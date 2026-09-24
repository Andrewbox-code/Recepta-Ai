import * as THREE from 'three'
import { windAt, type Wind } from '../physics/flight'
import type { SurfaceId } from '../physics/lies'
import { Atmosphere } from './Atmosphere'
import { Terrain, disposeTree } from './Terrain'
import { Trees } from './Trees'
import { Flora } from './Flora'
import { FAIRWAY_HALF, RANGE_LAYOUT, TARGETS, YD } from './layout'
import type { Layout, Pin } from './types'

export { YD, TARGETS }

export interface Flag {
  pos: THREE.Vector3
  cloth: THREE.Mesh
  base: Float32Array
  pin: Pin
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  return t
}

// Alpha-to-coverage gives foliage clean anti-aliased edges, but only on real
// multisampling hardware (software renderers draw nothing).
function smoothEdges(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext()
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
  return (gl.getParameter(gl.SAMPLES) as number) >= 2 && !/swiftshader|llvmpipe|software/i.test(name)
}

// The world around the player: sky and sun persist, while the ground, trees,
// flags and dressing are rebuilt for whichever layout is loaded (the driving
// range or a course hole).
export class World {
  atmosphere: Atmosphere
  layout: Layout = RANGE_LAYOUT
  flags: Flag[] = []
  private group = new THREE.Group()
  private terrain: Terrain | null = null
  private trees: Trees | null = null
  private flora: Flora | null = null
  private sock!: THREE.Group
  private sockMesh!: THREE.Mesh
  private scene: THREE.Scene
  private shadows: boolean
  private smooth: boolean

  surfaceAt = (x: number, z: number): SurfaceId => this.layout.surfaceAt(x, z)
  groundY = (x: number, z: number) => this.layout.groundY(x, z)

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadows: boolean) {
    this.scene = scene
    this.shadows = shadows
    this.smooth = smoothEdges(renderer)
    this.atmosphere = new Atmosphere(scene, renderer, shadows)
    this.load(RANGE_LAYOUT)
  }

  load(layout: Layout) {
    this.terrain?.dispose()
    if (this.trees) disposeTree(this.trees.group)
    if (this.flora) disposeTree(this.flora.group)
    disposeTree(this.group)
    this.group = new THREE.Group()
    this.scene.add(this.group)
    this.flags = []
    this.layout = layout
    const shadows = this.shadows
    this.terrain = new Terrain(this.scene, this.atmosphere.sunDir, layout)
    this.trees = new Trees(this.scene, shadows, this.smooth, layout)
    this.flora = new Flora(this.scene, shadows, layout)
    for (const p of layout.pins) {
      this.addFlag(p, shadows)
      if (p.kind === 'target') {
        const sign = this.sign(p.label ?? '', p.color)
        sign.position.set(p.x - p.r - 3.5, layout.heightAt(p.x - p.r - 3.5, p.z) + 1.6, p.z)
        sign.scale.set(3.6, 1.8, 1)
        this.group.add(sign)
      }
    }
    if (layout.kind === 'range') {
      for (let yd = 50; yd <= 300; yd += 50) {
        for (const side of [-1, 1]) {
          const x = side * (FAIRWAY_HALF + 6)
          const z = -yd * YD
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }))
          post.position.set(x, layout.heightAt(x, z) + 0.45, z)
          post.castShadow = shadows
          this.group.add(post)
          const s = this.sign(`${yd}`, '#ffffff')
          s.position.set(x, layout.heightAt(x, z) + 1.3, z)
          s.scale.set(1.8, 0.9, 1)
          this.group.add(s)
        }
      }
      this.buildTeeArea(shadows)
    } else {
      this.buildTeeMarkers(shadows, layout)
    }
    this.buildWindsock(shadows, layout)
  }

  private buildTeeMarkers(shadows: boolean, layout: Layout) {
    for (const x of [-3.5, 3.5]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.25, metalness: 0.2 }))
      m.position.set(x, layout.heightAt(x, -1.5) + 0.07, -1.5)
      m.castShadow = shadows
      this.group.add(m)
    }
  }

  private addFlag(pin: Pin, shadows: boolean) {
    const color = pin.color
    const pos = new THREE.Vector3(pin.x, this.layout.heightAt(pin.x, pin.z), pin.z)
    // Fibreglass pin with yellow/white bands.
    const pinTex = canvasTex(8, 64, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#f4f4f0' : '#f2c200'
        g.fillRect(0, i * 8, 8, 8)
      }
    })
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 2.3, 8), new THREE.MeshStandardMaterial({ map: pinTex, roughness: 0.35 }))
    pole.position.set(pos.x, pos.y + 1.15, pos.z)
    pole.castShadow = shadows
    this.group.add(pole)
    const cup = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.054, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }))
    cup.rotation.x = -Math.PI / 2
    cup.position.set(pos.x, pos.y + 0.006, pos.z)
    this.group.add(cup)
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }))
    hole.rotation.x = -Math.PI / 2
    hole.position.set(pos.x, pos.y + 0.007, pos.z)
    this.group.add(hole)
    const geo = new THREE.PlaneGeometry(0.6, 0.4, 12, 5)
    geo.translate(0.3, 0, 0)
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }))
    cloth.position.set(pos.x, pos.y + 2.08, pos.z)
    cloth.castShadow = shadows
    this.group.add(cloth)
    this.flags.push({ pos, cloth, base: Float32Array.from(geo.attributes.position.array as Float32Array), pin })
  }

  // Clean broadcast-style yardage board.
  private sign(text: string, accent: string) {
    const tex = canvasTex(256, 128, (g) => {
      g.fillStyle = 'rgba(12,18,14,0.78)'
      g.beginPath()
      g.roundRect(4, 4, 248, 120, 14)
      g.fill()
      g.fillStyle = accent
      g.fillRect(24, 100, 208, 5)
      g.fillStyle = '#fff'
      g.font = '600 64px "Inter", system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, 128, 56)
    })
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: true }))
  }

  private buildTeeArea(shadows: boolean) {
    // Tee markers: polished spheres on the box.
    for (const x of [-4.5, 4.5]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshStandardMaterial({ color: 0x1a4f9c, roughness: 0.25, metalness: 0.2 }))
      m.position.set(x, 0.07, -1.5)
      m.castShadow = shadows
      this.group.add(m)
    }
    // A bench and ball bucket give the tee some scale.
    const wood = new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 0.8 })
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.4, metalness: 0.8 })
    const bench = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.12), wood)
      slat.position.set(0, 0.45, i * 0.14)
      bench.add(slat)
    }
    for (const x of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal)
      leg.position.set(x, 0.225, 0.14)
      bench.add(leg)
    }
    bench.position.set(6.5, 0, 3)
    bench.rotation.y = -0.4
    bench.traverse((o) => (o.castShadow = shadows))
    this.group.add(bench)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.28, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f5f3a, roughness: 0.5, side: THREE.DoubleSide }))
    bucket.position.set(1.6, 0.14, 1.2)
    bucket.castShadow = shadows
    this.group.add(bucket)
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0213, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35 }), 30)
    const d = new THREE.Object3D()
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 0.13
      d.position.set(1.6 + Math.cos(a) * r, 0.2 + Math.random() * 0.07, 1.2 + Math.sin(a) * r)
      d.updateMatrix()
      balls.setMatrixAt(i, d.matrix)
    }
    this.group.add(balls)
  }

  private buildWindsock(shadows: boolean, layout: Layout) {
    const g = new THREE.Group()
    g.position.set(-8, layout.heightAt(-8, -1), -1)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 4.2, 10), new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.3, metalness: 0.7 }))
    pole.position.y = 2.1
    pole.castShadow = shadows
    g.add(pole)
    const sockGeo = new THREE.CylinderGeometry(0.24, 0.1, 1.6, 16, 5, true)
    sockGeo.rotateX(Math.PI / 2)
    sockGeo.translate(0, 0, -0.8)
    const cols: number[] = []
    const pos = sockGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const white = Math.floor((-pos.getZ(i) / 1.6) * 4.999) % 2 === 1
      cols.push(1, white ? 1 : 0.35, white ? 1 : 0.04)
    }
    sockGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    this.sockMesh = new THREE.Mesh(sockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }))
    this.sockMesh.castShadow = shadows
    const pivot = new THREE.Group()
    pivot.position.y = 4.1
    pivot.add(this.sockMesh)
    g.add(pivot)
    this.sock = pivot
    this.group.add(g)
  }

  update(t: number, wind: Wind) {
    for (const f of this.flags) {
      const w = windAt(wind, 2, t + f.pos.z * 0.01)
      const s = Math.hypot(w.x, w.z)
      if (s > 0.2) f.cloth.rotation.y = Math.atan2(-w.z, w.x)
      const pos = f.cloth.geometry.attributes.position as THREE.BufferAttribute
      const lift = Math.min(1, s / 9)
      for (let i = 0; i < pos.count; i++) {
        const bx = f.base[i * 3]
        const by = f.base[i * 3 + 1]
        const k = bx / 0.6
        const droop = (1 - lift) * k * 0.95
        const wave = Math.sin(t * (5 + s * 0.9) - bx * 10) * k * (0.03 + 0.07 * lift)
        pos.setXYZ(i, bx * Math.cos(droop), by - bx * Math.sin(droop) - (1 - lift) * 0.04 * k, wave)
      }
      pos.needsUpdate = true
      f.cloth.geometry.computeVertexNormals()
    }
    const w = windAt(wind, 4, t)
    const s = Math.hypot(w.x, w.z)
    const fill = Math.min(1, s / 8)
    this.sock.rotation.order = 'YXZ'
    if (s > 0.15) this.sock.rotation.y = Math.atan2(-w.x, -w.z)
    this.sock.rotation.x = -(1 - fill) * 1.25 + Math.sin(t * 3.1) * 0.03 * (1 - fill * 0.5)
    this.sockMesh.rotation.z = Math.sin(t * 7) * 0.05 * fill
    this.trees?.update(t, wind)
    this.terrain?.update(t)
  }
}
