import type { SurfaceId } from '../physics/lies'

// The range's shape, shared by the renderer and the ball physics so that what
// you see is exactly what the ball lands on.

export const YD = 0.9144
export const FAIRWAY_HALF = 38
export const RANGE_LEN = 360
export const WATER_Y = -0.35

export interface Bunker {
  dx: number
  dz: number
  rx: number
  rz: number
}

export interface Target {
  yd: number
  x: number
  r: number
  color: string
  bunkers: Bunker[]
}

const b = (dx: number, dz: number, r: number, stretch = 1.3): Bunker => ({ dx, dz, rx: r * stretch, rz: r })

export const TARGETS: Target[] = [
  { yd: 60, x: -7, r: 8, color: '#ff5a5a', bunkers: [b(9, 2, 3.2)] },
  { yd: 100, x: 11, r: 10, color: '#ffd23f', bunkers: [b(-10, 5, 4)] },
  { yd: 145, x: -13, r: 12, color: '#4dabff', bunkers: [b(0, 13, 4.5, 1.6), b(13, 2, 4)] },
  { yd: 185, x: 7, r: 14, color: '#f5f5f5', bunkers: [b(-14, 6, 5), b(13, -6, 4.5)] },
  { yd: 235, x: -6, r: 17, color: '#ff8c1a', bunkers: [b(16, 12, 6)] },
  { yd: 285, x: 9, r: 20, color: '#b36bff', bunkers: [b(-20, 0, 6), b(5, 22, 5, 1.8)] },
]

// Guards the front-left of the 145.
export const POND = { x: -34, z: -100, rx: 13, rz: 20 }

// Practice green beside the tee, for the putter.
export const PRACTICE = { x: -27, z: 4, r: 11, cup: { x: -29, z: -1 } }

export const TEE_BOX = { x0: -6, x1: 6, z0: -3, z1: 4 }

// ---- noise ----
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b2 = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b2 - a) * u + (c - a) * v + (a - b2 - c + d) * u * v
}
export function fbm(x: number, y: number, oct = 4) {
  let s = 0
  let a = 0.5
  let f = 1
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f)
    f *= 2.03
    a *= 0.5
  }
  return s / (1 - Math.pow(0.5, oct))
}
const sstep = (a: number, b2: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b2 - a)))
  return t * t * (3 - 2 * t)
}

export const ellipse = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => Math.hypot((x - cx) / rx, (z - cz) / rz)

// Ground height in metres. The playing corridor is flat except for raised
// greens and sunken bunkers; mounds, hills and a distant ridge frame it.
export function heightAt(x: number, z: number): number {
  const ax = Math.abs(x)
  let h = 0
  // Shoulder mounds just off the fairway, then rolling hills.
  const n1 = fbm(x * 0.018 + 3.1, z * 0.018)
  h += sstep(FAIRWAY_HALF + 4, FAIRWAY_HALF + 38, ax) * (1.2 + 4.5 * n1)
  h += sstep(80, 420, ax) * 16 * fbm(x * 0.004 + 9, z * 0.004 + 2)
  // Rolling dunes closing off the end of the range.
  h += sstep(-RANGE_LEN - 25, -RANGE_LEN - 190, z) * (5 + 12 * fbm(x * 0.006, z * 0.006 + 5))
  // Gentle rise behind the tee.
  h += sstep(25, 140, z) * (4 + 4 * n1)
  // The island falls away into the sea beyond.
  const d = Math.hypot(x * 0.8, z + 220)
  h = h * (1 - sstep(650, 1000, d)) - sstep(800, 1300, d) * 25

  for (const t of TARGETS) {
    const cz = -t.yd * YD
    const dg = Math.hypot(x - t.x, z - cz)
    if (dg > t.r + 30) continue
    h += 0.4 * (1 - sstep(t.r - 1, t.r + 6, dg))
    for (const k of t.bunkers) {
      const e = ellipse(x, z, t.x + k.dx, cz + k.dz, k.rx, k.rz)
      h -= 0.5 * (1 - sstep(0.7, 1.02, e))
      h += 0.16 * Math.exp(-((e - 1.12) ** 2) / 0.008) // turf lip
    }
  }
  const ep = ellipse(x, z, POND.x, POND.z, POND.rx, POND.rz)
  if (ep < 1.6) h -= 1.7 * (1 - sstep(0.75, 1.3, ep))
  return h
}

export function surfaceAt(x: number, z: number): SurfaceId {
  const pg = Math.hypot(x - PRACTICE.x, z - PRACTICE.z)
  if (pg < PRACTICE.r) return 'green'
  if (pg < PRACTICE.r + 1.5) return 'fringe'
  const ep = ellipse(x, z, POND.x, POND.z, POND.rx, POND.rz)
  if (ep < 1.4) {
    if (heightAt(x, z) < WATER_Y) return 'water'
    if (ep < 1.3) return 'rough' // muddy bank
  }
  for (const t of TARGETS) {
    const cz = -t.yd * YD
    for (const k of t.bunkers) if (ellipse(x, z, t.x + k.dx, cz + k.dz, k.rx, k.rz) < 1) return 'sand'
    const d = Math.hypot(x - t.x, z - cz)
    if (d < t.r) return 'green'
    if (d < t.r + 1.5) return 'fringe'
  }
  if (Math.abs(x) > FAIRWAY_HALF + fairwayWobble(z) || z < -RANGE_LEN || z > 12) return 'rough'
  return 'fairway'
}

// Fairway edges aren't ruler-straight.
export function fairwayWobble(z: number) {
  return Math.sin(z * 0.021) * 2.5 + Math.sin(z * 0.057 + 1.3) * 1.2
}

// What the ball actually meets: the water surface over the pond.
export function groundY(x: number, z: number) {
  const h = heightAt(x, z)
  return h < WATER_Y && ellipse(x, z, POND.x, POND.z, POND.rx, POND.rz) < 1.4 ? WATER_Y : h
}
