import type { Club } from './clubs'
import type { Lie } from './lies'
import type { SwingMetrics } from '../swing/analyze'

export type Contact = 'pure' | 'good' | 'thin' | 'top' | 'fat' | 'chunk' | 'toe' | 'heel' | 'shank' | 'whiff' | 'skied'

export interface Launch {
  clubSpeed: number // m/s
  ballSpeed: number // m/s
  launchV: number // deg
  launchH: number // deg, + = right of aim
  spinRpm: number
  tiltDeg: number // spin axis, + = curves right
  path: number // club path deg (+ = in-to-out)
  face: number // face angle deg (+ = open)
  depthMm: number // + = ground before ball (fat), - = high on/above the ball (thin)
  toeMm: number // + = toe, - = heel
  swingPct: number
  chaos: number // 0 = composed, 1+ = rushed/overswung
  contact: Contact
  quality: number // 0..1 how close to a flush strike (drives audio/fx, never shown as a grade)
}

export interface Rng {
  (): number // uniform [0,1)
}

export function gauss(rng: Rng) {
  let u = 0
  while (u === 0) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// Tuning constants for mapping gesture -> club. Exposed so the Swing Lab and
// tests can reason about them.
export const TUNING = {
  angleGain: 0.45, // club degrees per degree of gesture heading
  faceFollow: 0.4, // how much the face follows the path on its own; the rest is release
  idealTempo: 3,
  idealRelease: 0, // U before the ball where peak speed ideally lands
  releaseToMm: 120, // contact depth per U of release error
  toeMmPerU: 80,
}

export function computeTempoChaos(m: SwingMetrics, swingPct: number, putting = false) {
  // A putting stroke is naturally about 2:1; a full swing about 3:1.
  const ideal = putting ? 2 : TUNING.idealTempo
  const tempoErr = clamp((Math.abs(Math.log(m.tempoRatio / ideal)) - 0.3) / 0.8, 0, 1)
  const transErr = clamp((0.26 - m.rampFrac) / 0.2, 0, 1) // snatched from the top
  const overErr = clamp((swingPct - 1.03) / 0.25, 0, 1.5) // swinging out of your shoes
  const shortErr = clamp((0.45 - m.depth) / 0.25, 0, 1) * clamp(swingPct - 0.6, 0, 1) // all arms, no turn
  return {
    tempoErr,
    transErr,
    overErr,
    chaos: clamp(0.7 * tempoErr + 0.75 * transErr + 0.6 * overErr + 0.4 * shortErr, 0, 1.8),
  }
}

export function computeLaunch(m: SwingMetrics, club: Club, lie: Lie, speedRef: number, rng: Rng): Launch {
  const swingPct = m.speed / speedRef
  const effort = swingPct <= 1 ? swingPct : 1 + 0.12 * (1 - Math.exp(-(swingPct - 1) * 2.5))
  const clubSpeed = club.maxSpeed * effort
  const { transErr, chaos } = computeTempoChaos(m, swingPct, !!club.putter)

  // A rushed transition throws the club over the top: path goes left, face
  // stays a bit open relative to it (the classic pull-slice).
  const path = clamp(m.pathAngle * TUNING.angleGain - 3 * transErr + gauss(rng) * (0.5 + 3.5 * chaos), -16, 16)
  // The face lags the path (so swinging out-to-in leaves it open to the path:
  // fade/slice; in-to-out leaves it closed: draw/hook). Rotating the stroke
  // through impact is the release: curling left closes it, holding off opens it.
  const release = (m.faceAngle - m.pathAngle) * TUNING.angleGain
  const face = clamp(path * TUNING.faceFollow + release - 1 * transErr + gauss(rng) * (0.4 + 4.5 * chaos), -18, 18)

  // Where the club bottoms out comes from *when* the hands released their
  // speed. Peak before the ball = casting = fat. Still accelerating past it =
  // holding off = thin.
  const depthMm = clamp(
    (m.releaseOffset - TUNING.idealRelease) * TUNING.releaseToMm + gauss(rng) * (1 + 7 * chaos) + (1 - m.decel) * 25,
    -45,
    70,
  )
  const toeMm = m.crossX * TUNING.toeMmPerU + gauss(rng) * (0.8 + 4 * chaos)

  if (club.putter) return puttLaunch(m, club, swingPct, path, face, chaos, rng)

  const faceHalf = club.wood ? 48 : 32
  const hosel = club.wood ? -40 : -26

  let eff = 1
  let launchV = club.launch * (1 + (1 - Math.min(1, effort)) * 0.12) + lie.launchAdd
  let spin = club.spin * (0.35 + 0.65 * effort) * lie.spinMul * (1 + gauss(rng) * lie.spinJitter)
  let contact: Contact = 'pure'
  let horizExtra = 0

  if (Math.abs(toeMm) > 62) {
    contact = 'whiff'
  } else if (toeMm < hosel) {
    contact = 'shank'
  }

  // Heel/toe: loses smash, gear effect curves woods back toward the middle.
  const offC = Math.abs(toeMm) / faceHalf
  eff *= 1 - Math.min(0.5, offC * offC * 0.4)
  let tilt = (face - path) * club.tiltGain - toeMm * club.gear * 0.4
  horizExtra += toeMm * club.gear * 0.05
  spin *= 1 + Math.abs(face - path) * 0.012 - offC * 0.08 * club.gear

  // Vertical strike.
  const fatExcess = Math.max(0, depthMm - lie.fatGrace)
  if (fatExcess > 0) {
    const loss = 1 - Math.exp((-fatExcess * lie.fatPenalty) / 28)
    if (lie.id === 'tee') {
      // Club goes under a teed ball: pop-up.
      launchV += fatExcess * 1.1
      spin += fatExcess * 180
      eff *= 1 - loss * 0.55
    } else {
      eff *= 1 - loss * 0.78
      launchV += loss * 4
      spin *= 1 - loss * 0.35
    }
  }
  if (depthMm < 0) {
    const t = -depthMm * lie.thinPenalty
    if (t > 28 && lie.id !== 'tee') {
      launchV = 1.5 + (lie.ballSink > 0.3 ? 0 : 1)
      spin = 350
      eff *= 0.5
    } else {
      launchV *= Math.max(0.2, 1 - t * 0.028)
      spin *= Math.max(0.15, 1 - t * 0.032)
      eff *= 1 - Math.min(0.3, t * 0.005)
    }
  }

  let ballSpeed = clubSpeed * club.smash * eff * lie.speedMul
  let launchH = face * club.faceWeight + path * (1 - club.faceWeight) + horizExtra

  if (contact === 'shank') {
    ballSpeed = clubSpeed * 0.45
    launchH = 38 + gauss(rng) * 6
    launchV = club.launch * 0.6
    spin = 3500
    tilt = 10
  } else if (contact === 'whiff') {
    ballSpeed = 0
  }

  if (contact !== 'shank' && contact !== 'whiff') {
    if (depthMm > lie.fatGrace + 6) contact = fatExcess > 22 ? 'chunk' : 'fat'
    else if (depthMm < -7) contact = -depthMm * lie.thinPenalty > 28 && lie.id !== 'tee' ? 'top' : 'thin'
    else if (lie.id === 'tee' && fatExcess > 8) contact = 'skied'
    else if (toeMm > faceHalf * 0.45) contact = 'toe'
    else if (toeMm < -faceHalf * 0.45) contact = 'heel'
    else if (Math.abs(depthMm) > 3.5 || Math.abs(toeMm) > 7) contact = 'good'
  }
  if (lie.id === 'tee' && contact === 'fat') contact = 'skied'

  const quality = contact === 'whiff' || contact === 'shank' ? 0 : clamp(eff * (1 - Math.abs(depthMm) / 60), 0, 1)

  return {
    clubSpeed,
    ballSpeed,
    launchV: clamp(launchV, -2, 65),
    launchH,
    spinRpm: Math.max(150, spin),
    tiltDeg: clamp(tilt, -55, 55),
    path,
    face,
    depthMm,
    toeMm,
    swingPct,
    chaos,
    contact,
    quality,
  }
}

// Putting: no turf interaction and no curve in the air. Speed control and
// start line are everything; a toe/heel strike just comes up short.
function puttLaunch(m: SwingMetrics, club: Club, swingPct: number, path: number, face: number, chaos: number, rng: Rng): Launch {
  const clubSpeed = club.maxSpeed * swingPct
  const toeMm = m.crossX * TUNING.toeMmPerU + gauss(rng) * (0.5 + 3 * chaos)
  const off = Math.min(1, Math.abs(toeMm) / 40)
  const eff = 1 - off * off * 0.45
  const whiff = Math.abs(toeMm) > 62
  const contact: Contact = whiff ? 'whiff' : off > 0.45 ? (toeMm > 0 ? 'toe' : 'heel') : off > 0.15 ? 'good' : 'pure'
  // A putter face barely curves the start line off the path.
  const f = face * 0.5
  const p = path * 0.5
  return {
    clubSpeed,
    ballSpeed: whiff ? 0 : clubSpeed * club.smash * eff,
    launchV: club.launch,
    launchH: f * club.faceWeight + p * (1 - club.faceWeight),
    spinRpm: 150,
    tiltDeg: 0,
    path: p,
    face: f,
    depthMm: 0,
    toeMm,
    swingPct,
    chaos,
    contact,
    quality: whiff ? 0 : eff,
  }
}
