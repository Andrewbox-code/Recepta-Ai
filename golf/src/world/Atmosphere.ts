import * as THREE from 'three'

// Clear tournament-day sky: deep blue overhead fading to a pale hazy
// horizon, shaded cumulus, warm sun with crisp shadows that follow the action.

const SKY_TOP = new THREE.Color(0x2d6fc0)
const SKY_MID = new THREE.Color(0x5d98d8)
const SKY_HORIZON = new THREE.Color(0xc9dcec)

function skyMaterial(sunDir: THREE.Vector3, withClouds: boolean) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: sunDir },
      uTop: { value: SKY_TOP },
      uMid: { value: SKY_MID },
      uHor: { value: SKY_HORIZON },
      uDrift: { value: new THREE.Vector2() },
      uClouds: { value: withClouds ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun, uTop, uMid, uHor; uniform vec2 uDrift; uniform float uClouds;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        float y = vDir.y;
        vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.07, y));
        col = mix(col, uTop, smoothstep(0.1, 0.6, y));
        if (y < 0.0) col = uHor;
        float sd = max(dot(vDir, uSun), 0.0);
        col += vec3(1.0, 0.96, 0.88) * (pow(sd, 1200.0) * 4.0 + pow(sd, 80.0) * 0.2 + pow(sd, 5.0) * 0.1);
        if (uClouds > 0.5 && y > 0.02) {
          vec2 p = vDir.xz / (y + 0.08) * 1.1 + uDrift;
          float c = fbm(p);
          float cov = smoothstep(0.58, 0.8, c) * smoothstep(0.02, 0.25, y);
          // Cumulus: bright sunlit tops, grey-blue flat bases.
          float thick = smoothstep(0.58, 0.9, c);
          float lit = fbm(p + uSun.xz * 0.35);
          float sunSide = clamp((c - lit) * 3.0 + 0.6, 0.0, 1.0);
          vec3 cc = mix(vec3(0.66, 0.71, 0.79), vec3(1.0, 0.99, 0.96), sunSide);
          cc = mix(cc, vec3(0.58, 0.63, 0.72), thick * 0.35 * (1.0 - sunSide));
          cc = mix(cc, uHor, smoothstep(0.25, 0.02, y) * 0.6);
          col = mix(col, cc, cov * 0.95);
        }
        // Untonemapped on purpose: the sky should be exactly this bright cyan.
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

export class Atmosphere {
  sunDir = new THREE.Vector3()
  sun: THREE.DirectionalLight
  private sky: THREE.Mesh
  private skyMat: THREE.ShaderMaterial

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadows: boolean) {
    const elevation = 48
    const azimuth = 30 // behind the player's right shoulder: front-lit
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth))

    this.skyMat = skyMaterial(this.sunDir, true)
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -2
    scene.add(this.sky)

    // Environment lighting baked from a cloudless version of the same sky
    // over bright turf, so shading picks up that cyan/green bounce.
    const pm = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial(this.sunDir, false)))
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f6a26 }))
    ground.position.y = -2
    envScene.add(ground)
    scene.environment = pm.fromScene(envScene, 0.04).texture
    scene.environmentIntensity = 0.5
    pm.dispose()

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.3)
    if (shadows) {
      this.sun.castShadow = true
      this.sun.shadow.mapSize.set(4096, 4096)
      const c = this.sun.shadow.camera
      c.left = c.bottom = -45
      c.right = c.top = 45
      c.near = 10
      c.far = 400
      this.sun.shadow.bias = -0.0003
      this.sun.shadow.normalBias = 0.03
      this.sun.shadow.radius = 3
    }
    scene.add(this.sun, this.sun.target)
    scene.add(new THREE.HemisphereLight(0xc4dcf2, 0x4a6a2c, 0.3))
    // Aerial perspective: distant hills fade to the horizon haze.
    scene.fog = new THREE.FogExp2(0xc4d8ea, 0.0011)

  }

  follow(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150)
    this.sun.target.position.copy(focus)
  }

  update(t: number, wind: THREE.Vector2, cam: THREE.Camera) {
    this.skyMat.uniforms.uDrift.value.addScaledVector(wind, 0.0004)
    void t
    this.sky.position.copy(cam.position)
  }
}
