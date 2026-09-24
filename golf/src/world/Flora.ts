import * as THREE from 'three'
import type { Layout } from './types'

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// A few boulders lining the pond bank.
export class Flora {
  group = new THREE.Group()

  constructor(scene: THREE.Scene, shadows: boolean, layout: Layout) {
    scene.add(this.group)
    const heightAt = layout.heightAt
    const r = rng(1234)

    // Rocks: noise-displaced icospheres, flattened so they sit into the ground.
    const variants: THREE.BufferGeometry[] = []
    for (let v = 0; v < 3; v++) {
      const g = new THREE.IcosahedronGeometry(1, 3)
      const p = g.attributes.position
      const seed = r() * 100
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        const n = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed) + 0.1 * Math.sin(y * 7 + x * 5 + seed) + 0.25 * Math.max(0, x * 0.6 + z * 0.3)
        p.setXYZ(i, x * n * 1.3, Math.max(-0.3, y * n * 0.75), z * n)
      }
      g.computeVertexNormals()
      variants.push(g)
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 })
    const spots: { x: number; z: number; s: number; v: number }[] = []
    // A few boulders fringing the pond, like the reference's lakeside rocks.
    for (const w of layout.water) {
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2
        const lx = Math.cos(a) * w.rx * 1.3
        const lz = Math.sin(a) * w.rz * 1.3
        // Rotate into place (inverse of the layout's ellipse rotation).
        const c = Math.cos(w.rot)
        const sn = Math.sin(w.rot)
        spots.push({ x: w.x + lx * c - lz * sn, z: w.z + lx * sn + lz * c, s: 0.5 + r() * 1.1, v: Math.floor(r() * 3) })
      }
    }
    const d = new THREE.Object3D()
    variants.forEach((geo, vi) => {
      const mine = spots.filter((s) => s.v === vi)
      const im = new THREE.InstancedMesh(geo, rockMat, mine.length)
      mine.forEach((s, i) => {
        d.position.set(s.x, heightAt(s.x, s.z) - 0.1 * s.s, s.z)
        d.rotation.set(0, r() * 6.28, 0)
        d.scale.setScalar(s.s)
        d.updateMatrix()
        im.setMatrixAt(i, d.matrix)
      })
      im.castShadow = shadows
      im.receiveShadow = shadows
      this.group.add(im)
    })

  }
}
