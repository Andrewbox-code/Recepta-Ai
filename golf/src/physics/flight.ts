import { SURFACES, firmSurface, type Surface, type SurfaceId } from './lies'
import type { Launch } from './impact'

// World frame: y up, target line is -Z, +X is right of target. Metres.

export interface V3 {
  x: number
  y: number
  z: number
}

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })
const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
const mul = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s)
const len = (a: V3) => Math.hypot(a.x, a.y, a.z)
const cross = (a: V3, b: V3): V3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export const BALL = {
  mass: 0.04593,
  radius: 0.021335,
  area: Math.PI * 0.021335 * 0.021335,
}
const RHO = 1.2
const G = 9.81
const SPIN_DECAY_S = 24

export interface Wind {
  speed: number // m/s at 10 m
  dir: number // radians; direction the wind blows TOWARD, 0 = downwind (toward target), +PI/2 = toward the right
  gust: number // 0..1 gustiness
  phase: number
}

// Wind is slower near the ground (log profile), so a low punch really does
// cheat the wind and a towering wedge gets pushed around.
export function windAt(w: Wind, h: number, t: number): V3 {
  const z0 = 0.05
  const prof = Math.log(Math.max(h, 0.4) / z0) / Math.log(10 / z0)
  const g = 1 + w.gust * 0.22 * Math.sin(t * 0.9 + w.phase) + w.gust * 0.1 * Math.sin(t * 2.3 + w.phase * 1.7)
  const s = w.speed * prof * g
  return v3(Math.sin(w.dir) * s, 0, -Math.cos(w.dir) * s)
}

export interface Env {
  wind: Wind
  firmness: number
  surfaceAt: (x: number, z: number) => SurfaceId
  groundY?: (x: number, z: number) => number
  t0?: number // world clock at launch, so gusts line up with what the flags show
}

export interface FlightPoint {
  t: number
  p: V3
  spin: number // rpm magnitude (for visuals)
  phase: 0 | 1 | 2 // air, bouncing, rolling
}

export interface ShotResult {
  points: FlightPoint[]
  carry: number // m along the ground from start to first landing
  carryPos: V3
  total: number
  restPos: V3
  apex: number
  apexT: number
  landT: number
  landAngle: number // degrees
  offline: number // m right (+) / left (-) of the aim line at rest
  carryOffline: number
  hangTime: number
  restSurface: SurfaceId
  bounces: { t: number; p: V3; surface: SurfaceId; speed: number }[]
}

function aero(v: V3, w: V3, spin: V3): V3 {
  const vr = sub(v, w)
  const s = len(vr)
  if (s < 1e-6) return v3(0, -G, 0)
  const om = len(spin)
  const S = (BALL.radius * om) / s
  // Drag rises and lift saturates with spin ratio (fits of wind-tunnel data
  // for modern dimpled balls, simplified).
  const cd = 0.225 + 0.18 * S
  const cl = Math.min(0.34, 1.9 * S - 2.4 * S * S)
  const k = (0.5 * RHO * BALL.area) / BALL.mass
  let a = mul(vr, -k * cd * s)
  if (om > 1e-6) {
    const m = cross(spin, vr)
    const ml = len(m)
    if (ml > 1e-9) a = add(a, mul(m, (k * cl * s * s) / ml))
  }
  a.y -= G
  return a
}

export function initialState(l: Launch, aim: number) {
  const h = aim + (l.launchH * Math.PI) / 180
  const v = (l.launchV * Math.PI) / 180
  const vel = mul(v3(Math.cos(v) * Math.sin(h), Math.sin(v), -Math.cos(v) * Math.cos(h)), l.ballSpeed)
  const right = v3(Math.cos(h), 0, Math.sin(h))
  const a = (l.tiltDeg * Math.PI) / 180
  const w = (l.spinRpm * 2 * Math.PI) / 60
  const spin = add(mul(right, w * Math.cos(a)), v3(0, -w * Math.sin(a), 0))
  return { vel, spin }
}

export function simulate(l: Launch, start: V3, aim: number, env: Env, dt = 1 / 240): ShotResult {
  const groundY = env.groundY ?? (() => 0)
  const t0 = env.t0 ?? 0
  let { vel, spin } = initialState(l, aim)
  let p = { ...start }
  let t = 0
  let phase: 0 | 1 | 2 = 0
  const points: FlightPoint[] = [{ t, p: { ...p }, spin: l.spinRpm, phase }]
  let apex = p.y
  let apexT = 0
  let carryPos: V3 | null = null
  let landT = 0
  let landAngle = 0
  const bounces: ShotResult['bounces'] = []
  let restSurface: SurfaceId = env.surfaceAt(p.x, p.z)
  let sampleAcc = 0
  const r = BALL.radius
  const aimDir = v3(Math.sin(aim), 0, -Math.cos(aim))
  const aimRight = v3(Math.cos(aim), 0, Math.sin(aim))

  // A whiff or dribble: nothing to fly.
  if (l.ballSpeed < 0.05) {
    return {
      points,
      carry: 0,
      carryPos: { ...p },
      total: 0,
      restPos: { ...p },
      apex: 0,
      apexT: 0,
      landT: 0,
      landAngle: 0,
      offline: 0,
      carryOffline: 0,
      hangTime: 0,
      restSurface,
      bounces,
    }
  }

  const surf = (x: number, z: number): Surface => firmSurface(SURFACES[env.surfaceAt(x, z)], env.firmness)

  while (t < 40) {
    const gy = groundY(p.x, p.z) + r
    if (phase === 2) {
      const sp = Math.hypot(vel.x, vel.z)
      const s = surf(p.x, p.z)
      restSurface = s.id
      if (s.id === 'water') {
        // Trickled in. It's gone.
        p.y = groundY(p.x, p.z) - 0.3
        vel = v3()
        break
      }
      // Slopes: a rolling ball feels 5/7 of gravity along the ground, so putts
      // break and a ball can trickle back off a false front.
      const e = 0.2
      const gx = (groundY(p.x + e, p.z) - groundY(p.x - e, p.z)) / (2 * e)
      const gz = (groundY(p.x, p.z + e) - groundY(p.x, p.z - e)) / (2 * e)
      const ax = -(5 / 7) * G * gx
      const az = -(5 / 7) * G * gz
      const slopeA = Math.hypot(ax, az)
      if (sp < 0.05 && slopeA <= s.rollDecel) {
        vel = v3()
        break
      }
      vel.x += ax * dt
      vel.z += az * dt
      const sp2 = Math.hypot(vel.x, vel.z)
      const dv = (s.rollDecel + s.rollDrag * sp2) * dt
      if (sp2 <= dv) {
        vel = v3()
        if (slopeA <= s.rollDecel) break
      } else vel = mul(vel, (sp2 - dv) / sp2)
      vel.y = 0
      p = add(p, mul(vel, dt))
      p.y = groundY(p.x, p.z) + r
    } else {
      // Midpoint integration; plenty accurate at 240 Hz.
      const w1 = windAt(env.wind, p.y, t0 + t)
      const a1 = aero(vel, w1, spin)
      const vm = add(vel, mul(a1, dt / 2))
      const pm = add(p, mul(vel, dt / 2))
      const a2 = aero(vm, windAt(env.wind, pm.y, t0 + t + dt / 2), spin)
      p = add(p, mul(vm, dt))
      vel = add(vel, mul(a2, dt))
      spin = mul(spin, Math.exp(-dt / SPIN_DECAY_S))
      if (p.y > apex) {
        apex = p.y
        apexT = t
      }
      if (p.y <= gy && vel.y < 0) {
        p.y = gy
        const s = surf(p.x, p.z)
        const vn = -vel.y
        if (!carryPos) {
          carryPos = { ...p }
          landT = t
          landAngle = (Math.atan2(vn, Math.hypot(vel.x, vel.z)) * 180) / Math.PI
        }
        bounces.push({ t, p: { ...p }, surface: s.id, speed: len(vel) })
        if (s.id === 'water') {
          restSurface = 'water'
          points.push({ t, p: { ...p }, spin: 0, phase: 1 })
          p.y -= 0.35
          vel = v3()
          break
        }
        const e = s.restitution / (1 + vn * 0.045)
        // The turf gives: a steep landing plugs a little and loses pace.
        const soak = 1 - s.turfLoss * (vn / (vn + 6))
        vel.x *= soak
        vel.z *= soak
        // Friction at the contact patch: backspin fights forward speed and
        // can check or even suck the ball back on a receptive green.
        const u = add(v3(vel.x, 0, vel.z), cross(spin, v3(0, -r, 0)))
        const ul = Math.hypot(u.x, u.z)
        if (ul > 1e-6) {
          const need = (2 / 7) * ul
          const jmax = s.friction * (1 + e) * vn * (1 + Math.max(0, vn - 8) * 0.03)
          const dvm = Math.min(need, jmax)
          const dv = v3((-u.x / ul) * dvm, 0, (-u.z / ul) * dvm)
          vel = add(vel, dv)
          spin = add(spin, mul(cross(dv, v3(0, 1, 0)), 5 / (2 * r)))
        }
        spin.y *= 0.4
        vel.y = e * vn
        phase = 1
        if (vel.y < 0.45) {
          vel.y = 0
          phase = 2
        }
      }
    }
    t += dt
    sampleAcc += dt
    if (sampleAcc >= 1 / 120 - 1e-9) {
      sampleAcc = 0
      points.push({ t, p: { ...p }, spin: (len(spin) * 60) / (2 * Math.PI), phase })
    }
  }
  points.push({ t, p: { ...p }, spin: 0, phase: 2 })

  const cp = carryPos ?? p
  const d = (q: V3) => (q.x - start.x) * aimDir.x + (q.z - start.z) * aimDir.z
  const off = (q: V3) => (q.x - start.x) * aimRight.x + (q.z - start.z) * aimRight.z
  return {
    points,
    carry: d(cp),
    carryPos: cp,
    total: d(p),
    restPos: p,
    apex: apex - start.y,
    apexT,
    landT,
    landAngle,
    offline: off(p),
    carryOffline: off(cp),
    hangTime: landT,
    restSurface,
    bounces,
  }
}
