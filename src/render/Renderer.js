// Renderer: WebGL2 + PBR + shadows + post-processing chain
// (RenderPass into an MSAA half-float target -> GTAO ambient occlusion -> UnrealBloom ->
//  cinematic grade [grain, vignette, damage, flash, letterbox] -> OutputPass)
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const DistanceBlurShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, cameraNear: { value: 0.05 }, cameraFar: { value: 1500 }, reversed: { value: 0 }, start: { value: 150 }, end: { value: 600 }, radius: { value: 2.5 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float cameraNear, cameraFar, reversed, start, end, radius; uniform vec2 resolution; varying vec2 vUv;
    float lin(float d) { if (reversed > 0.5) return cameraNear * cameraFar / ((cameraFar - cameraNear) * d + cameraNear); float z = d * 2.0 - 1.0; return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear)); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv); float k = smoothstep(start, end, lin(texture2D(tDepth, vUv).x));
      if (k < 0.01) { gl_FragColor = c; return; }
      vec2 px = radius * k / resolution; vec4 s = c * 2.0; float w = 2.0;
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; vec2 o = vec2(cos(a), sin(a)) * px;
        float kk = smoothstep(start, end, lin(texture2D(tDepth, vUv + o).x)); s += texture2D(tDiffuse, vUv + o) * kk; w += kk; }
      gl_FragColor = s / w;
    }`,
};
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from '../core/Settings.js';
import { events } from '../core/Events.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    grain: { value: 0.05 }, vignette: { value: 0.35 },
    damage: { value: 0 }, flash: { value: 0 }, desat: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, letterbox: { value: 0 }, aberration: { value: 0 },
    blur: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, damage, flash, desat, letterbox, aberration, blur; uniform vec3 tint;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      float ab = aberration * 0.006 + damage * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      if (blur > 0.0) {
        vec3 acc = col; float o = blur * 0.004;
        acc += texture2D(tDiffuse, uv + vec2(o,0)).rgb; acc += texture2D(tDiffuse, uv - vec2(o,0)).rgb;
        acc += texture2D(tDiffuse, uv + vec2(0,o)).rgb; acc += texture2D(tDiffuse, uv - vec2(0,o)).rgb;
        col = acc / 5.0;
      }
      // grade: slight teal shadows / warm highlights, contrast
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(col, vec3(l), desat + damage * 0.35);
      col *= tint;
      col = mix(col * vec3(0.94,1.0,1.04), col * vec3(1.05,1.0,0.94), smoothstep(0.2, 0.8, l));
      // damage vignette (red-free, non-gore: dark desaturated edges + pulse)
      float d = length(c);
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      col = mix(col, col * vec3(0.55,0.42,0.40), damage * smoothstep(0.25, 0.75, d));
      col += flash;
      col += (rand(uv * (time * 0.001 + 1.0)) - 0.5) * grain;
      if (abs(c.y) > 0.5 - letterbox * 0.12) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false, reversedDepthBuffer: true });
    // reversed depth (+ a float depth buffer below): even precision from 0.05 m to 6 km, so big maps (Seoul) don't
    // z-fight / flicker on ground layers and facades at distance. Falls back to normal depth without EXT_clip_control.
    this.reversedDepth = this.renderer.capabilities.reversedDepthBuffer === true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 1500);
    this.scene.add(this.camera);
    // viewmodel layer rendered in a second pass with its own camera (no clipping into walls)
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(this.vmCamera);
    // image-based lighting so metallic PBR surfaces have something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.vmScene.environment = this.envMap; this.vmScene.environmentIntensity = 0.55;

    // the composer's own target would drop the canvas' antialiasing, so the scene renders into a
    // multisampled one (samples follow graphics.aa)
    this.sceneTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.sceneTarget.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight, THREE.FloatType);   // read by the distance blur; float for reversed depth
    this.composer = new EffectComposer(this.renderer, this.sceneTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // ambient occlusion: darkens creases, corners, the ground under props and people (off on low/medium)
    this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.ao.output = GTAOPass.OUTPUT.Default; this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // smoke, fire, glass, water, decals and sprites must not occlude in the AO depth/normal pass
    this.ao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverseVisible((o) => {
        const m = o.material; const soft = m && (Array.isArray(m) ? m.some((x) => x.transparent || !x.depthWrite) : (m.transparent || !m.depthWrite));
        if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || (o.isMesh && soft)) cache.push(o);
      });
      for (const o of cache) o.visible = false;
    };
    this.composer.addPass(this.ao);
    // distance blur: far pixels (by scene depth) are softened, near ones untouched. Off unless a level turns it
    // on (setDistanceBlur); levels pair it with distance culling of small detail, which the blur hides
    this.dblur = new ShaderPass(DistanceBlurShader); this.dblur.enabled = false; this.composer.addPass(this.dblur);
    { const rp = this.renderPass, orig = rp.render.bind(rp), self = this; rp.render = function (r, w, rb, ...a) { self._depthRT = rb; return orig(r, w, rb, ...a); };
      const db = this.dblur, dorig = db.render.bind(db); db.render = function (r, w, rb, ...a) { const u = db.uniforms; u.tDepth.value = self._depthRT?.depthTexture ?? null; u.cameraNear.value = self.camera.near; u.cameraFar.value = self.camera.far; u.reversed.value = self.reversedDepth ? 1 : 0; u.resolution.value.set(rb.width, rb.height); return dorig(r, w, rb, ...a); }; }
    // clamp HDR before the bloom: a sun glint on glass / a metal roof is 10-50x brighter than white and the bloom
    // turned it into a screen-wide white flash for a frame while the camera moved. Above ~3 the tone map is white anyway.
    this.clampPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, maxL: { value: 3.0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float maxL; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); float m = max(c.r, max(c.g, c.b)); if (!(m < 1e6)) c.rgb = vec3(0.0); else if (m > maxL) c.rgb *= maxL / m; gl_FragColor = c; }' });
    this.composer.addPass(this.clampPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.fx = { damage: 0, flash: 0, desat: 0, letterbox: 0, aberration: 0, blur: 0 };
    this.applySettings();
    addEventListener('resize', () => this.resize());
    events.on('settings:changed', () => this.applySettings());
    this.info = this.renderer.info; this.renderer.info.autoReset = false;   // counted over the whole frame (scene + post passes + viewmodel), reset in render()
  }

  // opts: { start, end (metres), radius (px) } or null to switch it off
  setDistanceBlur(opts) {
    this.dblur.enabled = !!opts; if (!opts) return;
    const u = this.dblur.uniforms; u.start.value = opts.start ?? 150; u.end.value = opts.end ?? 600; u.radius.value = opts.radius ?? 2.5;
  }
  applySettings() {
    const g = settings.data.graphics;
    this.camera.fov = g.fov; this.camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = g.shadows !== 'off';
    this.shadowSize = { off: 512, medium: 1024, high: 2048, ultra: 4096 }[g.shadows] || 2048;
    this.bloom.enabled = !!g.post;
    this.postEnabled = !!g.post;
    const samples = g.aa ?? 4;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    this.ao.enabled = (g.ao || 'off') !== 'off';
    this.aoScale = g.ao === 'high' ? 1 : 0.5;
    this.resize();
    events.emit('render:quality', g);
  }
  resize() {
    const g = settings.data.graphics;
    const scale = Math.min(2, (window.devicePixelRatio || 1)) * (g.renderScale || 1);
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(scale);
    this.composer.setSize(innerWidth, innerHeight);
    if (this.ao) this.ao.setSize(Math.round(innerWidth * scale * (this.aoScale ?? 1)), Math.round(innerHeight * scale * (this.aoScale ?? 1)));
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = this.camera.aspect; this.vmCamera.updateProjectionMatrix();
  }
  render(dt, time, showViewmodel = true) {
    this.renderer.info.reset();
    const u = this.grade.uniforms;
    u.time.value = time; u.damage.value = this.fx.damage; u.flash.value = this.fx.flash; u.desat.value = this.fx.desat;
    u.letterbox.value = this.fx.letterbox; u.aberration.value = this.fx.aberration; u.blur.value = this.fx.blur;
    u.grain.value = this.postEnabled ? 0.045 : 0; u.vignette.value = this.postEnabled ? 0.38 : 0.2;
    this.fx.flash = Math.max(0, this.fx.flash - dt * 2.5);
    this.fx.aberration = Math.max(0, this.fx.aberration - dt * 1.5);
    this.fx.blur = Math.max(0, this.fx.blur - dt * 0.6);
    this.composer.render(dt);
    if (showViewmodel) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      const tm = this.renderer.toneMapping;
      this.renderer.render(this.vmScene, this.vmCamera);
      this.renderer.toneMapping = tm;
      this.renderer.autoClear = true;
    }
  }
  clearScene() {
    const dispose = (o) => {
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
      });
    };
    for (const c of [...this.scene.children]) { if (c !== this.camera) { dispose(c); this.scene.remove(c); } }
    for (const c of [...this.camera.children]) this.camera.remove(c);
    for (const c of [...this.vmScene.children]) { if (c !== this.vmCamera) this.vmScene.remove(c); }
    this.scene.fog = null; this.scene.background = null; this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.2;
  }
}
