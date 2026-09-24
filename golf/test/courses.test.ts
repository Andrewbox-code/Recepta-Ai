import { describe, expect, it } from 'vitest'
import { COURSES, buildHole, coursePar } from '../src/world/holes'
import { simulate } from '../src/physics/flight'
import { pureLaunch } from './helpers'
import { CLUBS } from '../src/physics/clubs'

describe('courses', () => {
  for (const c of COURSES) {
    describe(c.name, () => {
      it('has sensible pars', () => {
        expect(c.holes.length).toBeGreaterThanOrEqual(3)
        expect(coursePar(c)).toBeGreaterThanOrEqual(14)
      })
      c.holes.forEach((spec, i) => {
        const h = buildHole(spec)
        it(`hole ${i + 1} (${spec.name}): tee, green and cup are where they should be`, () => {
          expect(h.surfaceAt(0, 0)).toBe('fairway')
          expect(h.surfaceAt(h.cup.x, h.cup.z)).toBe('green')
          expect(h.outOfBounds(0, 0)).toBe(false)
          expect(h.outOfBounds(h.cup.x, h.cup.z)).toBe(false)
          const yds = h.lengthYds
          if (spec.par === 3) expect(yds).toBeLessThan(230)
          if (spec.par === 4) expect(yds).toBeGreaterThan(300)
          if (spec.par === 5) expect(yds).toBeGreaterThan(470)
          for (const w of h.water) expect(h.surfaceAt(w.x, w.z) === 'water' || spec.water.length === 0 || spec.name === 'The Island').toBe(true)
        })
      })
    })
  }

  it('the island green is surrounded by water', () => {
    const h = buildHole(COURSES[1].holes[1])
    expect(h.surfaceAt(h.green.x, h.green.z + 20)).toBe('water')
    expect(h.surfaceAt(h.green.x + 22, h.green.z)).toBe('water')
  })

  it('a putt breaks with the slope of the green', () => {
    const h = buildHole(COURSES[0].holes[0])
    const i = CLUBS.findIndex((c) => c.putter)
    const b = pureLaunch(i)
    const start = { x: h.cup.x - 6, y: h.groundY(h.cup.x - 6, h.cup.z) + 0.021, z: h.cup.z }
    // Putt straight across the slope (+X): the green falls toward +Z (the front), so it should drift that way.
    const r = simulate({ ...b, ballSpeed: 2.6 }, start, Math.PI / 2, { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: h.surfaceAt, groundY: h.groundY })
    expect(r.restPos.z).toBeGreaterThan(start.z + 0.15)
  })

  it('a ball putted weakly up a false front rolls back off it', () => {
    const h = buildHole(COURSES[0].holes[3])
    // Front edge of the Crown Jewel green, on the side facing the approach.
    const inX = 0.383
    const inZ = -0.924
    const sx = h.green.x - inX * 11.5
    const sz = h.green.z - inZ * 11.5
    const start = { x: sx, y: h.groundY(sx, sz) + 0.021, z: sz }
    const aim = Math.atan2(h.cup.x - sx, -(h.cup.z - sz))
    const i = CLUBS.findIndex((c) => c.putter)
    const r = simulate({ ...pureLaunch(i), ballSpeed: 1.2 }, start, aim, { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: h.surfaceAt, groundY: h.groundY })
    const d0 = Math.hypot(h.cup.x - sx, h.cup.z - sz)
    const d1 = Math.hypot(h.cup.x - r.restPos.x, h.cup.z - r.restPos.z)
    expect(d1).toBeGreaterThan(d0 - 0.5)
  })
})
