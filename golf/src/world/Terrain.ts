import * as THREE from 'three'
import { FAIRWAY_HALF, POND, PRACTICE, RANGE_LEN, TARGETS, TEE_BOX, WATER_Y, YD, fairwayWobble, heightAt } from './layout'

// Area covered by the detailed, painted terrain.
const AX0 = -240
const AX1 = 240
const AZ0 = -540
const AZ1 = 120
const PX_PER_M = 3.2

function detailTexture() {
  // Tileable grass-blade noise, mean ~0.5, used to modulate the painted colour
  // at close range so the ground never looks like a flat texture.
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(128,128,128)'
  g.fillRect(0, 0, n, n)
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * n
    const y = Math.random() * n
    const v = 70 + Math.random() * 120
    g.strokeStyle = `rgba(${v},${v + 10},${v},0.55)`
    g.lineWidth = 0.6 + Math.random() * 0.8
    const a = Math.random() * Math.PI * 2
    const l = 2 + Math.random() * 5
    for (const ox of [-n, 0, n]) {
      for (const oy of [-n, 0, n]) {
        g.beginPath()
        g.moveTo(x + ox, y + oy)
        g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
        g.stroke()
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function paintSplat() {
  const W = Math.round((AX1 - AX0) * PX_PER_M)
  const H = Math.round((AZ1 - AZ0) * PX_PER_M)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const X = (x: number) => (x - AX0) * PX_PER_M
  const Z = (z: number) => (z - AZ0) * PX_PER_M
  const M = (m: number) => m * PX_PER_M
  // Canvas row 0 is AZ0 (far end); flipY is off so it lines up with the mesh.

  // Rough: mottled, darker, bluer.
  g.fillStyle = '#34561d'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const r = M(2 + Math.random() * 9)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const col = Math.random() < 0.5 ? '64,98,36' : '40,68,24'
    gr.addColorStop(0, `rgba(${col},0.35)`)
    gr.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Fairway: first cut, then the fairway itself with mowing stripes.
  const fairwayPath = (grow: number) => {
    g.beginPath()
    for (let z = 12; z >= -RANGE_LEN; z -= 2) g.lineTo(X(-(FAIRWAY_HALF + fairwayWobble(z) + grow)), Z(z))
    for (let z = -RANGE_LEN; z <= 12; z += 2) g.lineTo(X(FAIRWAY_HALF + fairwayWobble(z) + grow), Z(z))
    g.closePath()
  }
  g.fillStyle = '#42702a'
  fairwayPath(2.2)
  g.fill()
  g.save()
  fairwayPath(0)
  g.clip()
  for (let z = 12; z > -RANGE_LEN - 12; z -= 12) {
    g.fillStyle = Math.floor(-z / 12) % 2 ? '#4c8429' : '#5b9531'
    g.fillRect(0, Z(z - 12), W, M(12))
  }
  // Diagonal cross-cut, very subtle.
  g.globalAlpha = 0.06
  g.strokeStyle = '#1e3010'
  g.lineWidth = M(3)
  for (let k = -800; k < 800; k += 14) {
    g.beginPath()
    g.moveTo(X(k), Z(12))
    g.lineTo(X(k + 380), Z(-RANGE_LEN))
    g.stroke()
  }
  g.globalAlpha = 1
  g.restore()

  // Tee box, worn with divots in the hitting area.
  g.fillStyle = '#5f9a36'
  g.fillRect(X(TEE_BOX.x0), Z(TEE_BOX.z0), M(TEE_BOX.x1 - TEE_BOX.x0), M(TEE_BOX.z1 - TEE_BOX.z0))
  for (let i = 0; i < 160; i++) {
    const x = TEE_BOX.x0 + 0.5 + Math.random() * (TEE_BOX.x1 - TEE_BOX.x0 - 1)
    const z = TEE_BOX.z0 + 0.3 + Math.random() * (TEE_BOX.z1 - TEE_BOX.z0 - 0.6)
    if (Math.abs(x) < 0.8 && Math.abs(z) < 0.8) continue
    g.fillStyle = Math.random() < 0.5 ? 'rgba(96,70,40,0.75)' : 'rgba(120,94,58,0.6)'
    g.fillRect(X(x), Z(z), M(0.07), M(0.16))
  }

  const greenAt = (x: number, z: number, r: number) => {
    g.fillStyle = '#4e8a2c'
    g.beginPath()
    g.arc(X(x), Z(z), M(r + 1.5), 0, Math.PI * 2)
    g.fill()
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), M(r))
    gr.addColorStop(0, '#6fae3e')
    gr.addColorStop(1, '#62a236')
    g.fillStyle = gr
    g.beginPath()
    g.arc(X(x), Z(z), M(r), 0, Math.PI * 2)
    g.fill()
    // Checkerboard mowing
    g.save()
    g.clip()
    g.globalAlpha = 0.07
    g.fillStyle = '#10200a'
    for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) if ((i + j) % 2 === 0) g.fillRect(X(x + i * 2.5), Z(z + j * 2.5), M(2.5), M(2.5))
    g.restore()
  }

  for (const t of TARGETS) {
    const cz = -t.yd * YD
    greenAt(t.x, cz, t.r)
    for (const k of t.bunkers) {
      const cx = X(t.x + k.dx)
      const cy = Z(cz + k.dz)
      g.save()
      g.translate(cx, cy)
      g.scale(k.rx / k.rz, 1)
      g.fillStyle = '#6b6242'
      g.beginPath()
      g.arc(0, 0, M(k.rz + 0.35), 0, Math.PI * 2)
      g.fill()
      const sg = g.createRadialGradient(0, -M(k.rz * 0.3), 0, 0, 0, M(k.rz))
      sg.addColorStop(0, '#efe3c2')
      sg.addColorStop(0.75, '#e2d3a8')
      sg.addColorStop(1, '#c8b686')
      g.fillStyle = sg
      g.beginPath()
      g.arc(0, 0, M(k.rz), 0, Math.PI * 2)
      g.fill()
      g.restore()
      // Rake lines
      g.save()
      g.globalAlpha = 0.12
      g.strokeStyle = '#8f7d55'
      g.lineWidth = 1
      g.beginPath()
      g.ellipse(cx, cy, M(k.rx), M(k.rz), 0, 0, Math.PI * 2)
      g.clip()
      for (let o = -M(k.rx); o < M(k.rx); o += 3) {
        g.beginPath()
        g.moveTo(cx + o, cy - M(k.rz))
        g.lineTo(cx + o + 4, cy + M(k.rz))
        g.stroke()
      }
      g.restore()
    }
  }
  greenAt(PRACTICE.x, PRACTICE.z, PRACTICE.r)

  // Pond bank: mud to reeds.
  g.save()
  g.translate(X(POND.x), Z(POND.z))
  g.scale(POND.rx / POND.rz, 1)
  const pg = g.createRadialGradient(0, 0, M(POND.rz * 0.9), 0, 0, M(POND.rz * 1.35))
  pg.addColorStop(0, '#4c4630')
  pg.addColorStop(0.5, '#56562f')
  pg.addColorStop(1, 'rgba(62,95,39,0)')
  g.fillStyle = pg
  g.beginPath()
  g.arc(0, 0, M(POND.rz * 1.35), 0, Math.PI * 2)
  g.fill()
  g.restore()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.flipY = false
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

function withDetail(mat: THREE.MeshStandardMaterial, detail: THREE.Texture) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float dist = length(vWPos - cameraPosition);
        float fine = texture2D(uDetail, vWPos.xz * 0.9).r;
        float mid = texture2D(uDetail, vWPos.xz * 0.11).g;
        float macro = texture2D(uDetail, vWPos.xz * 0.012).b;
        float fineK = 1.0 - smoothstep(8.0, 60.0, dist);
        diffuseColor.rgb *= mix(1.0, 0.45 + fine * 1.1, 0.85 * fineK);
        diffuseColor.rgb *= 0.8 + mid * 0.4;
        diffuseColor.rgb *= 0.86 + macro * 0.28;`,
      )
  }
}

export class Terrain {
  group = new THREE.Group()
  water: THREE.Mesh
  private waterMat: THREE.ShaderMaterial

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    scene.add(this.group)
    const detail = detailTexture()

    // Detailed inner terrain (~2 m grid).
    const w = AX1 - AX0
    const d = AZ1 - AZ0
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2))
    geo.rotateX(-Math.PI / 2)
    geo.translate((AX0 + AX1) / 2, 0, (AZ0 + AZ1) / 2)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, heightAt(x, z))
      uv.setXY(i, (x - AX0) / w, (z - AZ0) / d)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ map: paintSplat(), roughness: 0.93, metalness: 0 })
    withDetail(mat, detail)
    const inner = new THREE.Mesh(geo, mat)
    inner.receiveShadow = true
    this.group.add(inner)

    // Outer terrain out to the horizon, sunk under the inner patch.
    const og = new THREE.PlaneGeometry(7000, 7000, 175, 175)
    og.rotateX(-Math.PI / 2)
    const op = og.attributes.position
    for (let i = 0; i < op.count; i++) {
      const x = op.getX(i)
      const z = op.getZ(i)
      const inside = x > AX0 + 2 && x < AX1 - 2 && z > AZ0 + 2 && z < AZ1 - 2
      op.setY(i, heightAt(x, z) - (inside ? 0.6 : 0.05))
    }
    og.computeVertexNormals()
    const omat = new THREE.MeshStandardMaterial({ color: 0x34561d, roughness: 0.95 })
    withDetail(omat, detail)
    const outer = new THREE.Mesh(og, omat)
    outer.receiveShadow = true
    this.group.add(outer)

    // Water
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSun: { value: sunDir.clone() },
          uDeep: { value: new THREE.Color(0x1d3a36) },
          uHorizon: { value: new THREE.Color(0xc7d8e4) },
          uZenith: { value: new THREE.Color(0x4a7fb8) },
        },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uHorizon; uniform vec3 uZenith;
        varying vec3 vW;
        void main() {
          vec2 p = vW.xz; float t = uTime;
          vec2 g = vec2(0.0);
          g += vec2(cos(p.x*0.9 + t*1.1), sin(p.y*0.7 + t*0.9)) * 0.035;
          g += vec2(cos(p.x*2.3 + p.y*1.7 + t*1.9), sin(p.y*2.9 - p.x*1.1 + t*1.5)) * 0.02;
          g += vec2(cos(p.x*6.1 - p.y*4.3 + t*3.1), sin(p.y*5.7 + p.x*3.9 + t*2.7)) * 0.012;
          vec3 n = normalize(vec3(g.x, 1.0, g.y));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n);
          vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
          vec3 col = mix(uDeep, sky, fres);
          float spec = pow(max(dot(R, uSun), 0.0), 400.0) * 4.0 + pow(max(dot(R, uSun), 0.0), 40.0) * 0.15;
          col += vec3(1.0, 0.95, 0.85) * spec;
          gl_FragColor = vec4(col, 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
    this.water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), this.waterMat)
    this.water.rotation.x = -Math.PI / 2
    this.water.scale.set(POND.rx * 1.5, POND.rz * 1.5, 1)
    this.water.position.set(POND.x, WATER_Y, POND.z)
    this.group.add(this.water)
  }

  update(t: number) {
    this.waterMat.uniforms.uTime.value = t
  }
}
