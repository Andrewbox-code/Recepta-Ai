import { analyzeSwing, findPhases, type SwingMetrics, type SwingSample } from './analyze'

export type SwingPhase = 'idle' | 'address' | 'back' | 'down' | 'through'

export interface LiveSwing {
  phase: SwingPhase
  origin: { x: number; y: number }
  points: SwingSample[]
  speed: number // U/s, instantaneous (smoothed)
  unit: number
}

export interface SwingCallbacks {
  onLive: (s: LiveSwing) => void
  onSwing: (m: SwingMetrics, samples: SwingSample[], unit: number) => void
  onCancel: (reason: string) => void
}

// After the hands pass the ball we keep listening briefly, to see whether the
// player swung *through* it or quit on it: until the hands have clearly
// started slowing down, capped so a fast swing still feels instant.
const FOLLOW_MIN_MS = 45
const FOLLOW_MAX_MS = 150

export class SwingInput {
  enabled = false
  private samples: SwingSample[] = []
  private phase: SwingPhase = 'idle'
  private pointerId = -1
  private impactAt = 0
  private finishTimer = 0
  private unit = 1
  private speed = 0
  private peak = 0

  private el: HTMLElement
  private cb: SwingCallbacks

  constructor(el: HTMLElement, cb: SwingCallbacks) {
    this.el = el
    this.cb = cb
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.up)
    el.addEventListener('pointercancel', () => this.cancel('interrupted'))
  }

  static unitFor(w: number, h: number) {
    return Math.min(w, h) * 0.32
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.phase !== 'idle' || e.button > 0) return
    e.preventDefault()
    this.el.setPointerCapture(e.pointerId)
    this.pointerId = e.pointerId
    this.unit = SwingInput.unitFor(window.innerWidth, window.innerHeight)
    this.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }]
    this.phase = 'address'
    this.speed = 0
    this.peak = 0
    this.emit()
  }

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || this.phase === 'idle') return
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    for (const c of evs.length ? evs : [e]) {
      const last = this.samples[this.samples.length - 1]
      if (c.timeStamp <= last.t) continue
      this.samples.push({ x: c.clientX, y: c.clientY, t: c.timeStamp })
    }
    this.updateSpeed()
    if (this.phase !== 'through') {
      const ph = findPhases(this.samples, this.unit)
      if (ph) {
        if (ph.crossIdx >= 0) {
          this.phase = 'through'
          this.impactAt = e.timeStamp
          this.finishTimer = window.setTimeout(() => this.finish(), FOLLOW_MAX_MS)
        } else if (ph.topIdx < this.samples.length - 1 && this.samples[this.samples.length - 1].y < this.samples[ph.topIdx].y - this.unit * 0.05 && ph.depth > 0.18) {
          this.phase = 'down'
        } else {
          this.phase = 'back'
        }
      }
    } else {
      const since = e.timeStamp - this.impactAt
      if (since >= FOLLOW_MAX_MS || (since >= FOLLOW_MIN_MS && this.speed < this.peak * 0.75)) {
        this.finish()
        return
      }
    }
    if (this.phase === 'down' || this.phase === 'through') this.peak = Math.max(this.peak, this.speed)
    this.emit()
  }

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return
    if (this.phase === 'through') this.finish()
    else if (this.phase !== 'idle') this.cancel(this.phase === 'address' ? 'tap' : 'backed off')
  }

  private updateSpeed() {
    const s = this.samples
    const now = s[s.length - 1]
    let i = s.length - 1
    while (i > 0 && now.t - s[i].t < 24) i--
    const a = s[i]
    const dt = (now.t - a.t) / 1000
    this.speed = dt > 0 ? Math.hypot(now.x - a.x, now.y - a.y) / this.unit / dt : 0
  }

  private finish() {
    if (this.phase === 'idle') return
    clearTimeout(this.finishTimer)
    const samples = this.samples
    const m = analyzeSwing(samples, this.unit)
    this.reset()
    if (m) this.cb.onSwing(m, samples, this.unit)
    else this.cb.onCancel('no swing')
  }

  cancel(reason: string) {
    if (this.phase === 'idle') return
    clearTimeout(this.finishTimer)
    this.reset()
    this.cb.onCancel(reason)
  }

  private reset() {
    if (this.pointerId >= 0 && this.el.hasPointerCapture(this.pointerId)) this.el.releasePointerCapture(this.pointerId)
    this.pointerId = -1
    this.phase = 'idle'
    this.speed = 0
    this.emit()
  }

  private emit() {
    const o = this.samples[0] ?? { x: 0, y: 0 }
    this.cb.onLive({ phase: this.phase, origin: { x: o.x, y: o.y }, points: this.samples, speed: this.speed, unit: this.unit })
  }
}
