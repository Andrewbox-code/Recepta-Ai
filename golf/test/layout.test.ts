import { describe, expect, it } from 'vitest'
import { POND, PRACTICE, TARGETS, WATER_Y, YD, groundY, heightAt, surfaceAt } from '../src/world/layout'
import { simulate } from '../src/physics/flight'
import { clubById } from '../src/physics/clubs'
import { pureLaunch } from './helpers'
import { CLUBS } from '../src/physics/clubs'

describe('course layout', () => {
  it('tee and practice green are flat and at ground zero', () => {
    for (const [x, z] of [[0, 0], [2, -1], [PRACTICE.cup.x, PRACTICE.cup.z]]) expect(Math.abs(heightAt(x, z))).toBeLessThan(0.02)
    expect(surfaceAt(0, 0)).toBe('fairway')
    expect(surfaceAt(PRACTICE.cup.x, PRACTICE.cup.z)).toBe('green')
  })

  it('greens, bunkers and the pond are where the physics thinks they are', () => {
    for (const t of TARGETS) {
      expect(surfaceAt(t.x, -t.yd * YD)).toBe('green')
      const b = t.bunkers[0]
      expect(surfaceAt(t.x + b.dx, -t.yd * YD + b.dz)).toBe('sand')
      expect(heightAt(t.x + b.dx, -t.yd * YD + b.dz)).toBeLessThan(heightAt(t.x, -t.yd * YD))
    }
    expect(surfaceAt(POND.x, POND.z)).toBe('water')
    expect(groundY(POND.x, POND.z)).toBeCloseTo(WATER_Y)
    expect(heightAt(POND.x, POND.z)).toBeLessThan(WATER_Y)
  })

  it('a shot aimed at the pond finishes wet', () => {
    const aim = Math.atan2(POND.x, -POND.z)
    const i = CLUBS.indexOf(clubById('lw'))
    // Lob wedge ~85 yd carry: pond centre is ~116 yd, so add a little.
    const l = pureLaunch(i, { ballSpeed: pureLaunch(i).ballSpeed * 1.2 })
    const r = simulate(l, { x: 0, y: 0.03, z: 0 }, aim, { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt, groundY })
    expect(r.restSurface).toBe('water')
  })
})
