import * as THREE from 'three'
import { TIER_INFO, rarityOf, type Progress, type Reward, type Tier, LEVEL_CARDS, MAX_LEVEL } from '../game/progress'
import { ALL_ITEMS, RARITY_COLOR, RARITY_LABEL } from '../physics/equipment'
import { dimpleNormal } from '../world/Ball'

// Chest balls: pick one, tap to crack it open, and flip through the cards.

const KIND_ICON: Record<string, string> = {
  driver: '<path d="M8 30 L22 10" stroke="currentColor" stroke-width="2.4"/><ellipse cx="28" cy="31" rx="9" ry="5" fill="currentColor"/>',
  woods: '<path d="M8 30 L22 10" stroke="currentColor" stroke-width="2.4"/><ellipse cx="27" cy="31" rx="7" ry="4" fill="currentColor"/>',
  irons: '<path d="M10 32 L22 8" stroke="currentColor" stroke-width="2.4"/><path d="M20 30 L33 28 L34 33 L19 34 Z" fill="currentColor"/>',
  wedges: '<path d="M10 32 L22 8" stroke="currentColor" stroke-width="2.4"/><path d="M20 29 L32 24 L34 33 L19 34 Z" fill="currentColor"/>',
  putter: '<path d="M14 32 L20 8" stroke="currentColor" stroke-width="2.4"/><rect x="12" y="30" width="20" height="5" rx="1.5" fill="currentColor"/>',
  ball: '<circle cx="20" cy="20" r="11" fill="currentColor"/><circle cx="16" cy="17" r="1.3" fill="#0008"/><circle cx="21" cy="15" r="1.3" fill="#0008"/><circle cx="24" cy="20" r="1.3" fill="#0008"/>',
}

export class ChestScreen {
  private root: HTMLElement
  private progress: Progress
  private onChange: () => void
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  private chest = new THREE.Group()
  private top = new THREE.Group()
  private bottom = new THREE.Group()
  private glow!: THREE.Sprite
  private bandMat!: THREE.MeshStandardMaterial
  private shellMat!: THREE.MeshPhysicalMaterial
  private sparks!: THREE.Points
  private sparkVel: THREE.Vector3[] = []
  private raf = 0
  private selected = 0
  private phase: 'idle' | 'shaking' | 'burst' | 'cards' = 'idle'
  private t0 = 0
  private rewards: Reward[] = []
  private shown = 0

  constructor(root: HTMLElement, progress: Progress, onChange: () => void) {
    this.root = root
    this.progress = progress
    this.onChange = onChange
    root.innerHTML = `
      <div class="title">Chest Balls <button class="x" id="chestClose">✕</button></div>
      <div class="chest-stage">
        <canvas id="chestCanvas"></canvas>
        <div class="chest-flash" id="chestFlash"></div>
        <div class="chest-label" id="chestLabel"></div>
        <div class="chest-cards" id="chestCards"></div>
      </div>
      <div class="chest-row" id="chestRow"></div>
      <div class="chest-actions"><button class="primary" id="chestOpen">Open</button></div>
      <div class="chest-help">Earn chest balls by playing: XP from every shot fills a <b>Bronze</b> ball; shots inside 2 yds, long holed putts and finished rounds pay out <b>Silver</b> and <b>Gold</b>; a hole-out earns <b>Platinum</b>. Your first card of an item unlocks it; extra cards level it up.</div>`
    root.querySelector('#chestClose')!.addEventListener('click', () => this.close())
    root.querySelector('#chestRow')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      if (!b || this.phase !== 'idle') return
      this.selected = +b.dataset.i!
      this.render()
    })
    root.querySelector('#chestOpen')!.addEventListener('click', () => this.primary())
    root.querySelector('#chestCards')!.addEventListener('click', () => this.nextCard())
    this.buildChest()
  }

  get isOpen() {
    return !this.root.classList.contains('hidden')
  }

  open() {
    this.root.classList.remove('hidden')
    this.phase = 'idle'
    this.selected = Math.min(this.selected, Math.max(0, this.progress.chests.length - 1))
    this.ensureRenderer()
    this.render()
    cancelAnimationFrame(this.raf)
    const loop = () => {
      this.animate()
      this.renderer!.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }

  close() {
    if (this.phase === 'shaking' || this.phase === 'burst') return
    this.root.classList.add('hidden')
    cancelAnimationFrame(this.raf)
  }

  private ensureRenderer() {
    if (this.renderer) return
    const canvas = this.root.querySelector<HTMLCanvasElement>('#chestCanvas')!
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const w = canvas.clientWidth || 360
    const h = canvas.clientHeight || 240
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    // Studio: soft environment plus a key light.
    const env = new THREE.Scene()
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x223040, side: THREE.BackSide })))
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), side: THREE.DoubleSide }))
    panel.position.set(0, 6, 2)
    panel.lookAt(0, 0, 0)
    env.add(panel)
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pm.fromScene(env, 0.02).texture
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(2, 3, 4)
    this.scene.add(key)
  }

  private buildChest() {
    const normal = dimpleNormal()
    this.shellMat = new THREE.MeshPhysicalMaterial({ color: 0xc47a3c, metalness: 0.9, roughness: 0.28, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 1, clearcoatRoughness: 0.1 })
    const half = (up: boolean) => new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2), this.shellMat)
    this.top.add(half(true))
    this.bottom.add(half(false))
    this.bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcc66, emissiveIntensity: 1.5 })
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.045, 16, 96), this.bandMat)
    band.rotation.x = Math.PI / 2
    this.bottom.add(band)
    // Interior glow revealed when it opens.
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }))
    inner.rotation.x = -Math.PI / 2
    this.bottom.add(inner)
    this.chest.add(this.top, this.bottom)
    this.scene.add(this.chest)
    const gc = document.createElement('canvas')
    gc.width = gc.height = 128
    const g = gc.getContext('2d')!
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.glow.scale.setScalar(3.4)
    this.glow.position.z = -0.5
    this.scene.add(this.glow)
    const n = 160
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) this.sparkVel.push(new THREE.Vector3())
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.sparks.visible = false
    this.scene.add(this.sparks)
    this.camera.position.set(0, 0.9, 5.2)
    this.camera.lookAt(0, 0, 0)
  }

  private setTier(tier: Tier | undefined) {
    const c = new THREE.Color(tier ? TIER_INFO[tier].color : '#555c63')
    this.shellMat.color.copy(c)
    this.shellMat.metalness = tier === 'platinum' ? 1 : 0.9
    this.bandMat.emissive.copy(c).lerp(new THREE.Color(0xffffff), 0.35)
    ;(this.glow.material as THREE.SpriteMaterial).color.copy(c)
    this.chest.visible = !!tier
    this.glow.visible = !!tier
  }

  private render() {
    const chests = this.progress.chests
    const row = this.root.querySelector('#chestRow')!
    row.innerHTML = chests.length
      ? chests.map((t, i) => `<button class="chest-pill ${i === this.selected ? 'on' : ''}" data-i="${i}" style="--c:${TIER_INFO[t].color}"><i></i>${TIER_INFO[t].name}</button>`).join('')
      : '<div class="chest-empty">No chest balls yet. Go hit some shots!</div>'
    const tier = chests[this.selected]
    this.setTier(tier)
    this.top.position.set(0, 0, 0)
    this.top.rotation.set(0, 0, 0)
    ;(this.root.querySelector('#chestLabel') as HTMLElement).textContent = tier ? `${TIER_INFO[tier].name} · ${TIER_INFO[tier].cards} cards` : ''
    const btn = this.root.querySelector<HTMLButtonElement>('#chestOpen')!
    btn.textContent = 'Open'
    btn.disabled = !tier
    ;(this.root.querySelector('#chestCards') as HTMLElement).innerHTML = ''
  }

  private primary() {
    if (this.phase === 'idle') {
      if (!this.progress.chests[this.selected]) return
      this.phase = 'shaking'
      this.t0 = performance.now()
      this.root.querySelector<HTMLButtonElement>('#chestOpen')!.disabled = true
    } else if (this.phase === 'cards') {
      if (this.shown < this.rewards.length) this.nextCard()
      else {
        this.phase = 'idle'
        this.render()
      }
    }
  }

  // Time-based opening animation.
  private animate() {
    const now = performance.now()
    const t = (now - this.t0) / 1000
    this.chest.rotation.y += 0.01
    if (this.phase === 'idle') {
      this.chest.position.y = Math.sin(now / 600) * 0.06
      this.chest.rotation.z = 0
    } else if (this.phase === 'shaking') {
      const k = Math.min(1, t / 1.1)
      this.chest.rotation.z = Math.sin(t * 42) * 0.12 * k
      this.chest.position.y = Math.abs(Math.sin(t * 20)) * 0.06 * k
      this.bandMat.emissiveIntensity = 1.5 + k * 4
      if (t > 1.1) this.burst()
    } else if (this.phase === 'burst' || this.phase === 'cards') {
      const k = Math.min(1, (now - this.t0) / 700)
      this.top.position.y = k * 1.6
      this.top.rotation.x = -k * 1.1
      this.chest.rotation.z *= 0.9
      const p = this.sparks.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const v = this.sparkVel[i]
        v.y -= 0.004
        p.setXYZ(i, p.getX(i) + v.x, p.getY(i) + v.y, p.getZ(i) + v.z)
      }
      p.needsUpdate = true
      ;(this.sparks.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - (now - this.t0) / 1600)
      if (this.phase === 'burst' && now - this.t0 > 650) this.showCards()
    }
  }

  private burst() {
    this.phase = 'burst'
    this.t0 = performance.now()
    const flash = this.root.querySelector<HTMLElement>('#chestFlash')!
    flash.classList.remove('go')
    void flash.offsetWidth
    flash.classList.add('go')
    const p = this.sparks.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, 0, 0.1, 0)
      const a = Math.random() * Math.PI * 2
      const up = 0.05 + Math.random() * 0.09
      const out = 0.02 + Math.random() * 0.05
      this.sparkVel[i].set(Math.cos(a) * out, up, Math.sin(a) * out)
    }
    ;(this.sparks.material as THREE.PointsMaterial).color.set(TIER_INFO[this.progress.chests[this.selected]].color)
    this.sparks.visible = true
    this.rewards = this.progress.open(this.selected)
    this.shown = 0
    navigator.vibrate?.([30, 40, 80])
    this.onChange()
  }

  private showCards() {
    this.phase = 'cards'
    this.nextCard()
  }

  private nextCard() {
    if (this.phase !== 'cards' || this.shown >= this.rewards.length) return
    const r = this.rewards[this.shown++]
    const item = ALL_ITEMS.find((i) => i.id === r.id)!
    const rar = rarityOf(r.id)
    const lvl = this.progress.level(r.id)
    const have = this.progress.cards[r.id] ?? 0
    const nextNeed = lvl < MAX_LEVEL ? LEVEL_CARDS[lvl] : null
    const tag = r.isNew ? '<em class="new">NEW!</em>' : r.levelUp ? `<em class="up">LEVEL UP · Lv ${lvl}</em>` : `<em>+1 card · ${nextNeed ? `${have}/${nextNeed}` : 'MAX'}</em>`
    const cards = this.root.querySelector('#chestCards')!
    cards.querySelectorAll('.reward').forEach((el) => el.classList.add('past'))
    const el = document.createElement('div')
    el.className = 'reward'
    el.style.setProperty('--c', RARITY_COLOR[rar])
    el.innerHTML = `<div class="rar">${RARITY_LABEL[rar]}</div><svg viewBox="0 0 40 40">${KIND_ICON[item.kind]}</svg><b>${item.name}</b><span>${item.kind === 'ball' ? 'Golf ball' : item.kind === 'woods' ? 'Fairway woods' : item.kind[0].toUpperCase() + item.kind.slice(1)}</span>${tag}`
    cards.appendChild(el)
    const btn = this.root.querySelector<HTMLButtonElement>('#chestOpen')!
    btn.disabled = false
    btn.textContent = this.shown < this.rewards.length ? `Next card (${this.rewards.length - this.shown} left)` : 'Collect'
    this.onChange()
  }
}
