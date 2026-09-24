import * as THREE from 'three'
import { FAIRWAY_HALF, POND, RANGE_LEN, TARGETS, YD, ellipse, fairwayWobble, heightAt, surfaceAt } from './layout'

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// Boulders on the mounds and clumps of wildflowers in the rough.
export class Flora {
  constructor(scene: THREE.Scene, shadows: boolean) {
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
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c8388, roughness: 0.85, flatShading: true })
    const spots: { x: number; z: number; s: number; v: number }[] = []
    for (let i = 0; i < 400 && spots.length < 70; i++) {
      const side = r() < 0.5 ? -1 : 1
      const z = 20 - r() * (RANGE_LEN + 120)
      const x = side * (FAIRWAY_HALF + fairwayWobble(z) + 10 + r() * 70)
      if (ellipse(x, z, POND.x, POND.z, POND.rx, POND.rz) < 1.6) continue
      if (x > -45 && x < -5 && z > -12 && z < 20) continue
      spots.push({ x, z, s: 0.6 + Math.pow(r(), 2) * 3.2, v: Math.floor(r() * 3) })
    }
    // A few boulders fringing the pond, like the reference's lakeside rocks.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2
      spots.push({ x: POND.x + Math.cos(a) * POND.rx * 1.28, z: POND.z + Math.sin(a) * POND.rz * 1.28, s: 0.5 + r() * 1.2, v: Math.floor(r() * 3) })
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
      scene.add(im)
    })

    // Wildflowers: small crossed cards with a canvas-drawn bloom.
    const tex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const g = c.getContext('2d')!
      g.strokeStyle = '#4c8a2a'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(32, 64)
      g.lineTo(32, 24)
      g.stroke()
      g.fillStyle = '#ffffff'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        g.beginPath()
        g.ellipse(32 + Math.cos(a) * 9, 20 + Math.sin(a) * 9, 7, 4, a, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#ffd54a'
      g.beginPath()
      g.arc(32, 20, 5, 0, Math.PI * 2)
      g.fill()
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const card = new THREE.PlaneGeometry(0.22, 0.22)
    card.translate(0, 0.11, 0)
    const cross = card.clone().rotateY(Math.PI / 2)
    const flowerGeo = new THREE.BufferGeometry()
    const merged = [card, cross]
    const pos: number[] = []
    const uv: number[] = []
    const nrm: number[] = []
    for (const m of merged) {
      const ni = m.toNonIndexed()
      pos.push(...(ni.attributes.position.array as Float32Array))
      uv.push(...(ni.attributes.uv.array as Float32Array))
      for (let i = 0; i < ni.attributes.position.count; i++) nrm.push(0, 1, 0)
    }
    flowerGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    flowerGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    flowerGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    const flowerMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 })
    const palette = [0xffffff, 0xff8fd8, 0xb58cff, 0xffe066, 0xff6b6b]
    const flowers: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    for (let i = 0; i < 5000 && flowers.length < 1400; i++) {
      // Clumps along the rough near the tee and around targets.
      const cz = 25 - r() * (RANGE_LEN + 40)
      const side = r() < 0.5 ? -1 : 1
      const cx = side * (FAIRWAY_HALF + fairwayWobble(cz) + 2 + r() * 24)
      if (surfaceAt(cx, cz) !== 'rough') continue
      const col = palette[Math.floor(r() * palette.length)]
      const n = 4 + Math.floor(r() * 8)
      for (let k = 0; k < n; k++) {
        const x = cx + (r() - 0.5) * 1.6
        const z = cz + (r() - 0.5) * 1.6
        d.position.set(x, heightAt(x, z), z)
        d.rotation.set(0, r() * 6.28, 0)
        d.scale.setScalar(0.6 + r() * 0.8)
        d.updateMatrix()
        flowers.push(d.matrix.clone())
        colors.push(new THREE.Color(col))
      }
    }
    for (const t of TARGETS) {
      for (let k = 0; k < 30; k++) {
        const a = r() * Math.PI * 2
        const rr = t.r + 6 + r() * 6
        const x = t.x + Math.cos(a) * rr
        const z = -t.yd * YD + Math.sin(a) * rr
        if (surfaceAt(x, z) !== 'rough') continue
        d.position.set(x, heightAt(x, z), z)
        d.rotation.set(0, r() * 6.28, 0)
        d.scale.setScalar(0.7 + r() * 0.6)
        d.updateMatrix()
        flowers.push(d.matrix.clone())
        colors.push(new THREE.Color(palette[Math.floor(r() * palette.length)]))
      }
    }
    const fm = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length)
    flowers.forEach((m, i) => {
      fm.setMatrixAt(i, m)
      fm.setColorAt(i, colors[i])
    })
    scene.add(fm)
  }
}
