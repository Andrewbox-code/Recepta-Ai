import type { LiveSwing } from '../swing/SwingInput'
import type { SwingMetrics } from '../swing/analyze'

interface Held {
  m: SwingMetrics
  club: { path: number; face: number }
  ox: number
  oy: number
  unit: number
  born: number
}

// Draws the hands' path on screen: where you addressed the ball, the impact
// line, and a speed-coloured trail. It never grades the swing.
export class SwingOverlay {
  private c: HTMLCanvasElement
  private g: CanvasRenderingContext2D
  private live: LiveSwing | null = null
  private held: Held | null = null
  lab = false
  speedRef = 8

  constructor(canvas: HTMLCanvasElement) {
    this.c = canvas
    this.g = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.c.width = window.innerWidth * dpr
    this.c.height = window.innerHeight * dpr
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  setLive(s: LiveSwing) {
    this.live = s.phase === 'idle' ? null : s
    if (this.live) this.held = null
  }

  hold(m: SwingMetrics, club: { path: number; face: number }, ox: number, oy: number, unit: number) {
    this.held = { m, club, ox, oy, unit, born: performance.now() }
  }

  clear() {
    this.held = null
  }

  private color(speed: number, a = 1) {
    const k = Math.min(1.3, speed / this.speedRef)
    const hue = 200 - Math.min(1, k) * 170 - Math.max(0, k - 1) * 100
    return `hsla(${hue}, 95%, ${55 + Math.min(1, k) * 10}%, ${a})`
  }

  private guides(ox: number, oy: number, U: number, a: number) {
    const g = this.g
    g.save()
    g.globalAlpha = a
    // Impact line
    g.setLineDash([6, 8])
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(ox - U * 0.9, oy)
    g.lineTo(ox + U * 0.9, oy)
    g.stroke()
    g.setLineDash([])
    // Backswing depth ticks: half and full.
    g.strokeStyle = 'rgba(255,255,255,0.25)'
    for (const d of [0.5, 1]) {
      g.beginPath()
      g.moveTo(ox - 14, oy + U * d)
      g.lineTo(ox + 14, oy + U * d)
      g.stroke()
    }
    // Ball
    g.fillStyle = 'rgba(255,255,255,0.95)'
    g.beginPath()
    g.arc(ox, oy, 7, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.5)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(ox, oy, 14, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }

  draw() {
    const g = this.g
    g.clearRect(0, 0, window.innerWidth, window.innerHeight)
    if (this.live) {
      const { origin, points, unit } = this.live
      this.guides(origin.x, origin.y, unit, 1)
      g.lineCap = 'round'
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        const dt = (b.t - a.t) / 1000
        const sp = dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / unit / dt : 0
        const age = (points[points.length - 1].t - b.t) / 900
        g.strokeStyle = this.color(sp, Math.max(0.15, 1 - age))
        g.lineWidth = 3 + Math.min(1, sp / this.speedRef) * 7
        g.beginPath()
        g.moveTo(a.x, a.y)
        g.lineTo(b.x, b.y)
        g.stroke()
      }
      const last = points[points.length - 1]
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(last.x, last.y, 9, 0, Math.PI * 2)
      g.fill()
      return
    }
    if (!this.held) return
    const { m, club, ox, oy, unit, born } = this.held
    const age = (performance.now() - born) / 1000
    const a = this.lab ? 1 : Math.max(0, 1 - age / 1.4)
    if (a <= 0) {
      this.held = null
      return
    }
    this.guides(ox, oy, unit, a * 0.8)
    const X = (x: number) => ox + x * unit
    const Y = (y: number) => oy + y * unit
    g.lineCap = 'round'
    for (let i = 1; i < m.trace.length; i++) {
      const p = m.trace[i - 1]
      const q = m.trace[i]
      g.strokeStyle = this.color(q.speed, a * (q.t > m.impactT ? 0.5 : 1))
      g.lineWidth = 2 + Math.min(1, q.speed / this.speedRef) * 6
      g.beginPath()
      g.moveTo(X(p.x), Y(p.y))
      g.lineTo(X(q.x), Y(q.y))
      g.stroke()
    }
    if (!this.lab) return
    // Swing Lab annotations: where the speed peaked, path and face through impact.
    g.globalAlpha = 1
    g.font = '600 12px system-ui, sans-serif'
    g.fillStyle = '#fff'
    const top = m.trace.reduce((b, p) => (p.y > b.y ? p : b), m.trace[0])
    g.fillText('top', X(top.x) + 12, Y(top.y) + 4)
    const peakY = Y(m.releaseOffset)
    g.strokeStyle = '#ff5b5b'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(ox - unit * 0.5, peakY)
    g.lineTo(ox - unit * 0.3, peakY)
    g.stroke()
    g.fillStyle = '#ff9b9b'
    g.fillText('peak speed', ox - unit * 0.5 - 70, peakY + 4)
    const ix = X(m.crossX)
    const arrow = (deg: number, color: string, label: string, len: number) => {
      const r = (deg * Math.PI) / 180
      const ex = ix + Math.sin(r) * len
      const ey = oy - Math.cos(r) * len
      g.strokeStyle = color
      g.fillStyle = color
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(ix, oy)
      g.lineTo(ex, ey)
      g.stroke()
      g.fillText(label, ex + 6, ey)
    }
    // Club path and face, exaggerated 3x so a few degrees is visible.
    arrow(0, 'rgba(255,255,255,0.35)', 'target', unit * 0.6)
    arrow(club.path * 3, '#6bd1ff', `path ${club.path.toFixed(1)}°`, unit * 0.55)
    arrow(club.face * 3, '#ffd166', `face ${club.face.toFixed(1)}°`, unit * 0.42)
  }
}
