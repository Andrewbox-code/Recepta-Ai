import * as THREE from 'three'
import { CLUBS, type Club } from './physics/clubs'
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
const CLUB_COLORS: Record<string, number> = { dr: 0xff5d5d, '3w': 0xff9f43, '5i': 0xffe066, '7i': 0x7ee081, '9i': 0x4dd0e1, pw: 0x7aa2ff, sw: 0xd08bff }

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

  club: Club = CLUBS[3]
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

  constructor() {
    const canvas = $<HTMLCanvasElement>('gl')
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.cam = new CameraDirector(window.innerWidth / window.innerHeight)
    this.cam.style = store.get<CamStyle>('cam', 'chase')
    this.range = new Range(this.scene)
    this.ball = new Ball(this.scene)
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

    this.newWind()
    this.buildHud()
    this.setLie(this.lie, false)
    this.reset(true)
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('keydown', (e) => this.key(e))
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      this.update(dt)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // ---------- shot lifecycle ----------

  reset(snap = false) {
    this.state = 'address'
    this.shot = null
    this.timeScale = 1
    this.slowMo = 0
    const p = new THREE.Vector3(this.tee.x, Ball.restY(this.lie), this.tee.z)
    this.ball.place(p)
    this.ball.setLie(this.lie, this.tee)
    this.ball.mesh.rotation.set(0, Math.random() * 6, 0)
    this.cam.address(p, this.aim, snap)
    this.input.enabled = true
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
    const launch = computeLaunch(m, this.club, this.lie, this.speedRef, Math.random)
    this.overlay.hold(m, launch, ox, oy, unit)
    const start = this.ball.mesh.position.clone()
    const result = simulate(launch, start, this.aim, {
      wind: this.wind,
      firmness: this.firmness,
      surfaceAt: this.range.surfaceAt,
      t0: this.worldT,
    })
    const holed = this.checkHoled(result)
    this.shot = { launch, result, metrics: m, club: this.club, t: 0, idx: 0, bounce: 0, landed: false, holed }
    this.state = 'flight'
    this.aimLine.visible = false
    this.tracer.reset()
    this.tracer.opacity = 1
    this.tracer.color = launch.contact === 'pure' ? 0xfff27a : 0xffffff
    this.cam.launch(new THREE.Vector3(result.carryPos.x, result.carryPos.y, result.carryPos.z))
    this.impactFx(launch, start)
    this.fillLab(m, launch)
    this.showLaunch(launch)

    // Slow motion for the shots you'll remember, good or bad.
    const great = launch.contact === 'pure' && launch.swingPct > 0.85 && launch.quality > 0.9
    const awful = ['shank', 'chunk', 'top', 'whiff', 'skied'].includes(launch.contact)
    if (great || awful) {
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
      if (b.surface === 'sand') this.debris.spray(bp, new THREE.Vector3(0, 1, 0), { count: 25, colors: [0xe3d3a4, 0xd8c692], speed: 0, spread: 2, up: 2, size: 0.02, drag: 3 })
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
    if (s.launch.contact !== 'whiff') {
      this.marks.marker(rest, CLUB_COLORS[s.club.id] ?? 0xffffff)
      this.history.unshift({ club: s.club.short, carry: yd(r.carry), total: yd(total), off: yd(off) })
      this.history = this.history.slice(0, 12)
      $('shots').innerHTML = this.history
        .map((h) => `<li>${h.club} <b>${h.carry.toFixed(0)}</b> <span>/ ${h.total.toFixed(0)} · ${Math.abs(h.off).toFixed(0)}${h.off > 0.5 ? 'R' : h.off < -0.5 ? 'L' : ''}</span></li>`)
        .join('')
    }

    // The gallery reacts to proximity, not to a grade.
    if (s.holed) {
      this.audio.crowd(1.3, 'cheer')
      this.toast('In the hole!')
      return
    }
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
    this.club = c
    document.querySelectorAll<HTMLButtonElement>('#clubs button').forEach((b) => b.classList.toggle('on', b.dataset.club === c.id))
    if (c.wood && this.lie.id === 'fairway' && c.id === 'dr') this.setLie(LIES.tee)
    else if (!c.wood && this.lie.id === 'tee') this.setLie(LIES.fairway)
  }

  setLie(l: Lie, look = true) {
    this.lie = l
    document.querySelectorAll<HTMLButtonElement>('#lies button').forEach((b) => b.classList.toggle('on', b.dataset.lie === l.id))
    if (this.state !== 'address') return
    const p = new THREE.Vector3(this.tee.x, Ball.restY(l), this.tee.z)
    this.ball.place(p)
    this.ball.setLie(l, this.tee)
    if (look) {
      // Show the player how it's sitting.
      this.cam.lieCheck(p, this.aim)
      this.lieTimer = 1.4
    }
  }

  // ---------- HUD ----------

  buildHud() {
    $('clubs').innerHTML = CLUBS.map((c, i) => `<button data-club="${c.id}" title="${c.name} (${i + 1})">${c.short}</button>`).join('')
    $('clubs').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.club
      if (id) this.setClub(CLUBS.find((c) => c.id === id)!)
    })
    const lieIds: LieId[] = ['tee', 'fairway', 'rough', 'sand', 'hardpan']
    $('lies').innerHTML = lieIds.map((id) => `<button data-lie="${id}">${LIES[id].name}</button>`).join('')
    $('lies').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.lie as LieId | undefined
      if (id) this.setLie(LIES[id])
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
    this.aim = Math.max(-0.35, Math.min(0.35, this.aim + (dir * Math.PI) / 180))
    this.cam.address(this.ball.mesh.position, this.aim)
    const d = Math.round((this.aim * 180) / Math.PI)
    $('aimText').textContent = d === 0 ? 'Aim 0°' : `Aim ${Math.abs(d)}° ${d > 0 ? 'R' : 'L'}`
  }

  showLaunch(l: Launch) {
    $('dClub').textContent = `${mph(l.clubSpeed).toFixed(0)}`
    $('dBall').textContent = `${mph(l.ballSpeed).toFixed(0)}`
    $('dLaunch').textContent = `${l.launchV.toFixed(1)}°`
    $('dSpin').textContent = `${Math.round(l.spinRpm / 10) * 10}`
    for (const id of ['dCarry', 'dTotal', 'dOffline', 'dApex']) $(id).textContent = '…'
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
    if (n >= 1 && n <= CLUBS.length) this.setClub(CLUBS[n - 1])
    switch (e.key.toLowerCase()) {
      case 'q':
      case 'arrowleft':
        this.nudgeAim(-1)
        break
      case 'e':
      case 'arrowright':
        this.nudgeAim(1)
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
      if (this.lieTimer <= 0 && this.state === 'address') this.cam.address(this.ball.mesh.position, this.aim)
    }

    const vel = this.shot ? this.sample(this.shot.result.points, this.shot, this.shot.t).v : new THREE.Vector3()
    this.cam.update(dt, this.ball.mesh.position, vel, this.aim)
    this.ball.update(sdt, this.cam.camera, window.innerHeight)
    this.debris.update(sdt)
    this.tracer.update(this.cam.camera)
    this.range.update(this.worldT, this.wind)
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
