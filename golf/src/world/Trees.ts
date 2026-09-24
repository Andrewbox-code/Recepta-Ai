import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { windAt, type Wind } from '../physics/flight'
import type { Layout } from './types'

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
  const n = 512
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const rnd = mulberry(needles ? 7 : 3)
  const count = needles ? 1700 : 1300
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * n * 0.46
    const a = rnd() * Math.PI * 2
    const x = n / 2 + Math.cos(a) * r
    const y = n / 2 + Math.sin(a) * r * (needles ? 0.55 : 1)
    const light = 30 + rnd() * 38
    g.fillStyle = `hsl(${needles ? 120 + rnd() * 25 : 78 + rnd() * 34}, ${needles ? 28 + rnd() * 10 : 34 + rnd() * 18}%, ${light * (0.55 + (1 - r / (n * 0.46)) * 0.45)}%)`
    g.save()
    g.translate(x, y)
    g.rotate(needles ? rnd() * 0.6 - 0.3 + Math.PI / 2 : rnd() * Math.PI * 2)
    g.beginPath()
    if (needles) g.ellipse(0, 0, 2.2, 18 + rnd() * 12, 0, 0, Math.PI * 2)
    else {
      // Pointed leaf with a midrib.
      const w = 8 + rnd() * 6
      const l = 16 + rnd() * 10
      g.moveTo(0, -l)
      g.quadraticCurveTo(w, 0, 0, l)
      g.quadraticCurveTo(-w, 0, 0, -l)
    }
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
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

interface Species {
  crown: THREE.InstancedMesh
  wood: THREE.InstancedMesh
  items: { x: number; y: number; z: number; s: number; rot: number; phase: number }[]
}

export class Trees {
  private species: Species[] = []
  private d = new THREE.Object3D()

  group = new THREE.Group()

  constructor(scene: THREE.Scene, shadows: boolean, smoothEdges: boolean, layout: Layout) {
    scene.add(this.group)
    const rnd = mulberry(42)
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(false), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 })
    const needleMat = new THREE.MeshStandardMaterial({ map: leafTexture(true), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 })
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 })
    // Smooth, un-jagged foliage edges with MSAA.
    leafMat.alphaToCoverage = needleMat.alphaToCoverage = smoothEdges

    const kinds: { crown: THREE.BufferGeometry; wood: THREE.BufferGeometry; mat: THREE.Material; pine: boolean; bark?: THREE.Material }[] = []
    // Broadleaf variants: oak-ish, round, tall.
    for (const v of [
      { rx: 4.2, ry: 3.4, cy: 7.2, h: 5.5, r: 0.38, cards: 150 },
      { rx: 3.4, ry: 3.2, cy: 6.4, h: 4.8, r: 0.3, cards: 120 },
      { rx: 2.8, ry: 4.6, cy: 8.5, h: 6.5, r: 0.3, cards: 130 },
    ]) {
      kinds.push({ crown: canopy(rnd, { cards: v.cards, rx: v.rx, ry: v.ry, cy: v.cy, size: 2.6, tint: 0.92 }), wood: trunk(rnd, v.h + v.ry * 0.6, v.r, 5), mat: leafMat, pine: false })
    }
    // Conifers: stacked tiers of drooping needle cards.
    for (const v of [
      { h: 15, w: 3.3 },
      { h: 11, w: 2.6 },
    ]) {
      const tiers: THREE.BufferGeometry[] = []
      const nt = 9
      for (let i = 0; i < nt; i++) {
        const y = 2 + (i / nt) * (v.h - 2.5)
        const w = v.w * (1 - i / nt) + 0.4
        tiers.push(canopy(rnd, { cards: 18, rx: w, ry: 0.75, cy: y, size: w * 0.9 + 0.7, tint: 0.85 }))
      }
      kinds.push({ crown: mergeGeometries(tiers)!, wood: trunk(rnd, v.h, 0.3, 0), mat: needleMat, pine: true })
    }

    const spots = layout.treeSpots(rnd)

    const buckets: Species['items'][] = kinds.map(() => [])
    for (const [si, sp] of spots.entries()) {
      // Performance mode: thin out the trees well away from play.
      if (!shadows && si % 5 < 2 && sp.far) continue
      // Parkland: mostly hardwoods, some pines.
      const k = rnd() < sp.pine ? 3 + Math.floor(rnd() * 2) : Math.floor(rnd() * 3)
      buckets[k].push({ x: sp.x, y: layout.heightAt(sp.x, sp.z) - 0.2, z: sp.z, s: sp.s, rot: rnd() * Math.PI * 2, phase: rnd() * 10 })
    }

    const tint = new THREE.Color()
    kinds.forEach((k, i) => {
      const items = buckets[i]
      const crown = new THREE.InstancedMesh(k.crown, k.mat, items.length)
      const wood = new THREE.InstancedMesh(k.wood, k.bark ?? barkMat, items.length)
      crown.castShadow = wood.castShadow = shadows
      crown.receiveShadow = shadows
      items.forEach((_, j) => {
        if (k.pine) tint.setHSL(0.34 + rnd() * 0.05, 0.25 + rnd() * 0.15, 0.55 + rnd() * 0.1)
        else tint.setHSL(0.2 + rnd() * 0.08, 0.3 + rnd() * 0.25, 0.6 + rnd() * 0.15)
        crown.setColorAt(j, tint)
      })
      this.group.add(crown, wood)
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
