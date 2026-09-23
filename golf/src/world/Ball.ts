import * as THREE from 'three'
import { BALL } from '../physics/flight'
import type { Lie } from '../physics/lies'

const TEE_HEIGHT = 0.03 // ball bottom above ground on a driver tee

function radialTex(inner: string, outer: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, inner)
  gr.addColorStop(1, outer)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
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

  constructor(scene: THREE.Scene) {
    const tex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const g = c.getContext('2d')!
      g.fillStyle = '#fafafa'
      g.fillRect(0, 0, 128, 128)
      g.fillStyle = 'rgba(0,0,0,0.06)'
      for (let y = 4; y < 128; y += 8) {
        for (let x = (y / 8) % 2 ? 0 : 4; x < 128; x += 8) {
          g.beginPath()
          g.arc(x, y, 2.4, 0, 7)
          g.fill()
        }
      }
      g.fillStyle = '#222'
      g.fillRect(40, 60, 48, 8) // a logo line so you can see it spin
      return new THREE.CanvasTexture(c)
    })()
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.25 }))
    scene.add(this.mesh)

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    scene.add(this.shadow)

    this.tee = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0025, 0.055, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }))
    scene.add(this.patch)
    scene.add(this.tee)
  }

  // Height of the ball's centre above the ground for a lie.
  static restY(lie: Lie) {
    if (lie.id === 'tee') return TEE_HEIGHT + BALL.radius
    return BALL.radius * (1 - 1.25 * lie.ballSink)
  }

  setLie(lie: Lie, at: THREE.Vector3) {
    this.lie = lie
    this.patch.clear()
    this.patch.position.set(at.x, 0, at.z)
    const disc = (r: number, color: number, y = 0.012, tex?: THREE.Texture) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshLambertMaterial({ color, map: tex ?? null }))
      m.rotation.x = -Math.PI / 2
      m.position.y = y
      this.patch.add(m)
      return m
    }
    this.tee.visible = lie.id === 'tee'
    this.tee.position.set(at.x, TEE_HEIGHT - 0.0275 + 0.003, at.z)
    switch (lie.id) {
      case 'rough': {
        disc(1.2, 0x2f5a1d)
        // A clump of long grass the ball is nestled into.
        const n = 900
        const blade = new THREE.ConeGeometry(0.0035, 1, 3)
        blade.translate(0, 0.5, 0)
        const im = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ color: 0xffffff }), n)
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
    this.shadow.visible = !this.lie || this.lie.ballSink < 0.4 || h > 0.1
  }
}
