import { describe, expect, it } from 'vitest'
import { analyzeSwing } from '../src/swing/analyze'
import { computeLaunch } from '../src/physics/impact'
import { clubById } from '../src/physics/clubs'
import { LIES } from '../src/physics/lies'
import { DEFAULT_LOADOUT, modsFor, type Loadout } from '../src/physics/equipment'
import { simulate } from '../src/physics/flight'
import { gesture } from './helpers'

const U = 300
const zero = () => {
  let i = 0
  return () => (i++ % 2 === 0 ? 0.6 : 0.25) // gauss() == 0: no randomness
}
const calm = { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: () => 'fairway' as const }
const with_ = (o: Partial<Loadout>): Loadout => ({ ...DEFAULT_LOADOUT, ...o })
const pure = analyzeSwing(gesture({ unit: U }), U)!
const toeHit = analyzeSwing(gesture({ unit: U, crossX: 0.3 }), U)!
const fatHit = analyzeSwing(gesture({ unit: U, follow: 0.55 }), U)!

function shot(m: typeof pure, clubId: string, lo: Loadout, lie = LIES.fairway) {
  const c = clubById(clubId)
  const l = computeLaunch(m, c, lie, m.speed, zero(), modsFor(c, lo))
  return { l, r: simulate(l, { x: 0, y: 0.03, z: 0 }, 0, calm) }
}

describe('equipment trade-offs', () => {
  it('the distance driver carries farther on a pure strike', () => {
    const max = shot(pure, 'dr', with_({ driver: 'stratos-max-dr' }), LIES.tee)
    const speed = shot(pure, 'dr', with_({ driver: 'vanta-ls-dr' }), LIES.tee)
    expect(speed.r.total).toBeGreaterThan(max.r.total + 5)
    expect(speed.l.spinRpm).toBeLessThan(max.l.spinRpm)
  })

  it('the forgiving driver keeps more ball speed on a toe strike', () => {
    const max = shot(toeHit, 'dr', with_({ driver: 'stratos-max-dr' }), LIES.tee)
    const speed = shot(toeHit, 'dr', with_({ driver: 'vanta-ls-dr' }), LIES.tee)
    const maxPure = shot(pure, 'dr', with_({ driver: 'stratos-max-dr' }), LIES.tee)
    const speedPure = shot(pure, 'dr', with_({ driver: 'vanta-ls-dr' }), LIES.tee)
    expect(max.l.ballSpeed / maxPure.l.ballSpeed).toBeGreaterThan(speed.l.ballSpeed / speedPure.l.ballSpeed)
  })

  it('game-improvement irons shrug off a heavy strike better than blades', () => {
    const gi = shot(fatHit, '7i', with_({ irons: 'kestrel-gi' }))
    const mb = shot(fatHit, '7i', with_({ irons: 'marlowe-mb' }))
    expect(gi.r.carry).toBeGreaterThan(mb.r.carry + 3)
  })

  it('tour balls and spin-milled wedges spin more than distance balls', () => {
    const tour = shot(pure, 'sw', with_({ ball: 'aria-tour', wedges: 'rook-spin' }))
    const dist = shot(pure, 'sw', with_({ ball: 'velo-distance', wedges: 'rook-spin' }))
    expect(tour.l.spinRpm).toBeGreaterThan(dist.l.spinRpm * 1.06)
  })

  it('tour spin makes a wedge stop quicker on a green', () => {
    const green = { ...calm, surfaceAt: () => 'green' as const }
    const run = (ball: string) => {
      const c = clubById('pw')
      const l = computeLaunch(pure, c, LIES.fairway, pure.speed, zero(), modsFor(c, with_({ ball, wedges: 'rook-spin' })))
      const r = simulate(l, { x: 0, y: 0.021, z: 0 }, 0, green)
      return r.total - r.carry
    }
    expect(run('aria-tour')).toBeLessThan(run('velo-distance'))
  })

  it('a distance ball goes farther off the tee', () => {
    const tour = shot(pure, 'dr', with_({ ball: 'aria-tour' }), LIES.tee)
    const dist = shot(pure, 'dr', with_({ ball: 'velo-distance' }), LIES.tee)
    expect(dist.r.total).toBeGreaterThan(tour.r.total)
  })

  it('every club resolves to a line of the right slot', () => {
    for (const id of ['dr', '3w', '3h', '4i', '9i', 'pw', 'lw', 'pt']) expect(modsFor(clubById(id), DEFAULT_LOADOUT)).toBeTruthy()
  })
})
