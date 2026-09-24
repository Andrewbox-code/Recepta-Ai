import * as THREE from 'three'
import { heightAt, surfaceAt } from './layout'

// Real blades around where the player stands. They share the terrain's
// lighting (normals point up) and bend with the wind in the vertex shader.
export class Grass {
  mesh: THREE.InstancedMesh
  private uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() } }

  constructor(scene: THREE.Scene, center: THREE.Vector2, radius: number, shadows: boolean) {
    // Tapered blade: 3 segments + tip.
    const seg = 3
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const w = 0.5 * (1 - t * 0.85)
      const bend = t * t * 0.25
      pos.push(-w, t, bend, w, t, bend)
      const c = 0.6 + t * 0.42
      col.push(c, c, c, c, c, c)
    }
    pos.push(0, 1.08, 0.33)
    col.push(1.05, 1.05, 1.05)
    for (let i = 0; i < seg; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    idx.push(seg * 2, seg * 2 + 1, seg * 2 + 2)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    geo.setIndex(idx)

    // Scatter, densest right around the ball.
    const mats: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    const d = new THREE.Object3D()
    const c = new THREE.Color()
    const tries = 140000
    for (let i = 0; i < tries; i++) {
      const r = radius * Math.pow(Math.random(), 0.65)
      const a = Math.random() * Math.PI * 2
      const x = center.x + Math.cos(a) * r * 1.25
      const z = center.y + Math.sin(a) * r
      const keep = 1 - r / radius
      const s = surfaceAt(x, z)
      if (s === 'water' || s === 'sand') continue
      const tall = s === 'rough'
      if (!tall && Math.random() > keep * 1.4) continue
      if (tall && Math.random() > 0.35 + keep) continue
      const h = s === 'green' || s === 'fringe' ? 0.012 : tall ? 0.07 + Math.random() * 0.09 : 0.03 + Math.random() * 0.03
      const w = tall ? 0.012 : 0.01
      d.position.set(x, heightAt(x, z) - 0.004, z)
      d.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4)
      d.scale.set(w * (0.7 + Math.random() * 0.6), h, w)
      d.updateMatrix()
      mats.push(d.matrix.clone())
      if (tall) c.setHSL(0.2 + Math.random() * 0.07, 0.5 + Math.random() * 0.2, 0.22 + Math.random() * 0.1)
      else c.setHSL(0.25 + Math.random() * 0.04, 0.5 + Math.random() * 0.15, 0.3 + Math.random() * 0.08)
      colors.push(c.clone())
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.6 })
    mat.onBeforeCompile = (sh) => {
      // Both faces use the same up-facing normal so blades light like turf.
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/\*= faceDirection/g, '*= 1.0'))
      sh.uniforms.uTime = this.uniforms.uTime
      sh.uniforms.uWind = this.uniforms.uWind
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;').replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 root = instanceMatrix[3].xyz;
          float bladeH = length(instanceMatrix[1].xyz);
        #else
          vec3 root = vec3(0.0); float bladeH = 1.0;
        #endif
        float ph = root.x * 0.35 + root.z * 0.28;
        float k = position.y * position.y * bladeH;
        float gust = 0.6 + 0.4 * sin(uTime * 0.8 + root.x * 0.05 - root.z * 0.04);
        vec2 sway = vec2(sin(uTime * 2.1 + ph), cos(uTime * 1.7 + ph * 1.3)) * (0.25 + length(uWind) * 0.08);
        mvPosition.xz += (uWind * 0.09 * gust + sway) * k;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      )
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, mats.length)
    mats.forEach((m, i) => {
      this.mesh.setMatrixAt(i, m)
      this.mesh.setColorAt(i, colors[i])
    })
    this.mesh.receiveShadow = shadows
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  update(t: number, wind: { x: number; z: number }) {
    this.uniforms.uTime.value = t
    this.uniforms.uWind.value.set(wind.x, wind.z)
  }
}
