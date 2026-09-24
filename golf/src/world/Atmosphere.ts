import * as THREE from 'three'

// Bright tropical day: saturated cyan sky, a few fair-weather clouds, sea on
// the horizon, strong warm sun with soft shadows that follow the action.

const SKY_TOP = new THREE.Color(0x1fa9f2)
const SKY_MID = new THREE.Color(0x49d0fb)
const SKY_HORIZON = new THREE.Color(0xc6f3ff)

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
        col += vec3(1.0, 0.96, 0.85) * (pow(sd, 900.0) * 4.0 + pow(sd, 60.0) * 0.25 + pow(sd, 6.0) * 0.08);
        if (uClouds > 0.5 && y > 0.02) {
          vec2 p = vDir.xz / (y + 0.1) * 1.3 + uDrift;
          float c = fbm(p);
          float cov = smoothstep(0.62, 0.82, c) * smoothstep(0.03, 0.3, y);
          float shade = smoothstep(0.6, 0.95, fbm(p * 1.4 + 3.0));
          vec3 cc = mix(vec3(1.0), vec3(0.8, 0.88, 0.95), shade * 0.6);
          col = mix(col, cc, cov * 0.92);
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
  private seaMat: THREE.ShaderMaterial

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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5f8f2c }))
    ground.position.y = -2
    envScene.add(ground)
    scene.environment = pm.fromScene(envScene, 0.04).texture
    scene.environmentIntensity = 0.55
    pm.dispose()

    this.sun = new THREE.DirectionalLight(0xfff4e0, 3.4)
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
    scene.add(new THREE.HemisphereLight(0xbff0ff, 0x6d8f35, 0.35))
    scene.fog = new THREE.FogExp2(0xbdefff, 0.00055)

    // Tropical sea out to the horizon, below the course.
    this.seaMat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uSun: { value: this.sunDir }, uDeep: { value: new THREE.Color(0x0a8fb8) }, uShallow: { value: new THREE.Color(0x3fe0e0) }, uSky: { value: SKY_HORIZON } },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uSky; varying vec3 vW;
        void main(){
          vec2 p = vW.xz * 0.05; float t = uTime * 0.6;
          vec2 g = vec2(sin(p.x*3.0 + t) + sin(p.x*7.1 + p.y*3.3 + t*1.7)*0.5, cos(p.y*2.7 - t) + cos(p.y*6.3 - p.x*2.9 + t*1.3)*0.5) * 0.05;
          vec3 nrm = normalize(vec3(g.x, 1.0, g.y));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);
          float d = length(vW.xz);
          vec3 col = mix(uShallow, uDeep, smoothstep(700.0, 1800.0, d));
          col = mix(col, uSky, fres * 0.8);
          vec3 R = reflect(-V, nrm);
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(R, uSun), 0.0), 250.0) * 2.0;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), this.seaMat)
    sea.position.y = -3
    scene.add(sea)
  }

  follow(focus: THREE.Vector3) {
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150)
    this.sun.target.position.copy(focus)
  }

  update(t: number, wind: THREE.Vector2, cam: THREE.Camera) {
    this.skyMat.uniforms.uDrift.value.addScaledVector(wind, 0.0004)
    this.seaMat.uniforms.uTime.value = t
    this.sky.position.copy(cam.position)
  }
}
