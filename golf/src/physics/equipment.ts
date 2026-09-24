import type { Club } from './clubs'

// Equipment: every club model and ball trades something for something.
// Brand and model names are fictional.

export type Slot = 'driver' | 'woods' | 'irons' | 'wedges' | 'putter'

// What a piece of equipment does to the strike. All neutral at 1 / 0.
export interface Mods {
  speed: number // ball-speed multiplier (distance)
  spin: number // spin multiplier
  forgiveness: number // 0..0.6: keeps speed and start line on mishits, softens fat/thin
  control: number // -0.3..0.5: shrinks the random scatter a rushed swing adds
  launch: number // degrees added to launch
  work: number // how much face-to-path curves it (tour heads are more workable)
  slowBonus: number // extra ball speed for slower swings (low-compression balls)
}

export const NEUTRAL: Mods = { speed: 1, spin: 1, forgiveness: 0, control: 0, launch: 0, work: 1, slowBonus: 0 }

// 0..10 bars for the Pro Shop. Putters only rate forgiveness and control.
export interface Stats {
  distance?: number
  spin?: number
  forgiveness?: number
  control?: number
  feel?: number
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }
export const RARITY_COLOR: Record<Rarity, string> = { common: '#b8c2ca', rare: '#4da3ff', epic: '#b76bff', legendary: '#f2b53a' }

export type HeadStyle = 'max' | 'speed' | 'tour' | 'gi' | 'cavity' | 'blade' | 'spinmill' | 'widesole' | 'chrome' | 'classic' | 'mallet' | 'milled'

export interface ClubLine {
  id: string
  slot: Slot
  brand: string
  model: string
  tagline: string
  stats: Stats
  mods: Partial<Mods>
  head: HeadStyle
  accent: number // paint-fill / badge colour
  shaft: 'graphite' | 'steel' | 'putter'
  rarity: Rarity
}

export interface BallModel {
  id: string
  brand: string
  model: string
  tagline: string
  stats: Stats
  speed: number
  longSpin: number // driver & woods
  ironSpin: number
  wedgeSpin: number
  slowBonus: number
  color: number
  logo: string
  logoColor: string
  rarity: Rarity
}

export const CLUB_LINES: ClubLine[] = [
  // ---- Drivers ----
  { id: 'stratos-max-dr', slot: 'driver', brand: 'Stratos', model: 'MAX', tagline: 'Big-MOI head. Mishits stay in play.', stats: { distance: 6, spin: 6, forgiveness: 10, control: 6 }, mods: { spin: 1.1, forgiveness: 0.5, control: 0.1, launch: 0.5, work: 0.8 }, head: 'max', accent: 0x2f7fd8, shaft: 'graphite' , rarity: 'common' },
  { id: 'vanta-ls-dr', slot: 'driver', brand: 'Vanta', model: 'LS Speed', tagline: 'Low spin, max ball speed. Find the centre or pay.', stats: { distance: 10, spin: 3, forgiveness: 3, control: 5 }, mods: { speed: 1.045, spin: 0.94, forgiveness: 0.02, control: -0.1, launch: 0.5 }, head: 'speed', accent: 0xe0342f, shaft: 'graphite' , rarity: 'epic' },
  { id: 'halcyon-dr', slot: 'driver', brand: 'Halcyon', model: 'Tour', tagline: 'Compact and workable. Tight dispersion.', stats: { distance: 8, spin: 5, forgiveness: 5, control: 10 }, mods: { speed: 1.02, spin: 1.0, forgiveness: 0.15, control: 0.4, work: 1.15 }, head: 'tour', accent: 0xc9a44a, shaft: 'graphite' , rarity: 'legendary' },
  // ---- Fairway woods & hybrids ----
  { id: 'stratos-max-fw', slot: 'woods', brand: 'Stratos', model: 'MAX', tagline: 'Easy launch off the deck.', stats: { distance: 6, spin: 6, forgiveness: 10, control: 6 }, mods: { spin: 1.06, forgiveness: 0.45, control: 0.1, launch: 1, work: 0.85 }, head: 'max', accent: 0x2f7fd8, shaft: 'graphite' , rarity: 'common' },
  { id: 'vanta-fw', slot: 'woods', brand: 'Vanta', model: 'Speed', tagline: 'Hot face, penetrating flight.', stats: { distance: 10, spin: 4, forgiveness: 4, control: 5 }, mods: { speed: 1.03, spin: 0.88, forgiveness: 0.05, launch: -0.4 }, head: 'speed', accent: 0xe0342f, shaft: 'graphite' , rarity: 'epic' },
  { id: 'halcyon-fw', slot: 'woods', brand: 'Halcyon', model: 'Tour', tagline: 'Shape it both ways.', stats: { distance: 8, spin: 6, forgiveness: 5, control: 10 }, mods: { speed: 1.01, forgiveness: 0.15, control: 0.4, work: 1.15 }, head: 'tour', accent: 0xc9a44a, shaft: 'graphite' , rarity: 'epic' },
  // ---- Irons ----
  { id: 'kestrel-gi', slot: 'irons', brand: 'Kestrel', model: 'GI Max', tagline: 'Wide sole, deep cavity. Pure it or not, it goes.', stats: { distance: 9, spin: 4, forgiveness: 10, control: 5 }, mods: { speed: 1.03, spin: 0.93, forgiveness: 0.55, control: 0.05, launch: 1, work: 0.8 }, head: 'gi', accent: 0x2f7fd8, shaft: 'steel' , rarity: 'rare' },
  { id: 'kestrel-pc', slot: 'irons', brand: 'Kestrel', model: 'Players CB', tagline: 'A little of everything.', stats: { distance: 7, spin: 6, forgiveness: 7, control: 7 }, mods: { speed: 1.01, forgiveness: 0.25, control: 0.2 }, head: 'cavity', accent: 0xb8bec6, shaft: 'steel' , rarity: 'common' },
  { id: 'marlowe-mb', slot: 'irons', brand: 'Marlowe', model: 'Forged MB', tagline: 'Forged blades. Surgical, unforgiving.', stats: { distance: 5, spin: 9, forgiveness: 2, control: 10 }, mods: { speed: 0.99, spin: 1.04, forgiveness: 0, control: 0.45, work: 1.2 }, head: 'blade', accent: 0x1f2a33, shaft: 'steel' , rarity: 'legendary' },
  // ---- Wedges ----
  { id: 'rook-spin', slot: 'wedges', brand: 'Rook', model: 'SpinMill Raw', tagline: 'Aggressive grooves. Maximum check.', stats: { distance: 5, spin: 10, forgiveness: 4, control: 8 }, mods: { spin: 1.06, forgiveness: 0.08, control: 0.3 }, head: 'spinmill', accent: 0xd24b2a, shaft: 'steel' , rarity: 'epic' },
  { id: 'rook-wide', slot: 'wedges', brand: 'Rook', model: 'WideSole', tagline: 'Bounce that forgives a heavy hand.', stats: { distance: 5, spin: 7, forgiveness: 10, control: 6 }, mods: { spin: 1.0, forgiveness: 0.5, control: 0.1 }, head: 'widesole', accent: 0x2f7fd8, shaft: 'steel' , rarity: 'rare' },
  { id: 'rook-chrome', slot: 'wedges', brand: 'Rook', model: 'Tour Chrome', tagline: 'Classic tour grind.', stats: { distance: 5, spin: 8, forgiveness: 6, control: 8 }, mods: { spin: 1.03, forgiveness: 0.2, control: 0.2 }, head: 'chrome', accent: 0x1f2a33, shaft: 'steel' , rarity: 'common' },
  // ---- Putters ----
  { id: 'lyle-blade', slot: 'putter', brand: 'Lyle', model: 'Classic Blade', tagline: 'Pure feel for pace.', stats: { forgiveness: 4, control: 9 }, mods: { forgiveness: 0.05, control: 0.35 }, head: 'classic', accent: 0xb8bec6, shaft: 'putter' , rarity: 'common' },
  { id: 'orbit-mallet', slot: 'putter', brand: 'Orbit', model: 'Mallet 7', tagline: 'High MOI. Off-centre putts still get there.', stats: { forgiveness: 10, control: 7 }, mods: { forgiveness: 0.5, control: 0.15 }, head: 'mallet', accent: 0xe0342f, shaft: 'putter' , rarity: 'rare' },
  { id: 'lyle-milled', slot: 'putter', brand: 'Lyle', model: 'Tour Milled', tagline: 'Milled face, tour-tight start lines.', stats: { forgiveness: 5, control: 10 }, mods: { forgiveness: 0.15, control: 0.45 }, head: 'milled', accent: 0xc9a44a, shaft: 'putter' , rarity: 'epic' },
]

export const BALLS: BallModel[] = [
  { id: 'range-ball', brand: 'Practice', model: 'Range Ball', tagline: 'Striped and scuffed. It does the job, just.', stats: { distance: 4, spin: 4, feel: 3 }, speed: 0.975, longSpin: 1.02, ironSpin: 0.97, wedgeSpin: 0.95, slowBonus: 0, color: 0xf3f3ef, logo: 'RANGE', logoColor: '#c0392b', rarity: 'common' },
  { id: 'velo-distance', brand: 'Velo', model: 'Distance', tagline: 'Two-piece, low spin. Long, but it won’t stop on greens.', stats: { distance: 10, spin: 3, feel: 4 }, speed: 1.02, longSpin: 0.92, ironSpin: 0.96, wedgeSpin: 0.95, slowBonus: 0, color: 0xf7f7f5, logo: 'VELO', logoColor: '#d4252b' , rarity: 'rare' },
  { id: 'aria-tour', brand: 'Aria', model: 'Tour', tagline: 'Urethane cover. Grabs on wedges, soft off the putter.', stats: { distance: 7, spin: 9, feel: 9 }, speed: 1.0, longSpin: 1.0, ironSpin: 1.01, wedgeSpin: 1.03, slowBonus: 0, color: 0xf8f8f6, logo: 'ARIA', logoColor: '#141414' , rarity: 'epic' },
  { id: 'aria-tourx', brand: 'Aria', model: 'Tour X', tagline: 'Firmer tour ball. Less driver spin, still checks.', stats: { distance: 8, spin: 8, feel: 7 }, speed: 1.01, longSpin: 0.95, ironSpin: 1.0, wedgeSpin: 1.02, slowBonus: 0, color: 0xf8f8f6, logo: 'ARIA X', logoColor: '#1e4fa8' , rarity: 'legendary' },
  { id: 'nimbus-soft', brand: 'Nimbus', model: 'Soft', tagline: 'Low compression. Extra pace for smooth swingers.', stats: { distance: 7, spin: 5, feel: 10 }, speed: 0.99, longSpin: 0.97, ironSpin: 0.97, wedgeSpin: 0.95, slowBonus: 0.035, color: 0xf2e86a, logo: 'NIMBUS', logoColor: '#1b1b1b' , rarity: 'rare' },
  { id: 'aurora-pro', brand: 'Aurora', model: 'Pro V', tagline: 'Five-layer tour ball. Long off the tee and still bites.', stats: { distance: 10, spin: 9, feel: 9 }, speed: 1.02, longSpin: 0.94, ironSpin: 1.01, wedgeSpin: 1.03, slowBonus: 0, color: 0xfafaf8, logo: 'AURORA', logoColor: '#7a3cc2', rarity: 'legendary' },
]

export const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'driver', label: 'Driver' },
  { slot: 'woods', label: 'Woods & Hybrids' },
  { slot: 'irons', label: 'Irons' },
  { slot: 'wedges', label: 'Wedges' },
  { slot: 'putter', label: 'Putter' },
]

export type Loadout = Record<Slot, string> & { ball: string }

export const DEFAULT_LOADOUT: Loadout = {
  driver: 'stratos-max-dr',
  woods: 'stratos-max-fw',
  irons: 'kestrel-pc',
  wedges: 'rook-chrome',
  putter: 'lyle-blade',
  ball: 'range-ball',
}

// What a new player owns: one sensible model per slot and a range ball.
export const STARTER_IDS = ['stratos-max-dr', 'stratos-max-fw', 'kestrel-pc', 'rook-chrome', 'lyle-blade', 'range-ball']

export const ALL_ITEMS = [...CLUB_LINES.map((l) => ({ id: l.id, rarity: l.rarity, name: `${l.brand} ${l.model}`, kind: l.slot as Slot | 'ball' })), ...BALLS.map((b) => ({ id: b.id, rarity: b.rarity, name: `${b.brand} ${b.model}`, kind: 'ball' as const }))]

// Levels from duplicate cards: small, across-the-board gains.
export function levelBonus(m: Mods, level: number): Mods {
  const l = Math.max(0, level - 1)
  return { ...m, speed: m.speed * (1 + 0.003 * l), forgiveness: m.forgiveness + 0.025 * l, control: m.control + 0.025 * l }
}

export function slotOf(c: Club): Slot {
  if (c.putter) return 'putter'
  if (c.id === 'dr') return 'driver'
  if (c.wood) return 'woods'
  if (c.sound === 'wedge') return 'wedges'
  return 'irons'
}

export const lineById = (id: string) => CLUB_LINES.find((l) => l.id === id)
export const ballById = (id: string) => BALLS.find((b) => b.id === id) ?? BALLS[0]

export function lineFor(c: Club, loadout: Loadout): ClubLine {
  const slot = slotOf(c)
  const l = lineById(loadout[slot])
  return l && l.slot === slot ? l : CLUB_LINES.find((x) => x.slot === slot)!
}

// Combine the club head and the ball into one set of strike modifiers.
export function modsFor(c: Club, loadout: Loadout, levelOf: (id: string) => number = () => 1): Mods {
  const line = lineFor(c, loadout)
  const ball = ballById(loadout.ball)
  const m: Mods = levelBonus({ ...NEUTRAL, ...line.mods }, levelOf(line.id))
  if (c.putter) return m // the ball barely matters on a putt
  const slot = slotOf(c)
  const ballSpin = slot === 'driver' || slot === 'woods' ? ball.longSpin : slot === 'wedges' ? ball.wedgeSpin : ball.ironSpin
  const bl = Math.max(0, levelOf(ball.id) - 1)
  return { ...m, speed: m.speed * ball.speed * (1 + 0.002 * bl), spin: m.spin * ballSpin, slowBonus: ball.slowBonus }
}
