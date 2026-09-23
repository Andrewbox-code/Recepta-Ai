import type { Contact } from '../physics/impact'
import type { Club } from '../physics/clubs'
import type { LieId, SurfaceId } from '../physics/lies'

// Everything is synthesised: no samples to load, and every strike can be
// shaped continuously by how it was hit rather than picked from a list.

export class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private amb!: GainNode
  private noise!: AudioBuffer
  private whooshGain!: GainNode
  private whooshFilter!: BiquadFilterNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private birdTimer = 0
  muted = false

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.connect(this.master)
    this.amb = ctx.createGain()
    this.amb.gain.value = 0.5
    this.amb.connect(this.master)

    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

    // Swing whoosh: a looping noise bed whose level and pitch track hand speed.
    const wsrc = this.loopNoise()
    this.whooshFilter = ctx.createBiquadFilter()
    this.whooshFilter.type = 'bandpass'
    this.whooshFilter.Q.value = 1.4
    this.whooshGain = ctx.createGain()
    this.whooshGain.gain.value = 0
    wsrc.connect(this.whooshFilter).connect(this.whooshGain).connect(this.sfx)

    // Ambient wind.
    const wind = this.loopNoise()
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 400
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    wind.connect(this.windFilter).connect(this.windGain).connect(this.amb)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }

  private loopNoise() {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.start()
    return src
  }

  private burst(opts: {
    at?: number
    dur: number
    type?: BiquadFilterType
    freq: number
    freqEnd?: number
    q?: number
    gain: number
    attack?: number
    dest?: AudioNode
  }) {
    const ctx = this.ctx!
    const t = opts.at ?? ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = opts.type ?? 'bandpass'
    f.frequency.setValueAtTime(opts.freq, t)
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur)
    f.Q.value = opts.q ?? 1
    const g = ctx.createGain()
    const a = opts.attack ?? 0.001
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    src.connect(f).connect(g).connect(opts.dest ?? this.sfx)
    src.start(t, Math.random() * 1.5)
    src.stop(t + opts.dur + 0.05)
  }

  private tone(opts: { at?: number; freq: number; freqEnd?: number; dur: number; gain: number; type?: OscillatorType; attack?: number; dest?: AudioNode }) {
    const ctx = this.ctx!
    const t = opts.at ?? ctx.currentTime
    const o = ctx.createOscillator()
    o.type = opts.type ?? 'sine'
    o.frequency.setValueAtTime(opts.freq, t)
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.002))
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    o.connect(g).connect(opts.dest ?? this.sfx)
    o.start(t)
    o.stop(t + opts.dur + 0.05)
  }

  // Live swing speed in U/s -> whoosh.
  swingSpeed(speed: number, active: boolean) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const v = active ? Math.min(1, speed / 10) : 0
    this.whooshGain.gain.setTargetAtTime(v * v * 0.5, t, 0.02)
    this.whooshFilter.frequency.setTargetAtTime(300 + v * 1800, t, 0.03)
  }

  strike(contact: Contact, club: Club, lie: LieId, quality: number, power: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + 0.005
    const p = Math.min(1.2, Math.max(0.25, power))
    const wood = club.sound === 'driver' || club.sound === 'wood'
    const wedge = club.sound === 'wedge'

    if (contact === 'whiff') {
      this.burst({ at: t, dur: 0.35, freq: 900, freqEnd: 300, q: 0.8, gain: 0.25 })
      return
    }
    if (contact === 'shank') {
      // Hosel: a dead metallic clank.
      this.tone({ at: t, freq: 620, dur: 0.18, gain: 0.35, type: 'square' })
      this.tone({ at: t, freq: 1370, dur: 0.12, gain: 0.2, type: 'triangle' })
      this.burst({ at: t, dur: 0.05, freq: 2500, gain: 0.5 })
      this.turf(lie, 0.5, t + 0.01)
      return
    }

    const clean = contact === 'pure' || contact === 'good'
    if (wood) {
      if (clean) {
        // Titanium crack with a short ring; the purer, the brighter and louder.
        const bright = 0.7 + quality * 0.3
        this.burst({ at: t, dur: 0.03, type: 'highpass', freq: 2500 * bright, gain: 1.1 * p })
        this.burst({ at: t, dur: 0.09, freq: 1800, q: 3, gain: 0.5 * p })
        const base = club.sound === 'driver' ? 1150 : 1350
        this.tone({ at: t, freq: base * bright, dur: 0.22, gain: 0.18 * p * quality })
        this.tone({ at: t, freq: base * 2.13 * bright, dur: 0.14, gain: 0.1 * p * quality })
        this.tone({ at: t, freq: 140, freqEnd: 70, dur: 0.1, gain: 0.5 * p })
      } else {
        // Off-centre: duller, lower, shorter.
        this.burst({ at: t, dur: 0.05, freq: 900, q: 1.2, gain: 0.8 * p })
        this.tone({ at: t, freq: 480, dur: 0.12, gain: 0.25 * p, type: 'triangle' })
        this.tone({ at: t, freq: 110, freqEnd: 60, dur: 0.12, gain: 0.5 * p })
      }
    } else {
      const click = wedge ? 5200 : 4200
      if (clean) {
        // Compressed "click" of a forged iron, then the turf after the ball.
        this.burst({ at: t, dur: 0.018, type: 'highpass', freq: click, gain: 1.2 * p })
        this.burst({ at: t, dur: 0.05, freq: wedge ? 3000 : 2400, q: 4, gain: 0.45 * p })
        this.tone({ at: t, freq: wedge ? 2400 : 1900, dur: 0.06, gain: 0.12 * p })
        this.tone({ at: t, freq: 160, freqEnd: 80, dur: 0.08, gain: 0.55 * p })
      }
    }

    switch (contact) {
      case 'thin':
      case 'top':
        // Stinging blade contact: harsh buzz you feel in your hands.
        this.burst({ at: t, dur: 0.03, type: 'highpass', freq: 3000, gain: 0.9 * p })
        this.tone({ at: t, freq: wood ? 520 : 780, dur: 0.28, gain: 0.22 * p, type: 'sawtooth' })
        this.tone({ at: t, freq: wood ? 1047 : 1570, dur: 0.18, gain: 0.08 * p, type: 'square' })
        if (contact === 'top') this.turf(lie, 0.3, t + 0.02)
        break
      case 'fat':
      case 'chunk': {
        const heavy = contact === 'chunk' ? 1 : 0.6
        this.tone({ at: t, freq: 90, freqEnd: 45, dur: 0.25, gain: 0.8 * heavy })
        this.burst({ at: t, dur: 0.06, freq: 700, q: 0.7, gain: 0.5 * p })
        this.turf(lie, 1.2 * heavy, t)
        break
      }
      case 'skied':
        this.burst({ at: t, dur: 0.04, freq: 1200, q: 1, gain: 0.8 * p })
        this.tone({ at: t, freq: 330, dur: 0.15, gain: 0.3 * p, type: 'triangle' })
        break
      case 'toe':
      case 'heel':
        if (!wood) {
          this.burst({ at: t, dur: 0.03, freq: 2200, q: 1, gain: 0.8 * p })
          this.tone({ at: t, freq: 650, dur: 0.14, gain: 0.2 * p, type: 'triangle' })
        }
        this.turf(lie, 0.4, t + 0.015)
        break
      default:
        if (!wood || lie !== 'tee') this.turf(lie, wedge ? 0.8 : 0.55, t + 0.012)
    }
  }

  // The ground's part of the sound.
  private turf(lie: LieId, amount: number, at: number) {
    switch (lie) {
      case 'sand':
        this.burst({ at, dur: 0.45 * amount + 0.1, freq: 2200, freqEnd: 900, q: 0.6, gain: 0.55 * amount, attack: 0.01 })
        break
      case 'rough':
        this.burst({ at, dur: 0.3, freq: 3500, freqEnd: 1500, q: 0.7, gain: 0.4 * amount, attack: 0.01 })
        this.burst({ at: at + 0.04, dur: 0.18, freq: 6000, q: 2, gain: 0.2 * amount })
        break
      case 'hardpan':
        this.tone({ at, freq: 200, freqEnd: 90, dur: 0.1, gain: 0.5 * amount })
        this.burst({ at, dur: 0.12, freq: 1500, q: 0.9, gain: 0.4 * amount })
        break
      case 'tee':
        break
      default:
        this.burst({ at, dur: 0.16 * amount + 0.06, type: 'lowpass', freq: 1800, q: 0.7, gain: 0.5 * amount, attack: 0.004 })
    }
  }

  land(surface: SurfaceId, speed: number) {
    if (!this.ctx) return
    const g = Math.min(0.6, speed / 40)
    if (g < 0.02) return
    if (surface === 'sand') this.burst({ dur: 0.2, freq: 1500, q: 0.6, gain: g })
    else {
      this.tone({ freq: surface === 'green' ? 160 : 120, freqEnd: 60, dur: 0.09, gain: g })
      this.burst({ dur: 0.05, type: 'lowpass', freq: 900, gain: g * 0.6 })
    }
  }

  // Ambient bed: wind strength drives level and brightness; birds now and then.
  ambient(windSpeed: number, dt: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const w = Math.min(1, windSpeed / 12)
    this.windGain.gain.setTargetAtTime(0.03 + w * 0.22 * (0.8 + 0.2 * Math.sin(t * 0.7)), t, 0.4)
    this.windFilter.frequency.setTargetAtTime(250 + w * 600 + Math.sin(t * 1.3) * 80, t, 0.4)
    this.birdTimer -= dt
    if (this.birdTimer <= 0) {
      this.birdTimer = 3 + Math.random() * 7
      const f = 2800 + Math.random() * 1800
      const n = 2 + Math.floor(Math.random() * 4)
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.09 + Math.random() * 0.05)
        this.tone({ at, freq: f, freqEnd: f * (0.7 + Math.random() * 0.5), dur: 0.07, gain: 0.025, dest: this.amb })
      }
    }
  }

  // A synthetic gallery: murmured "ooh" swelling into applause.
  crowd(intensity: number, kind: 'cheer' | 'ooh' | 'groan') {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.1
    const voices = 14
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      const base = 140 + Math.random() * 180
      const rise = kind === 'groan' ? 0.7 : kind === 'ooh' ? 1.12 : 1.3
      o.frequency.setValueAtTime(base, t)
      o.frequency.exponentialRampToValueAtTime(base * rise, t + 0.9)
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = kind === 'groan' ? 450 : 700 + Math.random() * 300
      f.Q.value = 5
      const g = ctx.createGain()
      const st = t + Math.random() * 0.15
      const peak = (0.05 * intensity) / Math.sqrt(voices)
      g.gain.setValueAtTime(0.0001, st)
      g.gain.exponentialRampToValueAtTime(peak, st + 0.25)
      g.gain.exponentialRampToValueAtTime(0.0001, st + 1.3)
      o.connect(f).connect(g).connect(this.sfx)
      o.start(st)
      o.stop(st + 1.4)
    }
    if (kind === 'cheer') {
      const claps = Math.floor(60 * intensity)
      for (let i = 0; i < claps; i++) {
        const at = t + 0.3 + Math.random() * 2.2 * (0.6 + intensity * 0.4)
        this.burst({ at, dur: 0.025, freq: 1200 + Math.random() * 1500, q: 1.5, gain: 0.06 + Math.random() * 0.06 })
      }
    }
  }
}
