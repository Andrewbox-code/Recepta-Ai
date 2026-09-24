import { ALL_ITEMS, STARTER_IDS, type Rarity } from '../physics/equipment'

// Chest balls: earned by playing well, opened for cards. The first card of
// an item unlocks it; duplicates level it up.

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum'
export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum']
export const TIER_INFO: Record<Tier, { name: string; color: string; cards: number; odds: Record<Rarity, number>; guarantee?: Rarity }> = {
  bronze: { name: 'Bronze Ball', color: '#c47a3c', cards: 2, odds: { common: 70, rare: 25, epic: 5, legendary: 0 } },
  silver: { name: 'Silver Ball', color: '#c9d3dc', cards: 3, odds: { common: 45, rare: 40, epic: 13, legendary: 2 }, guarantee: 'rare' },
  gold: { name: 'Gold Ball', color: '#f2c341', cards: 4, odds: { common: 0, rare: 50, epic: 38, legendary: 12 }, guarantee: 'epic' },
  platinum: { name: 'Platinum Ball', color: '#a6ecff', cards: 5, odds: { common: 0, rare: 0, epic: 60, legendary: 40 }, guarantee: 'legendary' },
}
const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

// Cards needed to reach each level (cumulative after the unlocking card).
export const LEVEL_CARDS = [1, 2, 4, 7, 11] // total cards for Lv1..Lv5
export const MAX_LEVEL = LEVEL_CARDS.length
export const XP_PER_BRONZE = 100

export interface Reward {
  id: string
  isNew: boolean
  levelUp: boolean
  level: number
}

export interface ShotEvent {
  contact: string
  quality: number
  putt: boolean
  holed: boolean
  puttFt: number // putt length for holed putts
  pinYds: number // rest distance from the target pin (Infinity if none)
  onGreen: boolean
  water: boolean
}

interface Saved {
  cards: Record<string, number>
  chests: Tier[]
  xp: number
  opened: number
}

export class Progress {
  cards: Record<string, number> = {}
  chests: Tier[] = []
  xp = 0
  opened = 0
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage
    let saved: Saved | null = null
    try {
      const raw = storage?.getItem('purestrike.progress')
      saved = raw ? (JSON.parse(raw) as Saved) : null
    } catch {
      saved = null
    }
    if (saved) {
      this.cards = saved.cards ?? {}
      this.chests = saved.chests ?? []
      this.xp = saved.xp ?? 0
      this.opened = saved.opened ?? 0
    } else {
      for (const id of STARTER_IDS) this.cards[id] = 1
      this.chests = ['silver'] // welcome gift
    }
  }

  save() {
    try {
      this.storage?.setItem('purestrike.progress', JSON.stringify({ cards: this.cards, chests: this.chests, xp: this.xp, opened: this.opened }))
    } catch {
      /* private mode */
    }
  }

  unlocked(id: string) {
    return (this.cards[id] ?? 0) > 0
  }

  level(id: string) {
    const n = this.cards[id] ?? 0
    let lvl = 0
    for (let i = 0; i < LEVEL_CARDS.length; i++) if (n >= LEVEL_CARDS[i]) lvl = i + 1
    return lvl
  }

  // Cards held toward the next level, and how many that level needs.
  nextLevel(id: string): { have: number; need: number } | null {
    const lvl = this.level(id)
    if (lvl >= MAX_LEVEL || lvl === 0) return null
    return { have: (this.cards[id] ?? 0) - LEVEL_CARDS[lvl - 1], need: LEVEL_CARDS[lvl] - LEVEL_CARDS[lvl - 1] }
  }

  // Score a finished shot: XP toward bronze, straight-to-chest for great moments.
  award(e: ShotEvent): { xp: number; chests: Tier[] } {
    let xp = 2
    const chests: Tier[] = []
    if (!e.putt) {
      if (e.contact === 'pure') xp += 10
      else if (e.contact === 'good') xp += 5
      if (e.onGreen) xp += 10
      if (e.pinYds < 10) xp += 10
      if (e.pinYds < 3) xp += 15
      if (e.holed) chests.push('platinum')
      else if (e.pinYds < 1) chests.push('gold')
      else if (e.pinYds < 2) chests.push('silver')
    } else if (e.holed) {
      xp += 10
      if (e.puttFt >= 25) chests.push('gold')
      else if (e.puttFt >= 10) chests.push('silver')
    }
    if (e.water) xp = 1
    this.xp += xp
    while (this.xp >= XP_PER_BRONZE) {
      this.xp -= XP_PER_BRONZE
      chests.push('bronze')
    }
    this.chests.push(...chests)
    this.save()
    return { xp, chests }
  }

  // Open the chest at index i. Deterministic given rng, so it can be tested.
  open(i: number, rng: () => number = Math.random): Reward[] {
    const tier = this.chests[i]
    if (!tier) return []
    this.chests.splice(i, 1)
    const info = TIER_INFO[tier]
    const out: Reward[] = []
    for (let k = 0; k < info.cards; k++) {
      let rarity = rollRarity(info.odds, rng)
      // The last card honours the chest's guarantee.
      if (k === info.cards - 1 && info.guarantee && !out.some((r) => RANK[rarityOf(r.id)] >= RANK[info.guarantee!]) && RANK[rarity] < RANK[info.guarantee]) rarity = info.guarantee
      const pool = ALL_ITEMS.filter((it) => it.rarity === rarity && this.level(it.id) < MAX_LEVEL)
      if (!pool.length) continue
      // Lean toward things you don't own yet.
      const locked = pool.filter((it) => !this.unlocked(it.id))
      const from = locked.length && rng() < 0.65 ? locked : pool
      const item = from[Math.floor(rng() * from.length)]
      const before = this.level(item.id)
      this.cards[item.id] = (this.cards[item.id] ?? 0) + 1
      const after = this.level(item.id)
      out.push({ id: item.id, isNew: before === 0, levelUp: before > 0 && after > before, level: after })
    }
    this.opened++
    this.save()
    return out
  }
}

function rollRarity(odds: Record<Rarity, number>, rng: () => number): Rarity {
  const total = odds.common + odds.rare + odds.epic + odds.legendary
  let r = rng() * total
  for (const k of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
    r -= odds[k]
    if (r < 0) return k
  }
  return 'common'
}

export const rarityOf = (id: string): Rarity => ALL_ITEMS.find((i) => i.id === id)?.rarity ?? 'common'
