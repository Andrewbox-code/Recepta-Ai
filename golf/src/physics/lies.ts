// How the ball is sitting changes what the club can do to it.
// These describe contact at impact; `surfaces` below describe landing/roll.

export type LieId = 'tee' | 'fairway' | 'rough' | 'sand' | 'hardpan' | 'green'

export interface Lie {
  id: LieId
  name: string
  speedMul: number // ball speed lost to stuff between face and ball
  spinMul: number // grass/sand trapped at impact kills spin (flier)
  spinJitter: number // +/- fraction of spin that's unpredictable
  launchAdd: number // degrees
  // Contact depth (mm, + = club enters ground before ball) the lie forgives
  // before it starts eating speed, and how hard it punishes beyond that.
  fatGrace: number
  fatPenalty: number
  thinPenalty: number
  ballSink: number // 0 = sitting up, 1 = fully buried (visual + contact)
  turf: 'grass' | 'rough' | 'sand' | 'dirt' | 'none'
}

export const LIES: Record<LieId, Lie> = {
  tee: { id: 'tee', name: 'Tee', speedMul: 1, spinMul: 1, spinJitter: 0.02, launchAdd: 0, fatGrace: 4, fatPenalty: 0.9, thinPenalty: 0.8, ballSink: -0.8, turf: 'none' },
  fairway: { id: 'fairway', name: 'Fairway', speedMul: 1, spinMul: 1, spinJitter: 0.03, launchAdd: 0, fatGrace: 2, fatPenalty: 1, thinPenalty: 1, ballSink: 0.05, turf: 'grass' },
  rough: { id: 'rough', name: 'Rough', speedMul: 0.88, spinMul: 0.55, spinJitter: 0.25, launchAdd: 1.5, fatGrace: 1, fatPenalty: 1.5, thinPenalty: 0.7, ballSink: 0.55, turf: 'rough' },
  sand: { id: 'sand', name: 'Fairway Bunker', speedMul: 0.96, spinMul: 0.8, spinJitter: 0.1, launchAdd: 0, fatGrace: 0, fatPenalty: 2.2, thinPenalty: 0.6, ballSink: 0.3, turf: 'sand' },
  green: { id: 'green', name: 'Green', speedMul: 1, spinMul: 1, spinJitter: 0.02, launchAdd: 0, fatGrace: 3, fatPenalty: 1, thinPenalty: 1, ballSink: 0, turf: 'grass' },
  hardpan: { id: 'hardpan', name: 'Hardpan', speedMul: 1, spinMul: 1.08, spinJitter: 0.05, launchAdd: -1, fatGrace: 0, fatPenalty: 2.6, thinPenalty: 0.8, ballSink: 0, turf: 'dirt' },
}

export type SurfaceId = 'fairway' | 'rough' | 'green' | 'sand' | 'fringe' | 'water'

export interface Surface {
  id: SurfaceId
  restitution: number // normal bounce coefficient at low impact speed
  friction: number // sliding friction during a bounce (spin grab)
  rollDecel: number // m/s^2 once rolling
  rollDrag: number // extra decel per m/s of speed (grass drag)
  turfLoss: number // forward speed soaked up by the turf on a steep landing
}

export const SURFACES: Record<SurfaceId, Surface> = {
  fairway: { id: 'fairway', restitution: 0.4, friction: 0.45, rollDecel: 1.2, rollDrag: 0.25, turfLoss: 0.35 },
  fringe: { id: 'fringe', restitution: 0.32, friction: 0.52, rollDecel: 1.4, rollDrag: 0.3, turfLoss: 0.4 },
  green: { id: 'green', restitution: 0.28, friction: 0.75, rollDecel: 0.52, rollDrag: 0.08, turfLoss: 0.5 },
  rough: { id: 'rough', restitution: 0.16, friction: 0.7, rollDecel: 4, rollDrag: 0.9, turfLoss: 0.6 },
  water: { id: 'water', restitution: 0, friction: 1, rollDecel: 100, rollDrag: 10, turfLoss: 1 },
  sand: { id: 'sand', restitution: 0.03, friction: 0.95, rollDecel: 12, rollDrag: 2, turfLoss: 0.9 },
}

// Green/fairway firmness 0 (soft, receptive) .. 1 (baked). Firm ground gives
// more bounce and less grab, so the ball releases.
export function firmSurface(s: Surface, firmness: number): Surface {
  if (s.id === 'sand' || s.id === 'rough' || s.id === 'water') return s
  const f = firmness - 0.5
  return {
    ...s,
    restitution: s.restitution * (1 + f * 0.7),
    friction: s.friction * (1 - f * 0.6),
    rollDecel: s.rollDecel * (1 - f * 0.35),
    turfLoss: s.turfLoss * (1 - f * 0.8),
  }
}
