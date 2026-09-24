import * as THREE from 'three'
import { windAt, type Wind } from '../physics/flight'

interface Particle {
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  max: number
  size: number
  spin: THREE.Vector3
  rot: THREE.Euler
  drag: number
  color: THREE.Color
}

// Turf, sand and dust thrown up at impact.
export class Debris {
  ground: (x: number, z: number) => number = () => 0
  private mesh: THREE.InstancedMesh
  private parts: Particle[] = []
  private cap = 700
  private d = new THREE.Object3D()

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.cap)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  spray(at: THREE.Vector3, dir: THREE.Vector3, o: { count: number; colors: number[]; speed: number; spread: number; up: number; size: number; drag?: number }) {
    for (let i = 0; i < o.count; i++) {
      if (this.parts.length >= this.cap) this.parts.shift()
      const v = dir
        .clone()
        .multiplyScalar(o.speed * (0.4 + Math.random() * 0.8))
        .add(new THREE.Vector3((Math.random() - 0.5) * o.spread, o.up * (0.3 + Math.random()), (Math.random() - 0.5) * o.spread))
      const max = 0.8 + Math.random() * 1.2
      this.parts.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.01, (Math.random() - 0.5) * 0.06)),
        v,
        life: max,
        max,
        size: o.size * (0.4 + Math.random()),
        spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        drag: o.drag ?? 1.5,
        color: new THREE.Color(o.colors[Math.floor(Math.random() * o.colors.length)]),
      })
    }
  }

  update(dt: number) {
    for (const q of this.parts) q.life -= dt
    this.parts = this.parts.filter((q) => q.life > 0)
    for (let i = 0; i < this.parts.length; i++) {
      const q = this.parts[i]
      q.v.y -= 9.81 * dt
      q.v.multiplyScalar(Math.exp(-q.drag * dt))
      q.p.addScaledVector(q.v, dt)
      const gy = this.ground(q.p.x, q.p.z) + 0.005
      if (q.p.y < gy) {
        q.p.y = gy
        q.v.set(0, 0, 0)
        q.spin.set(0, 0, 0)
      }
      q.rot.x += q.spin.x * dt
      q.rot.y += q.spin.y * dt
      this.d.position.copy(q.p)
      this.d.rotation.copy(q.rot)
      this.d.scale.setScalar(q.size * Math.min(1, (q.life / q.max) * 3))
      this.d.updateMatrix()
      this.mesh.setMatrixAt(i, this.d.matrix)
      this.mesh.setColorAt(i, q.color)
    }
    this.mesh.count = this.parts.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

// Broadcast-style shot tracer: a camera-facing ribbon of constant screen width.
export class Tracer {
  mesh: THREE.Mesh
  private pts: THREE.Vector3[] = []
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private alpha: Float32Array
  private max = 2400

  constructor(scene: THREE.Scene, color = 0xfff27a) {
    this.pos = new Float32Array(this.max * 2 * 3)
    this.alpha = new Float32Array(this.max * 2)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1))
    const idx: number[] = []
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo.setIndex(idx)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, vA * opacity); }`,
    })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  set opacity(v: number) {
    ;(this.mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = v
  }

  set color(c: number) {
    ;(this.mesh.material as THREE.ShaderMaterial).uniforms.color.value.setHex(c)
  }

  reset() {
    this.pts = []
    this.geo.setDrawRange(0, 0)
  }

  push(p: THREE.Vector3) {
    const last = this.pts[this.pts.length - 1]
    if (last && last.distanceToSquared(p) < 0.04) return
    if (this.pts.length < this.max) this.pts.push(p.clone())
  }

  update(camera: THREE.Camera) {
    const n = this.pts.length
    if (n < 2) {
      this.geo.setDrawRange(0, 0)
      return
    }
    const cam = camera.position
    const tan = new THREE.Vector3()
    const view = new THREE.Vector3()
    const side = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]
      tan.subVectors(this.pts[Math.min(n - 1, i + 1)], this.pts[Math.max(0, i - 1)]).normalize()
      view.subVectors(p, cam)
      const dist = view.length()
      side.crossVectors(tan, view).normalize().multiplyScalar(Math.max(0.012, dist * 0.0022))
      this.pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6)
      const head = Math.min(1, (n - i) / 6)
      const a = 0.25 + 0.75 * (i / n)
      const near = Math.min(1, Math.max(0, (dist - 2) / 6)) // fade out right next to the lens
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a * (0.6 + 0.4 * head) * near
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.alpha.needsUpdate = true
    this.geo.setDrawRange(0, (n - 1) * 6)
  }
}

// Marks left on the ground: divots, pitch marks and where each shot finished.
export class GroundMarks {
  private group = new THREE.Group()
  private divots: THREE.Mesh[] = []
  private markers: THREE.Mesh[] = []

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  divot(at: THREE.Vector3, dir: THREE.Vector3, length: number, color = 0x6b4a2b) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, length), new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 }))
    m.rotation.x = -Math.PI / 2
    m.rotation.z = Math.atan2(dir.x, -dir.z)
    m.position.set(at.x, at.y + 0.003, at.z)
    this.group.add(m)
    this.divots.push(m)
    if (this.divots.length > 40) this.group.remove(this.divots.shift()!)
  }

  marker(at: THREE.Vector3, color: number) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }))
    m.rotation.x = -Math.PI / 2
    m.position.set(at.x, at.y - 0.012, at.z)
    this.group.add(m)
    this.markers.push(m)
    if (this.markers.length > 25) this.group.remove(this.markers.shift()!)
  }

  clearMarkers() {
    for (const m of this.markers) this.group.remove(m)
    this.markers = []
  }
}

// Seed fluff and grass bits drifting on the breeze around whatever the camera
// is looking at: the most direct way to *see* the wind.
export class WindDrift {
  private points: THREE.Points
  private vel: Float32Array
  private n = 700
  private box = new THREE.Vector3(60, 14, 60)
  center = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    const pos = new Float32Array(this.n * 3)
    this.vel = new Float32Array(this.n * 3)
    for (let i = 0; i < this.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box.x
      pos[i * 3 + 1] = Math.random() * this.box.y
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,255,245,1)')
    gr.addColorStop(1, 'rgba(255,255,245,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 32, 32)
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.85 }),
    )
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  update(dt: number, t: number, wind: Wind) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute
    const a = pos.array as Float32Array
    const bx = this.box.x / 2
    const bz = this.box.z / 2
    for (let i = 0; i < this.n; i++) {
      const k = i * 3
      const w = windAt(wind, a[k + 1] + 0.5, t)
      // Particles ride the wind with a little turbulence.
      this.vel[k] += (w.x - this.vel[k]) * dt * 1.5 + Math.sin(t * 1.7 + i) * dt * 0.6
      this.vel[k + 1] += (Math.sin(t * 0.9 + i * 1.3) * 0.25 - this.vel[k + 1]) * dt
      this.vel[k + 2] += (w.z - this.vel[k + 2]) * dt * 1.5 + Math.cos(t * 1.3 + i) * dt * 0.6
      a[k] += this.vel[k] * dt
      a[k + 1] += this.vel[k + 1] * dt
      a[k + 2] += this.vel[k + 2] * dt
      // Wrap inside a box that travels with the camera focus.
      let rx = a[k] - this.center.x
      let rz = a[k + 2] - this.center.z
      if (rx > bx) rx -= bx * 2
      if (rx < -bx) rx += bx * 2
      if (rz > bz) rz -= bz * 2
      if (rz < -bz) rz += bz * 2
      a[k] = this.center.x + rx
      a[k + 2] = this.center.z + rz
      // Keep them in a slab above the ground around the focus.
      if (a[k + 1] < this.center.y + 0.05) a[k + 1] = this.center.y + this.box.y
      if (a[k + 1] > this.center.y + this.box.y) a[k + 1] = this.center.y + 0.1
    }
    pos.needsUpdate = true
  }
}
