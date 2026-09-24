import { describe, expect, it } from 'vitest'
import { CLUBS } from '../src/physics/clubs'
import { simulate, type Env } from '../src/physics/flight'
import { pureLaunch } from './helpers'

const calm: Env = { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: () => 'fairway' }
const yd = (m: number) => m / 0.9144

// Reference carries (yards) for a ~108 mph driver-speed player.
const EXPECTED: Record<string, [number, number]> = {
  dr: [255, 285],
  '3w': [235, 260],
  '5w': [222, 245],
  '3h': [212, 235],
  '4i': [200, 222],
  '5i': [190, 212],
  '6i': [178, 198],
  '7i': [164, 184],
  '8i': [150, 170],
  '9i': [135, 155],
  pw: [120, 140],
  gw: [108, 126],
  sw: [92, 112],
  lw: [78, 98],
}

describe('flight calibration (calm air, pure strike)', () => {
  CLUBS.forEach((c, i) => {
    if (c.putter) return
    it(`${c.name} carries in the expected window`, () => {
      const r = simulate(pureLaunch(i), { x: 0, y: 0.03, z: 0 }, 0, calm)
      console.log(
        `${c.short.padEnd(3)} ball ${(pureLaunch(i).ballSpeed / 0.44704).toFixed(0)}mph carry ${yd(r.carry).toFixed(1)}yd total ${yd(r.total).toFixed(1)}yd apex ${yd(r.apex).toFixed(1)}yd land ${r.landAngle.toFixed(0)}° hang ${r.hangTime.toFixed(1)}s`,
      )
      const [lo, hi] = EXPECTED[c.id]
      expect(yd(r.carry)).toBeGreaterThan(lo)
      expect(yd(r.carry)).toBeLessThan(hi)
    })
  })
})
