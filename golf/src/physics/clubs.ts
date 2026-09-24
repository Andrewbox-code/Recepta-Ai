// Club characteristics for a strong amateur / low-handicap player.
// `maxSpeed` is clubhead speed (m/s) at a 100% swing; the launch/spin numbers
// are what a centred, well-timed strike produces at that speed. Everything off
// that baseline comes from the swing and the lie, never from a menu.

export interface Club {
  id: string
  name: string
  short: string
  loft: number // static loft, degrees
  maxSpeed: number // m/s clubhead speed at a full, on-tempo swing
  smash: number // ball speed / club speed on a pure strike
  launch: number // launch angle, degrees, on a pure full strike
  spin: number // backspin rpm on a pure full strike
  faceWeight: number // share of start direction set by face (vs path)
  tiltGain: number // spin-axis tilt degrees per degree of face-to-path
  gear: number // gear-effect strength (woods high, irons low)
  wood: boolean
  putter?: boolean
  sound: 'driver' | 'wood' | 'iron' | 'wedge' | 'putter'
}

const mph = (v: number) => v * 0.44704

type Row = [string, string, string, number, number, number, number, number, number, number, number, Club['sound']]
// id, name, short, loft, club mph, smash, launch, spin, faceWeight, tiltGain, gear, sound
const ROWS: Row[] = [
  ['dr', 'Driver', 'DR', 10.5, 108, 1.48, 12.5, 2650, 0.85, 2.6, 1, 'driver'],
  ['3w', '3 Wood', '3W', 15, 103, 1.46, 11, 3600, 0.82, 2.2, 0.8, 'wood'],
  ['5w', '5 Wood', '5W', 18, 100, 1.44, 12, 4300, 0.81, 2.0, 0.7, 'wood'],
  ['3h', '3 Hybrid', '3H', 20, 97.5, 1.42, 12, 4500, 0.8, 1.9, 0.5, 'wood'],
  ['4i', '4 Iron', '4i', 23, 95, 1.39, 11.5, 4900, 0.79, 1.8, 0.3, 'iron'],
  ['5i', '5 Iron', '5i', 26, 92, 1.37, 12.5, 5300, 0.78, 1.7, 0.25, 'iron'],
  ['6i', '6 Iron', '6i', 29.5, 89.5, 1.35, 14.5, 6100, 0.77, 1.6, 0.22, 'iron'],
  ['7i', '7 Iron', '7i', 33, 87, 1.33, 16.5, 7000, 0.75, 1.45, 0.2, 'iron'],
  ['8i', '8 Iron', '8i', 37, 84.5, 1.31, 18.5, 7800, 0.74, 1.35, 0.18, 'iron'],
  ['9i', '9 Iron', '9i', 41, 82, 1.28, 20.5, 8600, 0.72, 1.25, 0.15, 'iron'],
  ['pw', 'Pitching Wedge', 'PW', 46, 81, 1.27, 24, 9300, 0.7, 1.1, 0.1, 'wedge'],
  ['gw', 'Gap Wedge', 'GW', 50, 78.5, 1.23, 27, 9600, 0.68, 1.02, 0.1, 'wedge'],
  ['sw', 'Sand Wedge', 'SW', 56, 76, 1.2, 30, 9800, 0.66, 0.95, 0.1, 'wedge'],
  ['lw', 'Lob Wedge', 'LW', 60, 73, 1.15, 33, 10000, 0.64, 0.9, 0.1, 'wedge'],
]

export const CLUBS: Club[] = [
  ...ROWS.map(([id, name, short, loft, spd, smash, launch, spin, faceWeight, tiltGain, gear, sound]) => ({
    id,
    name,
    short,
    loft,
    maxSpeed: mph(spd),
    smash,
    launch,
    spin,
    faceWeight,
    tiltGain,
    gear,
    wood: sound === 'driver' || sound === 'wood',
    sound,
  })),
  // A full putting stroke rolls it ~20 m on a medium-fast green.
  { id: 'pt', name: 'Putter', short: 'PT', loft: 3, maxSpeed: 3.6, smash: 1.55, launch: 2, spin: 150, faceWeight: 0.95, tiltGain: 0, gear: 0, wood: false, putter: true, sound: 'putter' },
]

export const clubById = (id: string) => CLUBS.find((c) => c.id === id) ?? CLUBS[7]
