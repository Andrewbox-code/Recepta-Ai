import * as THREE from 'three'
import type { SurfaceId } from '../physics/lies'
import { windAt, type Wind } from '../physics/flight'

export const YD = 0.9144

interface Target {
  yd: number
  x: number
  r: number
  color: string
  bunkers: { dx: number; dz: number; r: number }[]
}

export const TARGETS: Target[] = [
  { yd: 60, x: -7, r: 8, color: '#ff4d4d', bunkers: [{ dx: 9, dz: 2, r: 3.2 }] },
  { yd: 100, x: 11, r: 10, color: '#ffd23f', bunkers: [{ dx: -10, dz: 5, r: 4 }] },
  { yd: 145, x: -13, r: 12, color: '#4dabff', bunkers: [{ dx: 0, dz: 13, r: 4.5 }, { dx: 13, dz: 2, r: 4 }] },
  { yd: 185, x: 7, r: 14, color: '#ffffff', bunkers: [{ dx: -14, dz: 6, r: 5 }, { dx: 13, dz: -6, r: 4.5 }] },
  { yd: 235, x: -6, r: 17, color: '#ff8c1a', bunkers: [{ dx: 16, dz: 12, r: 6 }] },
  { yd: 285, x: 9, r: 20, color: '#b36bff', bunkers: [{ dx: -20, dz: 0, r: 6 }, { dx: 5, dz: 22, r: 5 }] },
]

const FAIRWAY_HALF = 38
const RANGE_LEN = 360

export interface Flag {
  pos: THREE.Vector3
  cloth: THREE.Mesh
  base: Float32Array
  target: Target
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length]
    g.fillRect(Math.random() * w, Math.random() * h, size, size * (1 + Math.random() * 2))
  }
}

export class Range {
  group = new THREE.Group()
  flags: Flag[] = []
  private trees!: THREE.InstancedMesh
  private trunks!: THREE.InstancedMesh
  private treeData: { x: number; z: number; s: number; phase: number }[] = []
  private sock!: THREE.Group
  private sockMesh!: THREE.Mesh
  private dummy = new THREE.Object3D()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
    this.buildSky(scene)
    this.buildGround()
    this.buildTargets()
    this.buildTrees()
    this.buildMarkers()
    this.buildWindsock()
  }

  surfaceAt = (x: number, z: number): SurfaceId => {
    for (const t of TARGETS) {
      const cz = -t.yd * YD
      for (const b of t.bunkers) {
        if (Math.hypot(x - (t.x + b.dx), z - (cz + b.dz)) < b.r) return 'sand'
      }
      const d = Math.hypot(x - t.x, z - cz)
      if (d < t.r) return 'green'
      if (d < t.r + 1.5) return 'fringe'
    }
    if (Math.abs(x) > FAIRWAY_HALF || z < -RANGE_LEN || z > 12) return 'rough'
    return 'fairway'
  }

  private buildSky(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1800, 32, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = max(vP.y, 0.0);
          vec3 top = vec3(0.22,0.47,0.82);
          vec3 hor = vec3(0.78,0.87,0.95);
          vec3 c = mix(hor, top, pow(h, 0.55));
          vec3 sunDir = normalize(vec3(-0.4,0.55,-0.7));
          float s = max(dot(vP, sunDir), 0.0);
          c += vec3(1.0,0.9,0.7) * (pow(s, 400.0) * 1.2 + pow(s, 8.0) * 0.18);
          if (vP.y < 0.0) c = hor * 0.9;
          gl_FragColor = vec4(c,1.0);
        }`,
    })
    scene.add(new THREE.Mesh(geo, mat))
    scene.fog = new THREE.Fog(0xc8dbe8, 250, 1300)
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x4a6b2a, 1.1)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1)
    sun.position.set(-40, 60, -70)
    scene.add(sun)
  }

  private buildGround() {
    const roughTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#3f6e27'
      g.fillRect(0, 0, 256, 256)
      speckle(g, 256, 256, 3500, ['#36611f', '#4a7d2e', '#3a6823', '#51853a'], 2)
    })
    roughTex.repeat.set(160, 160)
    const rough = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ map: roughTex }))
    rough.rotation.x = -Math.PI / 2
    rough.position.y = -0.02
    this.group.add(rough)

    const fwTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#5c9a3a'
      g.fillRect(0, 0, 256, 128)
      g.fillStyle = '#4f8c31'
      g.fillRect(0, 128, 256, 128)
      speckle(g, 256, 256, 2500, ['#58953a', '#4a8530', '#65a342', '#528f35'], 1.5)
    })
    const len = RANGE_LEN + 12
    fwTex.repeat.set(3, len / 22)
    const fw = new THREE.Mesh(new THREE.PlaneGeometry(FAIRWAY_HALF * 2, len), new THREE.MeshLambertMaterial({ map: fwTex }))
    fw.rotation.x = -Math.PI / 2
    fw.position.set(0, -0.005, -len / 2 + 12)
    this.group.add(fw)

    // Tee box
    const teeTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#69a845'
      g.fillRect(0, 0, 128, 128)
      speckle(g, 128, 128, 900, ['#62a040', '#72b24d'], 1)
    })
    teeTex.repeat.set(2, 2)
    const tee = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), new THREE.MeshLambertMaterial({ map: teeTex }))
    tee.rotation.x = -Math.PI / 2
    tee.position.set(0, -0.002, 0.5)
    this.group.add(tee)
    // Tee markers
    for (const x of [-3.5, 3.5]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }))
      m.position.set(x, 0.07, -0.4)
      this.group.add(m)
    }
  }

  private buildTargets() {
    const greenTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#6fbf4a'
      g.fillRect(0, 0, 256, 256)
      speckle(g, 256, 256, 1200, ['#69b845', '#76c652'], 1)
    })
    greenTex.repeat.set(4, 4)
    const greenMat = new THREE.MeshLambertMaterial({ map: greenTex })
    const fringeMat = new THREE.MeshLambertMaterial({ color: 0x5aa23a })
    const sandTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#e3d3a4'
      g.fillRect(0, 0, 128, 128)
      speckle(g, 128, 128, 1500, ['#d8c692', '#efe2b8', '#cdbb88'], 1)
    })
    sandTex.repeat.set(2, 2)
    const sandMat = new THREE.MeshLambertMaterial({ map: sandTex })
    const lipMat = new THREE.MeshLambertMaterial({ color: 0x3d6a24 })

    for (const t of TARGETS) {
      const cz = -t.yd * YD
      const fringe = new THREE.Mesh(new THREE.CircleGeometry(t.r + 1.5, 48), fringeMat)
      fringe.rotation.x = -Math.PI / 2
      fringe.position.set(t.x, 0.004, cz)
      this.group.add(fringe)
      const green = new THREE.Mesh(new THREE.CircleGeometry(t.r, 48), greenMat)
      green.rotation.x = -Math.PI / 2
      green.position.set(t.x, 0.008, cz)
      this.group.add(green)
      for (const b of t.bunkers) {
        const lip = new THREE.Mesh(new THREE.CircleGeometry(b.r + 0.4, 32), lipMat)
        lip.rotation.x = -Math.PI / 2
        lip.position.set(t.x + b.dx, 0.006, cz + b.dz)
        lip.scale.set(1.25, 1, 1)
        this.group.add(lip)
        const s = new THREE.Mesh(new THREE.CircleGeometry(b.r, 32), sandMat)
        s.rotation.x = -Math.PI / 2
        s.position.set(t.x + b.dx, 0.01, cz + b.dz)
        s.scale.set(1.25, 1, 1)
        this.group.add(s)
      }
      this.addFlag(t, new THREE.Vector3(t.x, 0, cz))

      const sign = this.textSprite(`${t.yd}`, t.color)
      sign.position.set(t.x - t.r - 4, 2.2, cz)
      sign.scale.set(5, 2.5, 1)
      this.group.add(sign)
    }
  }

  private addFlag(t: Target, pos: THREE.Vector3) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.3, 6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }))
    pole.position.set(pos.x, 1.15, pos.z)
    this.group.add(pole)
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.054, 16), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }))
    cup.rotation.x = -Math.PI / 2
    cup.position.set(pos.x, 0.012, pos.z)
    this.group.add(cup)
    const geo = new THREE.PlaneGeometry(0.75, 0.5, 10, 4)
    geo.translate(0.375, 0, 0)
    const cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: t.color, side: THREE.DoubleSide }))
    cloth.position.set(pos.x, 2.05, pos.z)
    this.group.add(cloth)
    this.flags.push({ pos, cloth, base: Float32Array.from(geo.attributes.position.array as Float32Array), target: t })
  }

  textSprite(text: string, color: string) {
    const tex = canvasTex(256, 128, (g) => {
      g.fillStyle = 'rgba(20,32,20,0.82)'
      g.beginPath()
      g.roundRect(8, 8, 240, 112, 18)
      g.fill()
      g.strokeStyle = color
      g.lineWidth = 6
      g.stroke()
      g.fillStyle = '#fff'
      g.font = 'bold 72px system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, 128, 68)
    })
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: true }))
  }

  private buildTrees() {
    const pts: { x: number; z: number; s: number; phase: number }[] = []
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    for (let z = 10; z > -RANGE_LEN - 60; z -= rnd(9, 16)) {
      for (const side of [-1, 1]) {
        pts.push({ x: side * rnd(FAIRWAY_HALF + 18, FAIRWAY_HALF + 34), z: z + rnd(-4, 4), s: rnd(0.8, 1.35), phase: rnd(0, 6) })
        if (Math.random() < 0.6) pts.push({ x: side * rnd(FAIRWAY_HALF + 38, FAIRWAY_HALF + 70), z: z + rnd(-6, 6), s: rnd(0.9, 1.5), phase: rnd(0, 6) })
      }
    }
    for (let x = -140; x < 140; x += rnd(7, 12)) pts.push({ x, z: -RANGE_LEN - rnd(40, 70), s: rnd(1.1, 1.8), phase: rnd(0, 6) })
    this.treeData = pts
    const foliageGeo = new THREE.ConeGeometry(3.2, 10, 7)
    foliageGeo.translate(0, 8, 0)
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3.5, 6)
    trunkGeo.translate(0, 1.75, 0)
    this.trees = new THREE.InstancedMesh(foliageGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pts.length)
    this.trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a3f28 }), pts.length)
    const c = new THREE.Color()
    pts.forEach((_, i) => {
      c.setHSL(0.26 + Math.random() * 0.07, 0.35 + Math.random() * 0.2, 0.3 + Math.random() * 0.12)
      this.trees.setColorAt(i, c)
    })
    this.group.add(this.trees, this.trunks)
    this.updateTrees(0, { speed: 0, dir: 0, gust: 0, phase: 0 })
  }

  private buildMarkers() {
    for (let yd = 50; yd <= 300; yd += 50) {
      for (const side of [-1, 1]) {
        const s = this.textSprite(`${yd}`, '#ffffff')
        s.position.set(side * (FAIRWAY_HALF + 3), 1.4, -yd * YD)
        s.scale.set(2.6, 1.3, 1)
        this.group.add(s)
      }
    }
  }

  private buildWindsock() {
    const g = new THREE.Group()
    g.position.set(-5.5, 0, -2)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.2, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }))
    pole.position.y = 2.1
    g.add(pole)
    const sockGeo = new THREE.CylinderGeometry(0.24, 0.1, 1.6, 12, 4, true)
    sockGeo.rotateX(Math.PI / 2)
    sockGeo.translate(0, 0, -0.8)
    // Orange/white bands via vertex colours
    const cols: number[] = []
    const pos = sockGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const band = Math.floor((-pos.getZ(i) / 1.6) * 4.999)
      const white = band % 2 === 1
      cols.push(1, white ? 1 : 0.45, white ? 1 : 0.05)
    }
    sockGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    this.sockMesh = new THREE.Mesh(sockGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))
    const pivot = new THREE.Group()
    pivot.position.y = 4.1
    pivot.add(this.sockMesh)
    g.add(pivot)
    this.sock = pivot
    this.group.add(g)
  }

  private updateTrees(t: number, wind: Wind) {
    const w = windAt(wind, 8, t)
    const s = Math.hypot(w.x, w.z)
    const lean = Math.min(0.09, s * 0.008)
    const ax = s > 0 ? w.x / s : 0
    const az = s > 0 ? w.z / s : 0
    this.treeData.forEach((p, i) => {
      const sway = lean + Math.sin(t * (1.2 + p.s * 0.3) + p.phase) * (0.006 + s * 0.0022)
      this.dummy.position.set(p.x, 0, p.z)
      this.dummy.rotation.set(az * sway, 0, -ax * sway)
      this.dummy.scale.setScalar(p.s)
      this.dummy.updateMatrix()
      this.trees.setMatrixAt(i, this.dummy.matrix)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.updateMatrix()
      this.trunks.setMatrixAt(i, this.dummy.matrix)
    })
    this.trees.instanceMatrix.needsUpdate = true
    this.trunks.instanceMatrix.needsUpdate = true
  }

  update(t: number, wind: Wind) {
    // Flags: stream downwind, stiffer and flatter the harder it blows.
    for (const f of this.flags) {
      const w = windAt(wind, 2, t + f.pos.z * 0.01)
      const s = Math.hypot(w.x, w.z)
      const yaw = Math.atan2(-w.z, w.x)
      f.cloth.rotation.y = s > 0.2 ? yaw : f.cloth.rotation.y
      const pos = f.cloth.geometry.attributes.position as THREE.BufferAttribute
      const lift = Math.min(1, s / 9)
      for (let i = 0; i < pos.count; i++) {
        const bx = f.base[i * 3]
        const by = f.base[i * 3 + 1]
        const k = bx / 0.75
        const droop = (1 - lift) * k * 0.95
        const wave = Math.sin(t * (5 + s * 0.9) - bx * 9) * k * (0.04 + 0.08 * lift)
        pos.setXYZ(i, bx * Math.cos(droop), by - bx * Math.sin(droop) - (1 - lift) * 0.05 * k, wave)
      }
      pos.needsUpdate = true
      f.cloth.geometry.computeVertexNormals()
    }
    // Windsock points downwind and fills as the wind picks up.
    const w = windAt(wind, 4, t)
    const s = Math.hypot(w.x, w.z)
    const fill = Math.min(1, s / 8)
    this.sock.rotation.order = 'YXZ'
    if (s > 0.15) this.sock.rotation.y = Math.atan2(-w.x, -w.z)
    this.sock.rotation.x = -(1 - fill) * 1.25 + Math.sin(t * 3.1) * 0.03 * (1 - fill * 0.5)
    this.sockMesh.rotation.z = Math.sin(t * 7) * 0.05 * fill
    this.updateTrees(t, wind)
  }
}
