import * as THREE from 'three'

export type CamMode = 'address' | 'launch' | 'chase' | 'landing' | 'rest' | 'lie'
export type CamStyle = 'chase' | 'tracer'

// Frame-rate independent smoothing.
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)

export class CameraDirector {
  camera: THREE.PerspectiveCamera
  mode: CamMode = 'address'
  style: CamStyle = 'chase'
  private pos = new THREE.Vector3()
  private look = new THREE.Vector3()
  private goalPos = new THREE.Vector3()
  private goalLook = new THREE.Vector3()
  private landingSpot = new THREE.Vector3()
  private shakeAmt = 0
  private modeT = 0
  private fov = 50
  private hold = false
  fovScale = 1 // wider on portrait screens
  lift = 0 // extra address height (metres) for downhill shots
  ground: (x: number, z: number) => number = () => 0 // stay put and just watch (putting)

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.05, 4000)
  }

  private fwd(aim: number) {
    return new THREE.Vector3(Math.sin(aim), 0, -Math.cos(aim))
  }

  address(ball: THREE.Vector3, aim: number, snap = false, putting = false) {
    this.mode = 'address'
    this.modeT = 0
    this.hold = false
    const f = this.fwd(aim)
    // Broadcast "behind the player" framing, solved so the ball sits just above
    // the bottom HUD whatever the screen shape.
    // Off an elevated tee, sit higher so the green isn't hidden by the tee box.
    const back = putting ? 1.9 : 4.2 + this.lift * 1.2
    const up = putting ? 0.85 : 1.35 + this.lift
    this.goalPos.copy(ball).addScaledVector(f, -back).add(new THREE.Vector3(0, up, 0))
    const ballDep = Math.atan2(up, back)
    const portrait = this.fovScale > 1
    const dep = ballDep - (putting ? (portrait ? 0.02 : 0.08) : portrait ? 0.03 : 0.1)
    this.goalLook.copy(this.goalPos).addScaledVector(f, 40).add(new THREE.Vector3(0, -40 * Math.tan(dep), 0))
    this.fov = putting ? 42 : 40
    if (snap) {
      this.pos.copy(this.goalPos)
      this.look.copy(this.goalLook)
    }
  }

  // Any fixed vantage point (overview map, look at the target).
  view(pos: THREE.Vector3, look: THREE.Vector3) {
    this.mode = 'lie'
    this.modeT = 0
    this.goalPos.copy(pos)
    this.goalLook.copy(look)
    this.fov = 50
  }

  lieCheck(ball: THREE.Vector3, aim: number) {
    this.mode = 'lie'
    this.modeT = 0
    const f = this.fwd(aim)
    const r = new THREE.Vector3(Math.cos(aim), 0, Math.sin(aim))
    this.goalPos.copy(ball).addScaledVector(f, -0.5).addScaledVector(r, 0.25).add(new THREE.Vector3(0, 0.22, 0))
    this.goalLook.copy(ball)
    this.fov = 40
  }

  launch(landing: THREE.Vector3, hold = false) {
    this.mode = 'launch'
    this.modeT = 0
    this.hold = hold
    this.landingSpot.copy(landing)
  }

  // Cut to a camera waiting near where the ball will come down.
  toLanding(ballDir: THREE.Vector3, aim: number) {
    this.mode = 'landing'
    this.modeT = 0
    const r = new THREE.Vector3(Math.cos(aim), 0, Math.sin(aim))
    const side = Math.sign(this.landingSpot.x - 0) || 1
    const flat = new THREE.Vector3(ballDir.x, 0, ballDir.z).normalize()
    this.pos
      .copy(this.landingSpot)
      .addScaledVector(flat, 16)
      .addScaledVector(r, -side * 9)
      .setY(this.landingSpot.y + 1.6)
    this.goalPos.copy(this.pos)
    this.fov = 38
  }

  rest() {
    this.mode = 'rest'
    this.modeT = 0
  }

  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount)
  }

  update(dt: number, ball: THREE.Vector3, vel: THREE.Vector3, aim: number) {
    this.modeT += dt
    const f = this.fwd(aim)
    switch (this.mode) {
      case 'address':
      case 'lie':
        this.pos.lerp(this.goalPos, damp(this.mode === 'lie' ? 5 : 6, dt))
        this.look.lerp(this.goalLook, damp(7, dt))
        break
      case 'launch': {
        // Hold the down-the-line view for a beat so you see it leave.
        this.look.lerp(ball, damp(10, dt))
        if (this.hold) break
        if (this.modeT > 0.45 && this.style === 'chase') this.mode = 'chase'
        if (this.style === 'tracer') {
          const hold = new THREE.Vector3().copy(this.goalPos).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(f, -3)
          this.pos.lerp(hold, damp(1.5, dt))
          this.fov = 50
        }
        break
      }
      case 'chase': {
        // Low and behind the ball, lagging it: you feel the speed.
        const flat = new THREE.Vector3(vel.x, 0, vel.z)
        if (flat.lengthSq() < 0.01) flat.copy(f)
        flat.normalize()
        const side = new THREE.Vector3(-flat.z, 0, flat.x)
        // Just below and off to the side of the ball's line, so it climbs
        // away against the sky rather than flying through the lens.
        this.goalPos
          .copy(ball)
          .addScaledVector(flat, -9)
          .addScaledVector(side, 1.8)
        const gb = this.ground(ball.x, ball.z)
        this.goalPos.y = this.ground(this.goalPos.x, this.goalPos.z) + Math.max(0.9, (ball.y - gb) * 0.8 - 0.4)
        this.pos.lerp(this.goalPos, damp(2.4, dt))
        this.look.lerp(ball, damp(12, dt))
        this.fov = 55
        break
      }
      case 'landing':
        this.look.lerp(ball, damp(this.modeT < 0.05 ? 1000 : 9, dt))
        break
      case 'rest': {
        if (this.style === 'tracer' || this.hold) {
          this.look.lerp(ball, damp(4, dt))
          break
        }
        // Slow drift toward the ball while it settles.
        const toBall = new THREE.Vector3().subVectors(ball, this.pos)
        const d = toBall.length()
        if (d > 7) this.pos.addScaledVector(toBall.normalize(), Math.min(d - 7, 6) * dt * 0.5)
        this.pos.y += (Math.max(1.4, ball.y + 1.4) - this.pos.y) * damp(1, dt)
        this.look.lerp(ball, damp(6, dt))
        break
      }
    }
    if (this.style === 'tracer' && (this.mode === 'chase' || this.mode === 'landing')) this.mode = 'launch'

    this.camera.fov += (Math.min(80, this.fov * this.fovScale) - this.camera.fov) * damp(3, dt)
    this.camera.updateProjectionMatrix()
    // Never dip below the ground (hilly holes, elevated tees).
    const gy = this.ground(this.pos.x, this.pos.z) + 0.45
    if (this.pos.y < gy) this.pos.y = gy
    this.camera.position.copy(this.pos)
    this.shakeAmt *= Math.exp(-dt * 6)
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s))
    }
    this.camera.lookAt(this.look)
  }
}
