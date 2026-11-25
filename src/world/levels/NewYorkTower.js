// Level: New York, Mission 07 (CLOSE QUARTERS). 18:05 EST, sleet at dusk. Every name here is fictional.
//
// Separate "plates" at ground level (the nav grid is 2.5D), only the current one is drawn (setArea):
//   street   x -160..120   the avenue (x -9..9, north = -z), Asher Tower on the east side (x 15..55, z -20..20)
//                          with its lobby, a café on the west side, a cross street at z 34..46, the garage ramp z 22..32
//   office   x 200..240    Asher Tower, 32nd floor (the same footprint, shifted): open-plan desks, glass meeting
//                          rooms, the core (elevators west, freight elevator south), the server room north-east.
//                          The skyline backdrop is lowered 128 m so the street lies far below the windows.
//   shaft    x 398..402    the freight elevator shaft (car top rides from y 46 to 0), landings at y 31 and 15
//   subway   x 402..1045   service corridor → maintenance platform (z 8..14) → tunnel (z 14..26, track bed -1.1,
//                          track A z 16.6 / track B z 22.4, steel columns between) → the disused Hollis St station
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { Weather } from '../../render/Effects.js';
import { settings } from '../../core/Settings.js';
import { signTexture } from '../CityProps.js';
import { buildCar } from '../korea/Cars.js';
import { wreck } from '../../render/Destruction.js';
import { Crowd } from '../city/Crowd.js';
import * as SK from '../city/SignKit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seedN = 17; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);

export const NY = {
  bounds: { minX: -160, maxX: 1060, minZ: -160, maxZ: 160 },
  ave: { x0: -9, x1: 9 }, walk: 6, cross: { z0: 34, z1: 46 },
  tower: { x0: 15, x1: 55, z0: -20, z1: 20, H: 152 },
  lobby: { x0: 15, x1: 42, z0: -19.6, z1: 19.6, h: 9 }, lobbyDoor: V(15, 0, 0),
  elevators: [V(41.4, 0, -7.5), V(41.4, 0, -2.5), V(41.4, 0, 2.5), V(41.4, 0, 7.5)],
  cafe: { x0: -27, x1: -15, z0: -48, z1: -32 }, cafeDoor: V(-15, 0, -40),
  ramp: { x0: 15, x1: 22, z0: 23, z1: 32 },
  start: V(-12, 0, -112),
  // 32F (same footprint shifted by OFF_DX); floor at y 0
  off: { x0: 200, x1: 240, z0: -20, z1: 20, h: 3.7 }, core: { x0: 214, x1: 228, z0: -7, z1: 7 },
  server: { x0: 230, x1: 239.6, z0: -19.6, z1: -9 }, serverDoor: V(230, 0, -12),
  liftOut: V(212, 0, -2), freightDoor: V(224, 0, 7.4), stairDoor: V(221, 0, -7.4),
  shaft: { x0: 398.3, x1: 401.7, z0: -1.7, z1: 1.7, top: 46 }, landings: [31, 15],
  plat: { x0: 405, x1: 470, z0: 8, z1: 14 }, tun: { x0: 404, x1: 1045, z0: 14, z1: 26 }, trackA: 16.6, trackB: 22.4, bed: -1.1,
  station: { x0: 960, x1: 1030, z0: 8, z1: 14 },
};
export const OFF_DX = 185;   // street → 32F shift (the office plate is the tower footprint moved east)
const OFF_DY = -128;         // the street lies this far below the 32nd floor

const cache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); return t;
}
// night facades: 8 bays x 8 floors per tile (24 m x 30.4 m); stone grid, ribbon glass or curtain wall.
// The emissive map lights offices (warm / cool, some floors dark, some blinds half down).
const FAC = [
  { kind: 'stone', wall: '#8a8278', glass: '#1a2028' }, { kind: 'stone', wall: '#6e6a66', glass: '#161c22' },
  { kind: 'curtain', wall: '#3a4650', glass: '#1c2834' }, { kind: 'curtain', wall: '#2c3036', glass: '#141a20' },
  { kind: 'ribbon', wall: '#9a9488', glass: '#182028' }, { kind: 'brick', wall: '#6a4a3c', glass: '#1a1a1e' },
];
function nightFacade(k) {
  const f = FAC[k % FAC.length]; const lit = [];
  let s = 1000 + k * 97; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const map = canvasTex(`nyf${k}`, 512, 512, (g, W, H) => {
    g.fillStyle = f.wall; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * W, r() * H, 2, 2); }
    const bw = W / 8, fh = H / 8;
    for (let fl = 0; fl < 8; fl++) {
      const floorDark = r() < 0.18;
      for (let b = 0; b < 8; b++) {
        let x, y, w, h;
        if (f.kind === 'curtain') { x = b * bw + 2; y = fl * fh + 2; w = bw - 4; h = fh * 0.78; }
        else if (f.kind === 'ribbon') { x = b * bw; y = fl * fh + fh * 0.3; w = bw; h = fh * 0.5; }
        else { x = b * bw + bw * 0.2; y = fl * fh + fh * 0.18; w = bw * 0.6; h = fh * 0.6; }
        g.fillStyle = f.glass; g.fillRect(x, y, w, h);
        const on = !floorDark && r() < 0.62; const warm = r() < 0.55; const blind = r() < 0.35 ? r() * 0.6 : 0;
        lit.push({ x, y, w, h, on, warm, blind, dim: 0.55 + r() * 0.45 });
        if (blind) { g.fillStyle = 'rgba(180,176,166,0.5)'; g.fillRect(x, y, w, h * blind); }
        if (f.kind === 'curtain') { g.fillStyle = 'rgba(160,170,180,0.6)'; g.fillRect(x - 2, y, 2, fh); }
      }
      if (f.kind === 'curtain') { g.fillStyle = '#2a2e32'; g.fillRect(0, fl * fh + fh * 0.8, W, fh * 0.2); }
      if (f.kind === 'brick') { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = fl * fh; y < (fl + 1) * fh; y += 5) g.fillRect(0, y, W, 1); }
    }
  });
  const emissive = canvasTex(`nyfe${k}`, 512, 512, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const L of lit) {
      if (!L.on) continue;
      const c = L.warm ? [255, 200, 130] : [200, 225, 255]; const a = L.dim;
      const gr = g.createLinearGradient(0, L.y, 0, L.y + L.h); gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); gr.addColorStop(1, `rgba(${c[0] * 0.6 | 0},${c[1] * 0.6 | 0},${c[2] * 0.6 | 0},${a * 0.8})`);
      g.fillStyle = gr; g.fillRect(L.x + 1, L.y + L.h * L.blind + 1, L.w - 2, L.h * (1 - L.blind) - 2);
      g.fillStyle = `rgba(255,255,250,${a * 0.5})`; g.fillRect(L.x + 1, L.y + 1, L.w - 2, 2);   // ceiling light strip
    }
  });
  return { map, emissive };
}
const facadeMat = (k, strength = 1) => { const t = nightFacade(k); return new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissive, emissiveIntensity: 0.9 * strength, roughness: 0.35, metalness: 0.25 }); };
// box with UVs in metres / tile size (u along the face, v up); faces: +x -x +y -y +z -z
function boxUV(w, h, d, um = 24, vm = 30.4) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * spans[f][0] / um, uv.getY(k) * spans[f][1] / vm); }
  return g;
}
const asphaltTex = () => canvasTex('nyasph', 512, 512, (g, W, H) => {
  g.fillStyle = '#3c3c3e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(20,20,22,0.35)'; g.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 80, 20 + Math.random() * 60); }   // patches
});
const wetRough = () => canvasTex('nywet', 256, 256, (g, W, H) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H); for (let i = 0; i < 40; i++) { const r = 10 + Math.random() * 40, x = Math.random() * W, y = Math.random() * H, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,10,10,0.9)'); gr.addColorStop(1, 'rgba(10,10,10,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }, false);
const slabTex = () => canvasTex('nyslab', 256, 256, (g, W, H) => { g.fillStyle = '#8e8c88'; g.fillRect(0, 0, W, H); for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); } g.fillStyle = 'rgba(40,40,40,0.5)'; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, H); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(W * 0.3, H * 0.6, 20, 10); });
const marbleTex = () => canvasTex('nymarble', 512, 512, (g, W, H) => {
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(120,110,100,${0.1 + Math.random() * 0.2})`; g.lineWidth = 0.5 + Math.random() * 1.5; g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - 0.3) * 60; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = 'rgba(60,56,50,0.4)'; for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 2, H); for (let y = 0; y < H; y += 128) g.fillRect(0, y, W, 2);
});
const carpetTex = () => canvasTex('nycarpet', 256, 256, (g, W, H) => { g.fillStyle = '#3a3e44'; g.fillRect(0, 0, W, H); for (let i = 0; i < 20000; i++) { const v = 40 + Math.random() * 30; g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.5)`; g.fillRect(Math.random() * W, Math.random() * H, 1, 1); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, H); });
const tileTex = () => canvasTex('nytile', 256, 256, (g, W, H) => { g.fillStyle = '#d6d0bc'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < W; x += 32) { g.fillStyle = `rgba(${200 + Math.random() * 30},${190 + Math.random() * 30},${160 + Math.random() * 30},1)`; g.fillRect(x + 1, y + 1, 30, 14); } for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(60,50,30,${Math.random() * 0.15})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); } for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(70,60,40,0.18)'; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 4, 30 + Math.random() * 80); } });
const sootTex = () => canvasTex('nysoot', 256, 256, (g, W, H) => { g.fillStyle = '#4a4642'; g.fillRect(0, 0, W, H); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '120,110,100'},${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); } for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,18,16,0.2)'; g.fillRect(Math.random() * W, 0, 3 + Math.random() * 10, H); } });
const screenTex = (k) => canvasTex(`nyscr${k}`, 128, 80, (g, W, H) => { g.fillStyle = ['#0e2238', '#14181c', '#1c2a1e', '#22140e'][k % 4]; g.fillRect(0, 0, W, H); for (let y = 6; y < H - 4; y += 6) { g.fillStyle = `rgba(${k % 2 ? '120,200,255' : '200,230,200'},${0.3 + Math.random() * 0.5})`; g.fillRect(6, y, 20 + Math.random() * 90, 2); } });

// a lit shop interior behind the glass: back shelves, counters, a few people-shaped shadows
const shopTex = (k) => canvasTex(`nyshop${k % 6}`, 256, 128, (g, W, H) => {
  const warm = k % 3 !== 1; g.fillStyle = warm ? '#5a4a36' : '#46505a'; g.fillRect(0, 0, W, H);
  g.fillStyle = warm ? '#e8c890' : '#d8e4ec'; g.fillRect(0, 0, W, 10);
  for (let y = 22; y < H - 30; y += 18) { g.fillStyle = 'rgba(30,24,18,0.5)'; g.fillRect(8, y, W - 16, 3); for (let x = 10; x < W - 12; x += 7 + Math.random() * 6) { g.fillStyle = `hsl(${Math.random() * 360},${30 + Math.random() * 30}%,${35 + Math.random() * 30}%)`; g.fillRect(x, y - 10, 5, 10); } }
  g.fillStyle = 'rgba(20,16,12,0.7)'; g.fillRect(W * 0.55, H - 34, W * 0.4, 34);
  for (let i = 0; i < 2; i++) { const x = 30 + Math.random() * (W - 60); g.fillStyle = 'rgba(10,8,6,0.55)'; g.fillRect(x, H - 60, 14, 60); g.beginPath(); g.arc(x + 7, H - 66, 7, 0, 6.3); g.fill(); }
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
});

export class NewYorkTower {
  constructor(game) { this.game = game; this.anchors = []; this.panes = []; this.area = null; this.areaMeshes = null; }

  async build() {
    const g = this.game, w = g.world; seedN = 17;
    w.bounds = { ...NY.bounds };
    const T = NY.tun;
    w.setTerrain((x, z) => (x > T.x0 && x < T.x1 && z > T.z0 && z < T.z1 ? NY.bed : 0), () => 'concrete');
    this.hf = w.heightFn;
    this.mats();
    this.atmosphere();
    this.skyline();
    this.street();
    this.streetDetail();
    this.towerExterior();
    this.lobby();
    this.office();
    this.shaftBuild();
    this.subway();
    this.lightsInit();
    g.renderer.camera.far = 2600; g.renderer.camera.updateProjectionMatrix();
    w.ladders = [];
  }

  mats() {
    const M = this.M = {};
    const at = asphaltTex(), wr = wetRough();
    M.asph = new THREE.MeshStandardMaterial({ map: at, roughnessMap: wr, roughness: 0.45, metalness: 0.2, color: 0x8a8a8c });
    M.walk = new THREE.MeshStandardMaterial({ map: slabTex(), roughnessMap: wr, roughness: 0.55, metalness: 0.1 });
    M.curb = new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 0.7 });
    M.conc = pbr('concrete', { color: 0x8a8884, key: 'ny_conc' });
    M.concDark = pbr('concrete', { color: 0x55524e, key: 'ny_concd' });
    M.metal = pbr('metal', { color: 0x7a7e82, key: 'ny_metal' });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.6, roughness: 0.55 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7 });
    M.marble = new THREE.MeshStandardMaterial({ map: marbleTex(), roughness: 0.18, metalness: 0.05 });
    M.granite = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.25, metalness: 0.1 });
    M.bronze = new THREE.MeshStandardMaterial({ color: 0x6a5236, metalness: 0.8, roughness: 0.35 });
    M.carpet = new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 });
    M.ceiling = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.9 });
    M.panel = new THREE.MeshBasicMaterial({ color: 0xb8bec4 });
    M.desk = new THREE.MeshStandardMaterial({ color: 0xa8a296, roughness: 0.5 });
    M.deskLeg = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.5, roughness: 0.5 });
    M.chair = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.8 });
    M.wall = new THREE.MeshStandardMaterial({ color: 0xc8c6c0, roughness: 0.85 });
    M.wood = pbr('wood', { color: 0x6a5240, key: 'ny_wood' });
    M.glass = new THREE.MeshStandardMaterial({ color: 0xa8c0c8, transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    M.glass.userData.noBatch = true;
    M.mullion = new THREE.MeshStandardMaterial({ color: 0x2a2e32, metalness: 0.6, roughness: 0.4 });
    M.tile = new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.35 });
    M.soot = new THREE.MeshStandardMaterial({ map: sootTex(), roughness: 0.95 });
    M.rail = new THREE.MeshStandardMaterial({ color: 0x8a8682, metalness: 0.9, roughness: 0.3 });
    M.tie = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.95 });
    M.ballast = new THREE.MeshStandardMaterial({ color: 0x343230, roughness: 1 });
    M.lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    M.workGlow = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
    M.red = new THREE.MeshBasicMaterial({ color: 0xff2a18, toneMapped: false });
    M.green = new THREE.MeshBasicMaterial({ color: 0x3aff6a, toneMapped: false });
    M.yellow = new THREE.MeshStandardMaterial({ color: 0xd8a818, roughness: 0.5, metalness: 0.2 });
    M.rack = new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.5, roughness: 0.4 });
    M.led = new THREE.MeshBasicMaterial({ color: 0x40c0ff, toneMapped: false });
    M.facade = FAC.map((_, k) => facadeMat(k));
    M.roof = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 });
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    this.fogStreet = new THREE.FogExp2(0x4a5260, 0.0062);
    this.fogHigh = new THREE.FogExp2(0x505a68, 0.0032);
    this.fogUnder = new THREE.FogExp2(0x0c0b0a, 0.035);
    scene.fog = this.fogStreet;
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.35;
    // overcast dusk: a slate zenith, a dirty orange glow at the horizon (city light under the sleet clouds)
    this.sky = new Sky(scene, { zenith: 0x1c2230, horizon: 0x6a5a52, stars: 0, sunDir: [0.6, 0.08, 0.7], sunColor: 0x9a8070, sunSize: 0.9999 });
    this.hemi = new THREE.HemisphereLight(0x8a94a8, 0x3a3430, 0.75); scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xb0b8c8, 0.5); const sh = settings.data.graphics.shadows;
    key.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    key.shadow.mapSize.set(size, size); Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key); scene.add(key.target); g.sun = key; g.sunOffset = V(-30, 70, 25); this.key = key;
    g.renderer.renderer.toneMappingExposure = 1.2;
    g.effects.setSmokeLight(0.5);
    // sleet: fast wet streaks plus slower grains
    this.rain = new Weather(scene, 'rain', 0.4); this.rain.mat.opacity = 0.2;
    this.snow = new Weather(scene, 'snow', 0.35);
  }

  // ---------------- the city around: one merged mesh per facade type (never batched, moved for the 32F view) ----------------
  skyline() {
    const scene = this.game.renderer.scene, M = this.M; const C = V(35, 0, 0);
    const per = FAC.map(() => []), roofs = [], fill = FAC.map(() => []), fillRoofs = [];
    const put = (x, z, w, d, h, k, lists, rl) => {
      const geo = boxUV(w, h, d).translate(x, h / 2, z); lists[k].push(geo);
      rl.push(new THREE.BoxGeometry(w * 0.6, 4 + rnd() * 6, d * 0.6).translate(x + (rnd() - 0.5) * w * 0.2, h + 2, z));   // rooftop plant / water tank
    };
    // far city: a grid of blocks (street every ~60 / 80 m) with mid- and high-rises; taller toward the north (midtown)
    for (let gx = -900; gx <= 1000; gx += 62) for (let gz = -1000; gz <= 1000; gz += 82) {
      const d0 = Math.hypot(gx + 31 - C.x, gz + 41 - C.z); if (d0 < 150 || d0 > 1300) continue;
      if (gx + 62 > -12 && gx < 12) continue;   // keep the avenue open
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = 18 + rnd() * 22, d = 22 + rnd() * 36, x = gx + 6 + w / 2 + rnd() * (50 - w), z = gz + 6 + d / 2 + rnd() * (70 - d);
        const north = Math.max(0, -z) / 1000; const h = 30 + rnd() * 90 + (rnd() < 0.25 + north * 0.4 ? 80 + rnd() * 220 * (0.5 + north) : 0);
        put(x, z, w, d, h, Math.floor(rnd() * FAC.length), per, roofs);
      }
    }
    // the low blocks right around the tower, only shown from the 32nd floor (the street plate has the real ones)
    for (let gx = -150; gx <= 140; gx += 31) for (let gz = -150; gz <= 150; gz += 41) {
      if (gx + 31 > -15 && gx < 15) continue; if (gx + 31 > 12 && gx < 58 && gz + 41 > -24 && gz < 24) continue;
      const w = 24 + rnd() * 4, d = 34 + rnd() * 4, h = 18 + rnd() * 70; put(gx + 15.5, gz + 20.5, w, d, h, Math.floor(rnd() * FAC.length), fill, fillRoofs);
    }
    const grp = new THREE.Group(); grp.userData.dynamic = true; grp.userData.skyline = true;
    per.forEach((L, k) => { if (!L.length) return; const m = new THREE.Mesh(mergeGeometries(L), M.facade[k]); m.receiveShadow = false; grp.add(m); });
    grp.add(new THREE.Mesh(mergeGeometries(roofs), M.roof));
    const fillGrp = new THREE.Group(); fill.forEach((L, k) => { if (L.length) fillGrp.add(new THREE.Mesh(mergeGeometries(L), M.facade[k])); }); fillGrp.add(new THREE.Mesh(mergeGeometries(fillRoofs), M.roof)); fillGrp.visible = false; grp.add(fillGrp);
    // the ground far below for the 32F view: streets as a dark plane with lines of street lights
    const gtex = canvasTex('nyground', 512, 512, (g2, W, H) => { g2.fillStyle = '#202224'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#3a3630'; for (let x = 0; x < W; x += 32) g2.fillRect(x, 0, 6, H); for (let y = 0; y < H; y += 42) g2.fillRect(0, y, W, 6); g2.fillStyle = '#ffc070'; for (let x = 0; x < W; x += 32) for (let y = 0; y < H; y += 10) g2.fillRect(x + 1, y, 2, 2); for (let y = 0; y < H; y += 42) for (let x = 0; x < W; x += 9) g2.fillRect(x, y + 1, 2, 2); });
    gtex.repeat.set(40, 40);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gtex, emissive: 0xffffff, emissiveMap: gtex, emissiveIntensity: 0.5, roughness: 0.9 }));
    ground.position.set(C.x, 0.05, C.z); ground.visible = false; grp.add(ground);
    scene.add(grp); this.skylineGrp = grp; this.skyFill = fillGrp; this.skyGround = ground;
  }

  // ---------------- the avenue ----------------
  street() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, props = this.game.props, N = NY;
    const plane = (x0, x1, z0, z1, mat, y = 0, um = 6) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / um, uv.getY(i) * (z1 - z0) / um); const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m; };
    plane(-160, 120, -160, 160, M.asph, 0.0, 9);
    // sidewalks (raised 15 cm) along both sides and the cross street
    const walk = (x0, x1, z0, z1) => { const h = 0.15; const m = new THREE.Mesh(boxUV(x1 - x0, h, z1 - z0, 3, 3), M.walk); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); w.addBox(V(x0, 0, z0), V(x1, h, z1), { surface: 'concrete' }); };
    const X = N.ave, C = N.cross;
    for (const [z0, z1] of [[-160, C.z0], [C.z1, 160]]) { walk(X.x0 - N.walk, X.x0, z0, z1); walk(X.x1, X.x1 + N.walk, z0, z1); }
    walk(-160, X.x0 - N.walk, C.z0 - 6, C.z0); walk(-160, X.x0 - N.walk, C.z1, C.z1 + 6); walk(X.x1 + N.walk, 120, C.z0 - 6, C.z0); walk(X.x1 + N.walk, 120, C.z1, C.z1 + 6);
    // lane markings: double yellow centre line, white lane dashes, crosswalks at the cross street
    const mark = (x, z, sx, sz, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })); m.position.set(x, 0.012, z); scene.add(m); };
    for (const s of [-0.12, 0.12]) mark(s, 0, 0.12, 320, 0xc8a020);
    for (let z = -158; z < 158; z += 9) for (const x of [-4.5, 4.5]) if (z + 3 < C.z0 - 4 || z > C.z1 + 4) mark(x, z, 0.12, 3, 0xd8d8d4);
    for (const z of [C.z0 - 2.5, C.z1 + 2.5]) for (let x = -8; x <= 8; x += 1.2) mark(x, z, 0.6, 4, 0xe0e0dc);
    for (let x = -60; x < -14; x += 9) mark(x, (C.z0 + C.z1) / 2, 3, 0.12, 0xd8d8d4);
    // buildings along the avenue (street plate): the west side all the way, the east side north and south of the tower
    const bldg = (x0, x1, z0, z1, h, k, shop = true) => {
      const W = x1 - x0, D = z1 - z0; const m = new THREE.Mesh(boxUV(W, h - 6, D), M.facade[k]); m.position.set((x0 + x1) / 2, 6 + (h - 6) / 2, (z0 + z1) / 2); m.castShadow = true; scene.add(m);
      // ground floor: stone base with shop windows facing the avenue
      const base = new THREE.Mesh(new THREE.BoxGeometry(W, 6, D), M.granite); base.position.set((x0 + x1) / 2, 3, (z0 + z1) / 2); scene.add(base);
      w.addBox(V(x0, 0, z0), V(x1, h, z1), { surface: 'concrete', walkable: false });
      if (shop) this.shopfronts(x0, x1, z0, z1);
      (this.bldgs ||= []).push({ x0, x1, z0, z1, h, k });
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), M.concDark); cornice.position.set((x0 + x1) / 2, 6, (z0 + z1) / 2); scene.add(cornice);
    };
    const wx1 = X.x0 - N.walk;   // west frontage x = -15
    let z = -160;
    for (const [len, h] of [[22, 64], [18, 40], [20, 92], [16, 34]]) { bldg(wx1 - 30, wx1, z, z + len, h, Math.floor(rnd() * 6)); z += len; }
    // the café block (z -48..-32) is lower, with the café on the ground floor
    bldg(wx1 - 30, wx1, -78, -48, 52, 4); bldg(wx1 - 30, N.cafe.x0, N.cafe.z0, N.cafe.z1, 38, 0, false); this.cafeFront();
    bldg(wx1 - 30, wx1, -32, -6, 70, 2); bldg(wx1 - 30, wx1, -6, 18, 46, 5); bldg(wx1 - 30, wx1, 18, C.z0 - 6, 58, 1);
    z = C.z1 + 6; for (const [len, h] of [[30, 60], [26, 84], [28, 40], [30, 66]]) { if (z >= 160) break; bldg(wx1 - 30, wx1, z, Math.min(160, z + len), h, Math.floor(rnd() * 6)); z += len; }
    const ex0 = X.x1 + N.walk;   // east frontage x = 15
    z = -160; for (const [len, h] of [[24, 72], [30, 50], [26, 110]]) { bldg(ex0, ex0 + 34, z, z + len, h, Math.floor(rnd() * 6)); z += len; }   // to z -80
    bldg(ex0, ex0 + 34, -80, -46, 60, 3); bldg(ex0, ex0 + 34, -46, -24, 40, 4);
    bldg(ex0 + 8, ex0 + 34, 32, C.z0 - 6, 30, 1, false);   // garage block south of the tower (ramp in front)
    z = C.z1 + 6; for (const [len, h] of [[34, 56], [40, 90], [40, 44]]) { if (z >= 160) break; bldg(ex0, ex0 + 34, z, Math.min(160, z + len), h, Math.floor(rnd() * 6)); z += len; }
    // fill behind the frontage so nothing looks hollow from the avenue
    for (const [x0, x1] of [[-160, wx1 - 30], [ex0 + 40, 120]]) for (let zz = -160; zz < 160; zz += 40) { if (zz + 40 > C.z0 - 6 && zz < C.z1 + 6) continue; const h = 30 + rnd() * 80; const m = new THREE.Mesh(boxUV(x1 - x0 - 2, h, 38), M.facade[Math.floor(rnd() * 6)]); m.position.set((x0 + x1) / 2, h / 2, zz + 20); scene.add(m); }
    // garage ramp down (visual: a dark sloped mouth under a concrete lintel)
    const R = N.ramp; const mouth = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4, 0.3), M.black); mouth.position.set(R.x0 + 4, 2, R.z1 - 0.2); scene.add(mouth);
    const lint = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.2, 0.6), M.concDark); lint.position.set(R.x0 + 4, 4.6, R.z1 - 0.2); scene.add(lint);
    const rsign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('PARKING', 'ASHER TOWER · P1–P3', '#1a1a1a', '#f0f0f0'), toneMapped: false })); rsign.position.set(R.x0 + 4, 4.6, R.z1 - 0.52); rsign.rotation.y = Math.PI; scene.add(rsign);
    const rampFloor = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 9).rotateX(-Math.PI / 2 - 0.12), M.concDark); rampFloor.position.set(R.x0 + 4, -0.5, (R.z0 + R.z1) / 2); scene.add(rampFloor);
    w.addBox(V(R.x0 + 8.2, 0, R.z0), V(R.x0 + 9, 4, R.z1), { surface: 'concrete', walkable: false });
    // street furniture: lamps, signals, hydrants, a newsstand, steam stacks, bins, scaffold, parked cars and cabs
    for (let zz = -150; zz < 160; zz += 26) for (const sx of [-1, 1]) { if (zz > C.z0 - 6 && zz < C.z1 + 6) continue; this.lamp(sx * 10.2, zz + (sx > 0 ? 13 : 0), sx > 0 ? Math.PI : 0); }
    for (const [x, zz, r] of [[-9.6, C.z0 - 1, 0], [9.6, C.z1 + 1, Math.PI], [9.6, C.z0 - 1, Math.PI], [-9.6, C.z1 + 1, 0]]) this.signal(x, zz, r);
    for (const [x, zz] of [[-10, -96], [10, -60], [-10, 12], [10, 56]]) { props.box(V(0.35, 0.8, 0.35), V(x, 0.55, zz), new THREE.MeshStandardMaterial({ color: 0xa02a1a, roughness: 0.5 }), { surface: 'metal' }); }
    const ns = props.box(V(2.4, 2.6, 1.6), V(-12.6, 1.45, -66), new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.6 }), { surface: 'metal' });
    const nsS = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('NEWS', 'COFFEE · LOTTO', '#1a3a2a', '#f0e8c0'), toneMapped: false })); nsS.position.set(-11.38, 2.4, -66); nsS.rotation.y = Math.PI / 2; scene.add(nsS);
    this.steamAt = [V(-3.5, 0, -88), V(4, 0, 18), V(-2, 0, 70)];
    for (const p of this.steamAt) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.4, 14, 1, true), new THREE.MeshStandardMaterial({ map: canvasTex('nystack', 64, 64, (g2, W, H) => { for (let y = 0; y < H; y += 16) { g2.fillStyle = (y / 16) % 2 ? '#e8e8e4' : '#e06a1a'; g2.fillRect(0, y, W, 16); } }), roughness: 0.6, side: THREE.DoubleSide })); st.position.set(p.x, 1.2, p.z); scene.add(st); w.addBoxCentered(V(p.x, 1.2, p.z), V(1, 2.4, 1), { surface: 'metal', walkable: false }); }
    for (const [x, zz] of [[-12.8, -86], [12.8, -30], [-12.8, 26], [12.8, 70]]) props.box(V(0.6, 0.95, 0.6), V(x, 0.62, zz), new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.6 }), { surface: 'metal' });
    // parked cars along the curbs (yellow cabs among them) and a couple stopped in traffic
    const car = (x, zz, yaw, col, type = 'sedan') => { const c = buildCar(type, { color: col, state: 'clean' }); c.position.set(x, 0, zz); c.rotation.y = yaw; scene.add(c); const sz = c.userData.size; w.addBoxCentered(V(x, 0.75, zz), V(sz.x, 1.5, sz.z), { surface: 'metal', walkable: false }); return c; };
    const cab = 0xe8b818;
    for (const [zz, col, t] of [[-140, cab, 'sedan'], [-126, 0x1a1a1c, 'suv'], [-104, 0x8a8e92, 'sedan'], [-58, cab, 'sedan'], [-20, 0x2a3040, 'van'], [4, cab, 'sedan'], [62, 0x6a1a1a, 'sedan'], [96, cab, 'sedan'], [124, 0xd8d8d4, 'suv']]) car(-7.6, zz, 0, col, t);
    for (const [zz, col, t] of [[-120, 0xd8d8d4, 'van'], [-88, cab, 'sedan'], [-68, 0x3a3a40, 'sedan'], [58, cab, 'sedan'], [82, 0x2a2a2c, 'suv'], [112, cab, 'sedan']]) car(7.6, zz, Math.PI, col, t);
    for (const [x, zz, col] of [[-3.2, 102, cab], [-3.2, 112, 0x5a6a7a], [3.2, -132, cab]]) car(x, zz, x < 0 ? 0 : Math.PI, col);
    // the kidnappers' SUV (moved by the mission; no collider)
    this.suv = buildCar('suv', { color: 0x101012, state: 'clean' }); this.suv.userData.dynamic = true; this.suv.position.set(-3.5, 0, -150); this.suv.rotation.y = Math.PI; this.suv.visible = false; scene.add(this.suv);
    // scaffold shed (sidewalk bridge) in front of a west building — very New York
    for (let zz = -150; zz < -122; zz += 3.5) for (const x of [-14.6, -9.6]) props.box(V(0.12, 3.2, 0.12), V(x, 1.75, zz), M.steel, { collide: x < -10, surface: 'metal' });
    const shed = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 28.5), new THREE.MeshStandardMaterial({ color: 0x2a4a2e, roughness: 0.7 })); shed.position.set(-12.1, 3.5, -136); scene.add(shed);
    for (let zz = -150; zz < -122; zz += 7) this.anchors.push({ pos: V(-12, 3.1, zz + 3.5), color: 0xffe8c0, power: 10, dist: 7, area: 'street' });
    // invisible bounds of the street plate
    for (const [x, zz, sx, sz] of [[-20, -162, 300, 2], [-20, 162, 300, 2], [122, 0, 2, 330]]) w.addBoxCentered(V(x, 10, zz), V(sx, 20, sz), { surface: 'concrete', walkable: false });
  }
  // what makes the avenue read as a real street: facade relief, fire escapes, rooftop water tanks, a subway
  // entrance, bus shelter, mailboxes, news boxes, street trees, trash bags, a food cart, construction barriers;
  // pedestrians (one instanced crowd) and moving traffic
  streetDetail() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, props = this.game.props, N = NY, C = N.cross;
    const relief = [], esc = [], tanks = [], tankRoof = [], legs = [];
    for (const b of this.bldgs) {
      const face = b.x1 <= 0 ? b.x1 : b.x0, nx = b.x1 <= 0 ? 1 : -1, D = b.z1 - b.z0;
      // pilasters every ~6 m and a cornice every 4 floors on the street face (shallow relief that catches light)
      for (let z = b.z0 + 0.3; z <= b.z1 - 0.2; z += Math.max(4, D / Math.max(1, Math.round(D / 6)))) relief.push(new THREE.BoxGeometry(0.35, b.h - 6, 0.5).translate(face + nx * 0.17, 6 + (b.h - 6) / 2, z));
      for (let y = 6 + 15.2; y < b.h - 2; y += 15.2) relief.push(new THREE.BoxGeometry(0.4, 0.35, D).translate(face + nx * 0.2, y, (b.z0 + b.z1) / 2));
      relief.push(new THREE.BoxGeometry(1.0, 1.2, D + 0.6).translate(face + nx * 0.3, b.h - 0.6, (b.z0 + b.z1) / 2));   // crown cornice
      // fire escapes on the older (stone / brick / ribbon) mid-rises facing the avenue
      if (b.h < 75 && FAC[b.k].kind !== 'curtain' && D >= 16) {
        const zc = (b.z0 + b.z1) / 2 + (rnd() - 0.5) * 4, wid = 6;
        for (let y = 9.4; y < b.h - 3; y += 3.8) {
          esc.push(new THREE.BoxGeometry(1.2, 0.06, wid).translate(face + nx * 0.6, y, zc));                        // grating
          esc.push(new THREE.BoxGeometry(0.04, 0.9, wid).translate(face + nx * 1.18, y + 0.45, zc));                // railing
          esc.push(new THREE.BoxGeometry(0.04, 0.04, wid).translate(face + nx * 1.18, y + 0.9, zc));
          for (const dz of [-wid / 2, wid / 2]) esc.push(new THREE.BoxGeometry(1.2, 0.9, 0.04).translate(face + nx * 0.6, y + 0.45, zc + dz));
          const st = new THREE.BoxGeometry(0.7, 0.05, 4.6); st.rotateX(Math.atan2(3.8, 4.4) * (Math.floor(y / 3.8) % 2 ? 1 : -1)); esc.push(st.translate(face + nx * 0.75, y + 1.9, zc));   // stair to the next level
        }
        esc.push(new THREE.BoxGeometry(0.5, 2.6, 0.04).translate(face + nx * 0.9, 8.0, zc + wid / 2 - 0.4));         // drop ladder
      }
      // wooden water tank on legs on the roof of low and mid buildings
      if (b.h < 80 && rnd() < 0.75) {
        const tx = (b.x0 + b.x1) / 2 + (rnd() - 0.5) * 8, tz = (b.z0 + b.z1) / 2 + (rnd() - 0.5) * D * 0.4, r = 1.6 + rnd() * 0.8;
        tanks.push(new THREE.CylinderGeometry(r, r, 3.2, 14).translate(tx, b.h + 3.8, tz));
        tankRoof.push(new THREE.ConeGeometry(r * 1.05, 1.3, 14).translate(tx, b.h + 6.05, tz));
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legs.push(new THREE.BoxGeometry(0.14, 2.2, 0.14).translate(tx + lx * r * 0.6, b.h + 1.1, tz + lz * r * 0.6));
        legs.push(new THREE.BoxGeometry(r * 1.6, 0.12, r * 1.6).translate(tx, b.h + 2.2, tz));
      }
    }
    const add = (list, mat, cast = true) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m); };
    add(relief, new THREE.MeshStandardMaterial({ color: 0x6a645c, roughness: 0.8 }));
    add(esc, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, metalness: 0.5, roughness: 0.6 }));
    const woodTank = new THREE.MeshStandardMaterial({ map: canvasTex('nytank', 128, 64, (g, W, H) => { g.fillStyle = '#5a4434'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 6) { g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.2})`; g.fillRect(x, 0, 1, H); } g.fillStyle = '#2a2a2a'; for (const y of [10, 32, 54]) g.fillRect(0, y, W, 3); }), roughness: 0.9 });
    add(tanks, woodTank); add(tankRoof, new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8 })); add(legs, M.steel);
    // subway entrance on the west sidewalk: stair opening with railings and the two green globes
    const sx = -12.2, sz = 70;
    const hole = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 6.4), M.black); hole.position.set(sx, 0.08, sz); scene.add(hole);
    for (let i = 0; i < 8; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.7), M.concDark); st.position.set(sx, 0.05 - i * 0.18, sz - 2.8 + i * 0.7); scene.add(st); }
    for (const dx of [-1.25, 1.25]) { props.box(V(0.06, 1.0, 6.4), V(sx + dx, 0.65, sz), M.steel, { surface: 'metal', walkable: false }); }
    props.box(V(2.5, 1.0, 0.06), V(sx, 0.65, sz - 3.2), M.steel, { surface: 'metal', walkable: false });
    for (const dx of [-1.25, 1.25]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), M.steel); post.position.set(sx + dx, 1.35, sz + 3.15); scene.add(post); const glb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0x3ad06a, toneMapped: false })); glb.position.set(sx + dx, 2.65, sz + 3.15); scene.add(glb); }
    const ssign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('MERCER AV STATION', 'UPTOWN & DOWNTOWN', '#141414', '#ffffff'), toneMapped: false })); ssign.position.set(sx, 1.4, sz - 3.24); ssign.rotation.y = Math.PI; scene.add(ssign);
    this.anchors.push({ pos: V(sx, 2.2, sz + 2.6), color: 0xb8ffc8, power: 6, dist: 6, area: 'street' });
    // bus shelter (east sidewalk), with a lit ad panel
    const bx = 12.6, bz = -100;
    props.box(V(1.6, 0.08, 4.4), V(bx, 2.6, bz), M.steel, { collide: false });
    const glassB = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), M.glass); glassB.position.set(bx + 0.78, 1.4, bz); glassB.rotation.y = Math.PI / 2; scene.add(glassB);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), new THREE.MeshBasicMaterial({ map: canvasTex('nyad', 128, 176, (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#203a5a'); gr.addColorStop(1, '#0a1420'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = '#e8e0c8'; g.font = 'bold 22px sans-serif'; g.fillText('NOCTURNE', 10, 40); g.font = '12px sans-serif'; g.fillText('THE NEW FRAGRANCE', 10, 60); g.fillStyle = '#c8a060'; g.beginPath(); g.ellipse(64, 120, 22, 34, 0, 0, 6.3); g.fill(); }), toneMapped: false })); ad.position.set(bx, 1.4, bz - 2.18); scene.add(ad);
    w.addBox(V(bx + 0.7, 0, bz - 2.2), V(bx + 0.85, 2.6, bz + 2.2), { walkable: false, cover: false }).passBullets = true;
    props.box(V(0.4, 0.45, 3.6), V(bx + 0.4, 0.38, bz), M.steel, { surface: 'metal' });
    // blue mailboxes, news boxes, a bike rack, parking meters
    for (const [x, z] of [[-13.6, -60], [13.6, 48], [-13.6, 104]]) { props.box(V(0.55, 1.2, 0.5), V(x, 0.75, z), new THREE.MeshStandardMaterial({ color: 0x1a3a7a, roughness: 0.5, metalness: 0.3 }), { surface: 'metal' }); }
    for (const [x, z] of [[-10.2, -76], [-10.2, -74.8], [10.2, 52], [10.2, 53.2], [-10.2, 22]]) props.box(V(0.45, 1.05, 0.5), V(x, 0.68, z), new THREE.MeshStandardMaterial({ color: [0xc8a020, 0x8a1a1a, 0x1a5a3a][Math.floor(rnd() * 3)], roughness: 0.6 }), { surface: 'metal' });
    for (let z = -150; z < 150; z += 9) for (const x of [-9.8, 9.8]) { if (Math.abs(z - C.z0 - 6) < 14 || rnd() < 0.3) continue; const mtr = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M.steel); mtr.position.set(x, 0.7, z); scene.add(mtr); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.5 })); hd.position.set(x, 1.3, z); scene.add(hd); }
    // street trees in iron-fenced pits
    for (let z = -144; z < 150; z += 17) for (const x of [-11, 11]) {
      if ((z > C.z0 - 8 && z < C.z1 + 8) || (x > 0 && z > -24 && z < 34) || rnd() < 0.25) continue;
      const pit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 })); pit.position.set(x, 0.17, z); scene.add(pit);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 })); trunk.position.set(x, 1.75, z); scene.add(trunk);
      for (let i = 0; i < 6; i++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 1.6, 4), trunk.material); br.position.set(x + (rnd() - 0.5) * 0.8, 3.6 + rnd() * 0.8, z + (rnd() - 0.5) * 0.8); br.rotation.set((rnd() - 0.5) * 1.4, 0, (rnd() - 0.5) * 1.4); scene.add(br); }   // bare March branches
      for (const [dx, dz, sx2, sz2] of [[0, -0.7, 1.4, 0.04], [0, 0.7, 1.4, 0.04], [-0.7, 0, 0.04, 1.4], [0.7, 0, 0.04, 1.4]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(sx2, 0.45, sz2), M.steel); f.position.set(x + dx, 0.38, z + dz); scene.add(f); }
      w.addBoxCentered(V(x, 1, z), V(0.3, 2, 0.3), { surface: 'wood', walkable: false });
    }
    // black trash bags piled at the curb, a food cart with its umbrella, construction barriers and cones
    const bagM = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.25, metalness: 0.1 });
    for (const [x, z] of [[-9.9, -84], [9.9, -40], [-9.9, 30], [9.9, 90], [-9.9, 120]]) for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rnd() * 0.15, 8, 6), bagM); b.scale.set(1, 0.8 + rnd() * 0.4, 1); b.position.set(x + (rnd() - 0.5) * 0.8, 0.45 + (i > 3 ? 0.45 : 0), z + (i % 4) * 0.6); scene.add(b); }
    for (const [x, z] of [[-9.9, -84], [9.9, -40], [-9.9, 30], [9.9, 90], [-9.9, 120]]) w.addBoxCentered(V(x, 0.5, z + 0.9), V(1, 1, 2.4), { surface: 'dirt', cover: true });
    const cx2 = -12.4, cz2 = -56;
    props.box(V(1.0, 1.0, 2.0), V(cx2, 0.65, cz2), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.3 }), { surface: 'metal' });
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 12), new THREE.MeshStandardMaterial({ map: canvasTex('nyumb', 64, 16, (g, W, H) => { for (let x = 0; x < W; x += 8) { g.fillStyle = (x / 8) % 2 ? '#e8e0d0' : '#2a5aa8'; g.fillRect(x, 0, 8, H); } }), roughness: 0.7 })); umb.position.set(cx2, 2.55, cz2); scene.add(umb);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), M.steel); pole.position.set(cx2, 1.4, cz2); scene.add(pole);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: signTexture('HALAL · HOT DOGS', 'PRETZELS $3', '#2a5aa8', '#ffffff'), toneMapped: false })); cs.position.set(cx2 + 0.51, 1.3, cz2); cs.rotation.y = Math.PI / 2; scene.add(cs);
    this.anchors.push({ pos: V(cx2 + 0.4, 2.0, cz2), color: 0xffe0a0, power: 8, dist: 6, area: 'street' });
    const barrierM = new THREE.MeshStandardMaterial({ map: canvasTex('nybar', 64, 16, (g, W, H) => { for (let x = -16; x < W; x += 16) { g.fillStyle = '#e06a1a'; g.beginPath(); g.moveTo(x, H); g.lineTo(x + 8, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, H); g.fill(); } }), roughness: 0.6 });
    barrierM.map.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 5; i++) { const z = 76 + i * 2.2; const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 2.0), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, map: barrierM.map })); bar.position.set(5.6, 0.95, z); scene.add(bar); for (const dz of [-0.9, 0.9]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.05), M.steel); l.position.set(5.6, 0.5, z + dz); scene.add(l); } }
    w.addBox(V(5.3, 0, 75), V(5.9, 1.1, 86), { walkable: false, cover: true });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 8), M.steel); plate.position.set(7.4, 0.02, 80); scene.add(plate);
    for (const [x, z] of [[4.8, 73], [4.8, 88], [2.2, 74]]) { const cn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xe06a1a, roughness: 0.6 })); cn.position.set(x, 0.35, z); scene.add(cn); }
    // pedestrians: one instanced crowd on the four sidewalk strips (heads down in the sleet)
    const X = N.ave, wk = N.walk, strips = [];
    for (const [z0, z1] of [[-158, C.z0 - 1], [C.z1 + 1, 158]]) { strips.push({ x0: X.x0 - wk + 0.6, x1: X.x0 - 1.4, z0, z1 }); strips.push({ x0: X.x1 + 1.4, x1: X.x1 + wk - 0.6, z0, z1 }); }
    this.crowd = new Crowd(this.game, strips.map((r) => ({ rect: r, kind: 'strip', n: Math.round((r.z1 - r.z0) / 2.6) })), { y: 0.15, rnd, max: 420 });
    for (const t of [this.crowd.near, this.crowd.mid, this.crowd.far]) t.mesh.userData.area = 'street';
    // moving traffic: one-way downtown (+z) in three lanes; stops for the light at the cross street, for the car ahead and for the player
    this.cars = [];
    const cols = [0xe8b818, 0xe8b818, 0x1a1a1c, 0x8a8e92, 0xd8d8d4, 0x2a3040, 0x5a1a1a, 0xe8b818, 0x3a4a3a];
    for (const lx of [-1.6, 1.6, 4.6]) for (let i = 0; i < 4; i++) {
      const type = rnd() < 0.15 ? 'van' : rnd() < 0.3 ? 'suv' : 'sedan';
      const c = buildCar(type, { color: cols[Math.floor(rnd() * cols.length)], state: 'clean' }); c.userData.dynamic = true; c.rotation.y = 0;
      const z = -150 + i * 80 + rnd() * 30; c.position.set(lx, 0, z); scene.add(c);
      for (const hz of [-0.75, 0.75]) { const tl = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), M.red); tl.position.set(hz, 0.85, -c.userData.size.z / 2 - 0.02); tl.rotation.y = Math.PI; c.add(tl); const hl = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), M.workGlow); hl.position.set(hz, 0.75, c.userData.size.z / 2 + 0.02); c.add(hl); }
      this.cars.push({ c, lane: lx, z, v: 8 + rnd() * 4, vmax: 9 + rnd() * 5, len: c.userData.size.z });
    }
    this.lightT = 0;
  }
  updateTraffic(dt) {
    this.lightT = (this.lightT + dt) % 40; const red = this.lightT > 24;   // avenue green 24 s, red 16 s
    const p = this.game.player.position, stopZ = NY.cross.z0 - 6;
    for (const t of this.cars) {
      let lim = t.vmax;
      if (red && t.z < stopZ && t.z > stopZ - 30) lim = Math.min(lim, Math.max(0, (stopZ - t.z - 2) * 0.9));
      for (const o of this.cars) if (o !== t && o.lane === t.lane && o.z > t.z && o.z - t.z < 30) lim = Math.min(lim, Math.max(0, (o.z - t.z - o.len - 2.5) * 0.8));
      if (Math.abs(p.x - t.lane) < 1.6 && p.z > t.z && p.z - t.z < 14 && p.y < 3) lim = Math.min(lim, Math.max(0, (p.z - t.z - 4) * 0.8));
      if (this.stopTraffic) lim = Math.min(lim, t.v - 6 * dt);
      t.v += Math.max(-7 * dt, Math.min(2.5 * dt, lim - t.v)); t.v = Math.max(0, t.v);
      t.z += t.v * dt; if (t.z > 165) { t.z -= 330; t.v = 6; }
      t.c.position.z = t.z;
    }
  }
  shopfronts(x0, x1, z0, z1) {
    const scene = this.game.renderer.scene, M = this.M;
    const face = x1 > 0 ? x0 : x1; const nx = x1 > 0 ? -1 : 1; const dz = z1 - z0; const n = Math.max(1, Math.floor(dz / 8));
    for (let i = 0; i < n; i++) {
      const zc = z0 + (i + 0.5) * dz / n, len = dz / n - 1.2;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, map: shopTex(i + Math.floor(rnd() * 4)), emissive: 0xffffff, emissiveMap: shopTex(i + Math.floor(rnd() * 4)), emissiveIntensity: 0.22 + rnd() * 0.18, roughness: 0.12, metalness: 0.3 }));
      win.position.set(face + nx * 0.03, 2, zc); win.rotation.y = nx > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(win);
      const names = ['DELI', 'PHARMACY', 'BAGELS', 'DRY CLEANING', 'WINE & SPIRITS', 'NAIL SALON', 'PIZZA', 'BANK', 'SHOES', 'HARDWARE', 'FLORIST', 'OPTICAL'];
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.8, 0.7), new THREE.MeshBasicMaterial({ map: signTexture(names[Math.floor(rnd() * names.length)], '', ['#1a1a1a', '#6a1a1a', '#1a2a4a', '#2a3a2a'][i % 4], '#f0f0e8'), toneMapped: false }));
      sg.position.set(face + nx * 0.06, 4.1, zc); sg.rotation.y = win.rotation.y; scene.add(sg);
      const rot = win.rotation.y, at = (o, y, dz = 0) => (g) => { g.position.set(face + nx * o, y, zc + dz); g.rotation.y = rot; scene.add(g); return g; };
      // printed fabric awning (half the shops), and the small things a New York front has: an OPEN neon in the
      // window, a projecting blade or point sign (own random stream so the rest of the street is unchanged)
      if (rnd() < 0.5) at(0.02, 3.75)(SK.awning(['DELI', 'BAGELS', 'PIZZA', 'FLORIST', 'WINE & SPIRITS'][i % 5], { w: Math.min(len, 6), depth: 1.3, drop: 0.45, color: ['#6a1a1a', '#1a3a2a', '#1a1a2a'][i % 3], ink: '#f0e8d8', font: 'serif', sub: 'EST. 1987 · OPEN 7 DAYS' }));
      const sr = this.signRnd ??= ((q) => () => ((q = (q * 16807) % 2147483647) / 2147483647))(4242);
      if (sr() < 0.4) at(0.05, 2.6, len * 0.3)(SK.neon('OPEN', { color: ['#ff3a3a', '#40c8ff', '#ffb040'][Math.floor(sr() * 3)], h: 0.45 }));
      if (sr() < 0.3) at(0, 6.5, -len / 2 + 0.3)(SK.blade(['HOTEL', 'TAILOR', 'PAWN', 'DINER'][Math.floor(sr() * 4)], { bg: '#141414', fg: ['#ff5a3a', '#ffd040', '#7ad8ff'][Math.floor(sr() * 3)], w: 0.7 }));
      else if (sr() < 0.3) at(0, 4.6, len / 2 - 0.3)(SK.point(['ATM', 'Rx', 'NAILS', '24H'][Math.floor(sr() * 4)], { shape: sr() < 0.5 ? 'round' : 'square', bg: '#f0f0e8', fg: '#1a1a1a', size: 0.6 }));
    }
  }
  cafeFront() {
    const scene = this.game.renderer.scene, M = this.M, C = NY.cafe, w = this.game.world;
    // glazed front with a lit interior behind (tables), a green awning and the name
    const fl = new THREE.Mesh(new THREE.BoxGeometry(C.x1 - C.x0, 0.1, C.z1 - C.z0), M.wood); fl.position.set((C.x0 + C.x1) / 2, 0.1, (C.z0 + C.z1) / 2); scene.add(fl);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, C.z1 - C.z0), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 })); back.position.set(C.x0 + 0.15, 2.5, (C.z0 + C.z1) / 2); scene.add(back);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(C.x1 - C.x0, 0.3, C.z1 - C.z0), M.ceiling); ceil.position.set((C.x0 + C.x1) / 2, 5, (C.z0 + C.z1) / 2); scene.add(ceil);
    for (const z of [C.z0, C.z1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(C.x1 - C.x0, 5, 0.3), M.granite); s.position.set((C.x0 + C.x1) / 2, 2.5, z); scene.add(s); w.addBox(V(C.x0, 0, z - 0.15), V(C.x1, 5, z + 0.15), { walkable: false }); }
    w.addBox(V(C.x0, 0, C.z0), V(C.x0 + 0.3, 5, C.z1), { walkable: false });
    for (let z = C.z0 + 2; z < C.z1 - 1; z += 3) for (const x of [C.x0 + 3, C.x0 + 7]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), M.marble); t.position.set(x, 0.78, z); scene.add(t); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6), M.deskLeg); l.position.set(x, 0.4, z); scene.add(l); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1.05, 8), M.wood); bar.position.set(C.x0 + 1.2, 0.55, (C.z0 + C.z1) / 2); scene.add(bar);
    for (const z of [C.z0 + 1, C.z1 - 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, 0.3), M.mullion); m.position.set(C.x1, 2.5, z); scene.add(m); }
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(C.z1 - C.z0 - 2, 3.4), M.glass); gl.position.set(C.x1, 1.9, (C.z0 + C.z1) / 2); gl.rotation.y = Math.PI / 2; scene.add(gl);
    // the café: printed awning, a chalk A-frame by the door, pendants over the bar, a neon line on the back wall
    const zc = (C.z0 + C.z1) / 2, put = (g, x, y, z, r = Math.PI / 2) => { g.position.set(x, y, z); g.rotation.y = r; scene.add(g); return g; };
    put(SK.awning('MERIDIAN', { w: C.z1 - C.z0 - 1, depth: 1.8, drop: 0.6, color: '#1e3a2a', ink: '#f0e6c8', font: 'serif', sub: 'ESPRESSO · BAKERY · SINCE 1994' }), C.x1 + 0.05, 4.05, zc);
    put(SK.aFrame('TODAY', { sub: 'pumpkin latte · rye loaf', bg: '#1a1a1a', fg: '#f0e6c8', chalk: true }), C.x1 + 1.6, 0, C.z0 + 2.2);
    put(SK.neon('fresh bread daily', { color: '#ffb070', h: 0.5 }), C.x0 + 0.32, 3.1, zc);
    for (let k = -1; k <= 1; k++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.24, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xb8904a, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })); p.position.set(C.x0 + 1.2, 2.9, zc + k * 2.4); scene.add(p);
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false })); b.rotation.x = Math.PI / 2; b.position.set(C.x0 + 1.2, 2.79, zc + k * 2.4); scene.add(b);
      const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.0, 4), M.mullion); cbl.position.set(C.x0 + 1.2, 3.9, zc + k * 2.4); scene.add(cbl); }
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('MERIDIAN CAFÉ', 'ESPRESSO · BAKERY', '#1e3a2a', '#f0e6c8'), toneMapped: false })); sg.position.set(C.x1 + 0.05, 4.5, (C.z0 + C.z1) / 2); sg.rotation.y = Math.PI / 2; scene.add(sg);
    this.anchors.push({ pos: V(C.x0 + 5, 4.2, (C.z0 + C.z1) / 2), color: 0xffd0a0, power: 30, dist: 14, area: 'street' });
  }
  lamp(x, z, yaw) {
    const scene = this.game.renderer.scene, M = this.M;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 8.5, 8), M.steel); pole.position.set(x, 4.25, z); scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), M.steel); arm.position.set(x + Math.cos(yaw) * 1.1, 8.3, z - Math.sin(yaw) * 1.1); arm.rotation.y = yaw; scene.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), M.lampGlow); head.position.set(x + Math.cos(yaw) * 2.2, 8.2, z - Math.sin(yaw) * 2.2); scene.add(head);
    this.game.world.addBoxCentered(V(x, 2, z), V(0.26, 4, 0.26), { surface: 'metal', walkable: false });
    this.anchors.push({ pos: V(x + Math.cos(yaw) * 2.2, 7.6, z - Math.sin(yaw) * 2.2), color: 0xffe0b8, power: 22, dist: 20, area: 'street' });
  }
  signal(x, z, yaw) {
    const scene = this.game.renderer.scene, M = this.M;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 6, 8), M.steel); pole.position.set(x, 3, z); scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 6), M.steel); arm.position.set(x - Math.sign(x) * 0.05, 5.8, z); scene.add(arm);
    for (const dz of [-1.5, 2.5]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.6 })); box.position.set(x - Math.sign(x) * 3 + Math.sign(x) * (dz + 1.5) * 0, 5.3, z + (Math.sign(x) > 0 ? -dz : dz)); scene.add(box);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), dz > 0 ? M.red : M.green); lamp.position.copy(box.position).add(V(0, dz > 0 ? 0.32 : -0.32, 0.21 * (Math.sign(x) > 0 ? 1 : -1))); if (Math.sign(x) < 0) lamp.rotation.y = Math.PI; scene.add(lamp);
    }
    this.game.world.addBoxCentered(V(x, 2, z), V(0.26, 4, 0.26), { surface: 'metal', walkable: false });
  }

  // ---------------- Asher Tower: exterior ----------------
  towerExterior() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, T = NY.tower, L = NY.lobby;
    // the shaft above the lobby: curtain wall, set back at 120 m, a lit crown
    const cw = facadeMat(2, 1.05); const W = T.x1 - T.x0, D = T.z1 - T.z0;
    const s1 = new THREE.Mesh(boxUV(W, 112, D), cw); s1.position.set((T.x0 + T.x1) / 2, L.h + 0.6 + 56, 0); s1.castShadow = true; scene.add(s1);
    const s2 = new THREE.Mesh(boxUV(W - 8, T.H - L.h - 112, D - 8), cw); s2.position.set((T.x0 + T.x1) / 2, L.h + 112 + (T.H - L.h - 112) / 2, 0); scene.add(s2);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(W - 10, 10, D - 10), new THREE.MeshStandardMaterial({ color: 0x1a1e22, emissive: 0xc8d8e8, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.6 })); crown.position.set((T.x0 + T.x1) / 2, T.H + 5, 0); scene.add(crown);
    for (let y = L.h + 4; y < L.h + 112; y += 3.8 * 4) { const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.25, D + 0.3), M.mullion); band.position.set((T.x0 + T.x1) / 2, y, 0); scene.add(band); }
    // the 32nd floor from outside (helicopter attack happens here; it reads as a floor of broken glass later)
    // base: dark granite piers with full-height glass between, the name over the entrance
    const pier = (z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, L.h, 1.2), M.granite); p.position.set(T.x0 + 0.3, L.h / 2, z); scene.add(p); w.addBoxCentered(V(T.x0 + 0.3, L.h / 2, z), V(1.2, L.h, 1.2), { walkable: false }); };
    for (const z of [-19.4, -13, -6.5, 6.5, 13, 19.4]) pier(z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, D), M.granite); head.position.set(T.x0 + 0.1, L.h + 0.1, 0); scene.add(head);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.0), new THREE.MeshBasicMaterial({ map: signTexture('ASHER TOWER', '417 · 8TH AVENUE NORTH', '#141414', '#d8c8a0'), toneMapped: false, transparent: true })); nm.position.set(T.x0 - 0.72, L.h + 0.1, 0); nm.rotation.y = -Math.PI / 2; scene.add(nm);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 8), M.bronze); canopy.position.set(T.x0 - 2, 4.4, 0); scene.add(canopy);
    for (const z of [-3.8, 3.8]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8), M.bronze); c.position.set(T.x0 - 3.8, 2.2, z); scene.add(c); }
    this.anchors.push({ pos: V(T.x0 - 2, 4.0, 0), color: 0xfff0d8, power: 30, dist: 12, area: 'street' });
    // side and back walls (solid granite at street level)
    w.addBox(V(T.x0, 0, T.z0 - 0.4), V(T.x1, L.h + 2, T.z0), { walkable: false }); w.addBox(V(T.x0, 0, T.z1), V(T.x1, L.h + 2, T.z1 + 0.4), { walkable: false }); w.addBox(V(T.x1, 0, T.z0), V(T.x1 + 0.4, L.h + 2, T.z1), { walkable: false });
    for (const z of [T.z0 - 0.2, T.z1 + 0.2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(W, L.h, 0.4), M.granite); m.position.set((T.x0 + T.x1) / 2, L.h / 2, z); scene.add(m); }
  }

  // glass pane with a collider that breaks when shot (both ways) or by script
  pane(x0, z0, x1, z1, y0, y1, { area = null, frame = true } = {}) {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M;
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0); const len = along ? x1 - x0 : z1 - z0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(len), y1 - y0), M.glass); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (!along) m.rotation.y = Math.PI / 2; m.userData.dynamic = true; m.renderOrder = 2; scene.add(m);
    const t = 0.06; const c = w.addBox(V(Math.min(x0, x1) - (along ? 0 : t), y0, Math.min(z0, z1) - (along ? t : 0)), V(Math.max(x0, x1) + (along ? 0 : t), y1, Math.max(z0, z1) + (along ? t : 0)), { surface: 'metal', walkable: false, cover: false });
    c.seeThrough = true; const p = { mesh: m, c, broken: false, along, x0, z0, x1, z1, y0, y1, area };
    c.onHit = () => this.breakPane(p);
    this.panes.push(p); return p;
  }
  breakPane(p, push = null) {
    if (p.broken) return; p.broken = true; p.mesh.visible = false; this.game.world.removeCollider(p.c);
    const g = this.game, W = wreck(g); const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2; const len = p.along ? Math.abs(p.x1 - p.x0) : Math.abs(p.z1 - p.z0);
    const n = Math.min(16, 6 + Math.round(len * (p.y1 - p.y0)));
    for (let i = 0; i < n; i++) {
      const s = 0.15 + Math.random() * 0.4; const sh = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.6 + Math.random()), 0.012), this.M.glass);
      const u = (Math.random() - 0.5) * len, y = p.y0 + Math.random() * (p.y1 - p.y0);
      sh.position.set(p.along ? cx + u : cx, y, p.along ? cz : cz + u); sh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const v = push ? push.clone().multiplyScalar(2 + Math.random() * 4) : V((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      W.add(sh, { v, av: V(Math.random() * 8, Math.random() * 8, Math.random() * 8), half: 0.02, life: 12, bounce: 0.15 });
    }
    g.audio.glassBreak?.(V(cx, (p.y0 + p.y1) / 2, cz), Math.min(1.5, len * (p.y1 - p.y0) / 5));
  }

  // ---------------- lobby ----------------
  lobby() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, L = NY.lobby, T = NY.tower, props = this.game.props;
    const floor = new THREE.Mesh(boxUV(T.x1 - T.x0, 0.1, T.z1 - T.z0, 4, 4), M.marble); floor.position.set((T.x0 + T.x1) / 2, 0.05, 0); floor.receiveShadow = true; scene.add(floor);
    w.addBox(V(T.x0, 0, T.z0), V(T.x1, 0.1, T.z1), { surface: 'concrete' });
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.x0, 0.4, T.z1 - T.z0), M.ceiling); ceil.position.set((T.x0 + T.x1) / 2, L.h + 0.2, 0); scene.add(ceil);
    w.addBox(V(T.x0, L.h, T.z0), V(T.x1, L.h + 0.4, T.z1), { walkable: false, cover: false });
    w.indoorZones.push({ min: V(T.x0, -1, T.z0), max: V(T.x1, L.h, T.z1) });
    // front glazing between the piers; the entrance (z -3.5..3.5) with two pairs of glass doors left open
    for (const [z0, z1] of [[-18.8, -13.6], [-12.4, -7.1], [5.9, 12.4], [13.6, 18.8]]) for (const [y0, y1] of [[0.1, 4.4], [4.4, L.h]]) this.pane(T.x0 + 0.3, z0, T.x0 + 0.3, z1, y0, y1, { area: 'street' });
    for (const [z0, z1] of [[-5.9, -3.6], [3.6, 5.9]]) this.pane(T.x0 + 0.3, z0, T.x0 + 0.3, z1, 0.1, 4.2, { area: 'street' });
    this.pane(T.x0 + 0.3, -5.9, T.x0 + 0.3, 5.9, 4.4, L.h, { area: 'street' });
    // walls: wood panelling on the north / south walls, the core faced in dark granite
    for (const z of [T.z0 + 0.2, T.z1 - 0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.x0 - 2, L.h, 0.1), M.wood); p.position.set((T.x0 + T.x1) / 2 + 1, L.h / 2, z); scene.add(p); }
    const core = new THREE.Mesh(new THREE.BoxGeometry(12, L.h, 22), M.granite); core.position.set(48, L.h / 2, 0); scene.add(core);
    w.addBox(V(42, 0, -11), V(54, L.h, 11), { walkable: false });
    for (const e of NY.elevators) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 1.6), M.bronze); door.position.set(e.x - 0.62, 1.4, e.z); scene.add(door);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 2.0), M.black); fr.position.set(e.x - 0.58, 1.5, e.z); scene.add(fr);
      const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), M.lampGlow); ind.position.set(e.x - 0.67, 3.2, e.z); ind.rotation.y = -Math.PI / 2; scene.add(ind);
    }
    // security desk (cover), turnstile line with gaps, planters, benches, columns
    props.box(V(1.2, 1.1, 10), V(25, 0.6, 0), M.granite, { surface: 'concrete' });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 10.4), M.marble); top.position.set(25, 1.18, 0); scene.add(top);
    for (const z of [-3, 0, 3]) { const mon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, emissive: 0xffffff, emissiveMap: screenTex(z + 3), emissiveIntensity: 0.6 })); mon.position.set(25.3, 1.45, z); scene.add(mon); }
    for (let z = -16; z <= 16; z += 2.2) { if (Math.abs(z) < 1.5) continue; props.box(V(0.9, 1.0, 0.22), V(33, 0.55, z), M.metal, { surface: 'metal' }); }
    for (const [x, z] of [[20, -15.5], [20, 15.5], [38, -15.5], [38, 15.5]]) { props.box(V(2.4, 0.9, 1.2), V(x, 0.5, z), M.granite, { surface: 'concrete' }); const tree = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.9 })); tree.position.set(x, 2.1, z); scene.add(tree); }
    for (const [x, z] of [[29, -10], [29, 10], [37, -10], [37, 10]]) { const c = props.box(V(1.0, L.h, 1.0), V(x, L.h / 2, z), M.granite, { surface: 'concrete', walkable: false }); c.castShadow = false; }
    for (const z of [-12, 12]) props.box(V(3, 0.45, 0.6), V(20.5, 0.28, z), M.wood, { surface: 'wood' });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshStandardMaterial({ map: canvasTex('nyart', 512, 256, (g2, W, H) => { g2.fillStyle = '#1a1c22'; g2.fillRect(0, 0, W, H); for (let i = 0; i < 9; i++) { g2.fillStyle = ['#b8a070', '#6a7a8a', '#d8d0c0', '#3a4a5a'][i % 4]; g2.fillRect(30 + i * 52, 40 + (i % 3) * 20, 40, H - 80 - (i % 3) * 30); } }), roughness: 0.5 }));
    art.position.set(41.94, 5.6, 0); art.rotation.y = -Math.PI / 2; scene.add(art);
    for (let x = 18; x < 42; x += 6) for (const z of [-12, 0, 12]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 16), M.lampGlow); l.position.set(x, L.h - 0.02, z); scene.add(l); }
    for (const [x, z] of [[20, -8], [20, 8], [32, 0], [38, -12], [38, 12], [26, -16], [26, 16]]) this.anchors.push({ pos: V(x, L.h - 1, z), color: 0xfff0d8, power: 30, dist: 16, area: 'street' });
  }

  // ---------------- 32nd floor ----------------
  office() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, O = NY.off, C = NY.core, S = NY.server, props = this.game.props;
    const fl = new THREE.Mesh(boxUV(O.x1 - O.x0, 0.1, O.z1 - O.z0, 3, 3), M.carpet); fl.position.set((O.x0 + O.x1) / 2, 0.05, 0); fl.receiveShadow = true; scene.add(fl);
    w.addBox(V(O.x0, 0, O.z0), V(O.x1, 0.1, O.z1), { surface: 'concrete' });
    // the slab edge outside the glass (a ledge 0.6 m) and the floor below seen through the gap
    const slab = new THREE.Mesh(new THREE.BoxGeometry(O.x1 - O.x0 + 1.4, 0.5, O.z1 - O.z0 + 1.4), M.concDark); slab.position.set((O.x0 + O.x1) / 2, -0.2, 0); scene.add(slab);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(O.x1 - O.x0, 0.3, O.z1 - O.z0), M.ceiling); ceil.position.set((O.x0 + O.x1) / 2, O.h + 0.15, 0); scene.add(ceil);
    w.addBox(V(O.x0, O.h, O.z0), V(O.x1, O.h + 0.3, O.z1), { walkable: false, cover: false });
    const above = new THREE.Mesh(new THREE.BoxGeometry(O.x1 - O.x0 + 1.4, 0.6, O.z1 - O.z0 + 1.4), M.concDark); above.position.set((O.x0 + O.x1) / 2, O.h + 0.6, 0); scene.add(above);
    w.indoorZones.push({ min: V(O.x0, -1, O.z0), max: V(O.x1, O.h, O.z1) });
    for (let x = O.x0 + 3; x < O.x1 - 1; x += 4) for (let z = O.z0 + 3; z < O.z1 - 1; z += 4) {
      if (x > C.x0 - 1 && x < C.x1 + 1 && z > C.z0 - 1 && z < C.z1 + 1) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), M.panel); p.position.set(x, O.h - 0.01, z); scene.add(p);
    }
    for (const [x, z] of [[205, -14], [205, 0], [205, 14], [216, -15], [216, 14], [233, 2], [233, 14], [234, -15]]) this.anchors.push({ pos: V(x, O.h - 0.4, z), color: 0xf4f8ff, power: 10, dist: 12, area: 'office' });
    // curtain wall: 1.5 m panes floor to ceiling with mullions on all four sides (the west side faces the avenue)
    this.westPanes = [];
    const mull = (x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, O.h, 0.08), M.mullion); m.position.set(x, O.h / 2, z); scene.add(m); };
    for (let z = O.z0; z < O.z1 - 0.01; z += 1.5) { const z1 = Math.min(O.z1, z + 1.5); this.westPanes.push(this.pane(O.x0, z, O.x0, z1, 0.1, O.h, { area: 'office' })); this.pane(O.x1, z, O.x1, z1, 0.1, O.h, { area: 'office' }); mull(O.x0, z); mull(O.x1, z); }
    for (let x = O.x0; x < O.x1 - 0.01; x += 1.5) { const x1 = Math.min(O.x1, x + 1.5); this.pane(x, O.z0, x1, O.z0, 0.1, O.h, { area: 'office' }); this.pane(x, O.z1, x1, O.z1, 0.1, O.h, { area: 'office' }); mull(x, O.z0); mull(x, O.z1); }
    // an invisible rail just inside the glass so nobody walks out of a broken pane (bullets pass)
    for (const [a, b] of [[V(O.x0 - 0.7, 0, O.z0), V(O.x0 - 0.5, 3, O.z1)], [V(O.x1 + 0.5, 0, O.z0), V(O.x1 + 0.7, 3, O.z1)], [V(O.x0, 0, O.z0 - 0.7), V(O.x1, 3, O.z0 - 0.5)], [V(O.x0, 0, O.z1 + 0.5), V(O.x1, 3, O.z1 + 0.7)]]) w.addBox(a, b, { walkable: false, cover: false }).passBullets = true;
    // core: drywall faces, elevator doors on the west face, stair door north, freight elevator south
    const coreM = new THREE.Mesh(new THREE.BoxGeometry(C.x1 - C.x0, O.h, C.z1 - C.z0), M.wall); coreM.position.set((C.x0 + C.x1) / 2, O.h / 2, 0); scene.add(coreM);
    w.addBox(V(C.x0, 0, C.z0), V(C.x1, O.h, C.z1), { walkable: false });
    for (const z of [-4.5, -1.5, 1.5, 4.5]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 1.2), M.metal); d.position.set(C.x0 - 0.03, 1.25, z); scene.add(d); }
    const fd = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.6, roughness: 0.5 })); fd.position.set(NY.freightDoor.x, 1.35, C.z1 + 0.04); fd.userData.dynamic = true; scene.add(fd); this.freightDoorMesh = fd;
    const fsign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('FREIGHT', 'SERVICE ONLY', '#5a1a1a', '#ffffff'), toneMapped: false })); fsign.position.set(NY.freightDoor.x, 2.95, C.z1 + 0.05); scene.add(fsign);
    const sd = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), M.metal); sd.position.set(NY.stairDoor.x, 1.15, C.z0 - 0.03); scene.add(sd);
    const ex = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ color: 0x20c040, toneMapped: false })); ex.position.set(NY.stairDoor.x, 2.5, C.z0 - 0.05); ex.rotation.y = Math.PI; scene.add(ex);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('KESTREL RISK ADVISORY', 'FLOOR 32', '#1a1e24', '#c8d0d8'), toneMapped: false })); logo.position.set(C.x0 - 0.04, 2.9, 0); logo.rotation.y = -Math.PI / 2; scene.add(logo);
    // reception desk in front of the lifts
    props.box(V(1.0, 1.05, 4.5), V(209.5, 0.55, 0), M.desk, { surface: 'wood' });
    // open-plan desk clusters (a collider per cluster, 0.75 m high = cover when crouched)
    const cluster = (cx, cz, along = true, n = 3) => {
      const L = n * 1.6, Wd = 1.6;
      const sx = along ? L : Wd, sz = along ? Wd : L;
      const top = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.04, sz), M.desk); top.position.set(cx, 0.74, cz); scene.add(top);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(along ? sx : 0.04, 0.4, along ? 0.04 : sz), new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.9 })); scr.position.set(cx, 0.95, cz); scene.add(scr);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), M.deskLeg); l.position.set(cx + lx * (sx / 2 - 0.1), 0.36, cz + lz * (sz / 2 - 0.1)); scene.add(l); }
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
        const u = (i + 0.5) * 1.6 - L / 2; const mx = along ? cx + u : cx + s * 0.45, mz = along ? cz + s * 0.45 : cz + u;
        const mon = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.55 : 0.04, 0.34, along ? 0.04 : 0.55), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, emissive: 0xffffff, emissiveMap: screenTex(i + (s > 0 ? 2 : 0)), emissiveIntensity: rnd() < 0.7 ? 0.5 : 0 })); mon.position.set(mx, 0.98, mz); scene.add(mon);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.chair); ch.position.set(along ? mx : cx + s * 1.15, 0.5, along ? cz + s * 1.15 : mz); ch.rotation.y = rnd() * 0.6 - 0.3; scene.add(ch);
      }
      w.addBoxCentered(V(cx, 0.38, cz), V(sx, 0.76, sz), { surface: 'wood', cover: true, walkable: false });
    };
    for (const z of [-15, -9, 9, 15]) cluster(205.5, z, true, 3);
    for (const z of [-15, -9]) cluster(220, z, true, 3);
    for (const x of [232, 237]) cluster(x, 2, false, 3);
    cluster(220, 12, true, 2);
    // glass meeting rooms along the south-west (z 11..19.6, x 200..213) with a solid back wall
    for (const z of [11]) { this.pane(200.3, z, 205, z, 0.1, O.h, { area: 'office' }); this.pane(206.6, z, 213, z, 0.1, O.h, { area: 'office' }); }
    this.pane(213, 11, 213, 19.6, 0.1, O.h, { area: 'office' }); this.pane(206.5, 11, 206.5, 19.6, 0.1, O.h, { area: 'office' });
    for (const [x, z] of [[203.4, 15.5], [209.8, 15.5]]) { props.box(V(2.6, 0.75, 1.3), V(x, 0.38, z), M.wood, { surface: 'wood' }); const tv = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), M.black); tv.position.set(x, 1.6, 19.3); scene.add(tv); }
    // server room: glass west and south walls, a door gap, racks in rows (cover), cold LEDs
    this.pane(S.x0, S.z0 + 0.3, S.x0, -13, 0.1, O.h, { area: 'office' }); this.pane(S.x0, -11, S.x0, S.z1, 0.1, O.h, { area: 'office' });
    this.pane(S.x0, S.z1, S.x1, S.z1, 0.1, O.h, { area: 'office' });
    const sfl = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.12, S.z1 - S.z0), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5 })); sfl.position.set((S.x0 + S.x1) / 2, 0.12, (S.z0 + S.z1) / 2); scene.add(sfl);
    this.leds = [];
    for (const x of [233.2, 236.6]) for (const z of [-18.2, -15.6]) {
      props.box(V(0.9, 2.1, 1.6), V(x, 1.05, z), M.rack, { surface: 'metal', walkable: false });
      for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), rnd() < 0.8 ? M.led : M.green); l.position.set(x - 0.46, 0.3 + i * 0.17, z - 0.6 + rnd() * 1.2); l.userData.dynamic = true; scene.add(l); this.leds.push(l); }
    }
    const term = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 1.2), M.desk); term.position.set(231.2, 0.85, -11.8); scene.add(term);
    w.addBoxCentered(V(231.2, 0.43, -11.8), V(0.7, 0.86, 1.2), { surface: 'wood', walkable: false, cover: true });
    this.serverScreen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.62), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, emissive: 0xffffff, emissiveMap: screenTex(0), emissiveIntensity: 0.8 })); this.serverScreen.position.set(231.45, 1.12, -11.8); scene.add(this.serverScreen);
    this.serverTerm = V(231.0, 1.0, -11.8);
    this.anchors.push({ pos: V(235, O.h - 0.4, -14), color: 0xa8d8ff, power: 18, dist: 9, area: 'office' });
    // Maya's phone, left on a desk by the window
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.16), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x7ef0e0, emissiveIntensity: 0.4 })); phone.position.set(220.3, 0.77, -15.2); phone.userData.dynamic = true; scene.add(phone); this.phone = phone;
    // invisible limits of the office plate
    w.addBox(V(O.x0 - 2, 0, O.z0 - 2), V(O.x1 + 2, 4, O.z0 - 1.2), { walkable: false }).passBullets = true;
  }

  // ---------------- freight elevator shaft ----------------
  shaftBuild() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, S = NY.shaft;
    const H = S.top + 5, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
    const wallM = M.soot;
    const wall = (x0, x1, z0, z1, y0, y1) => { const m = new THREE.Mesh(boxUV(x1 - x0, y1 - y0, z1 - z0, 4, 4), wallM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); scene.add(m); w.addBox(V(x0, y0, z0), V(x1, y1, z1), { walkable: false }); };
    wall(S.x0 - 0.3, S.x1 + 0.3, S.z0 - 0.3, S.z0, -2, H); wall(S.x0 - 0.3, S.x1 + 0.3, S.z1, S.z1 + 0.3, -2, H);
    // west wall with landing door openings (z -0.8..0.8) at the landing heights; east wall with the bottom door
    const lands = NY.landings;
    let y = -2; for (const ly of [...lands].sort((a, b) => a - b)) { wall(S.x0 - 0.3, S.x0, S.z0, S.z1, y, ly); wall(S.x0 - 0.3, S.x0, S.z0, -0.8, ly, ly + 2.4); wall(S.x0 - 0.3, S.x0, 0.8, S.z1, ly, ly + 2.4); y = ly + 2.4; }
    wall(S.x0 - 0.3, S.x0, S.z0, S.z1, y, H);
    wall(S.x1, S.x1 + 0.3, S.z0, -0.8, -2, H); wall(S.x1, S.x1 + 0.3, 0.8, S.z1, -2, H); wall(S.x1, S.x1 + 0.3, -0.8, 0.8, 2.4, H);
    // landings: a lit concrete lobby beyond each door (where the shooters stand)
    for (const ly of lands) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4), M.concDark); f.position.set(S.x0 - 2.3, ly - 0.15, 0); scene.add(f);
      w.addBox(V(S.x0 - 4.3, ly - 0.3, -2), V(S.x0 - 0.3, ly, 2), { surface: 'concrete' });
      const c = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4), M.concDark); c.position.set(S.x0 - 2.3, ly + 3.1, 0); scene.add(c);
      for (const z of [-2.1, 2.1]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 0.2), M.wall); sw.position.set(S.x0 - 2.3, ly + 1.5, z); scene.add(sw); }
      const bw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 4), M.wall); bw.position.set(S.x0 - 4.3, ly + 1.5, 0); scene.add(bw);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(`${Math.round(ly / 3.9) + 20}`, '', '#c8a020', '#141414'), toneMapped: false })); num.position.set(S.x0 + 0.02, ly + 2.9, 1.2); num.rotation.y = Math.PI / 2; scene.add(num);
      this.anchors.push({ pos: V(S.x0 - 2.3, ly + 2.8, 0), color: 0xfff0d0, power: 14, dist: 8, area: 'under' });
    }
    // guide rails, counterweight rails, cables, a lamp on the car
    for (const z of [S.z0 + 0.15, S.z1 - 0.15]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, H + 2, 0.12), M.steel); r.position.set(cx, H / 2 - 1, z); scene.add(r); }
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.9), M.steel); cw.position.set(S.x1 - 0.4, 6, 0); cw.userData.dynamic = true; scene.add(cw); this.counterweight = cw;
    // the car: roof deck (walkable, moved by script), cab below, a crosshead and a work lamp
    const car = new THREE.Group(); car.userData.dynamic = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, 3.3), new THREE.MeshStandardMaterial({ map: canvasTex('nycarroof', 128, 128, (g2, W2, H2) => { g2.fillStyle = '#4a4c4e'; g2.fillRect(0, 0, W2, H2); for (let i = 0; i < 2000; i++) { g2.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; g2.fillRect(Math.random() * W2, Math.random() * H2, 2, 2); } g2.strokeStyle = '#2a2a2a'; for (let x = 0; x < W2; x += 16) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x + 8, H2); g2.stroke(); } }), metalness: 0.5, roughness: 0.6 })); roof.position.y = -0.06; car.add(roof);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.25, 2.9, 3.25), M.metal); cab.position.y = -1.6; car.add(cab);
    const xh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 3.2), M.yellow); xh.position.set(0, 0.55, 0); car.add(xh);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.7), M.steel); hatch.position.set(-0.9, 0.02, 0.9); car.add(hatch);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 3.2), M.yellow); rail.position.set(1.55, 0.45, 0); car.add(rail); const r2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.05), M.yellow); r2.position.set(0, 0.45, s * 1.6); car.add(r2); }
    const ctl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xd8a818 })); ctl.position.set(1.2, 1.0, -1.2); car.add(ctl);
    const lampL = new THREE.PointLight(0xfff0d0, 14, 10, 2); lampL.position.set(0, 1.5, 0); car.add(lampL);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.workGlow); bulb.position.set(0, 1.45, 0); car.add(bulb);
    for (const dz of [-0.2, 0, 0.2]) { const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 60, 4), M.steel); cbl.position.set(0, 30, dz); car.add(cbl); }
    car.position.set(cx, S.top, cz); car.userData.area = 'under'; scene.add(car); this.liftCar = car; this.liftLamp = lampL;
    this.liftDeck = w.addBox(V(S.x0 + 0.05, S.top - 0.12, S.z0 + 0.05), V(S.x1 - 0.05, S.top, S.z1 - 0.05), { surface: 'metal' });
    this.liftDeckY = S.top;
    // the top of the shaft: the 32nd floor door seen from inside (light spilling in)
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ color: 0xc8d0d8, toneMapped: false })); top.position.set(S.x1 + 0.31, S.top + 1.2, 0); top.rotation.y = -Math.PI / 2; scene.add(top);
  }
  // move the car deck to height y (the player standing on it rides down)
  setLift(y) {
    const dy = y - this.liftDeckY; if (!dy) return;
    this.liftDeckY = y; this.liftCar.position.y = y; this.game.world.moveCollider(this.liftDeck, 0, dy, 0);
    this.counterweight.position.y = Math.min(NY.shaft.top, 6 + (NY.shaft.top - y));
  }

  // ---------------- subway ----------------
  subway() {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M, P = NY.plat, T = NY.tun, St = NY.station, props = this.game.props;
    const box = (x0, x1, y0, y1, z0, z1, mat, col = true, opts = {}) => { const m = new THREE.Mesh(boxUV(x1 - x0, y1 - y0, z1 - z0, 4, 4), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); if (col) w.addBox(V(x0, y0, z0), V(x1, y1, z1), { walkable: false, ...opts }); return m; };
    // service corridor from the shaft door: east along z 0, then south to the platform
    box(401.7, 413, -0.1, 0, -1.3, 1.3, M.concDark, false); box(410.4, 413, -0.1, 0, 1.3, 8, M.concDark, false);
    box(401.7, 410.4, 0, 2.8, 1.3, 1.6, M.wall); box(401.7, 413.3, 0, 2.8, -1.6, -1.3, M.wall); box(413, 413.3, 0, 2.8, -1.3, 8, M.wall); box(410.1, 410.4, 0, 2.8, 1.6, 8, M.wall);
    box(401.7, 413.3, 2.8, 3.0, -1.6, 8, M.concDark, true, { cover: false });
    for (const [x, z] of [[405, 0], [411.7, 4]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), M.workGlow); b.position.set(x, 2.78, z); scene.add(b); this.anchors.push({ pos: V(x, 2.5, z), color: 0xfff0d0, power: 10, dist: 7, area: 'under' }); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('TRACK ACCESS', 'AUTHORIZED ONLY', '#c8a020', '#141414'), toneMapped: false })); door.position.set(411.7, 2.58, 7.55); door.rotation.y = Math.PI; scene.add(door);
    // tunnel shell: north wall behind the platforms, south wall, ceiling; track bed, ties, rails, third rail cover
    // north wall, with the TRACK ACCESS doorway where the service corridor comes out (x 410.4..413)
    box(P.x0 - 1, 410.4, -1.2, 4.6, P.z0 - 0.4, P.z0, M.soot); box(413, T.x1, -1.2, 4.6, P.z0 - 0.4, P.z0, M.soot);
    box(410.4, 413, 2.8, 4.6, P.z0 - 0.4, P.z0, M.soot, true, { cover: false });
    for (const x of [410.3, 413.1]) box(x - 0.1, x + 0.1, 0, 2.8, P.z0 - 0.45, P.z0 + 0.05, M.black, false);   // door frame
    box(T.x0, T.x1, -1.2, 4.6, T.z1, T.z1 + 0.4, M.soot);
    box(T.x0, T.x1, 4.4, 4.8, P.z0, T.z1, M.soot, true, { cover: false });
    box(T.x0 - 0.4, T.x0, -1.2, 4.6, P.z0, T.z1, M.soot); box(T.x1, T.x1 + 0.4, -1.2, 4.6, P.z0, T.z1, M.soot);
    const bed = new THREE.Mesh(boxUV(T.x1 - T.x0, 0.1, T.z1 - T.z0, 4, 4), M.ballast); bed.position.set((T.x0 + T.x1) / 2, NY.bed - 0.05, (T.z0 + T.z1) / 2); scene.add(bed);
    const ties = [], rails = [];
    for (const tz of [NY.trackA, NY.trackB]) {
      for (let x = T.x0 + 0.5; x < T.x1; x += 0.75) ties.push(new THREE.BoxGeometry(0.24, 0.14, 2.5).translate(x, NY.bed + 0.07, tz));
      for (const s of [-0.72, 0.72]) rails.push(new THREE.BoxGeometry(T.x1 - T.x0, 0.14, 0.08).translate((T.x0 + T.x1) / 2, NY.bed + 0.21, tz + s));
      rails.push(new THREE.BoxGeometry(T.x1 - T.x0, 0.12, 0.3).translate((T.x0 + T.x1) / 2, NY.bed + 0.3, tz + (tz < 20 ? -1.6 : 1.6)));   // third rail with its wooden cover
    }
    scene.add(new THREE.Mesh(mergeGeometries(ties), M.tie)); scene.add(new THREE.Mesh(mergeGeometries(rails), M.rail));
    // steel I-beam columns between the tracks (every 4.5 m), painted, rust streaks, with a signal every 90 m
    const cols = [];
    for (let x = T.x0 + 4; x < T.x1 - 2; x += 4.5) { if (x > St.x0 && x < St.x1) continue; cols.push(new THREE.BoxGeometry(0.3, 5.6, 0.3).translate(x, 1.7, 19.5)); }
    scene.add(new THREE.Mesh(mergeGeometries(cols), new THREE.MeshStandardMaterial({ color: 0x3a3a34, metalness: 0.5, roughness: 0.7 })));
    for (let x = T.x0 + 4; x < T.x1 - 2; x += 4.5) if (!(x > St.x0 && x < St.x1)) w.addBoxCentered(V(x, 1.7, 19.5), V(0.3, 5.6, 0.3), { surface: 'metal', walkable: false });
    this.signals = [];
    for (let x = 520; x < T.x1 - 40; x += 90) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.3), M.black); s.position.set(x, 2.6, 19.3); scene.add(s); const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), rnd() < 0.5 ? M.red : M.green); l.position.set(x - 0.11, 2.75, 19.3); scene.add(l); this.signals.push(l); }
    // work lights along the north wall every 15 m (sparse pools of light in the dark)
    const glows = [];
    for (let x = T.x0 + 8; x < T.x1; x += 15) { glows.push(new THREE.BoxGeometry(0.4, 0.12, 0.12).translate(x, 3.6, P.z0 + 0.15)); if ((x - T.x0) % 30 < 15) this.anchors.push({ pos: V(x, 3.4, 15), color: 0xffe0b0, power: 12, dist: 11, area: 'under' }); }
    scene.add(new THREE.Mesh(mergeGeometries(glows), M.workGlow));
    // track bed fence along the tunnel north edge beyond the platforms (keeps walkers on platforms)
    // maintenance platform (z 8..14, y 0): concrete, yellow edge, tool lockers, a gang box, the second work car
    const pl = (x0, x1, mat) => { const m = new THREE.Mesh(boxUV(x1 - x0, 1.2, P.z1 - P.z0, 3, 3), mat); m.position.set((x0 + x1) / 2, -0.6, (P.z0 + P.z1) / 2); scene.add(m); w.addBox(V(x0, NY.bed, P.z0), V(x1, 0, P.z1), { surface: 'concrete' }); const e = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 0.4), M.yellow); e.position.set((x0 + x1) / 2, 0.01, P.z1 - 0.2); scene.add(e); };
    pl(P.x0, P.x1, M.concDark);
    for (const x of [420, 432, 444]) props.box(V(1.0, 1.9, 0.5), V(x, 0.95, P.z0 + 0.3), new THREE.MeshStandardMaterial({ color: 0x3a5a7a, metalness: 0.5, roughness: 0.5 }), { surface: 'metal', walkable: false });
    props.box(V(1.6, 1.0, 0.8), V(452, 0.5, 9.4), M.yellow, { surface: 'metal' });
    for (const x of [425, 445, 462]) this.anchors.push({ pos: V(x, 3.2, 11), color: 0xfff0d0, power: 18, dist: 12, area: 'under' });
    // the disused Hollis St station: platform, tiled wall with the name in mosaic, arches, old lamps, a sealed stair
    pl(St.x0, St.x1, M.marble);
    const wallT = new THREE.Mesh(boxUV(St.x1 - St.x0, 4.4, 0.1, 3, 3), M.tile); wallT.position.set((St.x0 + St.x1) / 2, 2.2, St.z0 + 0.05); scene.add(wallT);
    for (let x = St.x0 + 8; x < St.x1 - 4; x += 16) {
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshStandardMaterial({ map: signTexture('HOLLIS ST', '', '#3a5a6a', '#e8e0c8'), roughness: 0.4 })); nm.position.set(x, 2.3, St.z0 + 0.12); scene.add(nm);
    }
    for (let x = St.x0 + 4; x < St.x1; x += 8) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4), M.tile); c.position.set(x, 2.2, St.z1 - 1.2); scene.add(c); w.addBoxCentered(V(x, 2.2, St.z1 - 1.2), V(0.4, 4.4, 0.4), { walkable: false }); this.anchors.push({ pos: V(x, 3.6, 11), color: 0xffd8a0, power: 14, dist: 10, area: 'under' }); const lmp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M.lampGlow); lmp.position.set(x, 3.8, 10.5); scene.add(lmp); }
    const stair = new THREE.Mesh(new THREE.BoxGeometry(4, 4.4, 0.2), new THREE.MeshStandardMaterial({ map: canvasTex('nygate', 128, 128, (g2, W2, H2) => { g2.fillStyle = '#141414'; g2.fillRect(0, 0, W2, H2); g2.fillStyle = '#5a5a58'; for (let x = 0; x < W2; x += 10) g2.fillRect(x, 0, 3, H2); for (let y = 0; y < H2; y += 32) g2.fillRect(0, y, W2, 3); }), roughness: 0.6 })); stair.position.set(St.x0 + 35, 2.2, St.z0 + 0.15); scene.add(stair);
    for (const x of [St.x0 + 20, St.x0 + 50]) props.box(V(2.0, 0.5, 0.6), V(x, 0.25, St.z0 + 1.2), M.wood, { surface: 'wood' });
    w.addBox(V(T.x0, NY.bed, P.z0), V(P.x0, 4, P.z1), { walkable: false });
    w.addBox(V(P.x1, NY.bed, P.z0), V(St.x0, 4, P.z1), { walkable: false });   // no platform between: a wall of the tunnel
    const between = new THREE.Mesh(boxUV(St.x0 - P.x1, 4.6, 0.4, 4, 4), M.soot); between.position.set((P.x1 + St.x0) / 2, 1.1, P.z1 - 0.2); scene.add(between);
    w.addBox(V(St.x1, NY.bed, P.z0), V(T.x1, 4, P.z1), { walkable: false });
    const between2 = new THREE.Mesh(boxUV(T.x1 - St.x1, 4.6, 0.4, 4, 4), M.soot); between2.position.set((St.x1 + T.x1) / 2, 1.1, P.z1 - 0.2); scene.add(between2);
    // buffer stop at the tunnel end
    for (const tz of [NY.trackA, NY.trackB]) props.box(V(0.6, 1.2, 2.4), V(T.x1 - 1, NY.bed + 0.6, tz), new THREE.MeshStandardMaterial({ color: 0xa02a1a, roughness: 0.6 }), { surface: 'metal' });
    // rail vehicles: two maintenance cars (ours + the kidnappers'), a second hostile car, the express train
    this.ourCar = this.railCar(0xd8a818); this.ourCar.position.set(440, NY.bed, NY.trackA); scene.add(this.ourCar);
    this.theirCar = this.railCar(0x2a2c30); this.theirCar.position.set(476, NY.bed, NY.trackA); scene.add(this.theirCar);
    this.chaseCar = this.railCar(0x3a3e44); this.chaseCar.position.set(420, NY.bed, NY.trackB); this.chaseCar.visible = false; scene.add(this.chaseCar);
    this.express = this.train(); this.express.position.set(1200, NY.bed, NY.trackB); this.express.visible = false; scene.add(this.express);
  }
  // a track maintenance car: flat deck with railings, a low cab at the front (+x), lamps; seats are positions on the deck
  railCar(color) {
    const g = new THREE.Group(); g.userData.dynamic = true; g.userData.area = 'under'; const M = this.M;
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 2.5), paint); deck.position.y = 1.0; g.add(deck);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.4, 2.0), M.black); frame.position.y = 0.7; g.add(frame);
    for (const x of [-2.6, 2.6]) for (const z of [-0.72, 0.72]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16), M.steel); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.62, z); g.add(wh); }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 2.5), paint); cab.position.set(3.1, 1.95, 0); g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.1, metalness: 0.5 })); win.position.set(3.1, 2.3, 0); g.add(win);
    for (const z of [-1.2, 1.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 0.05), M.yellow); r.position.set(-1, 2.0, z); g.add(r); for (let x = -3.8; x <= 1.8; x += 1.4) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), M.yellow); p.position.set(x, 1.55, z); g.add(p); } }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.4), M.metal); crate.position.set(-3.2, 1.48, 0); g.add(crate);
    for (const z of [-0.8, 0.8]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), M.workGlow); hl.position.set(4.02, 1.4, z); hl.rotation.y = Math.PI / 2; g.add(hl); const tl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), M.red); tl.position.set(-4.02, 1.3, z); tl.rotation.y = -Math.PI / 2; g.add(tl); }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false })); beacon.position.set(3.1, 2.85, 0); g.add(beacon); g.userData.beacon = beacon;
    const head = new THREE.SpotLight(0xfff0d0, 0, 60, 0.45, 0.5, 1.2); head.position.set(4.1, 1.5, 0); const tgt = new THREE.Object3D(); tgt.position.set(30, 0.5, 0); g.add(tgt); head.target = tgt; g.add(head); g.userData.head = head;
    return g;
  }
  // a subway train of six silver cars with lit windows (used for the express passing on track B)
  train() {
    const g = new THREE.Group(); g.userData.dynamic = true; g.userData.area = 'under';
    const body = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2428, emissive: 0xe8f0e0, emissiveIntensity: 0.8, roughness: 0.1 });
    const band = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.5 });
    const L = 18, gap = 0.8;
    for (let c = 0; c < 6; c++) {
      const x = -c * (L + gap);
      const b = new THREE.Mesh(new THREE.BoxGeometry(L, 3.0, 3.0), body); b.position.set(x, 2.0, 0); g.add(b);
      const wv = new THREE.Mesh(new THREE.BoxGeometry(L - 1.5, 0.9, 3.02), glass); wv.position.set(x, 2.4, 0); g.add(wv);
      const s = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.18, 3.04), band); s.position.set(x, 1.4, 0); g.add(s);
      const u = new THREE.Mesh(new THREE.BoxGeometry(L - 2, 0.5, 2.4), this.M.black); u.position.set(x, 0.4, 0); g.add(u);
    }
    for (const z of [-0.9, 0.9]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), this.M.workGlow); hl.position.set(L / 2 + 0.02, 1.3, z); hl.rotation.y = Math.PI / 2; g.add(hl); }
    const head = new THREE.SpotLight(0xfff8e0, 0, 90, 0.5, 0.4, 1); head.position.set(L / 2 + 0.2, 1.4, 0); const tgt = new THREE.Object3D(); tgt.position.set(L / 2 + 30, 0.6, 0); g.add(tgt); head.target = tgt; g.add(head); g.userData.head = head;
    g.rotation.y = Math.PI;   // runs toward -x
    return g;
  }

  // ---------------- areas, lights, update ----------------
  lightsInit() {
    const scene = this.game.renderer.scene; this.pool = [];
    const n = { low: 4, medium: 6, high: 8, ultra: 10 }[settings.data.graphics.preset] ?? 6;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); this.pool.push(l); }
    this.poolT = 0;
  }
  updateLights(dt) {
    this.poolT -= dt; if (this.poolT > 0) return; this.poolT = 0.2;
    const cam = this.game.renderer.camera.position, a = this.area || 'street';
    const pool = this.anchors.filter((x) => x.area === a && !x.off).map((x) => ({ x, d: x.pos.distanceToSquared(cam) })).sort((p, q) => p.d - q.d);
    this.pool.forEach((l, i) => { const e = pool[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e.x.pos); l.color.setHex(e.x.color); l.intensity = e.x.power * (e.x.flicker ? 0.6 + Math.random() * 0.4 : 1); l.distance = e.x.dist; });
  }
  areaOf(x) { return x < 150 ? 'street' : x < 320 ? 'office' : 'under'; }
  // only the current plate is drawn; sky / weather / fog / skyline follow
  setArea(a) {
    const g = this.game, scene = g.renderer.scene;
    if (!this.areaMeshes) {
      this.areaMeshes = { street: [], office: [], under: [] };
      const box = new THREE.Box3(), c = new THREE.Vector3();
      for (const o of scene.children) {
        if (o.userData?.skyline || o.isLight || o === this.sky?.mesh || o === this.rain?.points || o === this.snow?.points) continue;
        let area = o.userData?.area || null;
        if (!area) { if (!(o.isMesh || o.userData?.dynamic || o.userData?.batched)) continue; box.setFromObject(o); if (box.isEmpty()) continue; box.getCenter(c); area = this.areaOf(c.x); }
        this.areaMeshes[area]?.push(o);
      }
    }
    this.area = a;
    for (const [k, list] of Object.entries(this.areaMeshes)) for (const o of list) o.visible = k === a && !o.userData.hidden;
    const out = a !== 'under';
    this.sky.mesh.visible = out; this.skylineGrp.visible = out;
    this.rain.points.visible = a === 'street' || (a === 'office' && this.windIn); this.snow.points.visible = this.rain.points.visible;
    if (a === 'office') { this.skylineGrp.position.set(OFF_DX, OFF_DY, 0); this.skyFill.visible = true; this.skyGround.visible = true; scene.fog = this.fogHigh; this.hemi.intensity = 0.38; this.key.intensity = 0.2; }
    else if (a === 'street') { this.skylineGrp.position.set(0, 0, 0); this.skyFill.visible = false; this.skyGround.visible = false; scene.fog = this.fogStreet; this.hemi.intensity = 0.75; this.key.intensity = 0.5; }
    else { scene.fog = this.fogUnder; this.hemi.intensity = 0.12; this.key.intensity = 0; }
    g.audio.setIndoor?.(a === 'street' ? 0 : 1);
    this.poolT = 0;
  }
  // a hidden object stays hidden across area switches
  hide(o, v = true) { o.userData.hidden = v; o.visible = !v && (!this.area || this.areaOf(o.position.x) === this.area); }
  update(dt, t) {
    const g = this.game;
    if (!this.area) this.setArea('street');
    if (this.area !== 'under') this.sky.update(dt, g.renderer.camera);
    // no sleet indoors (lobby, office until the glass goes)
    if (this.area === 'office') this.rain.points.visible = this.snow.points.visible = !!this.windIn;
    if (this.area === 'street') { const inside = g.world.isIndoor(g.renderer.camera.position); this.rain.points.visible = this.snow.points.visible = !inside; }
    if (this.rain.points.visible) { this.rain.update(dt, g.renderer.camera.position); this.snow.update(dt, g.renderer.camera.position); }
    this.updateLights(dt);
    // characters belong to a plate too (bodies in the lobby must not float in the 32F view)
    this.agentT = (this.agentT || 0) - dt;
    if (this.agentT <= 0) { this.agentT = 0.3; for (const a of g.director.agents) a.actor.root.visible = this.areaOf(a.position.x) === this.area; }
    if (this.area === 'street') { this.crowd?.update(dt); this.updateTraffic(dt); }
    if (this.leds && this.area === 'office') for (const l of this.leds) if (Math.random() < dt * 3) l.visible = !l.visible;
    // steam from the street stacks
    if (this.area === 'street') { this.steamT = (this.steamT || 0) - dt; if (this.steamT <= 0) { this.steamT = 0.25; for (const p of this.steamAt) g.effects.smoke.spawn({ x: p.x, y: 2.5, z: p.z, vx: (Math.random() - 0.3) * 0.6, vy: 1.2 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, size: 1.0, endSize: 3.2 + Math.random(), life: 3.5, alpha: 0.35, r: 0.8, g: 0.8, b: 0.8, drag: 0.3 }); } }
  }
}
