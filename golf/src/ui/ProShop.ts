import * as THREE from 'three'
import { BALLS, CLUB_LINES, SLOTS, ballById, lineById, type Loadout, type Slot, type Stats } from '../physics/equipment'
import { clubById, type Club } from '../physics/clubs'
import { buildClubModel } from '../world/ClubModel'
import { ballTexture } from '../world/Ball'

type Tab = Slot | 'ball'

// Product-photography studio: charcoal sweep with softbox strips, so chrome
// reads as chrome (dark with crisp highlights) rather than a white blob.
function studio() {
  const s = new THREE.Scene()
  const sweep = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ vec3 c = mix(vec3(0.03, 0.035, 0.04), vec3(0.16, 0.18, 0.2), smoothstep(-0.3, 0.8, vP.y)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  )
  s.add(sweep)
  const box = (w: number, h: number, pos: [number, number, number], k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }))
    m.position.set(...pos)
    m.lookAt(0, 0, 0)
    s.add(m)
  }
  box(7, 0.8, [0, 7, -2], 1.8) // overhead strip
  box(1.2, 6, [-7, 1, -4], 1.4) // key softbox
  box(1.2, 6, [7, 1, 3], 0.9) // rim
  box(4, 0.5, [2, -1, -7], 0.5) // low kicker from the front
  return s
}

// The club each slot is previewed with.
const PREVIEW_CLUB: Record<Slot, string> = { driver: 'dr', woods: '3w', irons: '7i', wedges: 'sw', putter: 'pt' }

const STAT_LABELS: [keyof Stats, string][] = [
  ['distance', 'Distance'],
  ['spin', 'Spin'],
  ['forgiveness', 'Forgiveness'],
  ['control', 'Control'],
  ['feel', 'Feel'],
]

// Equipment picker with a live studio render of the selected head or ball.
export class ProShop {
  private root: HTMLElement
  private tab: Tab = 'driver'
  private loadout!: Loadout
  private onEquip: (tab: Tab, id: string) => void
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.01, 10)
  private turntable = new THREE.Group()
  private raf = 0
  private previewId = ''
  frozen = false // hold the turntable still (tests)

  constructor(root: HTMLElement, onEquip: (tab: Tab, id: string) => void) {
    this.root = root
    this.onEquip = onEquip
    root.innerHTML = `
      <div class="title">Pro Shop <button class="x" id="shopClose">✕</button></div>
      <div class="shop-tabs" id="shopTabs">${[...SLOTS.map((s) => `<button data-tab="${s.slot}">${s.label}</button>`), '<button data-tab="ball">Ball</button>'].join('')}</div>
      <div class="shop-preview"><canvas id="shopCanvas"></canvas><div class="shop-caption" id="shopCaption"></div></div>
      <div class="shop-list" id="shopList"></div>`
    root.querySelector('#shopClose')!.addEventListener('click', () => this.close())
    root.querySelector('#shopTabs')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).dataset.tab as Tab | undefined
      if (t) {
        this.tab = t
        this.render()
      }
    })
    root.querySelector('#shopList')!.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
      if (!card) return
      const id = card.dataset.id!
      if (card.dataset.equip) {
        this.onEquip(this.tab, id)
        this.loadout = { ...this.loadout, [this.tab]: id }
      }
      this.showPreview(id)
      this.render(id)
    })
    this.scene.add(this.turntable)
  }

  get isOpen() {
    return !this.root.classList.contains('hidden')
  }

  open(loadout: Loadout, tab?: Tab) {
    this.loadout = loadout
    if (tab) this.tab = tab
    this.root.classList.remove('hidden')
    this.ensureRenderer()
    this.render()
    const loop = () => {
      if (!this.frozen) this.turntable.rotation.y += 0.008
      this.renderer?.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    cancelAnimationFrame(this.raf)
    loop()
  }

  close() {
    this.root.classList.add('hidden')
    cancelAnimationFrame(this.raf)
  }

  private ensureRenderer() {
    if (this.renderer) return
    const canvas = this.root.querySelector<HTMLCanvasElement>('#shopCanvas')!
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.85
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pm.fromScene(studio(), 0.02).texture
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(1, 2, -1.5)
    this.scene.add(key)
  }

  private sizeRenderer() {
    const canvas = this.renderer!.domElement
    const w = canvas.clientWidth || 360
    const h = canvas.clientHeight || 190
    this.renderer!.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private showPreview(id: string) {
    if (this.previewId === `${this.tab}:${id}`) return
    this.previewId = `${this.tab}:${id}`
    this.turntable.clear()
    this.sizeRenderer()
    if (this.tab === 'ball') {
      const b = ballById(id)
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.021, 64, 48),
        new THREE.MeshPhysicalMaterial({ map: ballTexture(b), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 }),
      )
      this.turntable.add(ball)
      this.camera.position.set(0, 0.012, -0.1)
      this.camera.lookAt(0, 0, 0)
      ;(this.root.querySelector('#shopCaption') as HTMLElement).textContent = `${b.brand} ${b.model}`
      return
    }
    const line = lineById(id)!
    const club: Club = clubById(PREVIEW_CLUB[this.tab])
    const built = buildClubModel(club, line, false)
    // Spin around the centre of the head.
    const box = new THREE.Box3().setFromObject(built.head)
    const c = box.getCenter(new THREE.Vector3())
    built.root.position.sub(c)
    this.turntable.add(built.root)
    const size = box.getSize(new THREE.Vector3()).length()
    this.camera.position.set(size * 0.5, size * 0.55, -size * 1.9)
    this.camera.lookAt(0, 0, 0)
    ;(this.root.querySelector('#shopCaption') as HTMLElement).textContent = `${line.brand} ${line.model} · shown as ${club.name}`
  }

  private bars(s: Stats) {
    return STAT_LABELS.filter(([k]) => s[k] !== undefined)
      .map(([k, label]) => `<div class="stat"><span>${label}</span><i><b style="width:${(s[k]! / 10) * 100}%"></b></i></div>`)
      .join('')
  }

  private render(previewId?: string) {
    this.root.querySelectorAll<HTMLButtonElement>('#shopTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab))
    const equipped = this.loadout[this.tab]
    const items =
      this.tab === 'ball'
        ? BALLS.map((b) => ({ id: b.id, name: `${b.brand} ${b.model}`, tag: b.tagline, stats: b.stats }))
        : CLUB_LINES.filter((l) => l.slot === this.tab).map((l) => ({ id: l.id, name: `${l.brand} ${l.model}`, tag: l.tagline, stats: l.stats }))
    const list = this.root.querySelector('#shopList')!
    list.innerHTML = items
      .map(
        (it) => `<div class="shop-card ${it.id === equipped ? 'equipped' : ''} ${it.id === (previewId ?? equipped) ? 'viewing' : ''}" data-id="${it.id}">
          <div class="sc-head"><b>${it.name}</b>${it.id === equipped ? '<em>In the bag</em>' : `<button data-id="${it.id}" data-equip="1">Equip</button>`}</div>
          <div class="sc-tag">${it.tag}</div>
          <div class="sc-stats">${this.bars(it.stats)}</div>
        </div>`,
      )
      .join('')
    this.showPreview(previewId ?? equipped)
  }
}
