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

// ---------- woods, fairways, hybrids ----------
function woodHead(c: Club, line: ClubLine, m: M) {
  const g = new THREE.Group()
  const dims =
    c.id === 'dr'
      ? { w: line.head === 'max' ? 0.122 : line.head === 'tour' ? 0.11 : 0.116, d: line.head === 'max' ? 0.118 : line.head === 'tour' ? 0.1 : 0.108, h: 0.062 }
      : c.id === '3h'
        ? { w: 0.094, d: 0.058, h: 0.04 }
        : c.id === '3w'
          ? { w: 0.1, d: 0.086, h: 0.039 }
          : { w: 0.093, d: 0.08, h: 0.036 }
  const loft = c.loft
  // Cut well into the ellipsoid so the face is broad and flat, as on a real head.
  const faceZ = (y: number) => -dims.d * 0.3 + (y - dims.h * 0.5) * Math.tan(THREE.MathUtils.degToRad(loft))
  const shape = (upper: boolean) => {
    const geo = new THREE.SphereGeometry(0.5, 64, 24, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i)
      const y = p.getY(i)
      let z = p.getZ(i)
      if (!upper) {
        // Broad, nearly flat sole: keep the planform almost all the way down.
        const hl = Math.hypot(x, z)
        if (hl > 1e-6) {
          const k = (0.5 * (0.82 + 0.18 * (hl / 0.5))) / hl
          x *= k
          z *= k
        }
      }
      // Pear/triangular planform: wider toward the back and toe.
      const toe = x + 0.5
      let X = x * dims.w
      let Z = z * dims.d * (0.82 + 0.18 * toe)
      // Sole sits on the ground; the crown domes up to the full head height.
      let Y = upper ? dims.h * 0.42 + y * 2 * dims.h * 0.58 : dims.h * 0.42 * (1 + 2 * y)
      Y = Math.max(0.0015, Y)
      // A flat, lofted face.
      const fz = faceZ(Y)
      if (Z < fz) Z = fz
      // Crown sits a touch lower at the back (aero drop).
      if (upper) Y -= Math.max(0, Z) * 0.18
      X += dims.w * 0.52
      p.setXYZ(i, X, Y, Z)
    }
    geo.computeVertexNormals()
    return geo
  }
  const crownMat =
    line.head === 'speed'
      ? new THREE.MeshPhysicalMaterial({ map: carbonTex(), metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 })
      : line.head === 'tour'
        ? new THREE.MeshPhysicalMaterial({ color: 0x1a1c1f, metalness: 0.3, roughness: 0.42, clearcoat: 0.5 })
        : new THREE.MeshPhysicalMaterial({ color: 0x2b313a, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })
  const crown = new THREE.Mesh(shape(true), crownMat)
  const sole = new THREE.Mesh(shape(false), m.titanium)
  g.add(crown, sole)
  // Face insert
  // Face insert: a rounded plate sitting just proud of the flat face.
  const fh = dims.h * 0.66
  const fw = dims.w * 0.66
  const fs = new THREE.Shape()
  const r = Math.min(fh, fw) * 0.3
  const x0 = -fw / 2
  const y0 = -fh / 2
  fs.moveTo(x0 + r, y0)
  fs.lineTo(x0 + fw - r, y0)
  fs.quadraticCurveTo(x0 + fw, y0, x0 + fw, y0 + r)
  fs.lineTo(x0 + fw, y0 + fh - r)
  fs.quadraticCurveTo(x0 + fw, y0 + fh, x0 + fw - r, y0 + fh)
  fs.lineTo(x0 + r, y0 + fh)
  fs.quadraticCurveTo(x0, y0 + fh, x0, y0 + fh - r)
  fs.lineTo(x0, y0 + r)
  fs.quadraticCurveTo(x0, y0, x0 + r, y0)
  const fgeo = new THREE.ShapeGeometry(fs, 12)
  const fuv = fgeo.attributes.uv
  const fpos = fgeo.attributes.position
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / fw + 0.5, fpos.getY(i) / fh + 0.5)
  fgeo.rotateY(Math.PI)
  const face = new THREE.Mesh(fgeo, new THREE.MeshPhysicalMaterial({ map: faceTex('wood'), metalness: 0.9, roughness: 0.35 }))
  face.position.set(dims.w * 0.53, dims.h * 0.5, faceZ(dims.h * 0.5) - 0.0006)
  face.rotation.x = THREE.MathUtils.degToRad(loft)
  g.add(face)
  // Alignment mark on the crown, sole weights and a painted accent.
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0012, 0.004), line.head === 'tour' ? m.paint : m.white)
  mark.position.set(dims.w * 0.52, dims.h * 0.99, faceZ(dims.h) + 0.014)
  g.add(mark)
  for (const [x, z] of [
    [0.3, 0.3],
    [0.72, 0.36],
  ]) {
    const wgt = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 20), m.chrome)
    wgt.position.set(dims.w * x, 0.0022, dims.d * z)
    g.add(wgt)
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.5, 0.0015, dims.d * 0.12), m.paint)
  stripe.position.set(dims.w * 0.55, 0.0012, dims.d * 0.1)
  g.add(stripe)
  return { g, hoselTop: new THREE.Vector3(0.004, dims.h * 1.15, -dims.d * 0.25), hoselR: 0.0078, sleeve: true, body: m.titanium as THREE.Material }
}

// ---------- irons & wedges ----------
function ironProfile(len: number, toeH: number, heelH: number, round: number) {
  const s = new THREE.Shape()
  s.moveTo(0.006, 0)
  s.lineTo(len - 0.01, 0)
  s.quadraticCurveTo(len + 0.004, 0.004, len + 0.002, toeH * 0.55)
  s.quadraticCurveTo(len - 0.002 + round, toeH, len - 0.03, toeH * 0.98)
  s.lineTo(0.012, heelH)
  s.quadraticCurveTo(0.002, heelH * 0.9, 0.002, heelH * 0.5)
  s.closePath()
  return s
}

function ironHead(c: Club, line: ClubLine, m: M) {
  const g = new THREE.Group()
  const wedge = line.slot === 'wedges'
  const style = line.head
  const len = style === 'gi' ? 0.084 : style === 'blade' ? 0.074 : wedge ? 0.078 : 0.079
  const toeH = (wedge ? 0.058 : 0.05) + (style === 'gi' ? 0.003 : 0)
  const heelH = wedge ? 0.028 : 0.022
  const body = style === 'spinmill' ? m.raw : style === 'blade' || style === 'cavity' ? m.satin : m.chrome
  const profile = ironProfile(len, toeH, heelH, wedge ? 0.012 : 0)

  const parts: THREE.BufferGeometry[] = []
  // Face plate
  parts.push(new THREE.ExtrudeGeometry(profile, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.001, bevelSegments: 2, curveSegments: 24 }))
  if (style === 'blade' || style === 'chrome' || style === 'spinmill') {
    // Muscle back: extra mass low behind the sweet spot, tapering up.
    const mb = new THREE.Shape()
    mb.moveTo(0.012, 0.002)
    mb.lineTo(len - 0.014, 0.002)
    mb.quadraticCurveTo(len - 0.004, toeH * 0.3, len - 0.018, toeH * 0.45)
    mb.lineTo(0.02, heelH * 0.75)
    mb.closePath()
    const back = new THREE.ExtrudeGeometry(mb, { depth: 0.009, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 16 })
    back.translate(0, 0, 0.006)
    parts.push(back)
  } else {
    // Cavity back: perimeter ring with a hollow in the middle.
    const ring = ironProfile(len, toeH, heelH, 0)
    const hole = new THREE.Path()
    const inset = style === 'gi' ? 0.009 : 0.007
    hole.moveTo(0.012 + inset, inset + (style === 'gi' ? 0.008 : 0.004))
    hole.lineTo(len - 0.01 - inset, inset + (style === 'gi' ? 0.008 : 0.004))
    hole.quadraticCurveTo(len - inset, toeH * 0.5, len - 0.03, toeH - inset)
    hole.lineTo(0.016, heelH - inset * 0.4)
    hole.closePath()
    ring.holes.push(hole)
    const rim = new THREE.ExtrudeGeometry(ring, { depth: style === 'gi' ? 0.014 : 0.01, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 16 })
    rim.translate(0, 0, 0.006)
    parts.push(rim)
  }
  if (style === 'gi' || style === 'widesole') {
    // Wide sole flange for bounce and a low CG.
    const flange = new RoundedBoxGeometry(len - 0.016, 0.01, style === 'gi' ? 0.03 : 0.028, 2, 0.004)
    flange.translate(len / 2, 0.005, 0.016)
    parts.push(flange.toNonIndexed())
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  loftShear(merged, c.loft)
  g.add(new THREE.Mesh(merged, body))

  // Grooved, milled face, lofted with the body.
  const fg = new THREE.PlaneGeometry(len * 0.72, toeH * 0.62)
  fg.rotateY(Math.PI)
  fg.translate(len * 0.52, toeH * 0.38, -0.0024)
  loftShear(fg, c.loft)
  const face = new THREE.Mesh(fg, new THREE.MeshPhysicalMaterial({ map: faceTex(style === 'spinmill' ? 'spin' : 'iron'), metalness: 0.95, roughness: style === 'spinmill' ? 0.5 : 0.28 }))
  g.add(face)

  // Cavity badge / back stamp with the model and loft.
  const badgeGeo = new THREE.PlaneGeometry(len * 0.5, toeH * 0.32)
  badgeGeo.translate(len * 0.5, toeH * 0.42, style === 'gi' ? 0.0125 : style === 'cavity' ? 0.0105 : 0.0163)
  loftShear(badgeGeo, c.loft)
  const label = wedge ? `${c.loft}°` : c.short.replace('i', '')
  const badge = new THREE.Mesh(
    badgeGeo,
    new THREE.MeshPhysicalMaterial({ map: badgeTex(line.brand, `${line.model} · ${label}`, style === 'blade' || style === 'chrome' ? 0x2a2f36 : line.accent), metalness: 0.4, roughness: 0.3, clearcoat: 1 }),
  )
  g.add(badge)
  return { g, hoselTop: new THREE.Vector3(0.001, 0.075, 0.006), hoselR: 0.0068, sleeve: false, body: body as THREE.Material }
}

// ---------- putters ----------
function putterHead(line: ClubLine, m: M) {
  const g = new THREE.Group()
  const finish = line.head === 'milled' ? m.satin : line.head === 'mallet' ? m.blackPvd : m.chrome
  let hoselTop: THREE.Vector3
  if (line.head === 'mallet') {
    // Fang-style mallet: crescent body with rear wings and sightlines.
    const s = new THREE.Shape()
    s.moveTo(-0.05, 0)
    s.lineTo(0.05, 0)
    s.quadraticCurveTo(0.058, 0.035, 0.045, 0.085)
    s.lineTo(0.022, 0.085)
    s.lineTo(0.016, 0.03)
    s.lineTo(-0.016, 0.03)
    s.lineTo(-0.022, 0.085)
    s.lineTo(-0.045, 0.085)
    s.quadraticCurveTo(-0.058, 0.035, -0.05, 0)
    const body = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 20 })
    body.rotateX(Math.PI / 2)
    body.translate(0.055, 0.024, 0.002)
    g.add(new THREE.Mesh(body, finish))
    for (const x of [-0.018, 0, 0.018]) {
      const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0008, x === 0 ? 0.08 : 0.05), m.white)
      line2.position.set(0.055 + x, 0.0265, x === 0 ? 0.042 : 0.06)
      g.add(line2)
    }
    for (const x of [-0.034, 0.034]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 18), m.paint)
      w.rotation.x = Math.PI / 2
      w.position.set(0.055 + x, 0.012, 0.089)
      g.add(w)
    }
    hoselTop = new THREE.Vector3(0.03, 0.08, 0.012)
    // Slant neck from the body up to the shaft.
    const from = new THREE.Vector3(0.042, 0.024, 0.01)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0048, from.distanceTo(hoselTop), 12), finish)
    neck.position.copy(from).add(hoselTop).multiplyScalar(0.5)
    neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hoselTop.clone().sub(from).normalize())
    g.add(neck)
  } else {
    // Classic Anser-style blade with a plumber's neck.
    const body = new RoundedBoxGeometry(0.1, 0.026, 0.024, 4, 0.004)
    body.translate(0.055, 0.013, 0.012)
    g.add(new THREE.Mesh(body, finish))
    const flange = new RoundedBoxGeometry(0.07, 0.01, 0.018, 3, 0.003)
    flange.translate(0.055, 0.005, 0.03)
    g.add(new THREE.Mesh(flange, finish))
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0008, 0.016), m.white)
    sight.position.set(0.055, 0.0265, 0.012)
    g.add(sight)
    if (line.head === 'milled') {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.001, 16), m.paint)
      dot.position.set(0.055, 0.0012, 0.03)
      g.add(dot)
    }
    // Plumber's neck: up, over, up.
    const neck1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.018, 12), finish)
    neck1.position.set(0.012, 0.035, 0.008)
    const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.014, 12), finish)
    neck2.rotation.z = Math.PI / 2
    neck2.position.set(0.006, 0.044, 0.008)
    g.add(neck1, neck2)
    hoselTop = new THREE.Vector3(0.0, 0.05, 0.008)
  }
  // Milled face
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.02), new THREE.MeshPhysicalMaterial({ map: faceTex('putter'), metalness: 0.9, roughness: 0.4 }))
  face.rotation.y = Math.PI
  face.position.set(0.055, 0.013, -0.0005)
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

export function buildClubModel(c: Club, line: ClubLine, shadows: boolean): BuiltClub {
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
  const shaftEnd = total - gripLen + 0.01
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

  const materials: THREE.Material[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = shadows
    const mm = mesh.material as THREE.Material
    if (!materials.includes(mm)) materials.push(mm)
  })
  return { root, hands, dir, head: built.g, materials }
}
