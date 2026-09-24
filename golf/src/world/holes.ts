import type { SurfaceId } from '../physics/lies'
import type { Layout, TreeSpot, Water } from './types'
import { fbm } from './layout'

// Course holes described as data (a routing line from tee to green, fairway,
// green shape and slope, bunkers, water, elevation) and turned into a Layout.
// Local coordinates: the tee is at the origin and the hole plays toward -Z.

type P2 = [number, number]

interface Ell {
  x: number
  z: number
  rx: number
  rz: number
  rot?: number
}

export interface HoleSpec {
  name: string
  par: 3 | 4 | 5
  path: P2[] // routing line; the last point is the green centre
  fairway: { start: number; width: number } | null // start = metres from the tee
  green: { rx: number; rz: number; rot?: number; tilt: P2; falseFront?: number; lift?: number }
  pin?: P2 // offset from green centre
  bunkers: Ell[]
  water: Ell[]
  teeElev?: number
  greenElev?: number
  hills?: number
  groves?: { x: number; z: number; r: number }[]
  seed?: number
}

export interface CourseSpec {
  id: string
  name: string
  blurb: string
  unlockStars: number
  holes: HoleSpec[]
}

const YD = 0.9144
const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function ellE(x: number, z: number, e: Ell) {
  const c = Math.cos(e.rot ?? 0)
  const s = Math.sin(e.rot ?? 0)
  const dx = x - e.x
  const dz = z - e.z
  const lx = dx * c + dz * s
  const lz = -dx * s + dz * c
  return Math.hypot(lx / e.rx, lz / e.rz)
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}
const rgb = (r: number, g: number, b: number) => (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0))
const shade = (c: number, k: number) => rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k)

export interface HoleLayout extends Layout {
  spec: HoleSpec
  par: number
  lengthYds: number
  cup: { x: number; z: number }
  green: { x: number; z: number }
  // A sensible target for a shot of `reach` metres from (x, z): the flag if
  // it's in range, otherwise a point down the routing line.
  aimPoint(x: number, z: number, reach: number): { x: number; z: number }
}

export function buildHole(spec: HoleSpec): HoleLayout {
  const pts = spec.path.map(([x, z]) => ({ x, z }))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  const total = cum[cum.length - 1]
  const gc = pts[pts.length - 1]
  const seed = spec.seed ?? spec.name.length * 13.7
  const hills = spec.hills ?? 1
  const teeElev = spec.teeElev ?? 0
  const greenElev = spec.greenElev ?? 0
  const fwHalf = (spec.fairway?.width ?? 0) / 2
  const G: Ell = { x: gc.x, z: gc.z, rx: spec.green.rx, rz: spec.green.rz, rot: spec.green.rot ?? 0 }
  const cup = { x: gc.x + (spec.pin?.[0] ?? 0), z: gc.z + (spec.pin?.[1] ?? 0) }
  // Direction the hole arrives at the green from, for the false front.
  const last = pts[pts.length - 2]
  const inDir = { x: gc.x - last.x, z: gc.z - last.z }
  const inL = Math.hypot(inDir.x, inDir.z)
  inDir.x /= inL
  inDir.z /= inL

  // Nearest point on the routing line.
  const near = (x: number, z: number) => {
    let best = Infinity
    let t = 0
    let tx = 0
    let tz = -1
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const vx = b.x - a.x
      const vz = b.z - a.z
      const l2 = vx * vx + vz * vz
      const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2))
      const px = a.x + vx * u
      const pz = a.z + vz * u
      const d = Math.hypot(x - px, z - pz)
      if (d < best) {
        best = d
        t = cum[i - 1] + u * Math.sqrt(l2)
        const l = Math.sqrt(l2)
        tx = vx / l
        tz = vz / l
      }
    }
    return { d: best, t, tx, tz }
  }

  const fairwayHalfAt = (t: number) => fwHalf * (1 + 0.14 * Math.sin(t * 0.045 + seed) + 0.06 * Math.sin(t * 0.13 + seed * 2))

  // Terrain without the water hollows (used to set each lake's level).
  const baseHeight = (x: number, z: number) => {
    const q = near(x, z)
    // Downhill holes fall away right off the tee (so you can see the green
    // from the tee); level and uphill holes ease in and out.
    const u = Math.min(1, Math.max(0, (q.t - 0.04 * total) / (0.86 * total)))
    let h = lerp(teeElev, greenElev, teeElev > greenElev ? 1 - (1 - u) * (1 - u) : sst(0.1 * total, 0.92 * total, q.t))
    const n = fbm(x * 0.02 + seed, z * 0.02 - seed)
    h += (n - 0.5) * (0.8 + 5 * hills * sst(fwHalf + 4, fwHalf + 55, q.d))
    h += sst(fwHalf + 60, fwHalf + 220, q.d) * 22 * hills * fbm(x * 0.006 + seed, z * 0.006)
    // Beyond the green and behind the tee the ground rises into banks.
    h += sst(total + 25, total + 140, q.t) * 10 * hills
    // Far hills on the horizon.
    const dd = Math.hypot(x - gc.x / 2, z - gc.z / 2)
    h += sst(600, 1600, dd) * 120 * fbm(x * 0.0015 + seed, z * 0.0015)
    // Raised, flat tee box.
    const teeW = 1 - sst(6, 11, Math.hypot(x * 0.8, z))
    h = lerp(h, teeElev + 0.35, teeW)
    // Bunkers are hollows with a turf lip.
    for (const b of spec.bunkers) {
      const e = ellE(x, z, b)
      if (e > 1.6) continue
      h -= 0.6 * (1 - sst(0.7, 1.02, e))
      h += 0.16 * Math.exp(-((e - 1.12) ** 2) / 0.008)
    }
    return h
  }

  const water: Water[] = spec.water.map((w) => ({ x: w.x, z: w.z, rx: w.rx, rz: w.rz, rot: w.rot ?? 0, level: baseHeight(w.x, w.z) - 0.35 }))

  const greenBase = (() => {
    // Sit the green a little above the approach.
    return lerp(teeElev, greenElev, 1) + (spec.green.lift ?? 0.5) + (fbm(gc.x * 0.02 + seed, gc.z * 0.02 - seed) - 0.5) * 0.8
  })()

  const heightAt = (x: number, z: number) => {
    let h = baseHeight(x, z)
    for (let i = 0; i < water.length; i++) {
      const e = ellE(x, z, spec.water[i])
      if (e < 1.6) h -= 2.0 * (1 - sst(0.75, 1.3, e))
    }
    // The green: a tilted plateau, blended into its surrounds, with an
    // optional false front that sheds anything that comes up short.
    const e = ellE(x, z, G)
    if (e < 1.9) {
      const dx = x - cup.x
      const dz = z - cup.z
      let gh = greenBase + spec.green.tilt[0] * dx + spec.green.tilt[1] * dz
      const ff = spec.green.falseFront ?? 0
      if (ff > 0) {
        const len = Math.hypot(x - G.x, z - G.z) || 1
        const front = -((x - G.x) * inDir.x + (z - G.z) * inDir.z) / len
        gh -= ff * sst(0.55, 1.0, e) * Math.max(0, front)
      }
      h = lerp(h, gh, 1 - sst(1.0, 1.8, e))
    }
    return h
  }

  const inWater = (x: number, z: number) => {
    for (let i = 0; i < water.length; i++) if (ellE(x, z, spec.water[i]) < 1.35 && heightAt(x, z) < water[i].level) return water[i]
    return null
  }

  const surfaceAt = (x: number, z: number): SurfaceId => {
    const eg = ellE(x, z, G)
    if (eg < 1) return 'green'
    if (inWater(x, z)) return 'water'
    for (const b of spec.bunkers) if (ellE(x, z, b) < 1) return 'sand'
    if (eg < 1 + 1.6 / Math.min(G.rx, G.rz)) return 'fringe'
    if (Math.abs(x) < 4 && z > -7 && z < 3) return 'fairway' // tee box
    const q = near(x, z)
    if (spec.fairway && q.t > spec.fairway.start && q.t < total - Math.min(G.rx, G.rz) * 0.6 && q.d < fairwayHalfAt(q.t)) return 'fairway'
    return 'rough'
  }

  const groundY = (x: number, z: number) => {
    const w = inWater(x, z)
    const h = heightAt(x, z)
    return w ? Math.max(h, w.level) : h
  }

  const corridor = Math.max(60, fwHalf + 48)
  const outOfBounds = (x: number, z: number) => {
    const q = near(x, z)
    return q.d > corridor || q.t > total + 55 || q.t < 0 - 20 + 0 * q.d
  }

  // Grid-jittered woods lining the hole, with gaps; groves where the spec asks.
  const treeSpots = (rnd: () => number): TreeSpot[] => {
    const out: TreeSpot[] = []
    const step = 8
    for (let x = bounds.x0; x < bounds.x1; x += step) {
      for (let z = bounds.z0; z < bounds.z1; z += step) {
        const px = x + rnd() * step
        const pz = z + rnd() * step
        const q = near(px, pz)
        const edge = Math.max(fwHalf, 16) + 11
        if (q.d < edge) continue
        if (ellE(px, pz, G) < 2.2 || Math.hypot(px, pz) < 16) continue
        if (spec.water.some((w) => ellE(px, pz, w) < 1.5) || spec.bunkers.some((b) => ellE(px, pz, b) < 1.6)) continue
        const n = fbm(px * 0.018 + seed, pz * 0.018)
        const lining = q.d < edge + 22
        const keep = lining ? n > 0.36 : n > 0.5
        if (!keep || rnd() > (lining ? 0.85 : 0.55)) continue
        out.push({ x: px, z: pz, s: 0.8 + rnd() * 0.6, pine: 0.3, far: q.d > corridor + 20 })
      }
    }
    for (const g of spec.groves ?? []) {
      for (let i = 0; i < g.r * 1.2; i++) {
        const a = rnd() * Math.PI * 2
        const rr = Math.sqrt(rnd()) * g.r
        out.push({ x: g.x + Math.cos(a) * rr, z: g.z + Math.sin(a) * rr, s: 0.9 + rnd() * 0.5, pine: 0.25, far: false })
      }
    }
    return out
  }

  // Painted ground colour.
  const paintColor = (x: number, z: number) => {
    const n = hash(Math.floor(x * 3), Math.floor(z * 3)) * 0.08 + 0.96
    const eg = ellE(x, z, G)
    if (eg < 1) {
      // Checkerboard mowing on the green.
      const c = Math.cos(0.5)
      const s = Math.sin(0.5)
      const u = Math.floor((x * c + z * s) / 3)
      const v = Math.floor((-x * s + z * c) / 3)
      return shade((u + v) & 1 ? 0x7dbb4a : 0x74b243, n)
    }
    for (let i = 0; i < water.length; i++) {
      const ew = ellE(x, z, spec.water[i])
      if (ew < 1.45) {
        const h = heightAt(x, z)
        if (h < water[i].level) return 0x3a4a3a
        if (h < water[i].level + 0.35) return shade(0x5a5236, n)
      }
    }
    for (const b of spec.bunkers) {
      const eb = ellE(x, z, b)
      if (eb < 1) return shade(eb > 0.85 ? 0xd8cca8 : 0xece2c6, n)
      if (eb < 1.12) return shade(0x4a7a2a, n)
    }
    if (eg < 1 + 1.6 / Math.min(G.rx, G.rz)) return shade(0x5d9a34, n)
    if (Math.abs(x) < 4 && z > -7 && z < 3) return shade(0x6cab3d, n)
    const q = near(x, z)
    if (spec.fairway && q.t > spec.fairway.start && q.t < total - Math.min(G.rx, G.rz) * 0.6) {
      const fw = fairwayHalfAt(q.t)
      if (q.d < fw) return shade(Math.floor(q.t / 11) & 1 ? 0x5b9633 : 0x6aa53b, n)
      if (q.d < fw + 2.2) return shade(0x4c8129, n)
    }
    const m = fbm(x * 0.05 + seed, z * 0.05)
    return shade(m > 0.55 ? 0x46752a : m < 0.4 ? 0x33591c : 0x3d6a22, n)
  }

  // Area covered by detailed terrain: the routing line plus a margin.
  const xs = pts.map((p) => p.x)
  const zs = pts.map((p) => p.z)
  const bounds = { x0: Math.min(...xs) - 170, x1: Math.max(...xs) + 170, z0: Math.min(...zs) - 150, z1: Math.max(...zs) + 90 }

  const aimPoint = (x: number, z: number, reach: number) => {
    const dp = Math.hypot(cup.x - x, cup.z - z)
    if (dp <= reach * 1.08) return { ...cup }
    // Walk the routing line from the far end back to a point about `reach` away.
    const q0 = near(x, z)
    let best = { x: cup.x, z: cup.z }
    for (let t = total; t > q0.t; t -= 2) {
      // point at arc length t
      let i = 1
      while (i < cum.length - 1 && cum[i] < t) i++
      const a = pts[i - 1]
      const b = pts[i]
      const u = (t - cum[i - 1]) / (cum[i] - cum[i - 1])
      const px = a.x + (b.x - a.x) * u
      const pz = a.z + (b.z - a.z) * u
      best = { x: px, z: pz }
      if (Math.hypot(px - x, pz - z) <= reach) break
    }
    return best
  }

  return {
    kind: 'hole',
    spec,
    par: spec.par,
    lengthYds: Math.round(total / YD),
    bounds,
    tee: { x: 0, z: 0 },
    cup,
    green: { x: gc.x, z: gc.z },
    pins: [{ x: cup.x, z: cup.z, color: '#e53935', r: Math.max(G.rx, G.rz), kind: 'hole' }],
    water,
    heightAt,
    surfaceAt,
    groundY,
    outOfBounds,
    treeSpots,
    paintColor,
    aimPoint,
  }
}

// ---------------------------------------------------------------------------
// Courses. Distances in metres (1 yd = 0.9144 m); holes play toward -Z.

export const COURSES: CourseSpec[] = [
  {
    id: 'pinecrest',
    name: 'Pinecrest Park',
    blurb: 'A friendly parkland four: generous fairways, a pond par 3, a reachable par 5 and a false-fronted finisher.',
    unlockStars: 0,
    holes: [
      {
        name: 'Opening Drive',
        par: 4,
        path: [[0, 0], [0, -150], [-8, -262], [-14, -350]],
        fairway: { start: 35, width: 36 },
        green: { rx: 14, rz: 17, rot: 0.1, tilt: [0.004, -0.012] },
        pin: [3, -4],
        bunkers: [{ x: 17, z: -238, rx: 6, rz: 11, rot: 0.1 }, { x: -31, z: -346, rx: 5, rz: 7 }, { x: -1, z: -330, rx: 6, rz: 4 }],
        water: [],
      },
      {
        name: 'The Pond',
        par: 3,
        path: [[0, 0], [8, -151]],
        fairway: { start: 105, width: 24 },
        green: { rx: 12, rz: 14, rot: -0.2, tilt: [0.012, -0.01] },
        pin: [-3, 2],
        bunkers: [{ x: -8, z: -168, rx: 6, rz: 4 }],
        water: [{ x: 16, z: -118, rx: 17, rz: 12, rot: 0.3 }],
      },
      {
        name: 'Long Way Home',
        par: 5,
        path: [[0, 0], [0, -240], [-60, -362], [-120, -458]],
        fairway: { start: 35, width: 34 },
        green: { rx: 13, rz: 16, rot: 0.6, tilt: [-0.008, -0.01] },
        pin: [2, -3],
        bunkers: [{ x: 24, z: -248, rx: 7, rz: 12 }, { x: -28, z: -228, rx: 6, rz: 9 }, { x: -106, z: -440, rx: 6, rz: 4, rot: 0.6 }],
        water: [{ x: -42, z: -330, rx: 30, rz: 5, rot: 0.5 }],
        groves: [{ x: -52, z: -255, r: 18 }],
      },
      {
        name: 'Crown Jewel',
        par: 4,
        path: [[0, 0], [0, -200], [44, -306]],
        fairway: { start: 35, width: 32 },
        green: { rx: 12, rz: 14, rot: -0.35, tilt: [0.004, -0.018], falseFront: 1.1, lift: 0.9 },
        pin: [2, 0],
        bunkers: [{ x: 34, z: -207, rx: 7, rz: 10 }, { x: 28, z: -300, rx: 4, rz: 6 }, { x: 57, z: -320, rx: 6, rz: 4, rot: -0.35 }],
        water: [],
        groves: [{ x: 45, z: -170, r: 20 }],
      },
    ],
  },
  {
    id: 'lakeside',
    name: 'Lakeside National',
    blurb: 'Water on every hole, including an island green. Pick your lines.',
    unlockStars: 1,
    holes: [
      {
        name: 'Shoreline',
        par: 4,
        path: [[0, 0], [5, -200], [10, -366]],
        fairway: { start: 35, width: 32 },
        green: { rx: 13, rz: 15, tilt: [-0.01, -0.01] },
        pin: [-3, -3],
        bunkers: [{ x: 28, z: -360, rx: 5, rz: 7 }],
        water: [{ x: -36, z: -190, rx: 18, rz: 120, rot: 0.03 }],
      },
      {
        name: 'The Island',
        par: 3,
        path: [[0, 0], [0, -137]],
        fairway: null,
        green: { rx: 11, rz: 12, tilt: [0.008, -0.008], lift: 1.2 },
        pin: [2, 1],
        bunkers: [],
        water: [{ x: 0, z: -132, rx: 34, rz: 30 }],
      },
      {
        name: 'Two Shotter',
        par: 5,
        path: [[0, 0], [0, -250], [20, -474]],
        fairway: { start: 35, width: 34 },
        green: { rx: 13, rz: 16, rot: 0.1, tilt: [0.006, -0.012] },
        pin: [0, -4],
        bunkers: [{ x: 5, z: -452, rx: 7, rz: 4 }, { x: 36, z: -480, rx: 5, rz: 6 }],
        water: [{ x: 10, z: -345, rx: 45, rz: 16, rot: 0.08 }],
      },
      {
        name: 'Last Crossing',
        par: 4,
        path: [[0, 0], [-5, -200], [-10, -348]],
        fairway: { start: 35, width: 30 },
        green: { rx: 12, rz: 15, tilt: [0.01, -0.014], falseFront: 0.8 },
        pin: [3, -2],
        bunkers: [{ x: -26, z: -345, rx: 5, rz: 7 }],
        water: [{ x: 26, z: -220, rx: 14, rz: 34 }, { x: -12, z: -312, rx: 22, rz: 5 }],
      },
    ],
  },
  {
    id: 'canyon',
    name: 'Canyon Ridge',
    blurb: 'Big elevation, false fronts and doglegs. Club selection is everything.',
    unlockStars: 3,
    holes: [
      {
        name: 'The Drop',
        par: 3,
        path: [[0, 0], [-10, -172]],
        fairway: { start: 120, width: 22 },
        green: { rx: 13, rz: 13, tilt: [0.01, -0.014], falseFront: 1.0 },
        pin: [3, -2],
        bunkers: [{ x: -26, z: -170, rx: 5, rz: 7 }, { x: 6, z: -178, rx: 5, rz: 6 }],
        water: [],
        teeElev: 22,
        greenElev: 0,
        hills: 1.6,
      },
      {
        name: 'Switchback',
        par: 4,
        path: [[0, 0], [0, -210], [-70, -332]],
        fairway: { start: 35, width: 30 },
        green: { rx: 12, rz: 14, rot: 0.5, tilt: [-0.01, -0.016], lift: 0.8 },
        pin: [0, -2],
        bunkers: [{ x: -22, z: -215, rx: 7, rz: 10 }, { x: -58, z: -318, rx: 5, rz: 4, rot: 0.5 }],
        water: [],
        teeElev: 0,
        greenElev: 14,
        hills: 1.8,
        groves: [{ x: -45, z: -200, r: 22 }],
      },
      {
        name: 'Serpent',
        par: 5,
        path: [[0, 0], [15, -200], [-20, -362], [10, -497]],
        fairway: { start: 35, width: 32 },
        green: { rx: 13, rz: 15, rot: -0.2, tilt: [0.01, -0.01] },
        pin: [-2, -2],
        bunkers: [{ x: 38, z: -210, rx: 7, rz: 10 }, { x: -2, z: -485, rx: 6, rz: 4 }],
        water: [{ x: 0, z: -300, rx: 46, rz: 5, rot: -0.4 }],
        teeElev: 10,
        greenElev: 4,
        hills: 1.6,
      },
      {
        name: 'Summit',
        par: 4,
        path: [[0, 0], [6, -220], [16, -392]],
        fairway: { start: 35, width: 30 },
        green: { rx: 12, rz: 13, tilt: [-0.006, -0.02], falseFront: 1.3, lift: 1 },
        pin: [0, -3],
        bunkers: [{ x: -4, z: -228, rx: 7, rz: 9 }, { x: 30, z: -386, rx: 5, rz: 6 }, { x: 2, z: -386, rx: 5, rz: 6 }],
        water: [],
        teeElev: 0,
        greenElev: 6,
        hills: 1.7,
      },
    ],
  },
]

export const courseById = (id: string) => COURSES.find((c) => c.id === id) ?? COURSES[0]
export const coursePar = (c: CourseSpec) => c.holes.reduce((s, h) => s + h.par, 0)
