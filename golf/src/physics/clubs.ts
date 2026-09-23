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
  sound: 'driver' | 'wood' | 'iron' | 'wedge'
}

const mph = (v: number) => v * 0.44704

export const CLUBS: Club[] = [
  { id: 'dr', name: 'Driver', short: 'DR', loft: 10.5, maxSpeed: mph(108), smash: 1.48, launch: 12.5, spin: 2650, faceWeight: 0.85, tiltGain: 2.6, gear: 1, wood: true, sound: 'driver' },
  { id: '3w', name: '3 Wood', short: '3W', loft: 15, maxSpeed: mph(103), smash: 1.46, launch: 11, spin: 3600, faceWeight: 0.82, tiltGain: 2.2, gear: 0.8, wood: true, sound: 'wood' },
  { id: '5i', name: '5 Iron', short: '5i', loft: 26, maxSpeed: mph(92), smash: 1.37, launch: 12.5, spin: 5300, faceWeight: 0.78, tiltGain: 1.7, gear: 0.25, wood: false, sound: 'iron' },
  { id: '7i', name: '7 Iron', short: '7i', loft: 33, maxSpeed: mph(87), smash: 1.33, launch: 16.5, spin: 7000, faceWeight: 0.75, tiltGain: 1.45, gear: 0.2, wood: false, sound: 'iron' },
  { id: '9i', name: '9 Iron', short: '9i', loft: 41, maxSpeed: mph(82), smash: 1.28, launch: 20.5, spin: 8600, faceWeight: 0.72, tiltGain: 1.25, gear: 0.15, wood: false, sound: 'iron' },
  { id: 'pw', name: 'Pitching Wedge', short: 'PW', loft: 46, maxSpeed: mph(81), smash: 1.27, launch: 24, spin: 9300, faceWeight: 0.7, tiltGain: 1.1, gear: 0.1, wood: false, sound: 'wedge' },
  { id: 'sw', name: 'Sand Wedge', short: 'SW', loft: 56, maxSpeed: mph(76), smash: 1.2, launch: 30, spin: 9800, faceWeight: 0.66, tiltGain: 0.95, gear: 0.1, wood: false, sound: 'wedge' },
]

export const clubById = (id: string) => CLUBS.find((c) => c.id === id) ?? CLUBS[3]
