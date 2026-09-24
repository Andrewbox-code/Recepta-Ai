import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

// Physically based sky, drifting cloud layer, image-based ambient light and
// a shadow-casting sun that follows the action.
export class Atmosphere {
  sunDir = new THREE.Vector3()
  sun: THREE.DirectionalLight
  private clouds: THREE.Mesh
  private cloudMat: THREE.ShaderMaterial
  private sky: Sky

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadows: boolean) {
    const elevation = 40
    const azimuth = 35 // behind the player's right shoulder: front-lit, broadcast-style
    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    this.sunDir.setFromSphericalCoords(1, phi, theta)

    this.sky = new Sky()
    this.sky.scale.setScalar(20000)
    const u = this.sky.material.uniforms
    u.turbidity.value = 2.2
    u.rayleigh.value = 1.8
    u.mieCoefficient.value = 0.004
    u.mieDirectionalG.value = 0.82
    u.sunPosition.value.copy(this.sunDir)
    scene.add(this.sky)

    // Bake the sky into an environment map for soft, physically plausible ambient.
    const pm = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    const envSky = new Sky()
    envSky.scale.setScalar(1000)
    envSky.material.uniforms.turbidity.value = 2.2
    envSky.material.uniforms.rayleigh.value = 1.8
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir)
    envScene.add(envSky)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2d4a1e }))
    ground.position.y = -1
    envScene.add(ground)
    scene.environment = pm.fromScene(envScene, 0.04).texture
    scene.environmentIntensity = 0.32
    pm.dispose()

    this.sun = new THREE.DirectionalLight(0xfff0dc, 3.2)
    this.sun.position.copy(this.sunDir).multiplyScalar(150)
    if (shadows) {
      this.sun.castShadow = true
      this.sun.shadow.mapSize.set(2048, 2048)
      const c = this.sun.shadow.camera
      c.left = c.bottom = -38
      c.right = c.top = 38
      c.near = 10
      c.far = 400
      this.sun.shadow.bias = -0.0003
      this.sun.shadow.normalBias = 0.03
      this.sun.shadow.radius = 3
    }
    scene.add(this.sun, this.sun.target)
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a4f22, 0.15))

    scene.fog = new THREE.FogExp2(0xb9cde0, 0.0008)

    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: { uTime: { value: 0 }, uSun: { value: this.sunDir }, uDrift: { value: new THREE.Vector2() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform vec3 uSun; uniform vec2 uDrift;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.02; a*=0.5; } return s; }
        void main(){
          if (vDir.y < 0.01) discard;
          vec2 p = vDir.xz / (vDir.y + 0.12) * 1.6 + uDrift;
          float c = fbm(p);
          float cov = smoothstep(0.6, 0.86, c);
          float thick = smoothstep(0.5, 0.95, fbm(p * 1.3 + 4.0));
          float sunAmt = pow(max(dot(vDir, uSun), 0.0), 6.0);
          vec3 lit = mix(vec3(0.93, 0.95, 0.98), vec3(1.0, 0.97, 0.9), sunAmt);
          vec3 col = mix(lit, vec3(0.62, 0.67, 0.74), thick * 0.7);
          float horizon = smoothstep(0.06, 0.4, vDir.y);
          gl_FragColor = vec4(col, cov * 0.9 * horizon);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.cloudMat)
    this.clouds.frustumCulled = false
    this.clouds.renderOrder = -1
    scene.add(this.clouds)
  }

  // Keep the shadow box centred on what we're looking at.
  follow(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150)
    this.sun.target.position.copy(focus)
  }

  update(t: number, wind: THREE.Vector2, cam: THREE.Camera) {
    this.cloudMat.uniforms.uTime.value = t
    this.cloudMat.uniforms.uDrift.value.addScaledVector(wind, 0.0004)
    this.clouds.position.copy(cam.position)
    this.sky.position.copy(cam.position)
  }
}
