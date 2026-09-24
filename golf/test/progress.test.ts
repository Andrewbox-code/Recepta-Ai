import { describe, expect, it } from 'vitest'
import { Progress, TIER_INFO, XP_PER_BRONZE, rarityOf } from '../src/game/progress'
import { STARTER_IDS, ALL_ITEMS, modsFor, DEFAULT_LOADOUT } from '../src/physics/equipment'
import { clubById } from '../src/physics/clubs'

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}
const shot = { contact: 'good', quality: 0.8, putt: false, holed: false, puttFt: 0, pinYds: 40, onGreen: false, water: false }

describe('chest balls and unlocks', () => {
  it('a new player owns only the starter kit and has a welcome chest', () => {
    const p = new Progress(mem())
    for (const it of ALL_ITEMS) expect(p.unlocked(it.id)).toBe(STARTER_IDS.includes(it.id))
    expect(p.chests).toEqual(['silver'])
  })

  it('progress survives a reload', () => {
    const store = mem()
    const a = new Progress(store)
    a.open(0, seeded(3))
    const b = new Progress(store)
    expect(b.cards).toEqual(a.cards)
    expect(b.chests).toEqual([])
  })

  it('great shots earn chests directly; XP adds up to bronze', () => {
    const p = new Progress(mem())
    expect(p.award({ ...shot, pinYds: 0.6 }).chests).toContain('gold')
    expect(p.award({ ...shot, pinYds: 1.5 }).chests).toContain('silver')
    expect(p.award({ ...shot, holed: true, pinYds: 0 }).chests).toContain('platinum')
    expect(p.award({ ...shot, putt: true, holed: true, puttFt: 30 }).chests).toContain('gold')
    let bronze = 0
    for (let i = 0; i < 40; i++) bronze += p.award(shot).chests.filter((c) => c === 'bronze').length
    expect(bronze).toBeGreaterThanOrEqual(Math.floor((40 * 7) / XP_PER_BRONZE) - 1)
  })

  it('chests deal the right number of cards and honour their guarantee', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      for (let s = 1; s < 40; s++) {
        const p = new Progress(mem())
        p.chests = [tier]
        const r = p.open(0, seeded(s))
        expect(r.length).toBe(TIER_INFO[tier].cards)
        const g = TIER_INFO[tier].guarantee
        if (g) {
          const rank = { common: 0, rare: 1, epic: 2, legendary: 3 }
          expect(Math.max(...r.map((x) => rank[rarityOf(x.id)]))).toBeGreaterThanOrEqual(rank[g])
        }
      }
    }
  })

  it('duplicates level items up and levels make the club better', () => {
    const p = new Progress(mem())
    p.cards['kestrel-pc'] = 4
    expect(p.level('kestrel-pc')).toBe(3)
    const lv1 = modsFor(clubById('7i'), DEFAULT_LOADOUT, () => 1)
    const lv3 = modsFor(clubById('7i'), DEFAULT_LOADOUT, (id) => p.level(id))
    expect(lv3.speed).toBeGreaterThan(lv1.speed)
    expect(lv3.forgiveness).toBeGreaterThan(lv1.forgiveness)
  })

  it('opening enough chests eventually unlocks everything', () => {
    const p = new Progress(mem())
    const rng = seeded(11)
    for (let i = 0; i < 300; i++) {
      p.chests = ['gold']
      p.open(0, rng)
      p.chests = ['bronze']
      p.open(0, rng)
    }
    for (const it of ALL_ITEMS) expect(p.unlocked(it.id)).toBe(true)
  })
})
