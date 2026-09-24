import * as THREE from 'three'
import { BALL } from '../physics/flight'
import type { Lie } from '../physics/lies'

const TEE_HEIGHT = 0.03 // ball bottom above ground on a driver tee

function radialTex(inner: string, outer: string, hold = 0) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, inner)
  if (hold) gr.addColorStop(hold, inner)
  gr.addColorStop(1, outer)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// Dimples as a normal map: a hex grid of shallow cups.
export function dimpleNormal() {
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  const cell = 16
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const row = Math.floor(y / (cell * 0.866))
      const ox = row % 2 ? cell / 2 : 0
      const cx = Math.round((x - ox) / cell) * cell + ox
      const cy = (Math.round(y / (cell * 0.866)) * cell * 0.866)
      let dx = (x - cx) / (cell * 0.45)
      let dy = (y - cy) / (cell * 0.45)
      const r = Math.hypot(dx, dy)
      if (r > 1) dx = dy = 0
      const i = (y * n + x) * 4
      img.data[i] = 128 - dx * 70
      img.data[i + 1] = 128 - dy * 70
      img.data[i + 2] = 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1)
  return t
}

// Cover print: brand logo, side stamp and alignment line, so you can see it spin.
export function ballTexture(b: { color: number; logo: string; logoColor: string }) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = `#${b.color.toString(16).padStart(6, '0')}`
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = b.logoColor
  g.font = 'italic 800 34px "Barlow Condensed", system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText(b.logo, 256, 140)
  g.fillRect(200, 150, 112, 3)
  g.font = '600 16px "Barlow", system-ui, sans-serif'
  g.fillStyle = 'rgba(20,20,20,0.7)'
  g.fillText('1', 384, 132)
  // Alignment line on the opposite side.
  g.fillStyle = b.logoColor
  g.fillRect(40, 126, 90, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// The ball plus the little patch of world it's sitting in. The patch is what
// makes the lie readable before you swing.
export class Ball {
  mesh: THREE.Mesh
  shadow: THREE.Mesh
  patch = new THREE.Group()
  tee: THREE.Mesh
  private lie!: Lie
  private spinAxis = new THREE.Vector3(1, 0, 0)
  private spinRate = 0
  private useBlob: boolean

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.useBlob = !shadows
    // Dimples as a normal map: a hex grid of shallow cups.
    const normal = dimpleNormal()
    const tex = ballTexture({ color: 0xf7f7f5, logo: 'PURE', logoColor: '#1b1b1b' })
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 48, 32),
      new THREE.MeshPhysicalMaterial({ map: tex, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0xffffff, emissiveIntensity: 0.06 }),
    )
    this.mesh.castShadow = shadows
    scene.add(this.mesh)

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    scene.add(this.shadow)

    this.tee = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0022, 0.055, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }))
    scene.add(this.patch)
    scene.add(this.tee)
  }

  // Height of the ball's centre above the ground for a lie.
  static restY(lie: Lie) {
    if (lie.id === 'tee') return TEE_HEIGHT + BALL.radius
    return BALL.radius * (1 - 1.25 * lie.ballSink)
  }

  setModel(b: { color: number; logo: string; logoColor: string }) {
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial
    mat.map?.dispose()
    mat.map = ballTexture(b)
    mat.needsUpdate = true
  }

  setLie(lie: Lie, at: THREE.Vector3) {
    this.lie = lie
    this.patch.clear()
    this.patch.position.set(at.x, at.y, at.z)
    // Soft-edged decals so the lie blends into the painted terrain.
    const fade = radialTex('#ffffff', '#000000', 0.55)
    const disc = (r: number, color: number, y = 0.012, tex?: THREE.Texture) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 40),
        new THREE.MeshStandardMaterial({ color, map: tex ?? null, alphaMap: fade, transparent: true, depthWrite: false, roughness: 0.95 }),
      )
      m.receiveShadow = true
      m.rotation.x = -Math.PI / 2
      m.position.y = y
      this.patch.add(m)
      return m
    }
    this.tee.visible = lie.id === 'tee'
    this.tee.position.set(at.x, at.y + TEE_HEIGHT - 0.0275 + 0.003, at.z)
    switch (lie.id) {
      case 'rough': {
        disc(1.2, 0x2f5a1d)
        // A clump of long grass the ball is nestled into.
        const n = 900
        const blade = new THREE.ConeGeometry(0.0035, 1, 3)
        blade.translate(0, 0.5, 0)
        const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), n)
        const d = new THREE.Object3D()
        const c = new THREE.Color()
        for (let i = 0; i < n; i++) {
          const r = Math.sqrt(Math.random()) * 0.55
          const a = Math.random() * Math.PI * 2
          d.position.set(Math.cos(a) * r, 0.012, Math.sin(a) * r)
          d.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6, (Math.random() - 0.5) * 0.7)
          d.scale.set(1, 0.05 + Math.random() * 0.06, 1)
          d.updateMatrix()
          im.setMatrixAt(i, d.matrix)
          c.setHSL(0.26 + Math.random() * 0.05, 0.5, 0.2 + Math.random() * 0.15)
          im.setColorAt(i, c)
        }
        this.patch.add(im)
        break
      }
      case 'sand': {
        const t = radialTex('#e6d5a6', '#d3be86')
        disc(1.6, 0xffffff, 0.012, t)
        disc(1.9, 0x3d6a24, 0.01)
        // A little crater the ball has settled into.
        const ring = new THREE.Mesh(new THREE.RingGeometry(BALL.radius * 0.9, BALL.radius * 1.6, 24), new THREE.MeshLambertMaterial({ color: 0xbfa872 }))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.014
        this.patch.add(ring)
        break
      }
      case 'hardpan': {
        const t = (() => {
          const c = document.createElement('canvas')
          c.width = c.height = 128
          const g = c.getContext('2d')!
          g.fillStyle = '#8a6f4b'
          g.fillRect(0, 0, 128, 128)
          g.strokeStyle = 'rgba(60,40,25,0.6)'
          for (let i = 0; i < 26; i++) {
            g.beginPath()
            let x = Math.random() * 128
            let y = Math.random() * 128
            g.moveTo(x, y)
            for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 30), (y += (Math.random() - 0.5) * 30))
            g.stroke()
          }
          return new THREE.CanvasTexture(c)
        })()
        disc(1.1, 0xffffff, 0.012, t)
        break
      }
      case 'fairway':
        disc(0.9, 0x5f9f3c, 0.006)
        break
      case 'tee':
        break
    }
  }

  place(p: THREE.Vector3) {
    this.mesh.position.copy(p)
    this.spinRate = 0
  }

  setSpin(rpm: number, axis?: THREE.Vector3) {
    this.spinRate = (rpm * 2 * Math.PI) / 60
    if (axis) this.spinAxis.copy(axis).normalize()
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewH: number, groundY = 0) {
    this.mesh.castShadow = this.mesh.scale.x < 3
    // Cosmetic spin, capped so it reads as spin instead of strobing.
    this.mesh.rotateOnWorldAxis(this.spinAxis, Math.min(this.spinRate, 60) * dt)
    // Keep the ball visible at distance, like every broadcast tracer does.
    const d = camera.position.distanceTo(this.mesh.position)
    // Never smaller than ~3.5px on screen, like a broadcast ball.
    const radPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / viewH
    const k = Math.max(1, (d * radPerPx * 3.5) / BALL.radius)
    this.mesh.scale.setScalar(k)
    const h = this.mesh.position.y - groundY
    const s = BALL.radius * 3 * k * (1 + h * 0.05)
    this.shadow.scale.set(s, s, 1)
    this.shadow.position.set(this.mesh.position.x, groundY + 0.015, this.mesh.position.z)
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - h / 25)
    this.shadow.visible = this.useBlob && (!this.lie || this.lie.ballSink < 0.4 || h > 0.1)
  }
}
