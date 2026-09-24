import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { windAt, type Wind } from '../physics/flight'
import { FAIRWAY_HALF, POND, RANGE_LEN, TARGETS, YD, ellipse, fairwayWobble, fbm, heightAt } from './layout'

// Seeded RNG so the course looks the same every visit.
function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function leafTexture(needles: boolean) {
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const rnd = mulberry(needles ? 7 : 3)
  const count = needles ? 420 : 260
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * n * 0.46
    const a = rnd() * Math.PI * 2
    const x = n / 2 + Math.cos(a) * r
    const y = n / 2 + Math.sin(a) * r * (needles ? 0.55 : 1)
    const light = 45 + rnd() * 55
    g.fillStyle = `hsl(${needles ? 115 + rnd() * 25 : 80 + rnd() * 30}, ${needles ? 35 : 45 + rnd() * 15}%, ${light * (0.55 + (1 - r / (n * 0.46)) * 0.45)}%)`
    g.save()
    g.translate(x, y)
    g.rotate(needles ? rnd() * 0.6 - 0.3 + Math.PI / 2 : rnd() * Math.PI * 2)
    g.beginPath()
    if (needles) g.ellipse(0, 0, 1.1, 9 + rnd() * 6, 0, 0, Math.PI * 2)
    else g.ellipse(0, 0, 4 + rnd() * 3, 7 + rnd() * 4, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function barkTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#7a6a58'
  g.fillRect(0, 0, 64, 256)
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${30 + Math.random() * 40},${25 + Math.random() * 30},${20 + Math.random() * 20},0.6)`
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 10 + Math.random() * 40)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// Crossed leaf cards scattered through an ellipsoid canopy, normals pointing
// out from the canopy centre so the whole crown shades like a soft volume.
function canopy(rnd: () => number, o: { cards: number; rx: number; ry: number; cy: number; size: number; tint: number }) {
  const quads: THREE.BufferGeometry[] = []
  const center = new THREE.Vector3(0, o.cy, 0)
  for (let i = 0; i < o.cards; i++) {
    const u = rnd() * 2 - 1
    const a = rnd() * Math.PI * 2
    const rr = Math.pow(rnd(), 0.4)
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * o.rx * rr, u * o.ry * rr + o.cy, Math.sqrt(1 - u * u) * Math.sin(a) * o.rx * rr)
    const s = o.size * (0.75 + rnd() * 0.5)
    const q = new THREE.PlaneGeometry(s, s)
    q.rotateX(rnd() * Math.PI)
    q.rotateY(rnd() * Math.PI)
    q.rotateZ(rnd() * Math.PI)
    q.translate(p.x, p.y, p.z)
    const n = q.attributes.normal
    const pp = q.attributes.position
    const cols: number[] = []
    for (let k = 0; k < pp.count; k++) {
      const v = new THREE.Vector3(pp.getX(k), pp.getY(k), pp.getZ(k))
      const dir = v.clone().sub(center)
      dir.y *= o.rx / o.ry
      dir.normalize()
      n.setXYZ(k, dir.x, dir.y, dir.z)
      // Self-shadowing: darker inside and underneath.
      const depth = Math.min(1, v.clone().sub(center).length() / Math.max(o.rx, o.ry))
      const ao = 0.45 + 0.55 * depth * (0.7 + 0.3 * Math.max(0, dir.y))
      cols.push(ao * o.tint, ao, ao * o.tint)
    }
    q.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    quads.push(q)
  }
  return mergeGeometries(quads)!
}

function trunk(rnd: () => number, h: number, r: number, branches: number) {
  const parts: THREE.BufferGeometry[] = []
  const t = new THREE.CylinderGeometry(r * 0.55, r, h, 8, 3)
  t.translate(0, h / 2, 0)
  parts.push(t)
  for (let i = 0; i < branches; i++) {
    const bl = h * (0.35 + rnd() * 0.25)
    const br = new THREE.CylinderGeometry(r * 0.15, r * 0.3, bl, 5)
    br.translate(0, bl / 2, 0)
    br.rotateZ(0.7 + rnd() * 0.4)
    br.rotateY(rnd() * Math.PI * 2)
    br.translate(0, h * (0.55 + rnd() * 0.35), 0)
    parts.push(br)
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!
}

function palmBarkTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#8a6a48'
  g.fillRect(0, 0, 256, 32)
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(60,42,26,0.8)'
    g.fillRect(x, 0, 3, 32)
    g.fillStyle = 'rgba(170,140,100,0.5)'
    g.fillRect(x + 4, 0, 6, 32)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 1)
  return t
}

function frondTexture() {
  const W = 128
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rnd = mulberry(11)
  // Leaflets fan out from the rib, longest mid-frond; v=0 at the base.
  for (let y = 12; y < H - 6; y += 5) {
    const s = y / H
    const len = (W / 2 - 4) * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (0.85 + rnd() * 0.15)
    for (const side of [-1, 1]) {
      const l = 52 + rnd() * 40
      g.strokeStyle = `hsl(${88 + rnd() * 20}, ${60 + rnd() * 15}%, ${l * 0.55}%)`
      g.lineWidth = 3.2
      g.beginPath()
      g.moveTo(W / 2, y)
      g.quadraticCurveTo(W / 2 + side * len * 0.6, y + 10, W / 2 + side * len, y + 26)
      g.stroke()
    }
  }
  g.strokeStyle = '#6f8f2a'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(W / 2, 0)
  g.lineTo(W / 2, H)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.flipY = false
  return t
}

// A curved, tapering palm trunk plus coconuts; returns the crown position too.
function palmTrunk(rnd: () => number, h: number, lean: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.15, h * 0.35, 0),
    new THREE.Vector3(lean * 0.55, h * 0.7, 0),
    new THREE.Vector3(lean, h, 0),
  ])
  const tubular = 10
  const radial = 6
  const geo = new THREE.TubeGeometry(curve, tubular, 0.2, radial, false)
  const pos = geo.attributes.position
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const c = curve.getPointAt(t)
    const k = 1.25 - 0.55 * t + (t < 0.05 ? 0.4 * (1 - t / 0.05) : 0) // flared base
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j
      pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k)
    }
  }
  geo.computeVertexNormals()
  const top = curve.getPointAt(1)
  const parts: THREE.BufferGeometry[] = [geo.toNonIndexed()]
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2
    const nut = new THREE.SphereGeometry(0.16, 6, 4)
    nut.translate(top.x + Math.cos(a) * 0.22, top.y - 0.25 - rnd() * 0.1, top.z + Math.sin(a) * 0.22)
    // Coconuts sample a dark part of the bark texture.
    const uv = nut.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.005, 0.5)
    parts.push(nut.toNonIndexed())
  }
  return { geo: mergeGeometries(parts)!, top }
}

function palmCrown(rnd: () => number, top: THREE.Vector3, fronds: number, len: number) {
  const out: THREE.BufferGeometry[] = []
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rnd() * 0.4
    const lift = 0.9 - rnd() * 0.5 - (f % 3 === 0 ? 0.6 : 0) // some hang lower
    const droop = 1.7 + rnd() * 0.6
    const width = 1.5 + rnd() * 0.3
    const segs = 6
    const geo = new THREE.PlaneGeometry(width, len, 2, segs)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    // Centreline in the frond's own vertical plane.
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
    for (let i = 1; i <= segs; i++) {
      const s = i / segs
      const ang = lift - droop * s * s
      const p = pts[i - 1]
      pts.push(new THREE.Vector2(p.x + Math.cos(ang) * (len / segs), p.y + Math.sin(ang) * (len / segs)))
    }
    const cols: number[] = []
    for (let k = 0; k < pos.count; k++) {
      const s = uv.getY(k) // 0 = base (flip below), 1 = tip
      const sb = 1 - s
      const x = pos.getX(k)
      const i = Math.min(segs, Math.round(sb * segs))
      const c = pts[i]
      // Leaflets fold down into a shallow V.
      const fold = -Math.abs(x) * 0.45
      pos.setXYZ(k, c.x, c.y + fold, x)
      uv.setY(k, sb)
      const shade = 0.7 + 0.3 * sb
      cols.push(shade, shade, shade)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    geo.rotateY(yaw)
    geo.translate(top.x, top.y, top.z)
    // Soft upward normals: light the crown like a canopy, not paper.
    const n = geo.attributes.normal
    for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0)
    out.push(geo)
  }
  return mergeGeometries(out)!
}

interface Species {
  crown: THREE.InstancedMesh
  wood: THREE.InstancedMesh
  items: { x: number; y: number; z: number; s: number; rot: number; phase: number }[]
}

export class Trees {
  private species: Species[] = []
  private d = new THREE.Object3D()

  constructor(scene: THREE.Scene, shadows: boolean) {
    const rnd = mulberry(42)
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(false), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 })
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 })

    const kinds: { crown: THREE.BufferGeometry; wood: THREE.BufferGeometry; mat: THREE.Material; pine: boolean; bark?: THREE.Material }[] = []
    // Broadleaf variants: oak-ish, round, tall.
    for (const v of [
      { rx: 4.2, ry: 3.4, cy: 7.2, h: 5.5, r: 0.38, cards: 150 },
      { rx: 3.4, ry: 3.2, cy: 6.4, h: 4.8, r: 0.3, cards: 120 },
      { rx: 2.8, ry: 4.6, cy: 8.5, h: 6.5, r: 0.3, cards: 130 },
    ]) {
      kinds.push({ crown: canopy(rnd, { cards: v.cards, rx: v.rx, ry: v.ry, cy: v.cy, size: 2.6, tint: 0.92 }), wood: trunk(rnd, v.h + v.ry * 0.6, v.r, 5), mat: leafMat, pine: false })
    }
    // Palms: curved trunks, arching fronds.
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75 })
    const palmBark = new THREE.MeshStandardMaterial({ map: palmBarkTexture(), roughness: 0.95 })
    for (const v of [
      { h: 9.5, lean: 2.2, fronds: 11, len: 3.6 },
      { h: 7, lean: 1.1, fronds: 10, len: 3.2 },
      { h: 11.5, lean: 3.6, fronds: 12, len: 3.9 },
    ]) {
      const t = palmTrunk(rnd, v.h, v.lean)
      kinds.push({ crown: palmCrown(rnd, t.top, v.fronds, v.len), wood: t.geo, mat: frondMat, pine: true, bark: palmBark })
    }

    // Placement: tree lines hugging the range, groves on the mounds, a dense
    // wood closing off the far end.
    const spots: { x: number; z: number; s: number }[] = []
    const ok = (x: number, z: number) => {
      if (Math.abs(x) < FAIRWAY_HALF + fairwayWobble(z) + 12 && z < 30 && z > -RANGE_LEN - 10) return false
      if (ellipse(x, z, POND.x, POND.z, POND.rx, POND.rz) < 1.5) return false
      for (const t of TARGETS) if (Math.hypot(x - t.x, z + t.yd * YD) < t.r + 12) return false
      if (x > -45 && x < -5 && z > -12 && z < 20) return false // practice green & tee
      return true
    }
    for (let z = 35; z > -RANGE_LEN - 40; z -= 5 + rnd() * 5) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const edge = FAIRWAY_HALF + fairwayWobble(z) + 14 + k * 11 + rnd() * 9
          if (fbm(z * 0.01 + side * 7, k) < 0.36 && k === 0) continue // gaps in the line
          const x = side * edge
          if (ok(x, z)) spots.push({ x, z: z + rnd() * 4, s: 0.8 + rnd() * 0.5 })
        }
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = (rnd() * 2 - 1) * 230
      const z = -RANGE_LEN - 20 - rnd() * 150
      if (fbm(x * 0.02, z * 0.02) > 0.42) spots.push({ x, z, s: 0.9 + rnd() * 0.6 })
    }
    for (let i = 0; i < 160; i++) {
      const side = rnd() < 0.5 ? -1 : 1
      const x = side * (100 + rnd() * 130)
      const z = 40 - rnd() * (RANGE_LEN + 60)
      if (fbm(x * 0.015, z * 0.015) > 0.5 && ok(x, z)) spots.push({ x, z, s: 1 + rnd() * 0.5 })
    }

    const buckets: Species['items'][] = kinds.map(() => [])
    for (const [si, sp] of spots.entries()) {
      // Performance mode: thin out the trees well away from the range.
      if (!shadows && si % 5 < 2 && (Math.abs(sp.x) > 75 || sp.z < -RANGE_LEN)) continue
      // Palms line the range; broadleaf fills in behind them.
      const palmBias = Math.abs(sp.x) < 80 && sp.z > -RANGE_LEN ? 0.75 : 0.4
      const k = rnd() < palmBias ? 3 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3)
      buckets[k].push({ x: sp.x, y: heightAt(sp.x, sp.z) - 0.2, z: sp.z, s: sp.s, rot: rnd() * Math.PI * 2, phase: rnd() * 10 })
    }

    const tint = new THREE.Color()
    kinds.forEach((k, i) => {
      const items = buckets[i]
      const crown = new THREE.InstancedMesh(k.crown, k.mat, items.length)
      const wood = new THREE.InstancedMesh(k.wood, k.bark ?? barkMat, items.length)
      crown.castShadow = wood.castShadow = shadows
      crown.receiveShadow = shadows
      items.forEach((_, j) => {
        if (k.pine) tint.setHSL(0.2 + rnd() * 0.05, 0.55 + rnd() * 0.2, 0.62 + rnd() * 0.12)
        else tint.setHSL(0.2 + rnd() * 0.07, 0.5 + rnd() * 0.25, 0.55 + rnd() * 0.14)
        crown.setColorAt(j, tint)
      })
      scene.add(crown, wood)
      this.species.push({ crown, wood, items })
    })
    for (const sp of this.species) {
      sp.items.forEach((it, j) => {
        this.d.position.set(it.x, it.y, it.z)
        this.d.rotation.set(0, it.rot, 0)
        this.d.scale.setScalar(it.s)
        this.d.updateMatrix()
        sp.wood.setMatrixAt(j, this.d.matrix)
      })
    }
    this.update(0, { speed: 0, dir: 0, gust: 0, phase: 0 })
  }

  update(t: number, wind: Wind) {
    const w = windAt(wind, 10, t)
    const s = Math.hypot(w.x, w.z)
    const lean = Math.min(0.03, s * 0.0025)
    const ax = s > 0 ? w.x / s : 0
    const az = s > 0 ? w.z / s : 0
    for (const sp of this.species) {
      sp.items.forEach((it, j) => {
        const sway = lean + Math.sin(t * (0.9 + it.s * 0.3) + it.phase) * (0.004 + s * 0.0016)
        this.d.position.set(it.x, it.y, it.z)
        this.d.rotation.set(az * sway, it.rot, -ax * sway, 'XZY')
        this.d.scale.setScalar(it.s)
        this.d.updateMatrix()
        sp.crown.setMatrixAt(j, this.d.matrix)
        sp.wood.setMatrixAt(j, this.d.matrix)
      })
      sp.crown.instanceMatrix.needsUpdate = true
      sp.wood.instanceMatrix.needsUpdate = true
    }
  }
}
