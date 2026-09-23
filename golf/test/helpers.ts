import { CLUBS } from '../src/physics/clubs'
import type { Launch } from '../src/physics/impact'

export function pureLaunch(clubIdx: number, over: Partial<Launch> = {}): Launch {
  const c = CLUBS[clubIdx]
  return {
    clubSpeed: c.maxSpeed,
    ballSpeed: c.maxSpeed * c.smash,
    launchV: c.launch,
    launchH: 0,
    spinRpm: c.spin,
    tiltDeg: 0,
    path: 0,
    face: 0,
    depthMm: 0,
    toeMm: 0,
    swingPct: 1,
    chaos: 0,
    contact: 'pure',
    quality: 1,
    ...over,
  }
}

import type { SwingSample } from '../src/swing/analyze'

export interface GestureOpts {
  unit?: number
  depth?: number // backswing length (U)
  backMs?: number
  downMs?: number // top -> ball
  follow?: number // follow-through length past the ball (U); equal to depth = peak speed at the ball
  pathDeg?: number // straight-line heading of the downswing
  curveDeg?: number // extra heading change through impact (release)
  crossX?: number // horizontal miss at the ball (U)
  hz?: number
}

const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s)

// A synthetic, human-ish swing: minimum-jerk backswing, then a single
// minimum-jerk stroke from the top through the ball into the follow-through.
export function gesture(o: GestureOpts = {}): SwingSample[] {
  const U = o.unit ?? 300
  const depth = o.depth ?? 1
  const backMs = o.backMs ?? 750
  const downMs = o.downMs ?? 250
  const follow = o.follow ?? depth
  const hz = o.hz ?? 120
  const pathT = Math.tan(((o.pathDeg ?? 0) * Math.PI) / 180)
  const curve = ((o.curveDeg ?? 0) * Math.PI) / 180
  const cx = o.crossX ?? 0
  const out: SwingSample[] = []
  const step = 1000 / hz
  const x0 = 500
  const y0 = 400
  out.push({ x: x0, y: y0, t: 0 })
  let t = 40
  // Back
  for (; t <= 40 + backMs; t += step) {
    const s = minJerk((t - 40) / backMs)
    out.push({ x: x0 + (cx * s - pathT * depth * s) * U, y: y0 + depth * U * s, t })
  }
  // Solve the stroke duration so the ball is reached at downMs.
  const total = depth + follow
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (minJerk(m) * total < depth) lo = m
    else hi = m
  }
  const strokeMs = downMs / lo
  const tTop = t
  for (; t <= tTop + strokeMs; t += step) {
    const s = minJerk((t - tTop) / strokeMs)
    const y = depth - s * total // U, + = back
    // Heading = path + curve * progress through impact zone
    const x = cx + pathT * -y + Math.tan(curve) * Math.max(0, 0.25 - y) * (y < 0.25 ? 0.5 * (0.25 - y) / 0.25 : 0)
    out.push({ x: x0 + x * U, y: y0 + y * U, t })
  }
  return out
}
