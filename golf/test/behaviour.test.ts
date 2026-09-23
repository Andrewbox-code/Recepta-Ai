import { describe, expect, it } from 'vitest'
import { simulate, type Env } from '../src/physics/flight'
import { analyzeSwing } from '../src/swing/analyze'
import { computeLaunch } from '../src/physics/impact'
import { CLUBS } from '../src/physics/clubs'
import { LIES } from '../src/physics/lies'
import { gesture, pureLaunch } from './helpers'

const calm: Env = { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: () => 'fairway' }
const start = { x: 0, y: 0.03, z: 0 }
const fixedRng = () => 0.5 // gauss(0.5, 0.5) = sqrt(2 ln2)*cos(pi) ~ -1.18; use zeroRng below instead
const zeroRng = (() => {
  // gauss() with u=e^-0.5? Simpler: alternate so cos term is 0 -> exactly zero noise.
  let i = 0
  return () => (i++ % 2 === 0 ? 0.6 : 0.25)
})()
void fixedRng

describe('ball flight behaviour', () => {
  it('positive spin-axis tilt curves the ball right, negative left', () => {
    const fade = simulate(pureLaunch(3, { tiltDeg: 15 }), start, 0, calm)
    const draw = simulate(pureLaunch(3, { tiltDeg: -15 }), start, 0, calm)
    expect(fade.carryOffline).toBeGreaterThan(8)
    expect(draw.carryOffline).toBeLessThan(-8)
  })

  it('headwind shortens and helpwind lengthens a 7 iron', () => {
    const base = simulate(pureLaunch(3), start, 0, calm).carry
    const into = simulate(pureLaunch(3), start, 0, { ...calm, wind: { speed: 7, dir: Math.PI, gust: 0, phase: 0 } }).carry
    const down = simulate(pureLaunch(3), start, 0, { ...calm, wind: { speed: 7, dir: 0, gust: 0, phase: 0 } }).carry
    expect(into).toBeLessThan(base - 12)
    expect(down).toBeGreaterThan(base + 6)
  })

  it('a crosswind moves a high wedge more than a low punch', () => {
    const cross = { ...calm, wind: { speed: 8, dir: Math.PI / 2, gust: 0, phase: 0 } }
    const high = simulate(pureLaunch(6), start, 0, cross)
    const low = simulate(pureLaunch(6, { launchV: 14, spinRpm: 6000 }), start, 0, cross)
    expect(high.carryOffline / high.carry).toBeGreaterThan(low.carryOffline / low.carry)
  })

  it('wedges stop quickly on a green; driver releases on a firm fairway', () => {
    const green = simulate(pureLaunch(5), start, 0, { ...calm, surfaceAt: () => 'green' })
    expect(green.total - green.carry).toBeLessThan(6)
    const firm = simulate(pureLaunch(0), start, 0, { ...calm, firmness: 0.9 })
    const soft = simulate(pureLaunch(0), start, 0, { ...calm, firmness: 0.1 })
    expect(firm.total - firm.carry).toBeGreaterThan(soft.total - soft.carry + 5)
  })
})

describe('swing analysis', () => {
  const U = 300
  it('reads tempo, path and a centred release from a smooth swing', () => {
    const m = analyzeSwing(gesture({ unit: U }), U)!
    expect(m).not.toBeNull()
    expect(m.tempoRatio).toBeGreaterThan(2.3)
    expect(m.tempoRatio).toBeLessThan(3.4)
    expect(Math.abs(m.pathAngle)).toBeLessThan(1)
    expect(Math.abs(m.releaseOffset)).toBeLessThan(0.08)
    expect(Math.abs(m.crossX)).toBeLessThan(0.01)
  })

  it('an in-to-out gesture starts the ball right and draws it back', () => {
    const m = analyzeSwing(gesture({ unit: U, pathDeg: 12 }), U)!
    expect(m.pathAngle).toBeGreaterThan(10)
    const l = computeLaunch(m, CLUBS[3], LIES.fairway, m.speed, zeroRng)
    expect(l.path).toBeGreaterThan(3)
    expect(l.launchH).toBeGreaterThan(1.5)
    expect(l.tiltDeg).toBeLessThan(-2)
  })

  it('an out-to-in gesture starts left and fades', () => {
    const m = analyzeSwing(gesture({ unit: U, pathDeg: -14 }), U)!
    const l = computeLaunch(m, CLUBS[0], LIES.tee, m.speed, zeroRng)
    expect(l.launchH).toBeLessThan(-1.5)
    expect(l.tiltDeg).toBeGreaterThan(4)
    const r = simulate(l, start, 0, calm)
    expect(r.carryOffline).toBeGreaterThan(r.carry * Math.sin((l.launchH * Math.PI) / 180)) // curved back right of its start line
  })

  it('quitting at the ball (no follow-through) releases early and hits it fat', () => {
    const m = analyzeSwing(gesture({ unit: U, follow: 0.15 }), U)!
    expect(m.releaseOffset).toBeGreaterThan(0.2)
    const l = computeLaunch(m, CLUBS[3], LIES.fairway, m.speed, zeroRng)
    expect(['fat', 'chunk']).toContain(l.contact)
  })

  it('a tiny backswing thrown into a huge follow-through catches it thin', () => {
    const m = analyzeSwing(gesture({ unit: U, depth: 0.5, follow: 1.8, backMs: 400, downMs: 140 }), U)!
    expect(m.releaseOffset).toBeLessThan(-0.2)
    const l = computeLaunch(m, CLUBS[3], LIES.fairway, m.speed, zeroRng)
    expect(['thin', 'top']).toContain(l.contact)
  })

  it('snatching from the top costs composure', () => {
    const smooth = analyzeSwing(gesture({ unit: U }), U)!
    const snatch = analyzeSwing(gesture({ unit: U, backMs: 1300, downMs: 110 }), U)!
    const a = computeLaunch(smooth, CLUBS[3], LIES.fairway, smooth.speed, zeroRng)
    const b = computeLaunch(snatch, CLUBS[3], LIES.fairway, snatch.speed, zeroRng)
    expect(b.chaos).toBeGreaterThan(a.chaos + 0.3)
  })

  it('missing the ball toward the heel shanks it', () => {
    const m = analyzeSwing(gesture({ unit: U, crossX: -0.45 }), U)!
    const l = computeLaunch(m, CLUBS[3], LIES.fairway, m.speed, zeroRng)
    expect(l.contact).toBe('shank')
    expect(l.launchH).toBeGreaterThan(20)
  })

  it('ignores a waggle that never reaches the top', () => {
    expect(analyzeSwing(gesture({ unit: U, depth: 0.1 }), U)).toBeNull()
  })
})
