// Main-menu backdrop: a live 3D vignette of the GOP fence line at night —
// sweeping searchlight, snowfall, distant artillery glow, slow camera dolly.
import * as THREE from 'three';
import { Sky } from '../render/Sky.js';
import { Weather } from '../render/Effects.js';
import { World } from './World.js';
import { Props } from './Props.js';
import { pbr } from '../render/TextureFactory.js';
import { audio } from '../audio/AudioEngine.js';

export function buildMenuScene(renderer) {
  const scene = renderer.scene; const cam = renderer.camera;
  const world = new World();
  const hf = (x, z) => Math.sin(x * 0.05) * 1.2 + Math.cos(z * 0.04 + x * 0.02) * 1.5 + Math.max(0, -z - 40) * 0.25;
  world.setTerrain(hf);
  const props = new Props(scene, world);
  scene.fog = new THREE.FogExp2(0x1a2029, 0.018);
  const sky = new Sky(scene, { zenith: 0x060a12, horizon: 0x2a3140, stars: 0.8, sunDir: [-0.4, 0.35, -0.8], sunColor: 0xbfd0ff, sunSize: 0.9997 });
  sky.uniforms.glow.value = 0.9; sky.uniforms.glowDir.value.set(0.3, 0, -1);
  scene.add(new THREE.HemisphereLight(0x6a7a96, 0x1a1c20, 0.6));
  const moon = new THREE.DirectionalLight(0xaabbe0, 0.9); moon.position.set(-30, 40, -40); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 150 }); scene.add(moon);
  const g = new THREE.PlaneGeometry(240, 240, 120, 120); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, hf(pos.getX(i), pos.getZ(i))); g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
  const terrain = new THREE.Mesh(g, pbr('snowground')); terrain.receiveShadow = true; scene.add(terrain);
  props.fence(-80, -20, 80, -20);
  const t1 = props.watchtower(-12, -14); props.watchtower(38, -14, { light: false });
  props.sandbagWall(5, -10, 4, 3); props.sandbagWall(-25, -12, 3, 3);
  props.pineForest(Array.from({ length: 60 }, () => ({ x: (Math.random() - 0.5) * 200, z: -30 - Math.random() * 80 })));
  props.pineForest(Array.from({ length: 20 }, () => ({ x: (Math.random() < .5 ? -1 : 1) * (30 + Math.random() * 60), z: Math.random() * 40 })));
  props.sign(-4, -17, '경고', { sub: '민간인 출입 통제 구역 · 지뢰 지대', rotY: 0 });
  const lamp = props.streetLamp(14, -8);
  const weather = new Weather(scene, 'snow', 0.8);
  let flashT = 2;
  const flash = new THREE.PointLight(0xff8840, 0, 400, 1.5); flash.position.set(60, 20, -180); scene.add(flash);
  return {
    update(dt, t) {
      const a = t * 0.03;
      cam.position.set(Math.sin(a) * 6 + 2, 2.2 + Math.sin(t * 0.2) * 0.15, 18 + Math.cos(a) * 3);
      cam.lookAt(6, 3.5, -30);
      sky.update(dt, cam); weather.update(dt, cam.position);
      for (const p of props.animated) p.update(dt, t);
      flashT -= dt;
      if (flashT < 0) { flashT = 2 + Math.random() * 5; flash.intensity = 300 + Math.random() * 600; sky.uniforms.glow.value = 2.5; if (Math.random() < 0.7) audio.distantArtillery(); }
      flash.intensity *= Math.exp(-dt * 6); sky.uniforms.glow.value += (0.9 - sky.uniforms.glow.value) * dt * 2;
    },
  };
}
