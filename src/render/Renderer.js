// Renderer: WebGL2 + PBR + shadows + post-processing chain
// (RenderPass -> UnrealBloom -> cinematic grade [grain, vignette, damage, flash, letterbox] -> OutputPass)
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
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

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.fx = { damage: 0, flash: 0, desat: 0, letterbox: 0, aberration: 0, blur: 0 };
    this.applySettings();
    addEventListener('resize', () => this.resize());
    events.on('settings:changed', () => this.applySettings());
    this.info = this.renderer.info;
  }

  applySettings() {
    const g = settings.data.graphics;
    this.camera.fov = g.fov; this.camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = g.shadows !== 'off';
    this.shadowSize = { off: 512, medium: 1024, high: 2048, ultra: 4096 }[g.shadows] || 2048;
    this.bloom.enabled = !!g.post;
    this.postEnabled = !!g.post;
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
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = this.camera.aspect; this.vmCamera.updateProjectionMatrix();
  }
  render(dt, time, showViewmodel = true) {
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
