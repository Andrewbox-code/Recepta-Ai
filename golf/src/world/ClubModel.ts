import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Club } from '../physics/clubs'
import type { ClubLine } from '../physics/equipment'

// Procedurally built golf clubs. Head frame: face toward -Z (target), toe
// toward +X, sole on y = 0, the hosel/heel at the origin.

export function clubLength(c: Club) {
  if (c.putter) return 0.87
  if (c.id === 'dr') return 1.14
  if (c.wood) return 1.08 - (c.loft - 15) * 0.008
  return 1.0 - (c.loft - 23) * 0.0045
}

export function lieAngle(c: Club) {
  if (c.putter) return 70
  if (c.wood) return 58
  return 60 + (c.loft - 23) * 0.12
}

// ---------- textures (cached) ----------
const texCache = new Map<string, THREE.Texture>()
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const hit = texCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  texCache.set(key, t)
  return t
}
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function carbonTex() {
  return tex('carbon', 256, 256, (g) => {
    g.fillStyle = '#15171b'
    g.fillRect(0, 0, 256, 256)
    const s = 16
    for (let y = 0; y < 256; y += s) {
      for (let x = 0; x < 256; x += s) {
        const odd = (x / s + y / s) % 2
        const gr = odd ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s)
        gr.addColorStop(0, '#1d2026')
        gr.addColorStop(0.5, '#343944')
        gr.addColorStop(1, '#1b1e23')
        g.fillStyle = gr
        g.fillRect(x + 0.5, y + 0.5, s - 1, s - 1)
      }
    }
  })
}

function gripTex(brand: string, accent: number) {
  return tex(`grip-${brand}-${accent}`, 256, 512, (g) => {
    g.fillStyle = '#23272c'
    g.fillRect(0, 0, 256, 512)
    // Rubber texture: tiny staggered pips.
    g.fillStyle = '#2f343a'
    for (let y = 0; y < 512; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 256; x += 6) g.fillRect(x, y, 3, 3)
    // Cord-style wrap lines on the lower hand.
    g.strokeStyle = 'rgba(255,255,255,0.05)'
    for (let y = 300; y < 512; y += 9) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(256, y - 20)
      g.stroke()
    }
    g.fillStyle = hex(accent)
    g.fillRect(0, 60, 256, 5)
    g.fillRect(0, 480, 256, 4)
    g.save()
    g.translate(128, 200)
    g.rotate(-Math.PI / 2)
    g.fillStyle = '#e9ecef'
    g.font = 'bold 34px "Barlow Condensed", system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(brand.toUpperCase(), 0, 12)
    g.restore()
  })
}

function graphiteTex(brand: string, accent: number) {
  return tex(`shaft-${brand}-${accent}`, 64, 1024, (g) => {
    const gr = g.createLinearGradient(0, 0, 64, 0)
    gr.addColorStop(0, '#16191d')
    gr.addColorStop(0.5, '#2c3037')
    gr.addColorStop(1, '#16191d')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 1024)
    g.fillStyle = hex(accent)
    g.fillRect(0, 300, 64, 150)
    g.fillStyle = '#16191d'
    g.fillRect(0, 330, 64, 10)
    g.save()
    g.translate(32, 380)
    g.rotate(-Math.PI / 2)
    g.fillStyle = '#ffffff'
    g.font = 'bold 26px "Barlow Condensed", sans-serif'
    g.textAlign = 'center'
    g.fillText(`${brand.toUpperCase()} 6X`, 0, 9)
    g.restore()
  })
}

function faceTex(kind: 'wood' | 'iron' | 'spin' | 'putter') {
  return tex(`face-${kind}`, 256, 128, (g) => {
    g.fillStyle = kind === 'wood' ? '#8e969f' : kind === 'putter' ? '#9aa2aa' : '#c5ccd2'
    g.fillRect(0, 0, 256, 128)
    if (kind === 'putter') {
      // Milled face: fine concentric arcs.
      g.strokeStyle = 'rgba(40,46,52,0.35)'
      for (let r = 6; r < 300; r += 5) {
        g.beginPath()
        g.arc(128, 64, r, 0, Math.PI * 2)
        g.stroke()
      }
      return
    }
    // Micro-milling
    g.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let x = -128; x < 256; x += 3) {
      g.beginPath()
      g.moveTo(x, 128)
      g.lineTo(x + 128, 0)
      g.stroke()
    }
    // Grooves / scorelines, clear of the toe and heel.
    const n = kind === 'wood' ? 6 : 12
    const gap = kind === 'wood' ? 12 : 8
    g.fillStyle = kind === 'spin' ? 'rgba(20,22,26,0.9)' : 'rgba(30,34,40,0.75)'
    for (let i = 0; i < n; i++) g.fillRect(kind === 'wood' ? 80 : 40, 20 + i * gap, kind === 'wood' ? 96 : 170, kind === 'spin' ? 3 : 2)
  })
}

function badgeTex(text: string, sub: string, accent: number) {
  return tex(`badge-${text}-${sub}-${accent}`, 256, 96, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 96)
    gr.addColorStop(0, hex(accent))
    gr.addColorStop(1, '#10151b')
    g.fillStyle = gr
    g.beginPath()
    g.roundRect(2, 2, 252, 92, 18)
    g.fill()
    g.fillStyle = '#fff'
    g.font = 'bold 44px "Barlow Condensed", sans-serif'
    g.textAlign = 'center'
    g.fillText(text.toUpperCase(), 128, 52)
    g.font = '600 22px "Barlow Condensed", sans-serif'
    g.fillStyle = 'rgba(255,255,255,0.8)'
    g.fillText(sub, 128, 82)
  })
}

// ---------- materials ----------
function mats(line: ClubLine) {
  const accent = new THREE.Color(line.accent)
  return {
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xdfe4e8, metalness: 1, roughness: 0.12, clearcoat: 0.3 }),
    satin: new THREE.MeshPhysicalMaterial({ color: 0xc3c9ce, metalness: 1, roughness: 0.32, anisotropy: 0.6 }),
    raw: new THREE.MeshPhysicalMaterial({ color: 0x5b5a57, metalness: 0.9, roughness: 0.45 }),
    titanium: new THREE.MeshPhysicalMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.28 }),
    blackPvd: new THREE.MeshPhysicalMaterial({ color: 0x1c1f23, metalness: 0.85, roughness: 0.3, clearcoat: 0.6 }),
    paint: new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }),
    ferrule: new THREE.MeshPhysicalMaterial({ color: 0x0d0f11, roughness: 0.25, clearcoat: 1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5 }),
  }
}

type M = ReturnType<typeof mats>

// Shear so the face lofts back while the sole stays flat on the ground.
function loftShear(geo: THREE.BufferGeometry, loftDeg: number) {
  const k = Math.tan(THREE.MathUtils.degToRad(loftDeg))
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.max(0, p.getY(i)) * k)
  geo.computeVertexNormals()
  return geo
}

// ---------- extra textures for the heads ----------

// Iron face in shape units: u = x / length, v = y / toe height.
function ironFaceTex(spin: boolean) {
  return tex(`ironface-${spin}`, 512, 320, (g) => {
    g.fillStyle = spin ? '#8b8984' : '#c9cfd4'
    g.fillRect(0, 0, 512, 320)
    // Blast-finished hitting area.
    g.fillStyle = spin ? 'rgba(60,58,54,0.25)' : 'rgba(150,158,166,0.35)'
    g.fillRect(70, 60, 360, 220)
    // Fine vertical milling.
    g.strokeStyle = 'rgba(255,255,255,0.07)'
    for (let x = 70; x < 430; x += 3) {
      g.beginPath()
      g.moveTo(x, 60)
      g.lineTo(x, 280)
      g.stroke()
    }
    // Grooves: v runs bottom (0) to top (1); canvas y is flipped.
    g.fillStyle = spin ? 'rgba(18,18,18,0.95)' : 'rgba(40,44,50,0.85)'
    for (let i = 0; i < 12; i++) g.fillRect(84, 280 - 16 - i * 17, 332 - i * 4, spin ? 5 : 4)
  })
}

// Driver/wood face: u along the face, v up the face.
function woodFaceTex(style: string) {
  return tex(`woodface-${style}`, 512, 256, (g) => {
    if (style === 'speed') {
      // Red carbon face.
      for (let y = 0; y < 256; y += 16) {
        for (let x = 0; x < 512; x += 16) {
          const odd = (x / 16 + y / 16) % 2
          g.fillStyle = odd ? '#8e1a1c' : '#6f1214'
          g.fillRect(x, y, 16, 16)
        }
      }
    } else {
      g.fillStyle = style === 'tour' ? '#3a3f45' : '#2a2e33'
      g.fillRect(0, 0, 512, 256)
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'
    g.fillRect(0, 0, 512, 256)
    // Scorelines, clear of heel and toe, plus a centre sweet-spot mark.
    g.fillStyle = 'rgba(220,226,232,0.55)'
    for (let i = 0; i < 7; i++) g.fillRect(150, 60 + i * 20, 212, 3)
  })
}

// Sole graphics: model name and a panel in the accent colour.
function soleTex(line: ClubLine) {
  return tex(`sole-${line.id}`, 512, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 512)
    gr.addColorStop(0, '#9aa1a8')
    gr.addColorStop(1, '#6b737b')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 512)
    g.fillStyle = '#20252b'
    g.beginPath()
    g.moveTo(90, 330)
    g.quadraticCurveTo(256, 250, 430, 330)
    g.lineTo(420, 420)
    g.quadraticCurveTo(256, 360, 100, 420)
    g.fill()
    g.fillStyle = hex(line.accent)
    g.fillRect(120, 300, 280, 8)
    g.fillStyle = '#ffffff'
    g.font = 'italic 800 54px "Barlow Condensed", sans-serif'
    g.textAlign = 'center'
    g.fillText(line.brand.toUpperCase(), 256, 400)
  })
}

// ---------- woods, fairways, hybrids ----------
// Built from a top-view outline: crown and sole are lofted rings shrinking
// toward an apex, meeting in a rounded rim, except along the front where
// they part to leave a tall, flat, lofted face.
function woodHead(c: Club, line: ClubLine, m: M) {
  const g = new THREE.Group()
  const style = line.head
  const dims =
    c.id === 'dr'
      ? { w: style === 'max' ? 0.122 : style === 'tour' ? 0.112 : 0.118, d: style === 'max' ? 0.118 : style === 'tour' ? 0.104 : 0.11, h: 0.064, faceH: 0.057 }
      : c.id === '3h'
        ? { w: 0.094, d: 0.055, h: 0.043, faceH: 0.036 }
        : c.id === '3w'
          ? { w: 0.104, d: 0.08, h: 0.04, faceH: 0.035 }
          : { w: 0.096, d: 0.074, h: 0.037, faceH: 0.032 }
  const { w, d, h, faceH } = dims
  const faceBottom = 0.004
  const faceTop = faceBottom + faceH
  const mid = h * 0.42

  // Pear planform (x = heel -> toe, z = face -> back).
  const outline = new THREE.CatmullRomCurve3(
    [
      [0.07, 0.012],
      [0.3, -0.004],
      [0.55, -0.008],
      [0.8, -0.002],
      [0.95, 0.03],
      [1.0, 0.2],
      [0.97, 0.45],
      [0.86, 0.72],
      [0.64, 0.95],
      [0.4, 1.0],
      [0.2, 0.86],
      [0.07, 0.6],
      [0.01, 0.3],
      [0.02, 0.1],
    ].map(([x, z]) => new THREE.Vector3(x * w, 0, z * d)),
    true,
    'centripetal',
  )
  const U = 96
  const V = 16
  const ring = outline.getSpacedPoints(U).slice(0, U)
  const apex = new THREE.Vector3(0.52 * w, 0, 0.42 * d)
  const sst = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  // How much each outline point belongs to the face.
  const faceness = ring.map((p) => sst(0.06 * d, 0.01 * d, p.z) * sst(0.04 * w, 0.12 * w, p.x) * sst(0.04 * w, 0.12 * w, w - p.x))

  const build = (upper: boolean) => {
    const pos: number[] = []
    const uv: number[] = []
    const col: number[] = []
    for (let v = 0; v <= V; v++) {
      const t = v / V
      const dome = Math.pow(Math.sin((t * Math.PI) / 2), upper ? 0.6 : 0.3)
      for (let u = 0; u < U; u++) {
        const e = ring[u]
        const x = e.x + (apex.x - e.x) * t
        const z = e.z + (apex.z - e.z) * t
        const f = faceness[u]
        let y: number
        if (upper) {
          const edge = mid + (faceTop - mid) * f
          const top = h * (1.02 - 0.18 * (z / d)) // crown falls away toward the back
          y = edge + (top - edge) * dome
        } else {
          const edge = mid - (mid - faceBottom) * f
          y = edge - (edge - 0.0012) * dome
        }
        pos.push(x, y, z)
        uv.push(x / w, z / d)
        // Two-tone crown on the MAX head: dark band behind the face.
        const dark = style === 'max' && upper && z < 0.14 * d + 0.02 * d * Math.sin(x * 60) ? 1 : 0
        const c1 = dark ? 0.12 : 1
        col.push(c1, c1, c1)
      }
    }
    const idx: number[] = []
    for (let v = 0; v < V; v++) {
      for (let u = 0; u < U; u++) {
        const a = v * U + u
        const b = v * U + ((u + 1) % U)
        const c2 = a + U
        const d2 = b + U
        if (upper) idx.push(a, c2, b, b, c2, d2)
        else idx.push(a, b, c2, b, d2, c2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    return geo
  }

  // The face: a band between the crown edge and sole edge (zero height away from the front).
  const facePos: number[] = []
  const faceUv: number[] = []
  const faceIdx: number[] = []
  for (let u = 0; u <= U; u++) {
    const e = ring[u % U]
    const f = faceness[u % U]
    const top = mid + (faceTop - mid) * f
    const bot = mid - (mid - faceBottom) * f
    facePos.push(e.x, top, e.z, e.x, bot, e.z)
    faceUv.push(1 - e.x / w, 1, 1 - e.x / w, 0)
    if (u < U) {
      const a = u * 2
      faceIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const faceGeo = new THREE.BufferGeometry()
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(facePos, 3))
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(faceUv, 2))
  faceGeo.setIndex(faceIdx)

  // Loft: lean the front of the head back, fading out toward the rear.
  const k = Math.tan(THREE.MathUtils.degToRad(c.loft))
  const loft = (geo: THREE.BufferGeometry) => {
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      const wgt = 1 - sst(0, 0.4 * d, z)
      p.setZ(i, z + (p.getY(i) - faceBottom) * k * wgt)
    }
    geo.computeVertexNormals()
    return geo
  }

  const crownMat =
    style === 'speed'
      ? new THREE.MeshPhysicalMaterial({ map: carbonTex(), metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 })
      : style === 'tour'
        ? new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 })
        : new THREE.MeshPhysicalMaterial({ color: 0xd9d4ca, vertexColors: true, metalness: 0.05, roughness: 0.45, clearcoat: 0.6 })
  const soleMat = new THREE.MeshPhysicalMaterial({ map: soleTex(line), metalness: 0.85, roughness: 0.35 })
  const faceMat = new THREE.MeshPhysicalMaterial({ map: woodFaceTex(style), metalness: style === 'speed' ? 0.3 : 0.8, roughness: 0.4, clearcoat: style === 'speed' ? 1 : 0, side: THREE.DoubleSide })
  const soleGeo = build(false)
  // Height of the (un-lofted) sole under a point, from the nearest vertex.
  const soleY = (x: number, z: number) => {
    const p = soleGeo.attributes.position
    let best = Infinity
    let y = 0
    for (let i = 0; i < p.count; i++) {
      const dd = (p.getX(i) - x) ** 2 + (p.getZ(i) - z) ** 2
      if (dd < best) {
        best = dd
        y = p.getY(i)
      }
    }
    return y
  }
  g.add(new THREE.Mesh(loft(build(true)), crownMat), new THREE.Mesh(loft(soleGeo), soleMat), new THREE.Mesh(loft(faceGeo), faceMat))

  // Alignment aid on the crown, just behind the face centre.
  const aidZ = 0.06 * d + (faceTop - faceBottom) * k * 0.6
  if (style === 'tour') {
    const aid = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0006, 0.01), m.white)
    aid.position.set(0.52 * w, h * 1.01, aidZ)
    g.add(aid)
  } else {
    const tri = new THREE.Shape()
    tri.moveTo(-0.005, 0)
    tri.lineTo(0.005, 0)
    tri.lineTo(0, 0.008)
    tri.closePath()
    const aid = new THREE.Mesh(new THREE.ShapeGeometry(tri), style === 'speed' ? m.paint : m.white)
    aid.rotation.x = -Math.PI / 2
    aid.position.set(0.52 * w, h * 1.015, aidZ + 0.008)
    g.add(aid)
  }
  // Sole weights: a sliding track on the tour head, a big rear weight on MAX, front and back on Speed.
  const weight = (x: number, z: number, r: number) => {
    const wt = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 24), m.chrome)
    wt.position.set(x, soleY(x, z) + 0.0008, z)
    g.add(wt)
  }
  if (c.id === 'dr' || c.wood) {
    if (style === 'tour') {
      const track = new THREE.Mesh(new RoundedBoxGeometry(w * 0.55, 0.003, 0.012, 2, 0.0014), m.blackPvd)
      track.position.set(0.5 * w, soleY(0.5 * w, 0.78 * d) + 0.0006, 0.78 * d)
      g.add(track)
      weight(0.6 * w, 0.78 * d, 0.006)
    } else if (style === 'max') weight(0.5 * w, 0.8 * d, 0.011)
    else {
      weight(0.5 * w, 0.18 * d, 0.006)
      weight(0.45 * w, 0.85 * d, 0.007)
    }
  }
  const hoselTop = new THREE.Vector3(0.012 * w, h + (c.id === 'dr' ? 0.02 : 0.018), 0.14 * d)
  return { g, hoselTop, hoselR: 0.0072, sleeve: c.id === 'dr' || c.id === '3w', body: m.blackPvd as THREE.Material }
}

// ---------- irons & wedges ----------
function ironProfile(len: number, toeH: number, heelH: number, wedge: boolean) {
  const s = new THREE.Shape()
  s.moveTo(0.009, 0)
  s.lineTo(len - 0.016, 0)
  // Rounded toe: taller and rounder on wedges.
  s.bezierCurveTo(len - 0.002, 0.0005, len + 0.002, toeH * 0.45, len - 0.002, toeH * (wedge ? 0.8 : 0.72))
  s.bezierCurveTo(len - 0.006, toeH * 0.98, len - 0.018, toeH * 1.02, len - 0.03, toeH)
  // Topline sloping down toward the heel.
  s.lineTo(0.022, heelH + 0.002)
  s.bezierCurveTo(0.012, heelH, 0.004, heelH * 0.75, 0.003, heelH * 0.45)
  s.bezierCurveTo(0.002, 0.004, 0.004, 0.0005, 0.009, 0)
  return s
}

function ironHead(c: Club, line: ClubLine, m: M) {
  const g = new THREE.Group()
  const wedge = line.slot === 'wedges'
  const style = line.head
  const len = style === 'gi' ? 0.083 : style === 'blade' ? 0.075 : wedge ? 0.077 : 0.079
  const toeH = (wedge ? 0.056 : 0.049) + (style === 'gi' ? 0.002 : 0) - (c.loft < 30 ? 0.003 : 0)
  const heelH = wedge ? 0.028 : 0.021
  const bodyMat =
    style === 'spinmill'
      ? m.raw
      : style === 'blade' || style === 'cavity' || style === 'chrome'
        ? m.satin
        : m.chrome
  const profile = ironProfile(len, toeH, heelH, wedge)
  const faceMap = ironFaceTex(style === 'spinmill').clone()
  faceMap.repeat.set(1 / len, 1 / toeH)
  faceMap.needsUpdate = true
  const faceMat = new THREE.MeshPhysicalMaterial({ map: faceMap, metalness: 0.95, roughness: style === 'spinmill' ? 0.5 : 0.3 })

  const soft = (sh: THREE.Shape, depth: number, bevel: number) =>
    new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 28 })

  // Face plate: caps carry the grooved face, sides are the body finish.
  const plate = soft(profile, 0.004, 0.0009)
  loftShear(plate, c.loft)
  g.add(new THREE.Mesh(plate, [faceMat, bodyMat]))

  const back: THREE.BufferGeometry[] = []
  const lowerBand = (top: number, inset: number) => {
    const s2 = new THREE.Shape()
    s2.moveTo(0.012 + inset, 0.002)
    s2.lineTo(len - 0.016 - inset, 0.002)
    s2.bezierCurveTo(len - 0.006 - inset, top * 0.4, len - 0.01 - inset, top * 0.85, len - 0.024 - inset, top)
    s2.bezierCurveTo(len * 0.6, top * 0.92, len * 0.3, top * 0.78, 0.02 + inset, top * 0.6)
    s2.closePath()
    return s2
  }
  if (style === 'blade' || style === 'chrome' || style === 'spinmill') {
    // Muscle back: a soft, sculpted mass low and centred.
    const muscle = soft(lowerBand(toeH * (wedge ? 0.62 : 0.55), 0.004), 0.004, 0.0032)
    muscle.translate(0, 0, 0.0048)
    back.push(muscle)
  } else if (style === 'cavity') {
    // Players cavity: thin perimeter, a sculpted lower bar and a badge.
    const ring = ironProfile(len, toeH, heelH, wedge)
    const hole = new THREE.Path()
    hole.moveTo(0.016, 0.009)
    hole.lineTo(len - 0.02, 0.009)
    hole.bezierCurveTo(len - 0.009, toeH * 0.4, len - 0.011, toeH * 0.75, len - 0.03, toeH - 0.0055)
    hole.lineTo(0.024, heelH - 0.002)
    hole.bezierCurveTo(0.016, heelH - 0.004, 0.014, 0.014, 0.016, 0.009)
    ring.holes.push(hole)
    const rim = soft(ring, 0.004, 0.0012)
    rim.translate(0, 0, 0.0048)
    back.push(rim)
    const bar = soft(lowerBand(toeH * 0.32, 0.006), 0.004, 0.002)
    bar.translate(0, 0, 0.0048)
    back.push(bar)
  } else {
    // Hollow-body / game-improvement: closed back, wide sole, toe weight.
    const shell = soft(ironProfile(len - 0.002, toeH - 0.003, heelH - 0.001, wedge), 0.011, 0.0022)
    shell.translate(0.001, 0.0005, 0.0048)
    back.push(shell)
    const flange = new RoundedBoxGeometry(len - 0.02, 0.009, style === 'widesole' ? 0.03 : 0.026, 3, 0.0038)
    flange.translate(len / 2, 0.0046, 0.013)
    back.push(flange.toNonIndexed())
  }
  const backGeo = mergeGeometries(back.map((b) => (b.index ? b.toNonIndexed() : b)).map((b) => {
    b.clearGroups()
    return b
  }))!
  loftShear(backGeo, c.loft)
  g.add(new THREE.Mesh(backGeo, bodyMat))

  // Badge / stamp on the back.
  const badgeZ = style === 'gi' || style === 'widesole' ? 0.0184 : style === 'cavity' ? 0.0092 : 0.0122
  const badgeGeo = new THREE.PlaneGeometry(len * (style === 'cavity' ? 0.46 : 0.4), toeH * 0.2)
  badgeGeo.translate(len * 0.52, toeH * (style === 'cavity' ? 0.46 : 0.3), badgeZ)
  loftShear(badgeGeo, c.loft)
  const label = wedge ? `${c.loft}°` : c.short.replace('i', '')
  g.add(
    new THREE.Mesh(
      badgeGeo,
      new THREE.MeshPhysicalMaterial({ map: badgeTex(line.brand, `${line.model} · ${label}`, style === 'blade' || style === 'chrome' || style === 'spinmill' ? 0x2a2f36 : line.accent), metalness: 0.4, roughness: 0.3, clearcoat: 1, transparent: true }),
    ),
  )
  if (style === 'gi') {
    // Toe weight screw.
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.002, 20), m.chrome)
    screw.rotation.x = Math.PI / 2
    screw.position.set(len - 0.012, toeH * 0.28, 0.0175 + toeH * 0.28 * Math.tan(THREE.MathUtils.degToRad(c.loft)))
    g.add(screw)
  }
  return { g, hoselTop: new THREE.Vector3(-0.001, 0.068, 0.004), hoselR: 0.0064, sleeve: false, body: bodyMat as THREE.Material }
}

// ---------- putters ----------
// Heads are drawn in top view (x = heel -> toe, second coord = face -> back)
// and extruded upward.
function upward(shape: THREE.Shape, height: number, bevel = 0.0012) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 20 })
  geo.rotateX(Math.PI / 2) // shape y -> +z (back), extrusion -> -y
  geo.translate(0, height + bevel, 0)
  return geo
}
function rrect(x0: number, z0: number, x1: number, z1: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(x0 + r, z0)
  s.lineTo(x1 - r, z0)
  s.quadraticCurveTo(x1, z0, x1, z0 + r)
  s.lineTo(x1, z1 - r)
  s.quadraticCurveTo(x1, z1, x1 - r, z1)
  s.lineTo(x0 + r, z1)
  s.quadraticCurveTo(x0, z1, x0, z1 - r)
  s.lineTo(x0, z0 + r)
  s.quadraticCurveTo(x0, z0, x0 + r, z0)
  return s
}

function putterHead(line: ClubLine, m: M) {
  const g = new THREE.Group()
  const finish = line.head === 'milled' || line.head === 'mallet' ? m.blackPvd : m.satin
  const parts: THREE.BufferGeometry[] = []
  let hoselTop: THREE.Vector3
  if (line.head === 'mallet') {
    // Spider-style: face bar with two wide wings sweeping back around a cut-out.
    const s = new THREE.Shape()
    s.moveTo(0.004, 0)
    s.lineTo(0.106, 0)
    s.bezierCurveTo(0.114, 0.02, 0.118, 0.07, 0.1, 0.098)
    s.bezierCurveTo(0.085, 0.112, 0.025, 0.112, 0.01, 0.098)
    s.bezierCurveTo(-0.008, 0.07, -0.004, 0.02, 0.004, 0)
    const cut = new THREE.Path()
    cut.moveTo(0.04, 0.03)
    cut.lineTo(0.07, 0.03)
    cut.bezierCurveTo(0.08, 0.055, 0.075, 0.085, 0.055, 0.09)
    cut.bezierCurveTo(0.035, 0.085, 0.03, 0.055, 0.04, 0.03)
    s.holes.push(cut)
    parts.push(upward(s, 0.022))
    g.add(new THREE.Mesh(mergeGeometries(parts)!, finish))
    // White T sightline and rear weights.
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0008, 0.024), m.white)
    t1.position.set(0.055, 0.0245, 0.014)
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0008, 0.003), m.white)
    t2.position.set(0.055, 0.0245, 0.0265)
    g.add(t1, t2)
    for (const x of [0.02, 0.09]) {
      const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 20), m.paint)
      wt.position.set(x, 0.012, 0.094)
      wt.rotation.x = Math.PI / 2
      g.add(wt)
    }
    // Short slant neck.
    hoselTop = new THREE.Vector3(0.028, 0.075, 0.01)
    const from = new THREE.Vector3(0.04, 0.022, 0.006)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0048, from.distanceTo(hoselTop), 14), finish)
    neck.position.copy(from).add(hoselTop).multiplyScalar(0.5)
    neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hoselTop.clone().sub(from).normalize())
    g.add(neck)
  } else {
    // Newport-style blade: face bar, heel and toe bumpers, low flange behind.
    parts.push(upward(rrect(0.004, 0, 0.102, 0.009, 0.002), 0.024))
    parts.push(upward(rrect(0.004, 0, 0.022, 0.03, 0.005), 0.024))
    parts.push(upward(rrect(0.084, 0, 0.102, 0.03, 0.005), 0.024))
    parts.push(upward(rrect(0.004, 0.004, 0.102, 0.032, 0.006), 0.008))
    g.add(new THREE.Mesh(mergeGeometries(parts)!, finish))
    // Cavity paint fill and sight dot.
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.018), new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.6 }))
    fill.rotation.x = -Math.PI / 2
    fill.position.set(0.053, 0.0103, 0.02)
    g.add(fill)
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.0006, 16), line.head === 'milled' ? m.paint : new THREE.MeshStandardMaterial({ color: 0xd4252b }))
    dot.position.set(0.053, 0.0252, 0.0045)
    g.add(dot)
    // Plumber's neck: post, bridge, then up into the shaft.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0045, 0.012, 14), finish)
    post.position.set(0.013, 0.031, 0.0045)
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.018, 14), finish)
    bridge.rotation.z = Math.PI / 2
    bridge.position.set(0.004, 0.038, 0.0045)
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0045, 0.014, 14), finish)
    riser.position.set(-0.005, 0.045, 0.0045)
    for (const p of [new THREE.Vector3(0.013, 0.038, 0.0045), new THREE.Vector3(-0.005, 0.038, 0.0045)]) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.0043, 14, 10), finish)
      knuckle.position.copy(p)
      g.add(knuckle)
    }
    g.add(post, bridge, riser)
    hoselTop = new THREE.Vector3(-0.005, 0.052, 0.0045)
  }
  // Milled face.
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.02), new THREE.MeshPhysicalMaterial({ map: faceTex('putter'), metalness: 0.9, roughness: 0.4 }))
  face.rotation.y = Math.PI
  face.position.set(0.055, 0.013, -0.0014)
  g.add(face)
  return { g, hoselTop, hoselR: 0.0045, sleeve: false, body: finish as THREE.Material }
}

export interface BuiltClub {
  root: THREE.Group // head at origin; shaft rises toward the player
  hands: THREE.Vector3 // top of the grip
  dir: THREE.Vector3 // unit vector up the shaft
  head: THREE.Group
  materials: THREE.Material[]
}

// `stub` builds just the head with a short piece of shaft, for close-ups.
export function buildClubModel(c: Club, line: ClubLine, shadows: boolean, stub = false): BuiltClub {
  const m = mats(line)
  const root = new THREE.Group()
  const built = c.putter ? putterHead(line, m) : c.wood ? woodHead(c, line, m) : ironHead(c, line, m)
  root.add(built.g)

  const L = clubLength(c)
  const lie = THREE.MathUtils.degToRad(lieAngle(c))
  const dir = new THREE.Vector3(-Math.cos(lie), Math.sin(lie), -0.1).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const base = built.hoselTop.clone()
  const hands = base.clone().addScaledVector(dir, L - built.hoselTop.y / dir.y)
  const along = (d: number) => base.clone().addScaledVector(dir, d)
  const cyl = (r0: number, r1: number, from: number, to: number, mat: THREE.Material, seg = 16) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, to - from, seg), mat)
    mesh.quaternion.copy(q)
    mesh.position.copy(along((from + to) / 2))
    root.add(mesh)
    return mesh
  }
  const total = base.distanceTo(hands)

  // Hosel rising from the heel to the shaft, with ferrule (and adjustable sleeve on woods).
  const heelToTop = new THREE.Vector3(0.002, 0.012, built.hoselTop.z).distanceTo(built.hoselTop)
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(built.hoselR * 0.9, built.hoselR * 1.25, heelToTop + 0.004, 18), built.body)
  hosel.quaternion.copy(q)
  hosel.position.copy(built.hoselTop).addScaledVector(dir, -heelToTop / 2)
  if (!c.putter) root.add(hosel)
  if (built.sleeve) cyl(0.0082, 0.0078, 0, 0.022, m.paint, 20)
  cyl(0.0068, 0.0055, built.sleeve ? 0.022 : 0, (built.sleeve ? 0.022 : 0) + 0.018, m.ferrule, 20)

  // Shaft: graphite with a graphic band for woods; stepped steel for irons.
  const shaftStart = (built.sleeve ? 0.022 : 0) + 0.018
  const gripLen = 0.27
  const shaftEnd = stub ? shaftStart + 0.09 : total - gripLen + 0.01
  if (line.shaft === 'graphite') {
    const mat = new THREE.MeshPhysicalMaterial({ map: graphiteTex(line.brand, line.accent), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })
    cyl(0.0048, 0.0072, shaftStart, shaftEnd, mat, 20)
  } else {
    // Steel: a short tip, then a series of steps getting wider toward the grip.
    const steps = c.putter ? 1 : 7
    let r = 0.0044
    let a = shaftStart
    const tip = (shaftEnd - shaftStart) * 0.32
    cyl(r, r, a, a + tip, m.chrome, 20)
    a += tip
    const stepLen = (shaftEnd - a) / steps
    for (let i = 0; i < steps; i++) {
      const r2 = r + 0.00035
      cyl(r2, r2 + 0.0001, a, a + stepLen - 0.0015, m.chrome, 20)
      cyl(r2 + 0.0003, r2, a + stepLen - 0.0015, a + stepLen, m.chrome, 20)
      r = r2
      a += stepLen
    }
  }
  if (stub) return finishModel(root, hands, dir, built.g, shadows)
  // Grip: taper toward the lower hand, textured, with an end cap.
  const gripMat = new THREE.MeshStandardMaterial({ map: gripTex(line.brand, line.accent), roughness: 0.85 })
  if (c.putter) {
    // Pistol-style putter grip: flatter and fatter.
    const pg = cyl(0.011, 0.0145, total - 0.27, total, gripMat, 24)
    pg.scale.set(1.15, 1, 0.85)
  } else cyl(0.0098, 0.0125, total - gripLen, total, gripMat, 24)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(c.putter ? 0.0145 : 0.0125, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.ferrule)
  cap.quaternion.copy(q)
  cap.position.copy(along(total))
  root.add(cap)

  return finishModel(root, hands, dir, built.g, shadows)
}

function finishModel(root: THREE.Group, hands: THREE.Vector3, dir: THREE.Vector3, head: THREE.Group, shadows: boolean): BuiltClub {
  const materials: THREE.Material[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = shadows
    for (const mm of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!materials.includes(mm)) materials.push(mm)
  })
  return { root, hands, dir, head, materials }
}
