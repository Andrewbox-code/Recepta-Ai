import * as THREE from 'three'
import type { Club } from '../physics/clubs'
import type { ClubLine } from '../physics/equipment'
import { buildClubModel } from './ClubModel'

// The club at the ball. It follows your hands: pull back and it swings back,
// push through and it comes through the ball into the follow-through.

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
  private line: ClubLine | null = null
  private sweetX = 0.045

  private shadows: boolean

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.shadows = shadows
    this.group.add(this.pivot)
    this.pivot.add(this.model)
    scene.add(this.group)
  }

  setClub(c: Club, line: ClubLine) {
    if (this.club === c && this.line === line) return
    this.club = c
    this.line = line
    this.model.clear()
    const b = buildClubModel(c, line, this.shadows)
    // Rotate about the hands: hang the model from them.
    b.root.position.copy(b.hands).negate()
    this.model.add(b.root)
    this.pivot.position.copy(b.hands)
    this.mats = b.materials
    // Swing plane contains the shaft and the target line (-Z).
    this.axis.crossVectors(b.dir, new THREE.Vector3(0, 0, -1)).normalize()
    // Centre of the face, so the ball sits on the sweet spot at address.
    const box = new THREE.Box3().setFromObject(b.head)
    this.sweetX = (box.min.x + box.max.x) / 2
    this.angle = this.target = 0
  }

  // Put the club behind the ball, square to the aim line.
  address(ball: THREE.Vector3, aim: number, ground: number) {
    // Heel sits a little inside the ball so the middle of the face meets it.
    const face = this.sweetX
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
