import * as THREE from 'three'
import type { Club } from '../physics/clubs'

// The club at the ball. It follows your hands: pull back and it swings back,
// push through and it comes through the ball into the follow-through.

function clubLength(c: Club) {
  if (c.putter) return 0.87
  if (c.id === 'dr') return 1.14
  if (c.wood) return 1.08 - (c.loft - 15) * 0.008
  return 1.0 - (c.loft - 23) * 0.0045
}

function lieAngle(c: Club) {
  if (c.putter) return 70
  if (c.wood) return 58
  return 60 + (c.loft - 23) * 0.12
}

export class Club3D {
  group = new THREE.Group() // placed at the ball, yawed to aim
  private pivot = new THREE.Group() // at the hands
  private model = new THREE.Group()
  private angle = 0
  private target = 0
  private axis = new THREE.Vector3()
  private visibleTarget = true
  private opacity = 1
  private mats: THREE.Material[] = []
  private club: Club | null = null

  private shadows: boolean

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.shadows = shadows
    this.group.add(this.pivot)
    this.pivot.add(this.model)
    scene.add(this.group)
  }

  setClub(c: Club) {
    if (this.club === c) return
    this.club = c
    this.model.clear()
    this.mats = []
    const L = clubLength(c)
    const lie = THREE.MathUtils.degToRad(lieAngle(c))
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 })
    const grip = new THREE.MeshStandardMaterial({ color: 0x1d2227, roughness: 0.75 })
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.6 })
    const carbon = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.35, roughness: 0.3 })
    const accent = new THREE.MeshStandardMaterial({ color: 0x14b8e6, metalness: 0.4, roughness: 0.35 })
    this.mats = [steel, grip, chrome, carbon, accent]

    // Head in its own frame: face toward -Z (target), toe toward +X, sole at y=0.
    // The hosel sits at the heel (origin).
    const head = new THREE.Group()
    if (c.putter) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.028, 0.03), carbon)
      blade.position.set(0.055, 0.014, 0.004)
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      line.position.set(0.055, 0.029, 0.004)
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.035), accent)
      flange.position.set(0.055, 0.004, 0.03)
      head.add(blade, line, flange)
    } else if (c.wood) {
      const size = c.id === 'dr' ? 1 : c.id === '3h' ? 0.62 : 0.72
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), carbon)
      shell.scale.set(1.0 * size, 0.55 * size, 0.95 * size)
      shell.position.set(0.055 * size, 0.034 * size, 0.045 * size)
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.1 * size, 0.045 * size, 0.004), steel)
      face.position.set(0.055 * size, 0.026 * size, -0.006)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.06 * size), accent)
      stripe.position.set(0.055 * size, 0.066 * size, 0.04 * size)
      head.add(shell, face, stripe)
    } else {
      // Iron/wedge blade: taller toe, loft tilts the face back.
      const wedge = c.sound === 'wedge'
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      shape.lineTo(0.078, 0)
      shape.quadraticCurveTo(0.09, 0.004, 0.088, wedge ? 0.05 : 0.044)
      shape.quadraticCurveTo(0.07, 0.056, 0.012, 0.03)
      shape.lineTo(0, 0.02)
      shape.closePath()
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 })
      geo.translate(0, 0, -0.011)
      const blade = new THREE.Mesh(geo, chrome)
      blade.rotation.x = THREE.MathUtils.degToRad(c.loft) * 0.5
      head.add(blade)
      const grooves = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.022), new THREE.MeshStandardMaterial({ color: 0x9aa3aa, metalness: 1, roughness: 0.45 }))
      grooves.position.set(0.045, 0.02, -0.0135)
      grooves.rotation.y = Math.PI
      blade.add(grooves)
    }
    head.traverse((o) => ((o as THREE.Mesh).castShadow = this.shadows))

    // Shaft rises from the heel toward the player (-X) at the lie angle, with
    // the hands a touch ahead of the ball.
    const dir = new THREE.Vector3(-Math.cos(lie), Math.sin(lie), -0.1).normalize()
    const hands = dir.clone().multiplyScalar(L)
    const shaftGeo = new THREE.CylinderGeometry(0.0065, 0.0045, L * 0.78, 10)
    const shaft = new THREE.Mesh(shaftGeo, steel)
    const gripGeo = new THREE.CylinderGeometry(0.0125, 0.0105, L * 0.24, 12)
    const gripM = new THREE.Mesh(gripGeo, grip)
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
    shaft.quaternion.copy(q)
    shaft.position.copy(dir).multiplyScalar(L * 0.39)
    gripM.quaternion.copy(q)
    gripM.position.copy(dir).multiplyScalar(L * 0.88)
    shaft.castShadow = gripM.castShadow = this.shadows

    // Build relative to the hands so we can rotate about them.
    head.position.copy(hands).negate()
    shaft.position.sub(hands)
    gripM.position.sub(hands)
    this.model.add(head, shaft, gripM)
    this.pivot.position.copy(hands)
    // Swing plane contains the shaft and the target line (-Z).
    this.axis.crossVectors(dir, new THREE.Vector3(0, 0, -1)).normalize()
    this.angle = this.target = 0
  }

  // Put the club behind the ball, square to the aim line.
  address(ball: THREE.Vector3, aim: number, ground: number) {
    // Heel sits a little inside the ball so the middle of the face meets it.
    const face = this.club?.putter ? 0.055 : this.club?.wood ? 0.05 : 0.042
    this.group.position.set(ball.x, ground, ball.z)
    this.group.rotation.set(0, -aim, 0)
    // Offset in the club's local frame: heel toward -X, face just behind the ball (+Z).
    this.group.translateX(-face)
    // A hand-width behind the ball, as players set up (and so the ball stays in view).
    this.group.translateZ(this.club?.putter ? 0.03 : 0.06)
    this.angle = this.target = 0
    this.visibleTarget = true
  }

  // y is the hands' offset in swing units: + = back, - = through.
  setSwing(y: number) {
    const range = this.club?.putter ? 0.9 : 2.4 // radians per unit of hand travel
    this.target = THREE.MathUtils.clamp(y, -1.3, 1.3) * range
  }

  // After impact: carry on into a finish, then get out of the shot.
  finish() {
    this.target = this.club?.putter ? -0.5 : -2.8
  }

  hide() {
    this.visibleTarget = false
  }

  update(dt: number) {
    this.angle += (this.target - this.angle) * (1 - Math.exp(-dt * 30))
    this.model.setRotationFromAxisAngle(this.axis, this.angle)
    const want = this.visibleTarget ? 1 : 0
    this.opacity += (want - this.opacity) * (1 - Math.exp(-dt * 5))
    this.group.visible = this.opacity > 0.02
    for (const m of this.mats) {
      m.transparent = this.opacity < 0.99
      m.opacity = this.opacity
    }
  }
}
