// Turns a raw pointer gesture into swing mechanics.
//
// Coordinate convention (normalised "swing units"):
//   origin = where the player pressed (address = the ball)
//   +Y     = pulled back toward the player (screen down)  -> backswing
//   -Y     = pushed toward the target (screen up)         -> downswing / through
//   +X     = right of the target line
// One unit `U` is a fraction of the screen so the gesture feels the same on a
// phone and a monitor.

export interface SwingSample {
  x: number
  y: number
  t: number // ms
}

export interface TracePoint {
  x: number // swing units
  y: number
  t: number // ms since backswing start
  speed: number // swing units / s
}

export interface SwingMetrics {
  depth: number // how far back the backswing went (U)
  backswingMs: number
  downswingMs: number
  tempoRatio: number // backswing : downswing (tour average ~3:1)
  rampFrac: number // how quickly the downswing got to half speed, as a fraction of downswing time
  speed: number // speed through the impact line, U/s
  peakSpeed: number
  releaseOffset: number // where peak speed happened: + = before the ball (early), - = after (late), in U
  decel: number // impact speed / peak speed reached before impact (1 = still accelerating)
  pathAngle: number // gesture heading over the downswing approach, degrees, + = toward right
  faceAngle: number // gesture heading right through impact, degrees
  crossX: number // horizontal miss of the ball at impact, U (+ = toward the toe)
  trace: TracePoint[]
  impactT: number // ms since backswing start
}

export const MIN_DEPTH = 0.18 // shallower than this is a waggle, not a swing
const START_DIST = 0.035
const REVERSAL = 0.05 // must come up this far off the top to count as a downswing

interface Norm {
  x: number
  y: number
  t: number
}

export interface Phases {
  startIdx: number
  topIdx: number
  crossIdx: number // first sample at/above the impact line after the top, -1 if not yet
  depth: number
}

function normalise(samples: SwingSample[], unit: number): Norm[] {
  const o = samples[0]
  return samples.map((s) => ({ x: (s.x - o.x) / unit, y: (s.y - o.y) / unit, t: s.t }))
}

// Incremental phase detection, also used live by the input layer to know when
// the club has reached the ball.
export function findPhases(samples: SwingSample[], unit: number): Phases | null {
  if (samples.length < 3) return null
  const p = normalise(samples, unit)
  let startIdx = -1
  for (let i = 1; i < p.length; i++) {
    if (Math.hypot(p[i].x, p[i].y) > START_DIST) {
      startIdx = i - 1
      break
    }
  }
  if (startIdx < 0) return null
  let topIdx = startIdx
  let crossIdx = -1
  let reversed = false
  for (let i = startIdx; i < p.length; i++) {
    if (!reversed) {
      if (p[i].y > p[topIdx].y) topIdx = i
      else if (p[topIdx].y - p[i].y > REVERSAL && p[topIdx].y >= MIN_DEPTH) reversed = true
    }
    if (reversed && p[i].y <= 0) {
      crossIdx = i
      break
    }
  }
  return { startIdx, topIdx, crossIdx, depth: Math.max(0, p[topIdx].y) }
}

const RESAMPLE_MS = 4

function resample(p: Norm[], from: number, to: number): Norm[] {
  const out: Norm[] = []
  let j = 0
  for (let t = from; t <= to + 1e-6; t += RESAMPLE_MS) {
    while (j < p.length - 2 && p[j + 1].t < t) j++
    const a = p[j]
    const b = p[Math.min(j + 1, p.length - 1)]
    const k = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, t })
  }
  return out
}

function speeds(r: Norm[]): number[] {
  const raw = r.map((_, i) => {
    const a = r[Math.max(0, i - 1)]
    const b = r[Math.min(r.length - 1, i + 1)]
    const dt = (b.t - a.t) / 1000
    return dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : 0
  })
  // ~20ms moving average: pointer sampling is jittery, a clubhead isn't.
  const w = 2
  return raw.map((_, i) => {
    let s = 0
    let n = 0
    for (let k = i - w; k <= i + w; k++) {
      if (k >= 0 && k < raw.length) {
        s += raw[k]
        n++
      }
    }
    return s / n
  })
}

// Where along the stroke the speed peaked, as the speed-weighted centre of the
// top-speed plateau: robust against one jittery pointer sample.
function releaseCentroid(r: Norm[], v: number[], from: number, peak: number) {
  let sw = 0
  let sy = 0
  for (let i = from; i < v.length; i++) {
    if (v[i] >= peak * 0.85) {
      sw += v[i]
      sy += v[i] * r[i].y
    }
  }
  return sw > 0 ? sy / sw : 0
}

const deg = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI

// Walk backwards along the path from index `end` until `len` of arc is covered.
function pointBack(r: Norm[], end: number, len: number): Norm {
  let acc = 0
  for (let i = end; i > 0; i--) {
    const d = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)
    if (acc + d >= len) {
      const k = (len - acc) / d
      return { x: r[i].x + (r[i - 1].x - r[i].x) * k, y: r[i].y + (r[i - 1].y - r[i].y) * k, t: r[i].t }
    }
    acc += d
  }
  return r[0]
}

export function analyzeSwing(samples: SwingSample[], unit: number): SwingMetrics | null {
  const ph = findPhases(samples, unit)
  if (!ph || ph.crossIdx < 0) return null
  const p = normalise(samples, unit)
  const t0 = p[ph.startIdx].t
  const top = p[ph.topIdx]
  const a = p[ph.crossIdx - 1]
  const b = p[ph.crossIdx]
  const k = a.y === b.y ? 1 : a.y / (a.y - b.y)
  const impactT = a.t + (b.t - a.t) * k
  const crossX = a.x + (b.x - a.x) * k

  const r = resample(p, t0, p[p.length - 1].t)
  const v = speeds(r)
  const iTop = Math.round((top.t - t0) / RESAMPLE_MS)
  const iImp = Math.min(r.length - 1, Math.round((impactT - t0) / RESAMPLE_MS))

  const speed = v[iImp]
  let peakIdx = iTop
  for (let i = iTop; i < v.length; i++) if (v[i] > v[peakIdx]) peakIdx = i
  let peakBefore = 0
  for (let i = iTop; i <= iImp; i++) peakBefore = Math.max(peakBefore, v[i])
  let rampIdx = iImp
  for (let i = iTop; i <= iImp; i++) {
    if (v[i] >= speed * 0.5) {
      rampIdx = i
      break
    }
  }

  const backswingMs = top.t - t0
  const downswingMs = Math.max(1, impactT - top.t)

  // Path: direction of travel on the way into the ball. Face: direction the
  // hands are travelling right through the ball. Any rotation of the stroke
  // through impact (a "release") shows up as face different from path.
  const approach = pointBack(r, iImp, 0.45)
  const imp = r[iImp]
  const pathAngle = deg(imp.x - approach.x, imp.y - approach.y)
  const late = pointBack(r, iImp, 0.1)
  const iAfter = Math.min(r.length - 1, iImp + 3)
  const after = r[iAfter]
  const faceAngle = deg(after.x - late.x, after.y - late.y)

  return {
    depth: ph.depth,
    backswingMs,
    downswingMs,
    tempoRatio: backswingMs / downswingMs,
    rampFrac: (r[rampIdx].t - top.t) / downswingMs,
    speed,
    peakSpeed: v[peakIdx],
    releaseOffset: releaseCentroid(r, v, iTop, v[peakIdx]),
    decel: peakBefore > 0 ? speed / peakBefore : 1,
    pathAngle,
    faceAngle,
    crossX,
    trace: r.map((q, i) => ({ x: q.x, y: q.y, t: q.t - t0, speed: v[i] })),
    impactT: impactT - t0,
  }
}
