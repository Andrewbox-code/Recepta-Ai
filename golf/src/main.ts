import * as THREE from 'three'
import { CLUBS, clubById, type Club } from './physics/clubs'
import { Grass } from './world/Grass'
import { Club3D } from './world/Club3D'
import { PuttGrid } from './world/PuttGrid'
import { PRACTICE } from './world/layout'
import { LIES, type Lie, type LieId } from './physics/lies'
import { computeLaunch, type Launch } from './physics/impact'
import { simulate, windAt, type ShotResult, type Wind, type FlightPoint } from './physics/flight'
import type { SwingMetrics } from './swing/analyze'
import { SwingInput } from './swing/SwingInput'
import { Range, YD } from './world/Range'
import { Ball } from './world/Ball'
import { Debris, GroundMarks, Tracer, WindDrift } from './world/Effects'
import { CameraDirector, type CamStyle } from './camera/CameraDirector'
import { AudioEngine } from './audio/AudioEngine'
import { SwingOverlay } from './ui/SwingOverlay'

type State = 'address' | 'flight' | 'rest'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const yd = (m: number) => m / YD
const mph = (ms: number) => ms / 0.44704
const CLUB_COLORS: Record<string, number> = Object.fromEntries(CLUBS.map((c, i) => [c.id, new THREE.Color().setHSL((i / CLUBS.length) * 0.85, 0.75, 0.6).getHex()]))

// Stock pure-strike carry (yards) in calm air, for the club selector.
function stockDistance(c: Club) {
  const l: Launch = {
    clubSpeed: c.maxSpeed,
    ballSpeed: c.maxSpeed * c.smash,
    launchV: c.launch,
    launchH: 0,
    spinRpm: c.spin,
    tiltDeg: 0,
    path: 0,
    face: 0,
    depthMm: 0,
    toeMm: 0,
    swingPct: 1,
    chaos: 0,
    contact: 'pure',
    quality: 1,
  }
  return yd(simulate(l, { x: 0, y: 0.03, z: 0 }, 0, { wind: { speed: 0, dir: 0, gust: 0, phase: 0 }, firmness: 0.5, surfaceAt: () => 'fairway' }, 1 / 120).carry)
}

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('purestrike.' + k)
      return v === null ? d : (JSON.parse(v) as T)
    } catch {
      return d
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem('purestrike.' + k, JSON.stringify(v))
    } catch {
      /* private mode etc. */
    }
  },
}

interface Shot {
  launch: Launch
  result: ShotResult
  metrics: SwingMetrics
  club: Club
  t: number
  idx: number
  bounce: number
  landed: boolean
  holed: boolean
}

class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  cam: CameraDirector
  range: Range
  ball: Ball
  debris: Debris
  tracer: Tracer
  marks: GroundMarks
  drift: WindDrift
  audio = new AudioEngine()
  input: SwingInput
  overlay: SwingOverlay
  aimLine: THREE.Mesh

  club: Club = clubById('7i')
  lie: Lie = LIES.fairway
  aim = 0
  wind: Wind = { speed: 0, dir: 0, gust: 0.5, phase: Math.random() * 10 }
  windLevel = store.get('wind', 1)
  firmness = store.get('firm', 0.5)
  speedRef = store.get('speedRef', 8)
  state: State = 'address'
  worldT = 0
  shot: Shot | null = null
  timeScale = 1
  slowMo = 0 // seconds of real time remaining in slow motion
  restTimer = 0
  lieTimer = 0
  swung = false
  tee = new THREE.Vector3(0, 0, 0)
  history: { club: string; carry: number; total: number; off: number }[] = []
  quality: 'high' | 'low' = store.get('quality', matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 500 ? 'low' : 'high')
  grass: Grass[] = []
  stock: Record<string, number> = {}
  freshPutt = false
  club3d!: Club3D
  puttGrid!: PuttGrid
  view: 'play' | 'map' | 'eye' = 'play'
  shotCount = 0
  bestProx = Infinity
  holed = 0
  lastPin = new THREE.Vector3()
  baseAim = 0 // straight down the range, or at the cup when putting

  constructor() {
    const canvas = $<HTMLCanvasElement>('gl')
    const high = this.quality === 'high'
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(high ? Math.min(2, window.devicePixelRatio) : 1)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.72
    this.renderer.shadowMap.enabled = high
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.cam = new CameraDirector(window.innerWidth / window.innerHeight)
    this.cam.style = store.get<CamStyle>('cam', 'chase')
    this.range = new Range(this.scene, this.renderer, high)
    this.ball = new Ball(this.scene, high)
    if (high) {
      this.grass.push(new Grass(this.scene, new THREE.Vector2(0, -4), 26, high))
      this.grass.push(new Grass(this.scene, new THREE.Vector2(PRACTICE.x, PRACTICE.z), 13, high))
    }
    this.stock = Object.fromEntries(CLUBS.map((c) => [c.id, stockDistance(c)]))
    this.club3d = new Club3D(this.scene, high)
    this.puttGrid = new PuttGrid(this.scene)
    this.debris = new Debris(this.scene)
    this.tracer = new Tracer(this.scene)
    this.marks = new GroundMarks(this.scene)
    this.drift = new WindDrift(this.scene)

    this.aimLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 30).translate(0, 15, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.aimLine.rotation.x = -Math.PI / 2
    this.scene.add(this.aimLine)

    this.overlay = new SwingOverlay($<HTMLCanvasElement>('overlay'))
    this.overlay.speedRef = this.speedRef
    this.overlay.lab = store.get('lab', false)
    this.audio.muted = store.get('muted', false)

    this.input = new SwingInput(canvas, {
      onLive: (s) => {
        this.overlay.setLive(s)
        if (s.phase !== 'idle') {
          if (this.view !== 'play') this.setView('play')
          $('data').classList.add('hidden')
          $('bagPop').classList.add('hidden')
          $('liePop').classList.add('hidden')
          const last = s.points[s.points.length - 1]
          this.club3d.setSwing((last.y - s.origin.y) / s.unit)
        } else if (this.state === 'address') this.club3d.setSwing(0)
        this.audio.swingSpeed(s.speed, s.phase === 'down' || s.phase === 'through')
      },
      onSwing: (m, samples, unit) => this.onSwing(m, samples[0].x, samples[0].y, unit),
      onCancel: (why) => this.onCancel(why),
    })
    canvas.addEventListener('pointerdown', () => {
      this.audio.unlock()
      if (this.state === 'flight') this.skip()
      else if (this.state === 'rest' && this.restTimer < 2.2) this.reset()
    })

    this.cam.fovScale = window.innerWidth < window.innerHeight ? 1.4 : 1
    this.newWind()
    this.buildHud()
    this.setLie(this.lie, false)
    this.reset(true)
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('keydown', (e) => this.key(e))
    let wheelAcc = 0
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        wheelAcc += e.deltaY
        if (Math.abs(wheelAcc) > 60) {
          this.cycleClub(Math.sign(wheelAcc))
          wheelAcc = 0
        }
      },
      { passive: false },
    )
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      this.update(dt)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // ---------- shot lifecycle ----------

  reset(snap = false) {
    if (this.freshPutt && this.club.putter) {
      this.freshPutt = false
      this.state = 'address'
      this.newPutt()
      return
    }
    this.state = 'address'
    this.shot = null
    this.timeScale = 1
    this.slowMo = 0
    const p = new THREE.Vector3(this.tee.x, Ball.restY(this.lie), this.tee.z)
    this.ball.place(p)
    this.ball.setLie(this.lie, this.tee)
    this.ball.mesh.rotation.set(0, Math.random() * 6, 0)
    this.cam.address(p, this.aim, snap, !!this.club.putter)
    this.input.enabled = true
    this.refreshAddress()
    this.aimLine.visible = true
    this.tracer.opacity = 0.35
    $('hint').classList.toggle('fade', this.swung)
  }

  onCancel(why: string) {
    if (why === 'tap') this.toast('Hold, pull down to take it back, then push up through the ball')
    else if (why === 'backed off') this.toast('Backed off — keep holding through the ball')
    else if (why === 'no swing') this.toast('Take it back further')
    if (!this.swung) $('hint').classList.remove('fade')
  }

  onSwing(m: SwingMetrics, ox: number, oy: number, unit: number) {
    this.swung = true
    $('hint').classList.add('fade')
    this.input.enabled = false
    this.club3d.finish()
    this.puttGrid.hide()
    this.shotCount++
    const launch = computeLaunch(m, this.club, this.lie, this.speedRef, Math.random)
    this.overlay.hold(m, launch, ox, oy, unit)
    const start = this.ball.mesh.position.clone()
    const result = simulate(launch, start, this.aim, {
      wind: this.wind,
      firmness: this.firmness,
      surfaceAt: this.range.surfaceAt,
      groundY: this.range.groundY,
      t0: this.worldT,
    })
    const holed = this.checkHoled(result)
    this.shot = { launch, result, metrics: m, club: this.club, t: 0, idx: 0, bounce: 0, landed: false, holed }
    this.state = 'flight'
    this.aimLine.visible = false
    this.tracer.reset()
    this.tracer.opacity = 1
    this.tracer.color = launch.contact === 'pure' ? 0xfff27a : 0xffffff
    this.cam.launch(new THREE.Vector3(result.carryPos.x, result.carryPos.y, result.carryPos.z), !!this.club.putter)
    this.impactFx(launch, start)
    this.fillLab(m, launch)
    this.showLaunch(launch)

    // Slow motion for the shots you'll remember, good or bad.
    const great = !this.club.putter && launch.contact === 'pure' && launch.swingPct > 0.85 && launch.quality > 0.9
    const awful = ['shank', 'chunk', 'top', 'whiff', 'skied'].includes(launch.contact)
    if ((great || awful) && !this.club.putter) {
      this.slowMo = great ? 0.9 : 0.7
      this.timeScale = 0.2
    }
    if (launch.contact === 'whiff') {
      this.state = 'rest'
      this.restTimer = 1.8
      this.cam.shake(0.02)
      this.audio.crowd(0.5, 'groan')
    }
  }

  // Did it drop? Look for the ball trickling over a cup slowly enough to fall.
  private checkHoled(r: ShotResult) {
    const pts = r.points
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]
      if (p.phase === 0 || p.p.y > 0.1) continue
      for (const f of this.range.flags) {
        if (Math.hypot(p.p.x - f.pos.x, p.p.z - f.pos.z) < 0.06) {
          const q = pts[i - 1]
          const v = Math.hypot(p.p.x - q.p.x, p.p.z - q.p.z) / Math.max(1e-4, p.t - q.t)
          if (v < 1.6) {
            const cut = pts.slice(0, i + 1)
            for (let k = 1; k <= 12; k++) cut.push({ t: p.t + k * 0.02, p: { x: f.pos.x, y: p.p.y - k * 0.006, z: f.pos.z }, spin: 0, phase: 2 })
            r.points = cut
            r.restPos = cut[cut.length - 1].p
            return true
          }
        }
      }
    }
    return false
  }

  private impactFx(l: Launch, at: THREE.Vector3) {
    const f = new THREE.Vector3(Math.sin(this.aim), 0, -Math.cos(this.aim))
    const ground = new THREE.Vector3(at.x, 0.01, at.z)
    const lie = this.lie.id
    const pow = Math.min(1.2, l.swingPct)
    this.audio.strike(l.contact, this.club, lie, l.quality, pow)

    const grass = [0x4f8c31, 0x5c9a3a, 0x3d6e22, 0x6b4a2b]
    const dirt = [0x6b4a2b, 0x7d5a36, 0x5a3f28]
    const sand = [0xe3d3a4, 0xd8c692, 0xcdbb88, 0xf0e4c0]
    const rough = [0x2f5a1d, 0x4a7d2e, 0x3a6823]
    const dust = [0x8a6f4b, 0xa08560, 0x7a6040]
    const fat = Math.max(0, l.depthMm - this.lie.fatGrace)
    const iron = !this.club.wood

    const vib = (p: number | number[]) => navigator.vibrate?.(p)
    switch (lie) {
      case 'sand':
        this.debris.spray(ground, f, { count: 160 + fat * 6, colors: sand, speed: 2 + pow * 3, spread: 2.5, up: 3 + fat * 0.1, size: 0.008, drag: 2.5 })
        break
      case 'rough':
        this.debris.spray(ground, f, { count: 90, colors: rough, speed: 5 * pow, spread: 2.5, up: 2.5, size: 0.014, drag: 3 })
        break
      case 'hardpan':
        this.debris.spray(ground, f, { count: 40 + fat * 3, colors: dust, speed: 2.5, spread: 3, up: 1.5, size: 0.01, drag: 3 })
        break
      case 'tee':
        this.debris.spray(new THREE.Vector3(at.x, 0.03, at.z), f, { count: 3, colors: [0xffffff], speed: 6 * pow, spread: 2, up: 3, size: 0.02 })
        this.ball.tee.visible = false
        break
      default:
        if (iron || fat > 0) {
          const n = fat > 0 ? 40 + fat * 4 : l.depthMm < -6 ? 4 : 22
          this.debris.spray(ground, f, { count: n, colors: fat > 0 ? [...grass, ...dirt] : grass, speed: (fat > 0 ? 3.5 : 6) * pow, spread: 1.8, up: fat > 0 ? 3.5 : 2, size: fat > 0 ? 0.022 : 0.014 })
        }
    }
    // Divot: after the ball on a good iron strike, behind it on a fat one.
    if (lie === 'fairway' && (iron || fat > 0) && l.depthMm > -6 && l.contact !== 'whiff') {
      const len = 0.12 + Math.min(0.3, Math.abs(l.depthMm) * 0.008) + (fat > 0 ? fat * 0.006 : 0.06)
      const startOff = fat > 0 ? -0.05 - fat * 0.004 : 0.03
      this.marks.divot(ground.clone().addScaledVector(f, startOff + len / 2), f, len)
    }

    switch (l.contact) {
      case 'pure':
        vib(12)
        break
      case 'good':
        vib(15)
        break
      case 'fat':
        this.cam.shake(0.035)
        vib([40, 20, 40])
        break
      case 'chunk':
        this.cam.shake(0.08)
        vib(120)
        break
      case 'thin':
      case 'top':
        this.cam.shake(0.025)
        vib([15, 15, 15, 15, 15])
        break
      case 'toe':
      case 'heel':
        this.cam.shake(0.02)
        vib([25, 20, 25])
        break
      case 'shank':
        this.cam.shake(0.06)
        vib([60, 30, 60])
        break
      case 'skied':
        this.cam.shake(0.02)
        vib(40)
        break
    }
    if (lie === 'hardpan' && fat > 4) this.cam.shake(0.1)
  }

  skip() {
    if (!this.shot) return
    this.slowMo = 0
    this.timeScale = 1
    this.shot.t = this.shot.result.points[this.shot.result.points.length - 1].t
  }

  private sample(pts: FlightPoint[], s: Shot, t: number) {
    while (s.idx < pts.length - 2 && pts[s.idx + 1].t < t) s.idx++
    const a = pts[s.idx]
    const b = pts[Math.min(pts.length - 1, s.idx + 1)]
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1
    return {
      p: new THREE.Vector3(a.p.x + (b.p.x - a.p.x) * k, a.p.y + (b.p.y - a.p.y) * k, a.p.z + (b.p.z - a.p.z) * k),
      v: new THREE.Vector3(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z).divideScalar(Math.max(1e-4, b.t - a.t)),
      phase: a.phase,
      spin: a.spin,
    }
  }

  private updateFlight(dt: number) {
    const s = this.shot!
    const r = s.result
    const pts = r.points
    s.t += dt * this.timeScale
    const cur = this.sample(pts, s, s.t)
    this.ball.place(cur.p)
    const axis = new THREE.Vector3(cur.v.z, 0, -cur.v.x)
    this.ball.setSpin(cur.spin, axis.lengthSq() > 0 ? axis : undefined)
    if (cur.phase === 0) this.tracer.push(cur.p)

    while (s.bounce < r.bounces.length && r.bounces[s.bounce].t <= s.t) {
      const b = r.bounces[s.bounce]
      const bp = new THREE.Vector3(b.p.x, 0.01, b.p.z)
      this.audio.land(b.surface, b.speed)
      if (b.surface === 'water') {
        this.debris.spray(new THREE.Vector3(b.p.x, b.p.y, b.p.z), new THREE.Vector3(0, 1, 0), { count: 90, colors: [0xffffff, 0xdbe9f2, 0xb8d3e3], speed: 0, spread: 3, up: 5, size: 0.03, drag: 1.2 })
        this.audio.splash()
      } else if (b.surface === 'sand') this.debris.spray(bp, new THREE.Vector3(0, 1, 0), { count: 25, colors: [0xe3d3a4, 0xd8c692], speed: 0, spread: 2, up: 2, size: 0.02, drag: 3 })
      else if (b.speed > 8) this.debris.spray(bp, new THREE.Vector3(0, 1, 0), { count: 6, colors: [0x4f8c31, 0x6b4a2b], speed: 0, spread: 1, up: 1.2, size: 0.015 })
      if (!s.landed) {
        s.landed = true
        $('dCarry').textContent = `${yd(r.carry).toFixed(1)}`
      }
      s.bounce++
    }

    // Cut to the landing camera for anything with real hang time.
    if (this.cam.mode === 'chase' && r.hangTime > 2.2 && s.t > r.apexT && r.landT - s.t < 1.3) this.cam.toLanding(cur.v, this.aim)

    const end = pts[pts.length - 1].t
    if (s.t >= end) this.finishShot()
  }

  private finishShot() {
    const s = this.shot!
    const r = s.result
    this.state = 'rest'
    this.restTimer = s.holed ? 5 : 3.2
    this.cam.rest()
    this.timeScale = 1
    const rest = new THREE.Vector3(r.restPos.x, r.restPos.y, r.restPos.z)
    this.ball.place(rest)
    const fwd = new THREE.Vector3(Math.sin(this.aim), 0, -Math.cos(this.aim))
    const right = new THREE.Vector3(Math.cos(this.aim), 0, Math.sin(this.aim))
    const d = rest.clone().sub(this.tee)
    const total = d.dot(fwd)
    const off = d.dot(right)
    $('dCarry').textContent = `${yd(r.carry).toFixed(1)}`
    $('dTotal').textContent = `${yd(total).toFixed(1)}`
    $('dOffline').textContent = `${Math.abs(yd(off)).toFixed(1)} ${off > 0.5 ? 'R' : off < -0.5 ? 'L' : ''}`
    $('dApex').textContent = `${yd(r.apex).toFixed(0)}`
    // Score cards: last carry and closest-to-pin (or putts holed).
    const pinDist = Math.hypot(rest.x - this.lastPin.x, rest.z - this.lastPin.z)
    if (s.club.putter) {
      $('scoreBig').textContent = s.holed ? 'IN' : `${(pinDist / 0.3048).toFixed(1)}′`
      $('scoreSmall').textContent = s.holed ? 'holed' : 'left'
      if (s.holed) this.holed++
    } else if (s.launch.contact !== 'whiff' && r.restSurface !== 'water') {
      $('scoreBig').textContent = `${Math.round(yd(r.carry))}`
      $('scoreSmall').textContent = 'last carry'
      this.bestProx = Math.min(this.bestProx, yd(pinDist))
    }
    if (s.launch.contact !== 'whiff') {
      this.marks.marker(rest, CLUB_COLORS[s.club.id] ?? 0xffffff)
      this.history.unshift({ club: s.club.short, carry: yd(r.carry), total: yd(total), off: yd(off) })
      this.history = this.history.slice(0, 12)
      $('shots').innerHTML = this.history
        .map((h) => `<li>${h.club} <b>${h.carry.toFixed(0)}</b> <span>/ ${h.total.toFixed(0)} · ${Math.abs(h.off).toFixed(0)}${h.off > 0.5 ? 'R' : h.off < -0.5 ? 'L' : ''}</span></li>`)
        .join('')
    }

    // The gallery reacts to proximity, not to a grade.
    if (r.restSurface === 'water') {
      this.toast('Wet one')
      this.audio.crowd(0.6, 'groan')
      return
    }
    if (s.holed) {
      this.audio.cup()
      this.audio.crowd(s.club.putter && Math.hypot(this.tee.x - rest.x, this.tee.z - rest.z) < 3 ? 0.4 : 1.3, 'cheer')
      if (s.club.putter) {
        this.restTimer = 2.5
        this.freshPutt = true
      }
      this.toast('In the hole!')
      return
    }
    if (s.club.putter) return
    let best = Infinity
    for (const f of this.range.flags) best = Math.min(best, Math.hypot(rest.x - f.pos.x, rest.z - f.pos.z))
    if (best < 1.5) this.audio.crowd(1, 'cheer')
    else if (best < 4) this.audio.crowd(0.6, 'cheer')
    else if (best < 8) this.audio.crowd(0.6, 'ooh')
    else if (s.club.wood && yd(total) > 295) this.audio.crowd(0.8, 'ooh')
    else if (s.launch.contact === 'shank') this.audio.crowd(0.7, 'groan')
  }

  // ---------- world ----------

  newWind(level = this.windLevel) {
    this.windLevel = level
    store.set('wind', level)
    const ranges = [
      [0, 0],
      [1.2, 3.5],
      [3.5, 6.5],
      [6.5, 10.5],
    ][level]
    this.wind = { speed: ranges[0] + Math.random() * (ranges[1] - ranges[0]), dir: Math.random() * Math.PI * 2, gust: 0.35 + Math.random() * 0.4, phase: Math.random() * 20 }
    document.querySelectorAll<HTMLButtonElement>('#windBtns button').forEach((b) => b.classList.toggle('on', +b.dataset.wind! === level))
  }

  setClub(c: Club) {
    if (this.state !== 'address') return
    const wasPutter = this.club.putter
    this.club = c
    document.querySelectorAll<HTMLButtonElement>('#clubs button').forEach((b) => b.classList.toggle('on', b.dataset.club === c.id))
    $('clubName').textContent = c.name
    $('clubMeta').textContent = c.putter ? 'Practice green' : `${c.loft}° · ${Math.round(this.stock[c.id] ?? 0)} yd carry`
    $('clubShort').textContent = c.putter ? 'P' : c.short
    $('clubSub').textContent = c.putter ? 'putt' : `${Math.round(this.stock[c.id] ?? 0)}y`
    this.club3d.setClub(c)
    if (wasPutter !== !!c.putter) {
      this.shotCount = 0
      this.bestProx = Infinity
      this.holed = 0
      $('scoreBig').textContent = '—'
    }
    if (c.putter) {
      this.newPutt()
      return
    }
    if (wasPutter) {
      this.tee.set(0, 0, 0)
      this.baseAim = 0
      this.aim = 0
      this.lie = LIES.fairway
      this.nudgeAim(0)
    }
    if (c.id === 'dr' && this.lie.id === 'fairway') this.setLie(LIES.tee, !wasPutter)
    else if (!c.wood && this.lie.id === 'tee') this.setLie(LIES.fairway, !wasPutter)
    else this.setLie(this.lie, false)
    if (wasPutter) this.cam.address(this.ball.mesh.position, this.aim, true)
  }

  cycleClub(dir: number) {
    const i = CLUBS.indexOf(this.club)
    this.setClub(CLUBS[(i + dir + CLUBS.length) % CLUBS.length])
  }

  // Drop a ball somewhere on the practice green, 3-14 m from the cup.
  newPutt() {
    const a = Math.random() * Math.PI * 2
    const r = 3 + Math.random() * 11
    let x = PRACTICE.cup.x + Math.cos(a) * r
    let z = PRACTICE.cup.z + Math.sin(a) * r
    const d = Math.hypot(x - PRACTICE.x, z - PRACTICE.z)
    if (d > PRACTICE.r - 0.8) {
      x = PRACTICE.x + ((x - PRACTICE.x) / d) * (PRACTICE.r - 0.8)
      z = PRACTICE.z + ((z - PRACTICE.z) / d) * (PRACTICE.r - 0.8)
    }
    this.tee.set(x, 0, z)
    this.baseAim = Math.atan2(PRACTICE.cup.x - x, -(PRACTICE.cup.z - z))
    this.aim = this.baseAim
    this.lie = LIES.green
    $('clubMeta').textContent = `Practice green · ${Math.hypot(PRACTICE.cup.x - x, PRACTICE.cup.z - z).toFixed(1)} m to the cup`
    $('clubSub').textContent = `${Math.hypot(PRACTICE.cup.x - x, PRACTICE.cup.z - z).toFixed(1)}m`
    this.reset(true)
    this.nudgeAim(0)
  }

  setLie(l: Lie, look = true) {
    this.lie = l
    document.querySelectorAll<HTMLButtonElement>('#lies button').forEach((b) => b.classList.toggle('on', b.dataset.lie === l.id))
    if (this.state !== 'address') return
    const p = new THREE.Vector3(this.tee.x, Ball.restY(l), this.tee.z)
    this.ball.place(p)
    this.ball.setLie(l, this.tee)
    this.refreshAddress()
    if (look) {
      // Show the player how it's sitting.
      this.cam.lieCheck(p, this.aim)
      this.lieTimer = 1.4
    }
  }

  // Club behind the ball, grid on the green, the info cards.
  refreshAddress() {
    if (this.state !== 'address') return
    const b = this.ball.mesh.position
    this.club3d.setClub(this.club)
    this.club3d.address(b, this.aim, this.range.groundY(b.x, b.z))
    if (this.club.putter) this.puttGrid.show(b, new THREE.Vector3(PRACTICE.cup.x, 0, PRACTICE.cup.z))
    else this.puttGrid.hide()
    const lieCard = $('lieIco')
    lieCard.className = `ico lie-${this.lie.id}`
    $('lieName').textContent = this.lie.id === 'sand' ? 'Bunker' : this.lie.name
    $('holeL1').textContent = this.club.putter ? 'Practice' : 'Driving'
    $('holeL2').textContent = this.club.putter ? 'Green' : 'Range'
    $('holeL3').textContent = `${this.club.putter ? 'Putt' : 'Shot'} ${this.shotCount + 1}`
    $('bestText').textContent = this.club.putter ? `${this.holed} holed` : Number.isFinite(this.bestProx) ? `${this.bestProx.toFixed(1)} yds` : 'Closest —'
    this.updatePin()
  }

  // The flag you're playing at: the cup when putting, otherwise the range
  // green closest to your aim line.
  updatePin() {
    const b = this.ball.mesh.position
    let pin: THREE.Vector3
    if (this.club.putter) pin = new THREE.Vector3(PRACTICE.cup.x, 0, PRACTICE.cup.z)
    else {
      // Among the greens roughly down your aim line, the one nearest this club's stock carry.
      const fwd = new THREE.Vector2(Math.sin(this.aim), -Math.cos(this.aim))
      const stock = (this.stock[this.club.id] ?? 150) * YD
      let best = Infinity
      pin = this.range.flags[0].pos
      for (const f of this.range.flags) {
        if (!f.target) continue
        const v = new THREE.Vector2(f.pos.x - b.x, f.pos.z - b.z)
        const off = Math.abs(Math.atan2(v.x * fwd.y - v.y * fwd.x, v.dot(fwd)))
        const score = Math.abs(v.length() - stock) + Math.max(0, off - 0.12) * 2000
        if (score < best) {
          best = score
          pin = f.pos
        }
      }
    }
    this.lastPin.copy(pin)
    const d = Math.hypot(pin.x - b.x, pin.z - b.z)
    const dy = yd(this.range.groundY(pin.x, pin.z) - this.range.groundY(b.x, b.z))
    const elev = `${dy >= 0 ? '+' : '−'}${Math.abs(dy).toFixed(1)}`
    $('pinDist').textContent = this.club.putter ? `${(d / 0.3048).toFixed(1)} ft` : `${yd(d).toFixed(0)} yds (${elev})`
  }

  // Overview map / look-at-the-target views, only while addressing the ball.
  setView(v: 'play' | 'map' | 'eye') {
    if (this.state !== 'address' && v !== 'play') return
    this.view = this.view === v ? 'play' : v
    $('mapBtn').classList.toggle('on', this.view === 'map')
    $('eyeBtn').classList.toggle('on', this.view === 'eye')
    const b = this.ball.mesh.position
    const f = new THREE.Vector3(Math.sin(this.aim), 0, -Math.cos(this.aim))
    if (this.view === 'map') {
      const dist = this.club.putter ? 10 : Math.min(260, Math.max(80, this.stock[this.club.id] * YD))
      const mid = b.clone().addScaledVector(f, dist * 0.55)
      this.cam.view(mid.clone().addScaledVector(f, -dist * 0.35).setY(dist * 1.1), mid)
    } else if (this.view === 'eye') {
      const pin = this.lastPin
      const back = new THREE.Vector3(pin.x - b.x, 0, pin.z - b.z).normalize()
      const at = pin.clone().addScaledVector(back, this.club.putter ? -2.5 : -18).setY(this.range.groundY(pin.x, pin.z) + (this.club.putter ? 0.6 : 3))
      this.cam.view(at, pin.clone().setY(this.range.groundY(pin.x, pin.z)))
    } else this.cam.address(b, this.aim, false, !!this.club.putter)
  }

  // ---------- HUD ----------

  buildHud() {
    $('clubs').innerHTML = CLUBS.map((c) => `<button data-club="${c.id}" title="${c.name}">${c.short}</button>`).join('')
    $('clubBtn').addEventListener('click', () => $('bagPop').classList.toggle('hidden'))
    $('lieCard').addEventListener('click', () => {
      if (!this.club.putter) $('liePop').classList.toggle('hidden')
    })
    $('mapBtn').addEventListener('click', () => this.setView('map'))
    $('eyeBtn').addEventListener('click', () => this.setView('eye'))
    $('clubPrev').addEventListener('click', () => this.cycleClub(-1))
    $('clubNext').addEventListener('click', () => this.cycleClub(1))
    document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) => {
      b.classList.toggle('on', b.dataset.quality === this.quality)
      b.addEventListener('click', () => {
        store.set('quality', b.dataset.quality)
        location.reload()
      })
    })
    $('clubs').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.club
      if (id) this.setClub(CLUBS.find((c) => c.id === id)!)
      $('bagPop').classList.add('hidden')
    })
    const lieIds: LieId[] = ['tee', 'fairway', 'rough', 'sand', 'hardpan']
    $('lies').innerHTML = lieIds.map((id) => `<button data-lie="${id}">${LIES[id].name}</button>`).join('')
    $('lies').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.lie as LieId | undefined
      if (id) this.setLie(LIES[id])
      $('liePop').classList.add('hidden')
    })
    this.setClub(this.club)
    this.setLie(this.lie, false)

    document.querySelectorAll<HTMLButtonElement>('[data-aim]').forEach((b) => b.addEventListener('click', () => this.nudgeAim(+b.dataset.aim!)))
    $('settingsBtn').addEventListener('click', () => $('settings').classList.toggle('hidden'))
    $('settingsClose').addEventListener('click', () => $('settings').classList.add('hidden'))

    const ref = $<HTMLInputElement>('speedRef')
    ref.value = String(this.speedRef)
    const showRef = () => ($('refVal').textContent = `${this.speedRef.toFixed(2)} U/s = 100%`)
    showRef()
    ref.addEventListener('input', () => {
      this.speedRef = +ref.value
      this.overlay.speedRef = this.speedRef
      store.set('speedRef', this.speedRef)
      showRef()
    })
    const firm = $<HTMLInputElement>('firmness')
    firm.value = String(this.firmness)
    const showFirm = () => ($('firmVal').textContent = this.firmness < 0.3 ? 'soft' : this.firmness > 0.7 ? 'firm & fast' : 'medium')
    showFirm()
    firm.addEventListener('input', () => {
      this.firmness = +firm.value
      store.set('firm', this.firmness)
      showFirm()
    })
    document.querySelectorAll<HTMLButtonElement>('#windBtns button').forEach((b) => b.addEventListener('click', () => this.newWind(+b.dataset.wind!)))
    this.newWind(this.windLevel)
    const camBtns = document.querySelectorAll<HTMLButtonElement>('[data-cam]')
    const showCam = () => camBtns.forEach((b) => b.classList.toggle('on', b.dataset.cam === this.cam.style))
    camBtns.forEach((b) =>
      b.addEventListener('click', () => {
        this.cam.style = b.dataset.cam as CamStyle
        store.set('cam', this.cam.style)
        showCam()
      }),
    )
    showCam()
    $('labBtn').addEventListener('click', () => this.toggleLab())
    $('labBtn').classList.toggle('on', this.overlay.lab)
    $('lab').classList.toggle('hidden', !this.overlay.lab)
    const mute = $('muteBtn')
    const showMute = () => {
      mute.textContent = this.audio.muted ? 'Sound off' : 'Sound on'
      mute.classList.toggle('on', !this.audio.muted)
    }
    showMute()
    mute.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted)
      store.set('muted', this.audio.muted)
      showMute()
    })
    $('clearBtn').addEventListener('click', () => {
      this.marks.clearMarkers()
      this.history = []
      $('shots').innerHTML = ''
    })
    // Keep HUD interactions from starting a swing underneath.
    $('hud').addEventListener('pointerdown', (e) => e.stopPropagation())
  }

  toggleLab() {
    this.overlay.lab = !this.overlay.lab
    store.set('lab', this.overlay.lab)
    $('labBtn').classList.toggle('on', this.overlay.lab)
    $('lab').classList.toggle('hidden', !this.overlay.lab)
  }

  nudgeAim(dir: number) {
    if (this.state !== 'address') return
    const step = (dir * Math.PI) / 180 / (this.club.putter ? 4 : 1)
    this.aim = this.baseAim + Math.max(-0.35, Math.min(0.35, this.aim - this.baseAim + step))
    this.cam.address(this.ball.mesh.position, this.aim, false, !!this.club.putter)
    this.refreshAddress()
    const d = Math.round(((this.aim - this.baseAim) * 180) / Math.PI * (this.club.putter ? 4 : 1)) / (this.club.putter ? 4 : 1)
    $('aimText').textContent = d === 0 ? '0°' : `${Math.abs(d)}°${d > 0 ? 'R' : 'L'}`
  }

  showLaunch(l: Launch) {
    $('dClub').textContent = `${mph(l.clubSpeed).toFixed(0)}`
    $('dBall').textContent = `${mph(l.ballSpeed).toFixed(0)}`
    $('dLaunch').textContent = `${l.launchV.toFixed(1)}°`
    $('dSpin').textContent = `${Math.round(l.spinRpm / 10) * 10}`
    for (const id of ['dCarry', 'dTotal', 'dOffline', 'dApex']) $(id).textContent = '…'
    $('data').classList.remove('hidden')
  }

  fillLab(m: SwingMetrics, l: Launch) {
    const sgn = (v: number, p: string, n: string) => `${Math.abs(v).toFixed(1)} ${v > 0.05 ? p : v < -0.05 ? n : ''}`
    const rows: [string, string][] = [
      ['Swing speed', `${Math.round(l.swingPct * 100)}%`],
      ['Backswing', `${Math.round(m.backswingMs)} ms · ${m.depth.toFixed(2)} U`],
      ['Downswing', `${Math.round(m.downswingMs)} ms`],
      ['Tempo', `${m.tempoRatio.toFixed(1)} : 1`],
      ['Transition ramp', `${Math.round(m.rampFrac * 100)}%`],
      ['Composure', `${Math.round(Math.max(0, 1 - l.chaos) * 100)}%`],
      ['', ''],
      ['Path', `${sgn(l.path, 'in-out', 'out-in')}°`],
      ['Face', `${sgn(l.face, 'open', 'closed')}°`],
      ['Face to path', `${(l.face - l.path).toFixed(1)}°`],
      ['Spin axis', `${sgn(l.tiltDeg, 'R', 'L')}°`],
      ['', ''],
      ['Peak speed at', `${sgn(m.releaseOffset, 'U early', 'U late')}`],
      ['Low point', `${sgn(l.depthMm, 'mm fat', 'mm thin')}`],
      ['Strike', `${sgn(l.toeMm, 'mm toe', 'mm heel')}`],
    ]
    $('labBody').innerHTML = rows.map(([k, v]) => (k ? `<div class="k">${k}</div><div>${v}</div>` : '<div class="sep"></div>')).join('')
  }

  toastTimer = 0
  toast(msg: string) {
    const t = $('toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800)
  }

  updateWindHud() {
    const w = windAt(this.wind, 10, this.worldT)
    const s = Math.hypot(w.x, w.z)
    const rel = this.wind.dir - this.aim
    $('windArrow').setAttribute('transform', `rotate(${(rel * 180) / Math.PI})`)
    $('windArrow').style.opacity = s < 0.3 ? '0.2' : '1'
    $('windSpeed').textContent = `${mph(s).toFixed(0)} mph`
    const along = Math.cos(rel)
    const cross = Math.sin(rel)
    const parts: string[] = []
    if (s < 0.3) parts.push('calm')
    else {
      if (Math.abs(along) > 0.38) parts.push(along > 0 ? 'helping' : 'into')
      if (Math.abs(cross) > 0.38) parts.push(cross > 0 ? 'left → right' : 'right → left')
    }
    $('windDesc').textContent = parts.join(', ')
  }

  key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const n = parseInt(e.key)
    if (n >= 0 && n <= 9) this.setClub(CLUBS[n === 0 ? 9 : n - 1])
    switch (e.key.toLowerCase()) {
      case 'q':
      case 'arrowleft':
        this.nudgeAim(-1)
        break
      case 'e':
      case 'arrowright':
        this.nudgeAim(1)
        break
      case '[':
      case 'z':
        this.cycleClub(-1)
        break
      case ']':
      case 'x':
        this.cycleClub(1)
        break
      case 'n':
        if (this.club.putter && this.state === 'address') this.newPutt()
        break
      case 'l':
        this.toggleLab()
        break
      case 'v':
        this.cam.style = this.cam.style === 'chase' ? 'tracer' : 'chase'
        store.set('cam', this.cam.style)
        document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === this.cam.style))
        break
      case 'w':
        this.newWind()
        break
      case 'm':
        this.audio.setMuted(!this.audio.muted)
        store.set('muted', this.audio.muted)
        break
      case ' ':
        if (this.state === 'flight') this.skip()
        else if (this.state === 'rest') this.reset()
        break
    }
  }

  resize() {
    this.cam.fovScale = window.innerWidth < window.innerHeight ? 1.4 : 1
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.cam.camera.aspect = window.innerWidth / window.innerHeight
    this.cam.camera.updateProjectionMatrix()
  }

  // ---------- frame ----------

  update(dt: number) {
    if (this.slowMo > 0) {
      this.slowMo -= dt
      if (this.slowMo <= 0) this.slowMo = 0
    }
    // Ease back out of slow motion.
    const target = this.slowMo > 0 ? 0.2 : 1
    this.timeScale += (target - this.timeScale) * (1 - Math.exp(-dt * (this.slowMo > 0 ? 20 : 3)))
    const sdt = dt * this.timeScale
    this.worldT += sdt

    if (this.state === 'flight') this.updateFlight(dt)
    else if (this.state === 'rest') {
      this.restTimer -= dt
      if (this.restTimer <= 0) this.reset()
    }
    if (this.lieTimer > 0) {
      this.lieTimer -= dt
      if (this.lieTimer <= 0 && this.state === 'address') this.cam.address(this.ball.mesh.position, this.aim, false, !!this.club.putter)
    }

    const vel = this.shot ? this.sample(this.shot.result.points, this.shot, this.shot.t).v : new THREE.Vector3()
    this.cam.update(dt, this.ball.mesh.position, vel, this.aim)
    this.ball.update(sdt, this.cam.camera, window.innerHeight)
    if (this.state === 'flight' && this.shot && this.shot.t > 0.25) this.club3d.hide()
    this.club3d.update(dt)
    this.puttGrid.update(dt, this.worldT)
    this.debris.update(sdt)
    this.tracer.update(this.cam.camera)
    this.range.update(this.worldT, this.wind)
    const gw = windAt(this.wind, 1, this.worldT)
    for (const g of this.grass) g.update(this.worldT, gw)
    const focus = this.state === 'address' ? this.tee : this.ball.mesh.position
    this.range.atmosphere.follow(focus)
    this.range.atmosphere.update(this.worldT, new THREE.Vector2(gw.x, gw.z), this.cam.camera)
    this.drift.center.copy(this.cam.camera.position).addScaledVector(this.cam.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), 20)
    this.drift.update(sdt, this.worldT, this.wind)
    this.aimLine.position.set(this.tee.x, 0.015, this.tee.z)
    this.aimLine.rotation.z = -this.aim
    this.audio.ambient(this.wind.speed, dt)
    this.updateWindHud()
    this.overlay.draw()
    this.renderer.render(this.scene, this.cam.camera)
  }
}

// Expose for console tinkering while prototyping.
;(window as unknown as { game: Game }).game = new Game()
