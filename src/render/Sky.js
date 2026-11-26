// Procedural sky dome (time-of-day gradient, stars, moon/sun, distant battle glow)
import * as THREE from 'three';

export class Sky {
  constructor(scene, opts = {}) {
    this.uniforms = {
      zenith: { value: new THREE.Color(opts.zenith ?? 0x0b1220) },
      horizon: { value: new THREE.Color(opts.horizon ?? 0x3a4250) },
      ground: { value: new THREE.Color(opts.groundColor ?? 0x15171a) },
      sunDir: { value: new THREE.Vector3(...(opts.sunDir ?? [0.3, 0.25, -0.9])).normalize() },
      sunColor: { value: new THREE.Color(opts.sunColor ?? 0xdfe8ff) },
      sunSize: { value: opts.sunSize ?? 0.9994 },
      stars: { value: opts.stars ?? 0.6 },
      glowDir: { value: new THREE.Vector3(0, 0, -1) },
      glowColor: { value: new THREE.Color(0xff7a30) },
      glow: { value: 0 },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); 
#ifdef USE_REVERSED_DEPTH_BUFFER
 gl_Position = vec4(p.xy, 0.0, p.w);
#else
 gl_Position = p.xyww;
#endif
}`,
      fragmentShader: `
        uniform vec3 zenith, horizon, ground, sunDir, sunColor, glowDir, glowColor; uniform float sunSize, stars, glow, time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, zenith, pow(clamp(h,0.0,1.0), 0.55));
          col = mix(col, ground, smoothstep(0.0, -0.12, h));
          float s = dot(d, sunDir);
          col += sunColor * smoothstep(sunSize, sunSize + 0.0004, s) * 2.5;
          col += sunColor * pow(max(s,0.0), 64.0) * 0.25;
          // stars
          vec3 sp = floor(d * 380.0);
          float st = step(0.9975, hash(sp)) * stars * smoothstep(0.05, 0.4, h);
          st *= 0.6 + 0.4 * sin(time * 2.0 + hash(sp+1.0) * 40.0);
          col += vec3(st);
          // distant battle glow on horizon
          float gd = max(dot(normalize(vec3(d.x,0.0,d.z)), normalize(vec3(glowDir.x,0.0,glowDir.z))), 0.0);
          col += glowColor * glow * pow(gd, 6.0) * smoothstep(0.35, 0.0, abs(h - 0.02));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000; this.mesh.userData.dynamic = true;
    scene.add(this.mesh);
  }
  update(dt, camera) {
    this.uniforms.time.value += dt;
    this.mesh.position.copy(camera.position);
  }
}
