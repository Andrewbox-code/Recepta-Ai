import * as THREE from 'three'
import type { Layout } from './types'

// Glowing read-the-green grid, draped over the turf between ball and cup.
export class PuttGrid {
  mesh: THREE.Mesh
  private mat: THREE.ShaderMaterial
  private fade = 0
  private want = 0

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 8 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec3 vW; uniform float uTime, uAlpha, uRadius; uniform vec2 uCenter;
        void main(){
          vec2 p = vW.xz;
          vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
          float line = 1.0 - min(min(g.x, g.y) * 1.1, 1.0);
          float d = length(p - uCenter) / uRadius;
          float edge = 1.0 - smoothstep(0.6, 1.0, d);
          float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - d * 5.0);
          gl_FragColor = vec4(vec3(1.0), line * edge * pulse * uAlpha * 0.45);
        }`,
    })
    const geo = new THREE.PlaneGeometry(1, 1, 48, 48).rotateX(-Math.PI / 2)
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.renderOrder = 2
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  show(ball: THREE.Vector3, cup: THREE.Vector3, layout: Layout) {
    const heightAt = layout.heightAt
    const mid = ball.clone().add(cup).multiplyScalar(0.5)
    const r = Math.max(4, ball.distanceTo(cup) * 0.5 + 3)
    const size = r * 2
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute
    const base = new THREE.PlaneGeometry(1, 1, 48, 48).rotateX(-Math.PI / 2).attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = mid.x + base.getX(i) * size
      const z = mid.z + base.getZ(i) * size
      pos.setXYZ(i, x, heightAt(x, z) + 0.012, z)
    }
    pos.needsUpdate = true
    this.mat.uniforms.uCenter.value.set(mid.x, mid.z)
    this.mat.uniforms.uRadius.value = r
    this.want = 1
  }

  hide() {
    this.want = 0
  }

  update(dt: number, t: number) {
    this.fade += (this.want - this.fade) * (1 - Math.exp(-dt * 6))
    this.mat.uniforms.uAlpha.value = this.fade
    this.mat.uniforms.uTime.value = t
    this.mesh.visible = this.fade > 0.01
  }
}
