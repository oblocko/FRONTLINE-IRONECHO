// Level: Corrin Head, North Atlantic coast — Mission 08 (THE MISSING FILE). 03:00 GMT, gale, heavy sea.
// Every place, company and name here is fictional.
//
// Separate "plates" at ground level (the nav grid is 2.5D); only the current one is drawn (setArea):
//   ext     x -900..250   the headland: the sea to the south (+z), a 36 m cliff whose top edge runs along z ≈ 40,
//                        the facility on the plateau (y 0): data hall B (x 20..92, z -62..-8) with its server hall,
//                        operations room (NOC) and plant room, the security building, helipad by the cliff edge,
//                        generator yard, radome, gate and the coast road west. At the foot of the cliff near
//                        x -90..-30: the landing shelf, a buttress ladder, the ledge, a steel stair and the
//                        seawater pump-house platform (y -18).
//   tunnel  x 400..640    the cooling-water tunnel: pump room → dry walkway → the sump (floor -3, a baffle that
//                        drops the roof to -0.4: under water while the pumps run) → fan chamber → shaft.
//   flash   x 1000..1200  a stretch of the GOP line in Gangwon-do in the snow, 14 March 04:21 KST (M01's sensors).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { Weather } from '../../render/Effects.js';
import { settings } from '../../core/Settings.js';
import { signTexture } from '../CityProps.js';
import { buildCar } from '../korea/Cars.js';
import { buildTruck } from '../Props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seedN = 31; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// value noise / fbm (deterministic)
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

export const CH = {
  SEA: -36, SHELF: -34.6,
  bounds: { minX: -900, maxX: 1250, minZ: -420, maxZ: 300 },
  navBounds: { minX: -130, maxX: 700, minZ: -150, maxZ: 60 },
  // the cliff route
  boatStart: V(-150, 0, 230), land: V(-86, -34.6, 47.5),
  buttress: { x0: -76, x1: -70, z0: 40, z1: 43.6, top: -26 },
  ladder: { x0: -76.9, x1: -76.05, z0: 40.9, z1: 42.6, top: -26 },
  ledge: { x0: -70, x1: -36, z0: 40, z1: 41.3, y: -26 },
  landing0: { x0: -40, x1: -36, z0: 40, z1: 42.6 },
  plat: { x0: -46, x1: -34.4, z0: 40, z1: 46, y: -18 },
  pumpHouse: { x0: -46, x1: -38, z0: 40, z1: 43.6 }, pumpDoor: V(-42, -18, 43.9),
  tower: V(-58, 0, 37),
  // facility (plateau, y 0)
  hall: { x0: 20, x1: 92, z0: -62, z1: -8, h: 11 },
  plant: { x0: 80, x1: 92, z0: -62, z1: -40 }, hatch: V(86, 0, -56),
  noc: { x0: 20, x1: 46, z0: -20, z1: -8 }, nocDoor: V(41, 0, -20),
  westDoor: V(20, 0, -38), rollDoor: { x0: 60, x1: 68, z: -8 }, plantDoor: V(92, 0, -45),
  rows: [28, 34, 40, 46, 52, 58, 64, 70], rowZ: [[-58, -40], [-36, -23]],
  rack: V(64.55, 0, -28), assetTerm: V(50, 0, -38),
  sec: { x0: -44, x1: -10, z0: -56, z1: -30 },
  pad: V(-26, 0, 12), gate: V(40, 0, -128),
  fence: { x0: -60, x1: 140, z0: -128, z1: 34 },
  // tunnel plate
  T: { x0: 414, x1: 640, z0: -2.5, z1: 2.5 }, pumpRoom: { x0: 400, x1: 414, z0: -7, z1: 7 }, panel: V(406, 0, -6.4),
  dip: { x0: 470, x1: 525, a: 480, b: 515, floor: -3 }, baffle: { x0: 486, x1: 511, y: -0.4 },
  fanRoom: { x0: 540, x1: 575, z0: -7, z1: 7 }, alcoves: [590, 610], shaft: { x0: 632.6, x1: 635.4, z0: -2.5, z1: -1.5, top: 8 },
  WL_RUN: 0.5, WL_STOP: -2.35,
  // flashback plate
  F: { x0: 1000, x1: 1200, fenceZ: 0 }, sensors: [1040, 1070, 1100, 1130, 1160],
};

// ---- the cliff line and the ground -------------------------------------------------------------------------
// the top edge of the cliff: straight along the climbing route, ragged headlands and coves away from it
const routeW = (x) => 1 - smooth(-120, -100, x) * (1 - smooth(-10, 10, x));   // 0 on the route (x -100..-10), 1 away
export function edgeZ(x) { const w = 1 - smooth(-115, -95, x) * (1 - smooth(-5, 15, x)); return 40 + w * (15 * Math.sin(x / 90) + 7 * Math.sin(x / 31 + 1.3) + 4 * Math.sin(x / 13)); }
export const roadZ = (x) => -22 + 12 * Math.sin(x / 110) + 5 * Math.sin(x / 47);
function plateauY(x, z) {
  // flat inside the facility, gently rolling moor outside; the coast road is smoothed
  const F = CH.fence; const dx = Math.max(F.x0 - 12 - x, x - F.x1 - 12, 0), dz = Math.max(F.z0 - 12 - z, 0);
  const out = smooth(0, 70, Math.hypot(dx, dz));
  let h = (fbm(x / 160, z / 160) - 0.45) * 22 + Math.max(0, -z - 150) * 0.05;
  h *= out; const e = edgeZ(x); h *= 1 - smooth(e - 25, e - 2, z) * 0.6;
  return h;
}
function baseY(x, z) {
  const d = z - edgeZ(x); const onRoute = 1 - routeW(x);
  const shelf = CH.SHELF + (fbm(x / 6, z / 6) - 0.5) * 0.5 - Math.max(0, d - 13) * 0.8;
  const open = -40 - d * 0.25 + (fbm(x / 20, z / 20) - 0.5) * 4;
  return open + (shelf - open) * onRoute;
}
const tunnelFloor = (x) => { const D = CH.dip; if (x < D.x0 || x > D.x1) return 0; if (x < D.a) return D.floor * (x - D.x0) / (D.a - D.x0); if (x <= D.b) return D.floor; return D.floor * (1 - (x - D.b) / (D.x1 - D.b)); };
export function heightAt(x, z) {
  if (x > 900) return (fbm(x / 30, z / 30) - 0.5) * 0.6;          // flashback: snowy ground
  if (x > 380) return tunnelFloor(x);
  return z < edgeZ(x) ? plateauY(x, z) : baseY(x, z);
}

// ---- waves: one function for the sea mesh (GLSL) and anything floating (JS) --------------------------------
const WAVES = [[-0.25, 1, 0.95, 52], [0.45, 1, 0.5, 27], [-0.8, 0.6, 0.28, 14], [0.2, 1, 0.12, 7.5]].map(([dx, dz, a, L]) => { const l = Math.hypot(dx, dz); const k = 2 * Math.PI / L; return { dx: dx / l, dz: dz / l, a, k, w: Math.sqrt(9.8 * k) }; });
export function waveH(x, z, t) { let h = 0; for (const w of WAVES) h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t); return h; }
function waveGrad(x, z, t) { let gx = 0, gz = 0; for (const w of WAVES) { const c = w.a * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.w * t); gx += c * w.dx; gz += c * w.dz; } return [gx, gz]; }

const cache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); return t;
}
// a box with world-metre UVs (u along the face, v up) so textures keep their scale
function boxM(w, h, d, um = 2, vm = 2) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * spans[f][0] / um, uv.getY(k) * spans[f][1] / vm); }
  return g;
}
// rack fronts: 42U of servers, LEDs in the emissive map
const rackTex = () => canvasTex('ch_rack', 128, 256, (g, W, H) => {
  g.fillStyle = '#121315'; g.fillRect(0, 0, W, H);
  for (let y = 6; y < H - 6; y += 6) { const n = rnd(); g.fillStyle = n < 0.12 ? '#0a0a0b' : n < 0.5 ? '#26282c' : '#1c1e22'; g.fillRect(6, y, W - 12, 5); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(6, y, W - 12, 1); }
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  for (let x = 8; x < W - 8; x += 3) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, 0, 1, H); }   // perforated door
});
const rackLed = () => canvasTex('ch_rackled', 128, 256, (g, W, H) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let y = 7; y < H - 6; y += 6) { if (rnd() < 0.15) continue; const c = rnd() < 0.7 ? '#40c8ff' : rnd() < 0.6 ? '#40ff70' : '#ffb020'; for (let i = 0; i < 1 + rnd() * 4; i++) { g.fillStyle = c; g.fillRect(10 + rnd() * 30, y + 1, 2, 2); } if (rnd() < 0.3) { g.fillStyle = '#40ff70'; g.fillRect(W - 20, y + 1, 2, 2); } }
}, true);
const panelTex = () => canvasTex('ch_panel', 256, 256, (g, W, H) => {
  g.fillStyle = '#8e9690'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 2, H); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, 0, 2, H); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '90,70,50'},${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * H, 2, 3 + rnd() * 12); }   // salt streaks
  for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(110,70,40,0.12)'; g.fillRect(rnd() * W, rnd() * H, 3, 30 + rnd() * 60); }
});
const floorTex = () => canvasTex('ch_floor', 256, 256, (g, W, H) => {
  g.fillStyle = '#a8aca8'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.fillRect(x + 2, y + 2, 60, 60); g.fillStyle = 'rgba(40,40,40,0.6)'; g.fillRect(x, y, 64, 2); g.fillRect(x, y, 2, 64); if (rnd() < 0.2) { g.fillStyle = 'rgba(30,30,30,0.5)'; for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) g.fillRect(x + 8 + k * 9, y + 8 + j * 9, 4, 4); } }
});
const padTex = () => canvasTex('ch_pad', 512, 512, (g, W, H) => {
  g.fillStyle = '#4a4c4a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { const v = 60 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v},0.4)`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  g.strokeStyle = '#e8e4d8'; g.lineWidth = 10; g.beginPath(); g.arc(W / 2, H / 2, W * 0.36, 0, 6.3); g.stroke();
  g.fillStyle = '#e8e4d8'; g.fillRect(W * 0.36, H * 0.3, 26, H * 0.4); g.fillRect(W * 0.64 - 26, H * 0.3, 26, H * 0.4); g.fillRect(W * 0.36, H * 0.48, W * 0.28, 22);
  g.fillStyle = '#d8b020'; for (let x = 0; x < W; x += 40) { g.fillRect(x, 0, 20, 8); g.fillRect(x, H - 8, 20, 8); g.fillRect(0, x, 8, 20); g.fillRect(W - 8, x, 8, 20); }
});
const screenTex = (k) => canvasTex(`ch_scr${k}`, 256, 144, (g, W, H) => {
  g.fillStyle = '#081420'; g.fillRect(0, 0, W, H);
  if (k === 0) { // camera feed grid: dark rectangles with a timestamp
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { g.fillStyle = `rgb(${20 + rnd() * 25},${24 + rnd() * 25},${26 + rnd() * 25})`; g.fillRect(4 + i * 63, 4 + j * 46, 59, 42); g.fillStyle = 'rgba(200,220,200,0.5)'; g.font = '7px monospace'; g.fillText(`CAM ${j * 4 + i + 1}  03:0${i}`, 7 + i * 63, 12 + j * 46); g.fillStyle = 'rgba(160,170,160,0.2)'; g.fillRect(10 + i * 63, 24 + j * 46, 20 + rnd() * 30, 3); }
  } else { // rack / temperature dashboard
    g.fillStyle = '#9fd8ff'; g.font = 'bold 12px monospace'; g.fillText(k === 1 ? 'HALL B  THERMAL' : 'UPLINK  STATUS', 8, 16);
    for (let i = 0; i < 24; i++) { const v = 0.3 + rnd() * 0.5; g.fillStyle = v > 0.72 ? '#ff8040' : '#40c8a0'; g.fillRect(8 + i * 10, H - 10 - v * 90, 7, v * 90); }
  }
});

// a light shaft: brightest at the lamp, fading along its length and toward its silhouette edges
function beamMaterial(color, opacity, length) {
  return new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, len: { value: length } },
    vertexShader: 'uniform float len; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = length(position) / len; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float t = clamp(vT, 0.0, 1.0); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(color, opacity * pow(1.0 - t, 1.6) * edge); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

export class CorrinHead {
  constructor(game) { this.game = game; this.anchors = []; this.area = null; this.areaMeshes = null; this.alarm = false; this.gas = 0; this.waterLevel = CH.WL_RUN; this.under = false; this.flashT = 8; this.time = 0; }

  async build() {
    const g = this.game, w = g.world; seedN = 31;
    w.bounds = { ...CH.bounds }; w.navBounds = { ...CH.navBounds }; w.ladders = [];
    w.setTerrain(heightAt, (x, z) => (x > 900 ? 'snow' : x > 380 ? 'concrete' : z < edgeZ(x) ? 'dirt' : 'concrete'));
    this.hf = heightAt;
    this.mats();
    this.atmosphere();
    this.terrain();
    this.sea();
    this.cliffRoute();
    this.facility();
    this.dataHall();
    this.yard();
    this.coast();
    this.tunnel();
    this.flashback();
    this.lightsInit();
    g.renderer.camera.far = 2600; g.renderer.camera.updateProjectionMatrix();
  }

  mats() {
    const M = this.M = {};
    M.rock = pbr('rock', { color: 0x8e8880, key: 'ch_rock' });
    M.rockDark = pbr('rock', { color: 0x605c58, key: 'ch_rockd' });
    M.moor = new THREE.MeshStandardMaterial({ map: canvasTex('ch_moor', 512, 512, (g2, W, H) => {
      g2.fillStyle = '#4e5238'; g2.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 40; const c = rnd(); g2.fillStyle = c < 0.4 ? 'rgba(92,84,58,0.35)' : c < 0.75 ? 'rgba(58,70,40,0.4)' : 'rgba(84,66,70,0.3)'; g2.beginPath(); g2.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, 6.3); g2.fill(); }
      for (let i = 0; i < 9000; i++) { const v = rnd(); g2.fillStyle = v < 0.5 ? 'rgba(120,118,80,0.5)' : v < 0.8 ? 'rgba(40,46,28,0.55)' : 'rgba(140,120,96,0.4)'; const x = rnd() * W, y = rnd() * H; g2.fillRect(x, y, 1.5, 2 + rnd() * 3); }
      for (let i = 0; i < 40; i++) { g2.fillStyle = 'rgba(110,108,104,0.5)'; const x = rnd() * W, y = rnd() * H; g2.beginPath(); g2.ellipse(x, y, 3 + rnd() * 6, 2 + rnd() * 4, 0, 0, 6.3); g2.fill(); }   // stones
    }), roughness: 0.92 });
    M.conc = pbr('concrete', { color: 0x8a8a84, key: 'ch_conc' });
    M.concDark = pbr('concrete', { color: 0x5a5a56, key: 'ch_concd' });
    M.asph = pbr('asphalt', { color: 0x5a5a5a, key: 'ch_asph' });
    M.metal = pbr('metal', { color: 0x8a8e90, key: 'ch_metal' });
    M.paint = pbr('paintedMetal', { color: 0x6a7068, key: 'ch_paint' });
    M.rust = pbr('paintedMetal', { color: 0x6a4a36, key: 'ch_rust' });
    M.yellow = new THREE.MeshStandardMaterial({ color: 0xc89a18, roughness: 0.55, metalness: 0.3 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2c2e30, metalness: 0.65, roughness: 0.5 });
    M.grate = new THREE.MeshStandardMaterial({ map: canvasTex('ch_grate', 64, 64, (g2, W, H) => { g2.fillStyle = '#3a3c3c'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#111'; for (let y = 2; y < H; y += 8) for (let x = 2; x < W; x += 8) g2.fillRect(x, y, 5, 5); }), roughness: 0.6, metalness: 0.6 });
    M.panel = new THREE.MeshStandardMaterial({ map: panelTex(), roughness: 0.6, metalness: 0.2 });
    M.roof = new THREE.MeshStandardMaterial({ color: 0x2c302e, roughness: 0.85 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.7 });
    M.floor = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.55 });
    M.wall = new THREE.MeshStandardMaterial({ color: 0xb8bcb8, roughness: 0.85 });
    M.rack = new THREE.MeshStandardMaterial({ map: rackTex(), emissive: 0xffffff, emissiveMap: rackLed(), emissiveIntensity: 1.6, roughness: 0.45, metalness: 0.4 });
    M.rackSide = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, metalness: 0.45 });
    M.strip = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, toneMapped: false });
    M.lamp = new THREE.MeshBasicMaterial({ color: 0xffb860, toneMapped: false });
    M.redLamp = new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false });
    M.green = new THREE.MeshBasicMaterial({ color: 0x40ff70, toneMapped: false });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x9ab8c4, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }); M.glass.userData.noBatch = true;
    M.window = new THREE.MeshStandardMaterial({ color: 0x20262a, emissive: 0xffd8a0, emissiveIntensity: 0.6, roughness: 0.2 });
    M.desk = new THREE.MeshStandardMaterial({ color: 0x6a6e70, roughness: 0.5 });
    M.screen = [0, 1, 2].map((k) => new THREE.MeshBasicMaterial({ map: screenTex(k), toneMapped: false }));
    M.white = new THREE.MeshStandardMaterial({ color: 0xd8dcd8, roughness: 0.6 });
    M.pipe = new THREE.MeshStandardMaterial({ color: 0x3a5a6a, roughness: 0.5, metalness: 0.4 });
    M.pipeG = new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 0.5, metalness: 0.4 });
    M.tunnel = pbr('concrete', { color: 0x6a6a64, key: 'ch_tun' });
    M.snow = pbr('snowground', { color: 0xc8ccd4, key: 'ch_snow' });
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    this.fogExt = new THREE.FogExp2(0x2a343e, 0.0042);
    this.fogTun = new THREE.FogExp2(0x0a0c0c, 0.045);
    this.fogFlash = new THREE.FogExp2(0x0e1420, 0.012);
    scene.fog = this.fogExt;
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.25;
    this.sky = new Sky(scene, { zenith: 0x10151b, horizon: 0x36424c, stars: 0, sunDir: [0.3, 0.2, -0.9], sunColor: 0x10161c, sunSize: 0.9999 });
    this.hemi = new THREE.HemisphereLight(0x8098b4, 0x2a2c24, 0.85); scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0x9aaac8, 0.62); const sh = settings.data.graphics.shadows;
    key.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    key.shadow.mapSize.set(size, size); Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04;
    scene.add(key); scene.add(key.target); g.sun = key; g.sunOffset = V(-45, 55, 80); this.key = key;
    g.renderer.renderer.toneMappingExposure = 1.35;
    g.effects.setSmokeLight(0.35);
    // driving rain: dense, fast, slanted by the gale from the south-west
    this.rain = new Weather(scene, 'rain', 0.9); this.rain.mat.opacity = 0.28; this.rain.wind.set(5.5, 0, -3.5);
    this.spray = new Weather(scene, 'snow', 0.3); this.spray.mat.color.setHex(0x9aa8b0); this.spray.mat.opacity = 0.35; this.spray.wind.set(7, 0, -4);   // wind-blown spume
    this.snowF = new Weather(scene, 'snow', 0.5); this.snowF.points.visible = false;   // the flashback's snow
  }

  // ---------------- ground: plateau, cliff wall, the shelf at its foot ----------------
  terrain() {
    const scene = this.game.renderer.scene, M = this.M;
    // plateau: a grid per column from the far moor to the cliff edge
    const ribbon = (x0, x1, dx, zFrom, zTo, rows, yFn, mat, um = 8) => {
      const cols = Math.round((x1 - x0) / dx) + 1; const pos = [], uv = [], idx = [];
      for (let i = 0; i < cols; i++) { const x = x0 + i * dx; const za = zFrom(x), zb = zTo(x); for (let j = 0; j <= rows; j++) { const t = j / rows; const z = za + (zb - za) * Math.pow(t, 0.7); pos.push(x, yFn(x, z), z); uv.push(x / um, z / um); } }
      for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows; j++) { const a = i * (rows + 1) + j, b = a + rows + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m;
    };
    ribbon(-900, 250, 5, () => -420, (x) => edgeZ(x) + 0.05, 80, (x, z) => plateauY(x, Math.min(z, edgeZ(x) - 0.01)), M.moor, 10);
    // the shelf and the rocks at the foot (only around the route is it above water)
    ribbon(-160, 60, 1.5, (x) => edgeZ(x) - 4, () => 75, 40, (x, z) => baseY(x, Math.max(z, edgeZ(x))), M.rockDark, 5);
    // the cliff face: rock strata, overhangs, gullies; the top row sits exactly on the edge
    const cols = Math.round(1150 / 1.5), rows = 26; const pos = [], uv = [], idx = [];
    for (let i = 0; i <= cols; i++) {
      const x = -900 + i * 1.5; const e = edgeZ(x); const top = plateauY(x, e - 0.01), bot = -42;
      for (let j = 0; j <= rows; j++) {
        const y = bot + (top - bot) * j / rows;
        const strata = Math.sin(y * 0.85 + fbm(x / 40, 0) * 6) > 0.6 ? 0.9 : 0;
        let inset = 1.2 + fbm(x / 9, y / 7) * 2.6 + strata + Math.max(0, Math.sin(x / 17)) * 1.2 + Math.abs(Math.sin(x / 3.1 + fbm(x / 20, y / 30) * 5)) * 1.1 + fbm(x / 2.2, y / 2.2) * 0.9;
        inset *= smooth(top + 0.2, top - 3, y);
        pos.push(x, y, e - inset); uv.push(x / 5, y / 5);
      }
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const a = i * (rows + 1) + j, b = a + rows + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const cliff = new THREE.Mesh(geo, M.rock); cliff.receiveShadow = true; scene.add(cliff);
    // sea stacks and fallen blocks: silhouettes when the lightning goes
    const stacks = [];
    const stack = (x, z, r, h) => { const s = new THREE.CylinderGeometry(r * 0.7, r, h, 9, 6); const p = s.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.8 + fbm(p.getX(i) + x, p.getY(i) * 0.3 + z) * 0.5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } s.computeVertexNormals(); s.translate(x, -40 + h / 2, z); stacks.push(s); };
    stack(-230, 96, 9, 40); stack(-205, 120, 5, 26); stack(150, 110, 8, 33); stack(-420, 140, 12, 44); stack(-640, 120, 7, 30); stack(-150, 74, 4, 10);
    const sm = new THREE.Mesh(mergeGeometries(stacks.map((s) => s.toNonIndexed())), M.rock); sm.castShadow = true; scene.add(sm);
    const rocks = [];
    for (let i = 0; i < 70; i++) { const x = -110 + rnd() * 100, d = 2 + rnd() * 18; const z = edgeZ(x) + d; const r = 0.5 + rnd() * (d > 12 ? 2.6 : 1.4); const gg = new THREE.IcosahedronGeometry(r, 1); const p = gg.attributes.position; for (let k = 0; k < p.count; k++) { const s = 0.75 + hash(k, i) * 0.5; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.6, p.getZ(k) * s); } gg.translate(x, baseY(x, z) + r * 0.15, z); rocks.push(gg.toNonIndexed()); }
    const rm = new THREE.Mesh(mergeGeometries(rocks.map((r) => { r.computeVertexNormals(); return r; })), M.rockDark); rm.receiveShadow = rm.castShadow = true; scene.add(rm);
    // keep everyone off the cliff wall itself (the heightfield would lift them onto the plateau)
    const w = this.game.world;
    for (let x = -130; x < 40; x += 4) { const e = Math.min(edgeZ(x), edgeZ(x + 4)); w.addBox(V(x, -45, e - 3), V(x + 4, -0.6, e), { walkable: false, surface: 'concrete', cover: false }); }
    w.addBox(V(-125, -45, 30), V(-121, 5, 80), { walkable: false });   // shelf ends
    w.addBox(V(-12, -45, 30), V(-8, -19, 80), { walkable: false });
  }

  // ---------------- the sea: one big displaced plane (waves in the vertex shader, foam on the crests) ----------------
  sea() {
    const scene = this.game.renderer.scene;
    const seg = settings.data.graphics.preset === 'low' ? 90 : 120;
    const geo = new THREE.PlaneGeometry(2600, 2600, seg, seg).rotateX(-Math.PI / 2).translate(-300, CH.SEA, 1100);
    // a finer apron near the route so the swell reads up close (boat, ledge)
    const near = new THREE.PlaneGeometry(400, 320, 130, 104).rotateX(-Math.PI / 2).translate(-60, CH.SEA + 0.02, 190);
    const nm = canvasTex('ch_seanorm', 256, 256, (g2, W, H) => { const img = g2.createImageData(W, H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const nx = (vnoise(i * 0.07, j * 0.07) - 0.5) * 1.4 + Math.sin(i * 0.12 + j * 0.05) * 0.3, nz = (vnoise(i * 0.07 + 40, j * 0.07) - 0.5) * 1.4; const k = (j * W + i) * 4; img.data[k] = 128 + nx * 80; img.data[k + 1] = 128 + nz * 80; img.data[k + 2] = 255; img.data[k + 3] = 255; } g2.putImageData(img, 0, 0); }, false);
    nm.repeat.set(1 / 14, 1 / 14);
    const mat = new THREE.MeshStandardMaterial({ color: 0x16232a, roughness: 0.32, metalness: 0.25, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.5 });
    const uT = { value: 0 }; this.seaTime = uT;
    const W = WAVES.map((w) => `h += ${w.a.toFixed(3)} * sin(${w.k.toFixed(4)} * (${w.dx.toFixed(4)} * p.x + ${w.dz.toFixed(4)} * p.z) - ${w.w.toFixed(4)} * uTime); g += ${(w.a * w.k).toFixed(4)} * cos(${w.k.toFixed(4)} * (${w.dx.toFixed(4)} * p.x + ${w.dz.toFixed(4)} * p.z) - ${w.w.toFixed(4)} * uTime) * vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)});`).join('\n');
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uT;
      sh.vertexShader = 'uniform float uTime; varying float vCrest; varying vec2 vWorld;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `vec3 p0 = position; float h = 0.0; vec2 g = vec2(0.0);\n{ vec3 p = p0; ${W} }\nvec3 objectNormal = normalize(vec3(-g.x, 1.0, -g.y));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(p0.x, p0.y + h, p0.z); vCrest = h; vWorld = p0.xz;');
      sh.fragmentShader = 'varying float vCrest; varying vec2 vWorld;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n float fo = smoothstep(0.8, 1.6, vCrest) * (0.55 + 0.45 * sin(vWorld.x * 0.7) * sin(vWorld.y * 0.9));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.68, 0.7), clamp(fo, 0.0, 0.8));')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>');
    };
    // world-space UVs for the ripple normal map (14 m tile)
    for (const gg of [geo, near]) { const p = gg.attributes.position, uv = gg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i)); }
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.userData.dynamic = true; m.userData.area = 'ext'; scene.add(m);
    const m2 = new THREE.Mesh(near, mat); m2.frustumCulled = false; m2.userData.dynamic = true; m2.userData.area = 'ext'; m2.renderOrder = 1; scene.add(m2);
    // the near apron replaces the big plane there: punch it by lowering the big plane's vertices under the apron
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (x > -255 && x < 135 && z > 35 && z < 345) p.setY(i, CH.SEA - 3); }
    this.seaMesh = m; this.seaNormal = nm;
    // the swell breaking at the foot of the cliff: spray bursts along the shelf edge and the stacks
    this.surfAt = []; for (let x = -130; x < 40; x += 7) this.surfAt.push(V(x, CH.SEA, edgeZ(x) + (x > -100 && x < -20 ? 14 : 2)));
    for (const [x, z] of [[-230, 96], [150, 110], [-205, 120]]) this.surfAt.push(V(x, CH.SEA, z - 8));
    this.surfT = 0;
  }
  seaY(x, z) { return CH.SEA + waveH(x, z, this.seaTime.value); }
  seaTilt(x, z) { return waveGrad(x, z, this.seaTime.value); }

  // ---------------- the way up: buttress ladder, the ledge, the storm-torn stair, the pump-house platform ----------------
  cliffRoute() {
    const g = this.game, scene = g.renderer.scene, w = g.world, M = this.M, props = g.props;
    const B = CH.buttress, L = CH.ledge, P = CH.plat;
    // a concrete buttress (old outfall pier) against the cliff with an iron ladder on its west face
    props.box(V(B.x1 - B.x0, B.top - CH.SHELF + 1, B.z1 - B.z0), V((B.x0 + B.x1) / 2, (B.top + CH.SHELF - 1) / 2, (B.z0 + B.z1) / 2), M.concDark, { surface: 'concrete' });
    const lad = CH.ladder; w.ladders.push({ min: V(lad.x0, 0, lad.z0), max: V(lad.x1, 0, lad.z1), top: lad.top });
    const rails = [], rungs = [];
    for (const z of [lad.z0 + 0.15, lad.z1 - 0.15]) rails.push(new THREE.BoxGeometry(0.06, B.top - CH.SHELF + 1.2, 0.06).translate(B.x0 - 0.18, (B.top + CH.SHELF) / 2 + 0.6, z));
    for (let y = CH.SHELF + 0.3; y < B.top + 1; y += 0.3) rungs.push(new THREE.BoxGeometry(0.04, 0.04, lad.z1 - lad.z0 - 0.3).translate(B.x0 - 0.18, y, (lad.z0 + lad.z1) / 2));
    scene.add(new THREE.Mesh(mergeGeometries([...rails, ...rungs]), M.rust));
    for (const z of [lad.z0 + 0.15, lad.z1 - 0.15]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 4, 12, Math.PI), M.rust); hoop.position.set(B.x0 - 0.18, B.top + 0.7, z); hoop.rotation.set(0, Math.PI / 2, Math.PI / 2); scene.add(hoop); }
    // rock steps from the shelf to the ladder foot
    for (const [x, z, top, s] of [[-80.5, 42.4, -33.6, 1.6], [-78.6, 41.6, -32.3, 1.4]]) { props.box(V(s, top - CH.SHELF + 1, s), V(x, (top + CH.SHELF - 1) / 2, z), M.rockDark, { surface: 'concrete' }); }
    // the ledge: a weathered shelf of rock with an iron handline pinned along the wall
    props.box(V(L.x1 - L.x0, 1.2, L.z1 - L.z0), V((L.x0 + L.x1) / 2, L.y - 0.6, (L.z0 + L.z1) / 2), M.rock, { surface: 'concrete' });
    const LD = CH.landing0; props.box(V(LD.x1 - LD.x0, 1.2, LD.z1 - LD.z0), V((LD.x0 + LD.x1) / 2, L.y - 0.6, (LD.z0 + LD.z1) / 2), M.rock, { surface: 'concrete' });
    const line = []; for (let x = L.x0; x < L.x1; x += 3) { line.push(new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(x, L.y + 1.05, 40.15)); } line.push(new THREE.CylinderGeometry(0.015, 0.015, L.x1 - L.x0, 4).rotateZ(Math.PI / 2).translate((L.x0 + L.x1) / 2, L.y + 1.05, 40.3));
    scene.add(new THREE.Mesh(mergeGeometries(line.map((q) => q.toNonIndexed())), M.rust));
    // the torn-off lower flight of the stair: twisted steel hanging toward the sea
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), M.rust); st.position.set(-38 + i * 0.4, -27 - i * 0.9, 42.6 + i * 0.5); st.rotation.set(0.4 + i * 0.2, 0.3, 0.2 * i); scene.add(st); }
    const twist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.5, 0.12), M.rust); twist.position.set(-37.4, -28.5, 43.4); twist.rotation.set(0.5, 0, 0.3); scene.add(twist);
    // the steel stair: two flights (lane A z 40.2..41.4, lane B z 41.6..42.8), 0.2 m risers
    const stepsG = [], railG = [];
    const flight = (xs, xe, y0, y1, za, zb) => {
      const n = Math.round((y1 - y0) / 0.2), run = (xe - xs) / n;
      for (let i = 0; i < n; i++) { const x = xs + run * (i + 0.5), top = y0 + 0.2 * (i + 1); stepsG.push(new THREE.BoxGeometry(Math.abs(run) + 0.02, 0.05, zb - za).translate(x, top - 0.025, (za + zb) / 2)); w.addBox(V(Math.min(x - run / 2, x + run / 2), top - 0.25, za), V(Math.max(x - run / 2, x + run / 2), top, zb), { surface: 'metal' }); }
      for (const z of [za, zb]) { const len = Math.hypot(xe - xs, y1 - y0); const s = new THREE.BoxGeometry(len, 0.22, 0.05); s.rotateZ(Math.atan2(y1 - y0, xe - xs)); s.translate((xs + xe) / 2, (y0 + y1) / 2 + 0.1, z); stepsG.push(s); const r = new THREE.CylinderGeometry(0.025, 0.025, len, 5).rotateZ(Math.PI / 2 + Math.atan2(y1 - y0, xe - xs)); r.translate((xs + xe) / 2, (y0 + y1) / 2 + 1.0, z); railG.push(r); }
    };
    flight(-36, -30.2, L.y, -22, 40.2, 41.4);
    const lnd = (x0, x1, y, z0, z1) => { stepsG.push(boxM(x1 - x0, 0.08, z1 - z0).translate((x0 + x1) / 2, y - 0.04, (z0 + z1) / 2)); w.addBox(V(x0, y - 0.3, z0), V(x1, y, z1), { surface: 'metal' }); };
    lnd(-30.2, -28.4, -22, 40.2, 42.8);
    flight(-28.4, -34.4, -22, P.y, 41.6, 42.8);
    w.addBox(V(-35.6, L.y, 41.45), V(-30.2, -17, 41.55), { walkable: false, cover: false });          // rail between the lanes
    w.addBox(V(-36, L.y, 42.9), V(-28.4, -15, 43.0), { walkable: false, cover: false });             // outer rail
    w.addBox(V(-28.4, L.y, 40.2), V(-28.3, -15, 43.0), { walkable: false, cover: false });
    // the upper flights to the top (Nadia's way; a chained gate at their foot keeps Daniel to the pump house)
    for (let k = 0; k < 4; k++) { const y0 = P.y + k * 4.5, y1 = y0 + 4.5; const xa = k % 2 ? -26 : -32, xb = k % 2 ? -32 : -26; const za = k % 2 ? 41.6 : 40.2; const n = Math.round(4.5 / 0.2), run = (xb - xa) / n; for (let i = 0; i < n; i++) stepsG.push(new THREE.BoxGeometry(Math.abs(run) + 0.02, 0.05, 1.2).translate(xa + run * (i + 0.5), y0 + 0.2 * (i + 1), za + 0.6)); stepsG.push(boxM(1.8, 0.08, 2.6).translate(k % 2 ? -32.9 : -25.1, y1, 41.5)); }
    w.addBox(V(-33.6, P.y, 40.1), V(-33.4, P.y + 2.2, 41.5), { walkable: false });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.3), M.rust); gate.position.set(-33.5, P.y + 0.6, 40.8); scene.add(gate);
    const sm = new THREE.Mesh(mergeGeometries(stepsG.map((q) => q.toNonIndexed())), M.grate); sm.castShadow = true; scene.add(sm);
    scene.add(new THREE.Mesh(mergeGeometries(railG.map((q) => q.toNonIndexed())), M.yellow));
    // the pump-house platform on steel brackets, and the pump house built into the rock
    props.box(V(P.x1 - P.x0, 0.4, P.z1 - P.z0), V((P.x0 + P.x1) / 2, P.y - 0.2, (P.z0 + P.z1) / 2), M.concDark, { surface: 'concrete' });
    for (const x of [-45.5, -40, -35]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 7.5), M.rust); br.position.set(x, P.y - 2.8, 43.2); br.rotation.x = -0.75; scene.add(br); }
    w.addBox(V(P.x0, P.y, P.z1 - 0.1), V(P.x1, P.y + 1.1, P.z1), { walkable: false, cover: false });
    w.addBox(V(P.x0, P.y, P.z0), V(P.x0 + 0.1, P.y + 1.1, P.z1), { walkable: false, cover: false });
    w.addBox(V(P.x1 - 0.1, P.y, 43.0), V(P.x1, P.y + 1.1, P.z1), { walkable: false, cover: false });
    const rl = []; for (const [x0, z0, x1, z1] of [[P.x0, P.z1, P.x1, P.z1], [P.x0, P.z0, P.x0, P.z1], [P.x1, 43, P.x1, P.z1]]) { const len = Math.hypot(x1 - x0, z1 - z0); for (const y of [0.55, 1.05]) rl.push(new THREE.BoxGeometry(x1 - x0 || 0.05, 0.05, z1 - z0 || 0.05).translate((x0 + x1) / 2, P.y + y, (z0 + z1) / 2)); for (let s = 0; s <= len; s += 1.5) { const f = s / len; rl.push(new THREE.BoxGeometry(0.05, 1.05, 0.05).translate(x0 + (x1 - x0) * f, P.y + 0.52, z0 + (z1 - z0) * f)); } }
    scene.add(new THREE.Mesh(mergeGeometries(rl.map((q) => q.toNonIndexed())), M.yellow));
    const H = CH.pumpHouse; const ph = new THREE.Mesh(boxM(H.x1 - H.x0, 5.5, H.z1 - H.z0, 3, 3), M.conc); ph.position.set((H.x0 + H.x1) / 2, P.y + 2.75, (H.z0 + H.z1) / 2); ph.castShadow = true; scene.add(ph);
    w.addBox(V(H.x0, P.y, H.z0), V(H.x1, P.y + 5.5, H.z1), { walkable: false, surface: 'concrete' });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.08), M.rust); door.position.set(CH.pumpDoor.x, P.y + 1.1, H.z1 + 0.04); scene.add(door);
    const ds = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('PUMP HOUSE 2', 'SEAWATER INTAKE · AUTHORISED ONLY', '#c8a020', '#141414'), toneMapped: false })); ds.position.set(CH.pumpDoor.x, P.y + 2.5, H.z1 + 0.05); scene.add(ds);
    this.anchors.push({ pos: V(CH.pumpDoor.x + 1.2, P.y + 2.6, H.z1 + 1.4), color: 0xffb060, power: 5, dist: 11, area: 'ext' });
    const bulk = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M.lamp); bulk.position.set(CH.pumpDoor.x + 1.2, P.y + 2.8, H.z1 + 0.15); scene.add(bulk); this.glow(V(CH.pumpDoor.x + 1.2, P.y + 2.8, H.z1 + 0.3), 0xffb060, 2.2);
    // intake pipes down the rock into the sea, louvred vents on the house
    for (const x of [-44.5, -39.5]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 20, 14), M.rust); pp.position.set(x, P.y - 9.7, 43.6); pp.rotation.x = -0.22; pp.castShadow = true; scene.add(pp); for (let y = P.y - 3; y > CH.SEA; y -= 4) { const cl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 1.6), M.steel); cl.position.set(x, y, 41.2 + (P.y - y) * 0.22); scene.add(cl); } }
    for (let i = 0; i < 3; i++) { const lv = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.2), M.steel); lv.position.set(-44.5, P.y + 3.6 + i * 0.25, H.z1 + 0.08); lv.rotation.x = 0.5; scene.add(lv); }
  }

  // ---------------- the facility on the headland ----------------
  facility() {
    const g = this.game, scene = g.renderer.scene, w = g.world, M = this.M, props = g.props, F = CH.fence;
    // yard paving
    const slab = (x0, x1, z0, z1, mat, y = 0.03, um = 6) => { const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / um, uv.getY(i) * (z1 - z0) / um); const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); };
    slab(F.x0, F.x1, F.z0, 30, M.asph, 0.03, 8);
    slab(-38, -14, 2, 26, new THREE.MeshStandardMaterial({ map: padTex(), roughness: 0.6 }), 0.06, 24);
    // the perimeter: double fence with wire on the inland sides, a rail along the cliff edge
    props.fence(F.x0, F.z0, F.x1, F.z0, { height: 3.4 }); props.fence(F.x0, F.z0, F.x0, F.z1, { height: 3.4 }); props.fence(F.x1, F.z0, F.x1, F.z1, { height: 3.4 });
    props.fence(F.x0 - 5, F.z0 - 5, F.x1 + 5, F.z0 - 5, { height: 2.6 });
    for (let x = F.x0; x < F.x1; x += 2) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), M.steel); pole.position.set(x, 0.6, F.z1 + 1); scene.add(pole); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(F.x1 - F.x0, 0.06, 0.06), M.yellow); rail.position.set((F.x0 + F.x1) / 2, 1.15, F.z1 + 1); scene.add(rail);
    w.addBox(V(F.x0, 0, F.z1 + 0.9), V(F.x1, 1.2, F.z1 + 1.1), { walkable: false, cover: false });
    // gate & guardhouse with a barrier arm
    const G = CH.gate;
    props.box(V(5, 3, 4), V(G.x - 9, 1.5, G.z + 6), M.conc, { surface: 'concrete' });
    const gw = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 0.05), M.window); gw.position.set(G.x - 9, 2, G.z + 3.97); scene.add(gw);
    this.barrier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.12), new THREE.MeshStandardMaterial({ map: canvasTex('ch_bar', 64, 8, (g2, W2) => { for (let x = 0; x < W2; x += 16) { g2.fillStyle = '#d82020'; g2.fillRect(x, 0, 8, 8); g2.fillStyle = '#f0f0f0'; g2.fillRect(x + 8, 0, 8, 8); } }) }));
    this.barrier.position.set(G.x, 1.0, G.z); this.barrier.userData.dynamic = true; scene.add(this.barrier);
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('CORRIN HEAD', 'SABLE RIDGE DATA SERVICES · NO ENTRY', '#1a2a3a', '#e8f0f8'), toneMapped: false })); gs.position.set(G.x + 9, 2.2, G.z - 6); gs.rotation.y = Math.PI; scene.add(gs);
    // road to the gate from the north and the coast road west
    const road = (pts, wd, mat) => { const P2 = []; for (let s = 0; s < pts.length - 1; s++) { const [ax, az] = pts[s], [bx, bz] = pts[s + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3)); for (let i = 0; i < n; i++) { const t = i / n; P2.push([ax + (bx - ax) * t, az + (bz - az) * t]); } } P2.push(pts.at(-1)); const pos = [], uv = [], idx = []; let dist = 0; for (let i = 0; i < P2.length; i++) { const [x, z] = P2[i]; const [px, pz] = P2[Math.max(0, i - 1)], [qx, qz] = P2[Math.min(P2.length - 1, i + 1)]; let dx = qx - px, dz = qz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (i) dist += Math.hypot(x - P2[i - 1][0], z - P2[i - 1][1]); for (const s of [-1, 1]) { const vx = x - dz * wd / 2 * s, vz = z + dx * wd / 2 * s; pos.push(vx, heightAt(vx, vz) + 0.06, vz); uv.push((s + 1) / 2 * wd / 4, dist / 4); } if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -3; scene.add(m); };
    const rm = pbr('asphalt', { color: 0x4a4a4a, key: 'ch_road' });
    road([[G.x, -410], [G.x, -200], [G.x, G.z - 2]], 7, rm);
    this.coastRoad = [[G.x, -200], [-40, -205], [-140, -170]]; for (let x = -160; x >= -880; x -= 40) this.coastRoad.push([x, roadZ(x)]);
    road(this.coastRoad, 6.5, rm);
    // guard towers at the corners (the one by the cliff carries the searchlight)
    for (const [x, z] of [[F.x1 - 4, F.z1 - 3], [F.x0 + 4, F.z0 + 4], [F.x1 - 4, F.z0 + 4]]) props.watchtower(x, z, { light: false });
    // the searchlight: a lamp head on the cliff tower, a long visible beam, one spotlight
    const T = CH.tower; const head = new THREE.Group(); head.position.set(T.x, 3.6, T.z + 3.3); head.userData.dynamic = true; scene.add(head);
    // a cantilevered gantry at the very edge carries the lamp out over the face
    props.box(V(1.4, 3.2, 1.4), V(T.x, 1.6, T.z), M.paint, { surface: 'metal' }); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.6), M.steel); arm.position.set(T.x, 3.2, T.z + 1.6); scene.add(arm);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 14).rotateX(Math.PI / 2), M.steel); head.add(can);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false })); lens.position.z = 0.46; head.add(lens);
    const beamGeo = new THREE.CylinderGeometry(0.35, 3.6, 70, 20, 1, true).translate(0, -35, 0).rotateX(-Math.PI / 2);
    const beamMat = beamMaterial(0xd8e4f0, 0.16, 70);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.z = 0.4; head.add(beam);
    const spot = new THREE.SpotLight(0xe8f0ff, 900, 140, 0.075, 0.35, 1.6); spot.position.set(0, 0, 0.5); head.add(spot); head.add(spot.target); spot.target.position.set(0, 0, 10);
    const lg = this.glow(V(0, 0, 0.6), 0xeef4ff, 3.5); scene.remove(lg); head.add(lg);
    this.search = { head, beam, spot, on: true, t: 0, aim: V(-60, -20, 42), mode: 'sweep' };
    // floodlights on poles around the yard (sodium), each a pool anchor
    for (const [x, z] of [[-50, 26], [-4, 26], [10, -70], [-50, -70], [100, -10], [100, -80], [40, -110], [-20, -20]]) this.flood(x, z);
    // masts with red obstruction lights; the radome; satellite dishes
    this.beacons = [];
    for (const [x, z, h] of [[118, -110, 46], [-32, -110, 32]]) {
      const lat = []; for (let y = 0; y < h; y += 3) { for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) lat.push(new THREE.BoxGeometry(0.08, 3, 0.08).translate(x + a * (1 - y / h * 0.6), y + 1.5, z + b * (1 - y / h * 0.6))); lat.push(new THREE.BoxGeometry(1.6 * (1 - y / h * 0.6), 0.06, 0.06).translate(x, y, z - 0.8 * (1 - y / h * 0.6))); }
      scene.add(new THREE.Mesh(mergeGeometries(lat.map((q) => q.toNonIndexed())), M.paint));
      for (const y of [h * 0.5, h]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.redLamp.clone()); b.position.set(x, y + 0.2, z); b.userData.dynamic = true; scene.add(b); this.beacons.push(b); }
      w.addBox(V(x - 1, 0, z - 1), V(x + 1, h, z + 1), { walkable: false });
    }
    const rad = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 3), M.white); rad.position.set(120, 12.5, -80); rad.castShadow = true; scene.add(rad);
    props.box(V(8, 6, 8), V(120, 3, -80), M.conc, { surface: 'concrete' });
    for (const [x, z, r] of [[96, -100, 3.2], [104, -112, 2.4]]) { const dish = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, 1.0), new THREE.MeshStandardMaterial({ color: 0xd0d4d0, roughness: 0.5, side: THREE.DoubleSide })); dish.position.set(x, r + 2.2, z); dish.rotation.set(-0.9, 0.6, 0); scene.add(dish); props.box(V(0.8, 2.6, 0.8), V(x, 1.3, z), M.paint, { surface: 'metal' }); }
  }
  flood(x, z) {
    const scene = this.game.renderer.scene, M = this.M; const h = 9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 8), M.steel); pole.position.set(x, h / 2, z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), M.steel); head.position.set(x, h, z); scene.add(head);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4).rotateX(Math.PI / 2), M.lamp); glow.position.set(x, h - 0.14, z); scene.add(glow);
    this.game.world.addBox(V(x - 0.15, 0, z - 0.15), V(x + 0.15, h, z + 0.15), { walkable: false, cover: false });
    this.anchors.push({ pos: V(x, h - 1, z), color: 0xffb868, power: 70, dist: 30, area: 'ext' });
    this.glow(V(x, h - 0.2, z), 0xffc070, 5);
  }
  // a soft halo round a lamp so the lights read through the rain from the sea and the air
  glow(pos, color, size) {
    if (!this._glowTex) this._glowTex = canvasTex('ch_glow', 64, 64, (g2, W, H) => { const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, W, H); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    sp.position.copy(pos); sp.scale.set(size, size, 1); sp.userData.area = 'ext'; this.game.renderer.scene.add(sp); return sp;
  }

  // ---------------- data hall B: the server hall, the operations room, the plant room ----------------
  dataHall() {
    const g = this.game, scene = g.renderer.scene, w = g.world, M = this.M, props = g.props, H = CH.hall;
    const wall = (x0, z0, x1, z1, h = H.h, mat = M.panel, t = 0.4) => { const W = Math.abs(x1 - x0) || t, D = Math.abs(z1 - z0) || t; const m = new THREE.Mesh(boxM(W, h, D, 3, 3), mat); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; scene.add(m); return w.addBox(V(Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), 0, Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0)), V(Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0), h, Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0)), { walkable: false, surface: 'metal' }); };
    // shell: west wall with the double door (z -40..-36), north wall with the roll-up door (x 60..68), east wall with the plant door
    wall(H.x0, H.z0, H.x0, -40); wall(H.x0, -36, H.x0, H.z1);
    wall(H.x0, H.z1, CH.rollDoor.x0, H.z1); wall(CH.rollDoor.x1, H.z1, H.x1, H.z1);
    wall(H.x0, H.z0, H.x1, H.z0);
    wall(H.x1, H.z0, H.x1, -46); wall(H.x1, -44, H.x1, H.z1);
    const lintel = (x, z, wd, alongZ) => { const m = new THREE.Mesh(boxM(alongZ ? 0.4 : wd, H.h - 3, alongZ ? wd : 0.4, 3, 3), M.panel); m.position.set(x, 3 + (H.h - 3) / 2, z); scene.add(m); };
    lintel(H.x0, -38, 4, true); lintel((CH.rollDoor.x0 + CH.rollDoor.x1) / 2, H.z1, 8, false); lintel(H.x1, -45, 2, true);
    // roof (inside: dark ceiling) and the interior floor
    const roof = new THREE.Mesh(new THREE.BoxGeometry(H.x1 - H.x0 + 0.8, 0.5, H.z1 - H.z0 + 0.8), M.roof); roof.position.set((H.x0 + H.x1) / 2, H.h + 0.25, (H.z0 + H.z1) / 2); roof.castShadow = true; scene.add(roof);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0).rotateX(-Math.PI / 2), M.floor); const fuv = fl.geometry.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * (H.x1 - H.x0) / 2.4, fuv.getY(i) * (H.z1 - H.z0) / 2.4); fl.position.set((H.x0 + H.x1) / 2, 0.05, (H.z0 + H.z1) / 2); fl.receiveShadow = true; scene.add(fl);
    w.indoorZones.push({ min: V(H.x0, -1, H.z0), max: V(H.x1, H.h, H.z1) });
    // doors: the west double door and the roll-up door are colliders the mission removes
    this.westLeaves = []; for (const dz of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 2), M.steel); leaf.position.set(H.x0, 1.3, -38 + dz); leaf.userData.dynamic = true; scene.add(leaf); this.westLeaves.push(leaf); }
    this.westDoorC = w.addBox(V(H.x0 - 0.2, 0, -40), V(H.x0 + 0.2, 3, -36), { walkable: false, surface: 'metal' });
    const rd = CH.rollDoor; this.roll = new THREE.Mesh(new THREE.BoxGeometry(rd.x1 - rd.x0, 3, 0.15), new THREE.MeshStandardMaterial({ map: canvasTex('ch_roll', 64, 64, (g2, W2, H2) => { g2.fillStyle = '#8a8e8a'; g2.fillRect(0, 0, W2, H2); for (let y = 0; y < H2; y += 4) { g2.fillStyle = 'rgba(0,0,0,0.35)'; g2.fillRect(0, y, W2, 1); } }), roughness: 0.5, metalness: 0.5 }));
    this.roll.position.set((rd.x0 + rd.x1) / 2, 1.5, rd.z); this.roll.userData.dynamic = true; scene.add(this.roll);
    this.rollC = w.addBox(V(rd.x0, 0, rd.z - 0.2), V(rd.x1, 3, rd.z + 0.2), { walkable: false, surface: 'metal' });
    this.plantC = w.addBox(V(H.x1 - 0.2, 0, -46), V(H.x1 + 0.2, 3, -44), { walkable: false, surface: 'metal' });
    const pdoor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 1.8), M.steel); pdoor.position.set(H.x1, 1.2, -45); pdoor.userData.dynamic = true; scene.add(pdoor); this.plantLeaf = pdoor;
    // exterior: signage, louvres, rooftop chillers and stacks, the cable bridge to the plant yard
    const sn = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: signTexture('DATA HALL B', 'SABLE RIDGE DATA SERVICES · CORRIN HEAD', '#203040', '#e8eef4'), toneMapped: false })); sn.position.set(H.x0 - 0.22, 8, -26); sn.rotation.y = -Math.PI / 2; scene.add(sn);
    const louv = []; for (let z = H.z0 + 4; z < H.z1 - 4; z += 6) for (let y = 5; y < 9; y += 0.4) louv.push(new THREE.BoxGeometry(0.3, 0.06, 4).translate(H.x1 + 0.25, y, z));
    scene.add(new THREE.Mesh(mergeGeometries(louv.map((q) => q.toNonIndexed())), M.steel));
    for (let x = H.x0 + 8; x < H.x1 - 6; x += 12) { props.box(V(8, 2.4, 4), V(x, H.h + 1.7, H.z0 + 8), M.paint, { collide: false }); for (const dx of [-2, 2]) { const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16), M.black); fan.position.set(x + dx, H.h + 2.95, H.z0 + 8); scene.add(fan); } }
    for (const [x, z] of [[30, -14], [84, -14]]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 5, 12), M.steel); st.position.set(x, H.h + 2.5, z); scene.add(st); }
    // ---- interior ----
    this.hallLights = [];
    const R = this.rackMeshes = [];
    const rackG = [], sideG = [], trayG = [], stripG = [];
    for (const x of CH.rows) for (const [z0, z1] of CH.rowZ) {
      const len = z1 - z0; const geo = boxM(1.1, 2.2, len, 0.6, 2.2);   // both long faces show rack doors, one 0.6 m rack per tile
      rackG.push(geo.translate(x, 1.1, (z0 + z1) / 2));
      sideG.push(new THREE.BoxGeometry(1.14, 0.1, len + 0.04).translate(x, 2.25, (z0 + z1) / 2));
      w.addBox(V(x - 0.55, 0, z0), V(x + 0.55, 2.2, z1), { walkable: false, surface: 'metal' });
      trayG.push(new THREE.BoxGeometry(0.5, 0.1, len).translate(x, 3.1, (z0 + z1) / 2));
      for (let z = z0 + 1; z < z1; z += 3) trayG.push(new THREE.BoxGeometry(0.04, 0.8, 0.04).translate(x, 3.5, z));
    }
    // light strips over the aisles
    for (let x = 25; x < 79; x += 6) { stripG.push(new THREE.BoxGeometry(0.18, 0.06, 36).translate(x, 4.6, -40)); }
    const rackMesh = new THREE.Mesh(mergeGeometries(rackG.map((q) => q.toNonIndexed())), M.rack); rackMesh.castShadow = true; scene.add(rackMesh); R.push(rackMesh);
    scene.add(new THREE.Mesh(mergeGeometries(sideG.map((q) => q.toNonIndexed())), M.rackSide));
    scene.add(new THREE.Mesh(mergeGeometries(trayG.map((q) => q.toNonIndexed())), M.yellow));
    const strips = new THREE.Mesh(mergeGeometries(stripG.map((q) => q.toNonIndexed())), M.strip); strips.userData.dynamic = true; scene.add(strips); this.strips = strips;
    for (let x = 31; x < 79; x += 12) for (const z of [-50, -30]) this.anchors.push({ pos: V(x, 4.2, z), color: 0xd8ecff, power: 22, dist: 16, area: 'ext', hall: true });
    // cooling units (CRAH) along the south wall, a cable ladder overhead across the cross aisle
    for (let x = 26; x < 78; x += 8) props.box(V(3, 2.4, 1), V(x, 1.2, H.z0 + 0.9), M.white, { surface: 'metal' });
    // the asset terminal in the cross aisle
    const term = props.box(V(0.6, 1.2, 0.5), V(CH.assetTerm.x, 0.6, CH.assetTerm.z), M.steel, { surface: 'metal' });
    const ts = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), M.screen[1]); ts.position.set(CH.assetTerm.x, 1.35, CH.assetTerm.z + 0.26); ts.rotation.x = -0.3; scene.add(ts); this.assetScreen = ts;
    // rack H-17: a black cabinet with a Kestrel lease tag, the drive sled half out once opened
    const rk = CH.rack;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('H-17', 'KESTREL RISK ADVISORY · LEASED', '#e06a1a', '#141414'), toneMapped: false })); tag.position.set(rk.x + 0.02, 2.0, rk.z); tag.rotation.y = Math.PI / 2; scene.add(tag);
    const rowTag = (x, z, txt) => { const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: signTexture(txt, '', '#1a2a3a', '#ffffff'), toneMapped: false })); t2.position.set(x, 2.6, z); scene.add(t2); };
    CH.rows.forEach((x, i) => { rowTag(x, -22.9, `ROW ${String.fromCharCode(65 + i)}`); rowTag(x, -40.1, `ROW ${String.fromCharCode(65 + i)}`); });
    this.sled = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.4 })); this.sled.position.set(rk.x + 0.05, 1.3, rk.z); this.sled.userData.dynamic = true; scene.add(this.sled);
    this.sledLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.3), M.green.clone()); this.sledLed.position.set(rk.x + 0.32, 1.3, rk.z); this.sledLed.userData.dynamic = true; this.sledLed.visible = false; scene.add(this.sledLed);
    // the operations room (NOC): a glass wall, desks, a video wall of camera feeds; two night technicians work here
    const N = CH.noc;
    wall(N.x0, N.z0, CH.nocDoor.x - 1, N.z0, 3, M.wall, 0.12); wall(CH.nocDoor.x + 1, N.z0, N.x1, N.z0, 3, M.wall, 0.12); wall(N.x1, N.z0, N.x1, N.z1, 3, M.wall, 0.2);
    for (const o of scene.children.slice(-3)) { o.visible = false; o.userData.hidden = true; }   // drawn below as glass + a solid east wall
    for (const [x0, x1] of [[N.x0, CH.nocDoor.x - 1], [CH.nocDoor.x + 1, N.x1]]) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2.8), M.glass); gl.position.set((x0 + x1) / 2, 1.5, N.z0); scene.add(gl); const fr = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, 0.12), M.steel); fr.position.set((x0 + x1) / 2, 0.05, N.z0); scene.add(fr); const fr2 = fr.clone(); fr2.position.y = 2.95; scene.add(fr2); }
    const nw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, N.z1 - N.z0), M.wall); nw.position.set(N.x1, 1.5, (N.z0 + N.z1) / 2); scene.add(nw);
    w.colliders.at(-3).seeThrough = true; w.colliders.at(-2).seeThrough = true;
    const nceil = new THREE.Mesh(new THREE.BoxGeometry(N.x1 - N.x0, 0.2, N.z1 - N.z0), M.white); nceil.position.set((N.x0 + N.x1) / 2, 3.1, (N.z0 + N.z1) / 2); scene.add(nceil);
    this.nocDoorLeaf = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 0.06), M.glass); this.nocDoorLeaf.position.set(CH.nocDoor.x + 1.9, 1.3, N.z0 - 0.08);   // open until the lockdown this.nocDoorLeaf.userData.dynamic = true; scene.add(this.nocDoorLeaf);
    this.nocDoorC = null;   // locked in the lockdown
    for (let i = 0; i < 3; i++) { const dx = 25 + i * 6; props.box(V(4.4, 0.75, 1.2), V(dx, 0.38, -14), M.desk, { surface: 'wood' }); for (const k of [-1.2, 0, 1.2]) { const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), M.screen[(i + k + 3) % 3 | 0]); mon.position.set(dx + k, 1.15, -14.5); mon.rotation.y = Math.PI; scene.add(mon); } }
    const vw = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.6), M.screen[0]); vw.position.set(33, 1.9, N.z1 - 0.15); vw.rotation.y = Math.PI; scene.add(vw);
    this.anchors.push({ pos: V(33, 2.6, -14), color: 0xbad8ff, power: 14, dist: 12, area: 'ext', hall: true });
    this.nocPanel = V(CH.nocDoor.x + 1.6, 1.3, N.z0 - 0.3);
    const kp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.06), M.steel); kp.position.copy(this.nocPanel).setZ(N.z0 - 0.08); scene.add(kp);
    this.nocLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), M.green.clone()); this.nocLed.position.copy(this.nocPanel).add(V(0, 0.1, 0.05)).setZ(N.z0 - 0.12); this.nocLed.userData.dynamic = true; scene.add(this.nocLed);
    w.indoorZones.push({ min: V(N.x0, -1, N.z0), max: V(N.x1, 3, N.z1) });
    // the staging area by the roll-up door: pallets of new servers, a pallet truck
    for (const [x, z] of [[52, -14], [56, -15], [72, -13], [75, -16], [70, -18]]) props.box(V(1.2, 1.4, 1.0), V(x, 0.7, z), M.white, { surface: 'wood' });
    props.box(V(1.4, 1.1, 2.4), V(62, 0.55, -15), M.yellow, { surface: 'metal' });
    // plant room: chillers, pipework, the hatch from the tunnel shaft
    const P = CH.plant; wall(P.x0, P.z0, P.x0, -50, H.h, M.wall); wall(P.x0, -48, P.x0, P.z1, H.h, M.wall); wall(P.x0, P.z1, P.x1, P.z1, H.h, M.wall);
    for (const z of [-60, -52]) { props.box(V(4, 2.6, 3), V(88, 1.3, z + 1.5), M.pipeG, { surface: 'metal' }); }
    for (let y = 3.5; y < 6; y += 1.2) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 21, 12).rotateX(Math.PI / 2), M.pipe); pp.position.set(81.5, y, -51); scene.add(pp); }
    // electrical panels on the north wall, a pump skid, valve manifold, floor markings
    for (let x = 81.5; x < 91; x += 1.6) { const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.6), M.paint); cab.position.set(x, 1.1, -40.6); scene.add(cab); const lt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), (x * 10) % 3 < 1.5 ? M.green : M.lamp); lt.position.set(x - 0.4, 1.9, -40.92); scene.add(lt); }
    w.addBox(V(80.6, 0, -41), V(91.6, 2.2, -40.2), { walkable: false, surface: 'metal' });
    props.box(V(2.4, 1.4, 1.6), V(83, 0.7, -46), M.pipe, { surface: 'metal' });
    for (let x = 82; x < 91; x += 1.4) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 10), M.pipe); v.position.set(x, 1.6, -61.4); scene.add(v); const hw = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: 0x8a1a14 })); hw.position.set(x, 1.4, -61.1); scene.add(hw); }
    for (const [x, z, sx, sz] of [[86, -50.5, 9, 0.12], [81, -45, 0.12, 9]]) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), M.yellow); ln.position.set(x, 0.07, z); scene.add(ln); }
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), M.yellow); hatch.position.set(CH.hatch.x, 0.08, CH.hatch.z); scene.add(hatch);
    this.anchors.push({ pos: V(86, 3.5, -54), color: 0xffd0a0, power: 12, dist: 12, area: 'ext', hall: true });
    // alarm beacons (spinning red) high on the walls
    this.alarmLamps = [];
    for (const [x, z] of [[21, -30], [50, -61.5], [79, -30], [50, -8.6], [86, -40.6]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), M.redLamp.clone()); b.position.set(x, 6, z); b.userData.dynamic = true; b.visible = false; scene.add(b); this.alarmLamps.push(b); this.anchors.push({ pos: V(x, 5.5, z), color: 0xff2010, power: 0, dist: 20, area: 'ext', alarm: true }); }
    // ceiling cameras (the mission may make them watchers)
    this.cams = [];
    for (const [x, z, yaw] of [[25, -24, 2.36], [77, -24, -2.36], [25, -58, 0.785], [77, -58, -0.785], [49, -39.6, Math.PI / 2]]) {
      const cam = new THREE.Group(); cam.position.set(x, 5.2, z); cam.userData.dynamic = true; scene.add(cam);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.42), M.white); body.position.z = 0.2; cam.add(body);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), M.redLamp); led.position.set(0, 0.1, 0.4); cam.add(led);
      this.cams.push({ obj: cam, base: yaw, x, z, led });
    }
  }

  // ---------------- the yard: security building, helipad, generators, parking, cover ----------------
  yard() {
    const g = this.game, scene = g.renderer.scene, w = g.world, M = this.M, props = g.props, S = CH.sec;
    // security building: two storeys, lit windows, a canopy over the door
    const sb = new THREE.Mesh(boxM(S.x1 - S.x0, 7, S.z1 - S.z0, 3, 3), M.conc); sb.position.set((S.x0 + S.x1) / 2, 3.5, (S.z0 + S.z1) / 2); sb.castShadow = true; scene.add(sb);
    w.addBox(V(S.x0, 0, S.z0), V(S.x1, 7, S.z1), { walkable: false });
    const wins = []; for (let x = S.x0 + 2; x < S.x1 - 1; x += 3) for (const y of [2, 5.2]) { wins.push(new THREE.BoxGeometry(1.6, 1.1, 0.05).translate(x, y, S.z1 + 0.03)); wins.push(new THREE.BoxGeometry(0.05, 1.1, 1.6).translate(S.x1 + 0.03, y, S.z0 + 3 + ((x - S.x0) % 18))); }
    this.secWin = new THREE.Mesh(mergeGeometries(wins.map((q) => q.toNonIndexed())), M.window.clone()); this.secWin.userData.dynamic = true; scene.add(this.secWin);
    props.box(V(5, 0.3, 2.5), V(-20, 3.2, S.z1 + 1.25), M.steel, { collide: false });
    const ss = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('SECURITY', 'VISITORS REPORT HERE', '#203040', '#ffffff'), toneMapped: false })); ss.position.set(-20, 3.8, S.z1 + 0.04); scene.add(ss);
    this.anchors.push({ pos: V(-20, 3, S.z1 + 1.5), color: 0xfff0d0, power: 18, dist: 10, area: 'ext' });
    // helipad: edge lights, a windsock snapping in the gale
    this.padLights = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false })); l.position.set(CH.pad.x + Math.cos(a) * 11, 0.15, CH.pad.z + Math.sin(a) * 11); l.userData.dynamic = true; scene.add(l); this.padLights.push(l); }
    const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), M.steel); sockPole.position.set(-40, 3, 26); scene.add(sockPole);
    this.sock = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 10, 1, true).rotateZ(Math.PI / 2).translate(1.2, 0, 0), new THREE.MeshStandardMaterial({ map: canvasTex('ch_sock', 64, 16, (g2, W2, H2) => { for (let x = 0; x < W2; x += 16) { g2.fillStyle = (x / 16) % 2 ? '#f0f0f0' : '#e06010'; g2.fillRect(x, 0, 16, H2); } }), side: THREE.DoubleSide }));
    this.sock.position.set(-40, 6, 26); this.sock.userData.dynamic = true; scene.add(this.sock);
    // generator yard east of the hall: containers, a fuel tank, transformers behind a fence
    for (const [x, z] of [[104, -52], [104, -36], [118, -52], [118, -36]]) props.box(V(12, 3, 3), V(x, 1.5, z), M.paint, { surface: 'metal' });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 10, 18).rotateZ(Math.PI / 2), M.white); tank.position.set(112, 2.6, -18); scene.add(tank); w.addBox(V(107, 0, -20.4), V(117, 5, -15.6), { walkable: false });
    props.fence(96, -64, 132, -64, { height: 2.4 }); props.fence(132, -64, 132, -10, { height: 2.4 });
    // parking, vehicles, a container stack and barriers: cover for the yard fight
    for (const [x, z, t, c, r] of [[-46, -92, 'suv', 0x2a2c30, 0], [-40, -92, 'sedan', 0x6a6e72, 0], [-34, -92, 'van', 0xd8d8d4, 0], [-22, -92, 'suv', 0x141414, 0], [2, -40, 'van', 0xe8e8e4, Math.PI / 2], [-4, 8, 'suv', 0x1a1c1e, 0.3]]) {
      const car = buildCar(t, { color: c, state: 'clean' }); car.position.set(x, 0, z); car.rotation.y = r; scene.add(car); const sz = car.userData.size; const q = Math.abs(Math.sin(r)) > 0.5; w.addBoxCentered(V(x, 0.8, z), V(q ? sz.z : sz.x, 1.6, q ? sz.x : sz.z), { surface: 'metal', walkable: false });
    }
    const cont = pbr('corrugated', { color: 0x2a4a6a, key: 'ch_cont' }), cont2 = pbr('corrugated', { color: 0x7a3a24, key: 'ch_cont2' });
    props.box(V(12.2, 2.6, 2.45), V(-2, 1.3, -6), cont, { surface: 'metal' }); props.box(V(6.1, 2.6, 2.45), V(-8, 1.3, -2.4), cont2, { surface: 'metal' }); props.box(V(12.2, 2.6, 2.45), V(-2, 3.9, -6), cont2, { surface: 'metal', collide: false });
    const jb = []; const jm = pbr('concrete', { color: 0x9a9a94, key: 'ch_jersey' });
    for (const [x, z, q] of [[8, -30, 0], [8, -46, 0], [-6, -64, 1], [10, 14, 0], [-50, 4, 1], [-46, -16, 0], [-14, -14, 1], [-36, -4, 0]]) {
      const sh = new THREE.Shape(); sh.moveTo(-0.32, 0); sh.lineTo(0.32, 0); sh.lineTo(0.32, 0.08); sh.lineTo(0.12, 0.3); sh.lineTo(0.08, 0.82); sh.lineTo(-0.08, 0.82); sh.lineTo(-0.12, 0.3); sh.lineTo(-0.32, 0.08);
      const gg = new THREE.ExtrudeGeometry(sh, { depth: 3.6, bevelEnabled: false }).translate(0, 0, -1.8); if (q) gg.rotateY(Math.PI / 2); jb.push(gg.translate(x, 0, z).toNonIndexed());
      w.addBoxCentered(V(x, 0.41, z), q ? V(3.6, 0.82, 0.64) : V(0.64, 0.82, 3.6), { surface: 'concrete', cover: true });
    }
    const jbm = new THREE.Mesh(mergeGeometries(jb), jm); jbm.castShadow = jbm.receiveShadow = true; scene.add(jbm);
    for (const [x, z] of [[14, -54], [14, -22], [-8, -24], [-30, -6]]) props.box(V(1.2, 1.2, 1.2), V(x, 0.6, z), pbr('wood', { color: 0x8a6a48, key: 'ch_crate' }), { surface: 'wood' });
    // painted lines: parking bays, a yellow walkway along the hall, the hatched keep-clear box at the roll-up door
    const paint = (x, z, sx, sz, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); m.position.set(x, 0.045, z); m.receiveShadow = true; scene.add(m); };
    for (let x = -52; x <= -14; x += 3) paint(x, -92, 0.12, 5, 0xd8d8d0);
    paint(-33, -94.5, 38, 0.12, 0xd8d8d0);
    paint(17.5, -35, 0.15, 50, 0xd8b020); paint(16, -35, 0.15, 50, 0xd8b020);
    for (let x = 58; x < 70; x += 1.2) paint(x, -4, 0.25, 6, 0xd8b020);
    paint(-26, -40, 0.15, 30, 0xd8d8d0);
    // bollards at the hall door and along the walkway
    for (let z = -58; z <= -12; z += 4) { if (Math.abs(z + 38) < 3) continue; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 10), M.yellow); b.position.set(15, 0.5, z); scene.add(b); w.addBox(V(14.85, 0, z - 0.15), V(15.15, 1, z + 0.15), { walkable: false, cover: false }); }
    // a container stack by the gate, cable drums, a generator trailer and a fuel bowser by the plant yard
    const cont3 = pbr('corrugated', { color: 0x5a6a4a, key: 'ch_cont3' });
    props.box(V(12.2, 2.6, 2.45), V(74, 1.3, -112), cont2, { surface: 'metal' }); props.box(V(12.2, 2.6, 2.45), V(74, 1.3, -108.6), cont3, { surface: 'metal' }); props.box(V(12.2, 2.6, 2.45), V(74, 3.9, -110.3), cont, { surface: 'metal', collide: false });
    for (const [x, z] of [[60, -100], [62.5, -101], [-20, -66]]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 18).rotateX(Math.PI / 2), pbr('wood', { color: 0x7a5a3a, key: 'ch_drum' })); d.position.set(x, 1.1, z); scene.add(d); w.addBox(V(x - 1.1, 0, z - 0.6), V(x + 1.1, 2.2, z + 0.6), { walkable: false }); }
    const bowser = buildTruck({ model: true }); bowser.position.set(100, 0, -74); bowser.rotation.y = Math.PI / 2; scene.add(bowser); w.addBoxCentered(V(100, 1.5, -74), V(9, 3, 3), { walkable: false, surface: 'metal' });
    props.box(V(5, 2.2, 2.2), V(86, 1.1, -96), M.yellow, { surface: 'metal' });
    // a smokers' shelter by the security building, signs
    for (const [x, z] of [[-6, -26], [-2, -26], [-6, -22], [-2, -22]]) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), M.steel); pst.position.set(x, 1.2, z); scene.add(pst); }
    props.box(V(4.6, 0.1, 4.6), V(-4, 2.45, -24), new THREE.MeshStandardMaterial({ color: 0x5a6a70, transparent: true, opacity: 0.7, roughness: 0.3 }), { collide: false });
    props.box(V(3, 0.45, 0.5), V(-4, 0.4, -25.4), pbr('wood', { color: 0x6a5a48, key: 'ch_bench' }), { surface: 'wood' });
    for (const [x, z, t, sub, bg, ry] of [[-38, 27, 'HELIPAD', 'KEEP CLEAR · ROTORS TURNING', '#c8a020', Math.PI], [-40, -60, 'ASSEMBLY POINT', 'FIRE / EVACUATION', '#1a7a3a', 0], [18, -44, 'DATA HALL B', 'AUTHORISED STAFF ONLY', '#203040', -Math.PI / 2]]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), M.steel); sp.position.set(x, 1.1, z); scene.add(sp);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: signTexture(t, sub, bg, '#ffffff'), toneMapped: false, side: THREE.DoubleSide })); sg.position.set(x, 2.2, z); sg.rotation.y = ry; scene.add(sg);
    }
    // the moor outside the wire: dry-stone walls along the fields, boulders
    const walls = [], stones = [];
    const dry = (pts) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const len = Math.hypot(bx - ax, bz - az); for (let t = 0; t < len; t += 1.4) { const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len; const y = plateauY(x, z); const bx2 = new THREE.BoxGeometry(1.5, 0.9 + hash(x, z) * 0.4, 0.8); bx2.rotateY(Math.atan2(bz - az, bx - ax) * -1 + (hash(z, x) - 0.5) * 0.2); walls.push(bx2.translate(x, y + 0.45, z).toNonIndexed()); } } };
    dry([[-80, -140], [-80, -260], [-200, -300]]); dry([[-140, -170], [-260, -210], [-400, -190]]); dry([[160, -140], [200, -260]]); dry([[-300, -60], [-420, -110], [-560, -90]]); dry([[-620, -40], [-700, -120]]);
    for (let i = 0; i < 160; i++) { const x = -880 + rnd() * 1100, z = -400 + rnd() * 360; if (x > -70 && x < 150 && z > -140) continue; if (z > edgeZ(x) - 8) continue; const r = 0.4 + rnd() * 1.3; const gg = new THREE.IcosahedronGeometry(r, 0); gg.scale(1, 0.6, 1); stones.push(gg.translate(x, plateauY(x, z) + r * 0.2, z).toNonIndexed()); }
    const wm = new THREE.Mesh(mergeGeometries(walls), pbr('rock', { color: 0x7a766e, key: 'ch_wall' })); wm.castShadow = wm.receiveShadow = true; scene.add(wm);
    const stm = new THREE.Mesh(mergeGeometries(stones), M.rock); stm.receiveShadow = true; scene.add(stm);
  }

  // ---------------- along the coast: the lighthouse on the far headland, a village, a few crofts ----------------
  coast() {
    const scene = this.game.renderer.scene, M = this.M;
    const lx = -760, lz = edgeZ(-760) - 14, ly = plateauY(lx, lz);
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 16), M.white); lh.position.set(lx, ly + 11, lz); scene.add(lh);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.4, 3, 16), new THREE.MeshStandardMaterial({ color: 0x8a1a14 })); band.position.set(lx, ly + 16, lz); scene.add(band);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false })); lamp.position.set(lx, ly + 23.5, lz); scene.add(lamp);
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(9, 0.8, 260, 12, 1, true).translate(0, 130, 0).rotateZ(-Math.PI / 2), beamMaterial(0xfff0c0, 0.1, 260));
    lb.position.copy(lamp.position); lb.userData.dynamic = true; scene.add(lb); this.lightBeam = lb;
    // a few cottages with a lit window inland (Maya's village is past the headland)
    const houses = []; const wins = [];
    for (const [x, z] of [[-520, -120], [-540, -100], [-600, -140], [-330, -200], [-860, -90], [-880, -110]]) { const y = plateauY(x, z); houses.push(boxM(9, 4, 6).translate(x, y + 2, z)); const roof = new THREE.ConeGeometry(6, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.7); houses.push(roof.translate(x, y + 5.3, z)); wins.push(new THREE.BoxGeometry(1, 0.8, 0.05).translate(x - 2, y + 2, z + 3.03)); }
    scene.add(new THREE.Mesh(mergeGeometries(houses.map((q) => q.toNonIndexed())), M.conc));
    scene.add(new THREE.Mesh(mergeGeometries(wins), M.window));
  }

  // ---------------- the cooling tunnel plate ----------------
  tunnel() {
    const g = this.game, scene = g.renderer.scene, w = g.world, M = this.M, props = g.props, T = CH.T, R = CH.pumpRoom, D = CH.dip;
    // floors: follow tunnelFloor (ramps into the sump)
    const floor = (x0, x1, z0, z1) => { const n = Math.max(1, Math.round((x1 - x0) / 1)); const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, n, 1).rotateX(-Math.PI / 2); const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2; p.setY(i, tunnelFloor(x)); uv.setXY(i, x / 3, p.getZ(i) / 3); } geo.computeVertexNormals(); const m = new THREE.Mesh(geo, M.tunnel); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); };
    floor(R.x0, R.x1, R.z0, R.z1); floor(T.x0, T.x1, T.z0, T.z1); floor(CH.fanRoom.x0, CH.fanRoom.x1, CH.fanRoom.z0, T.z0); floor(CH.fanRoom.x0, CH.fanRoom.x1, T.z1, CH.fanRoom.z1);
    for (const ax of CH.alcoves) floor(ax - 2, ax + 2, -5, T.z0);
    const seg = (x0, x1, z0, z1, h = 4.4) => {   // a wall segment (collider + mesh) from the floor up
      const W = x1 - x0, Dd = z1 - z0; const yb = Math.min(tunnelFloor(x0), tunnelFloor(x1), 0) - 0.2;
      const m = new THREE.Mesh(boxM(W, h - yb, Dd, 3, 3), M.tunnel); m.position.set((x0 + x1) / 2, (h + yb) / 2, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
      w.addBox(V(x0, yb, z0), V(x1, h, z1), { walkable: false, surface: 'concrete' });
    };
    // pump room walls
    seg(R.x0 - 0.5, R.x1, R.z0 - 0.5, R.z0, 5.5); seg(R.x0 - 0.5, R.x1, R.z1, R.z1 + 0.5, 5.5); seg(R.x0 - 0.5, R.x0, R.z0, R.z1, 5.5);
    seg(R.x1, R.x1 + 0.5, R.z0, T.z0, 5.5); seg(R.x1, R.x1 + 0.5, T.z1, R.z1, 5.5);
    // tunnel walls (gaps for the fan room and the alcoves)
    const north = [[T.x0, CH.fanRoom.x0], [CH.fanRoom.x1, CH.alcoves[0] - 2], [CH.alcoves[0] + 2, CH.alcoves[1] - 2], [CH.alcoves[1] + 2, T.x1]];
    for (const [a, b] of north) seg(a, b, T.z0 - 0.5, T.z0);
    seg(T.x0, CH.fanRoom.x0, T.z1, T.z1 + 0.5); seg(CH.fanRoom.x1, T.x1, T.z1, T.z1 + 0.5); seg(T.x1, T.x1 + 0.5, T.z0, T.z1, 9);
    const F = CH.fanRoom; seg(F.x0, F.x1, F.z0 - 0.5, F.z0, 8); seg(F.x0, F.x1, F.z1, F.z1 + 0.5, 8); seg(F.x0 - 0.5, F.x0, F.z0, T.z0, 8); seg(F.x0 - 0.5, F.x0, T.z1, F.z1, 8); seg(F.x1, F.x1 + 0.5, F.z0, T.z0, 8); seg(F.x1, F.x1 + 0.5, T.z1, F.z1, 8);
    for (const ax of CH.alcoves) { seg(ax - 2, ax + 2, -5.5, -5); seg(ax - 2.5, ax - 2, -5, T.z0); seg(ax + 2, ax + 2.5, -5, T.z0); }
    // ceiling slabs (visual), the baffle that drops the roof into the water
    for (const [a, b, y] of [[R.x0 - 0.5, CH.fanRoom.x0, 4.6], [CH.fanRoom.x0, CH.fanRoom.x1, 8.2], [CH.fanRoom.x1, T.x1 + 0.5, 4.6]]) { const ceil = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.4, 15), M.tunnel); ceil.position.set((a + b) / 2, y + 0.2, 0); scene.add(ceil); }
    const Bf = CH.baffle; const bf = new THREE.Mesh(boxM(Bf.x1 - Bf.x0, 4.4 - Bf.y, T.z1 - T.z0, 3, 3), M.tunnel); bf.position.set((Bf.x0 + Bf.x1) / 2, (4.4 + Bf.y) / 2, 0); scene.add(bf);
    w.addBox(V(Bf.x0, Bf.y, T.z0), V(Bf.x1, 4.4, T.z1), { walkable: false, surface: 'concrete' });
    // pumps (three motors on volutes), the intake grilles, the control panel
    for (const z of [-4, 0, 4]) {
      props.box(V(2.8, 0.25, 2.4), V(R.x0 + 4, 0.13, z), M.steel, { surface: 'metal' });
      const vol = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.9, 20).rotateX(Math.PI / 2), M.pipe); vol.position.set(R.x0 + 4, 1.1, z); scene.add(vol);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 12), M.steel); neck.position.set(R.x0 + 4, 2.0, z); scene.add(neck);
      const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16), M.pipeG); mot.position.set(R.x0 + 4, 3.0, z); scene.add(mot);
      for (let k = 0; k < 8; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.14), M.pipeG); const a = k / 8 * Math.PI * 2; fin.position.set(R.x0 + 4 + Math.cos(a) * 0.58, 3.0, z + Math.sin(a) * 0.58); fin.rotation.y = -a; scene.add(fin); }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.25, 16), M.steel); cap.position.set(R.x0 + 4, 3.78, z); scene.add(cap);
      const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 14).rotateZ(Math.PI / 2), M.pipe); pp.position.set(R.x0 + 8, 1.1, z); scene.add(pp);
      for (const dx of [5.6, 9.6]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 14).rotateZ(Math.PI / 2), M.steel); fl.position.set(R.x0 + dx, 1.1, z); scene.add(fl); }
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 16), M.redLamp.clone()); valve.material = new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 }); valve.position.set(R.x0 + 7, 1.9, z); valve.rotation.x = Math.PI / 2; scene.add(valve);
      w.addBox(V(R.x0 + 2.6, 0, z - 1.2), V(R.x0 + 5.4, 3.9, z + 1.2), { walkable: false, surface: 'metal' });
    }
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), M.grate); gr.position.set(R.x0 + 0.02, 1.8, 0); gr.rotation.y = Math.PI / 2; scene.add(gr);
    props.box(V(1.6, 2, 0.5), V(CH.panel.x, 1, CH.panel.z - 0.1), M.paint, { surface: 'metal' });
    this.panelLeds = []; for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), M.green.clone()); l.position.set(CH.panel.x - 0.4 + i * 0.4, 1.6, CH.panel.z + 0.17); l.userData.dynamic = true; scene.add(l); this.panelLeds.push(l); }
    const pnS = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('INTAKE PUMPS 1–3', 'HALL B COOLING LOOP', '#203040', '#ffffff'), toneMapped: false })); pnS.position.set(CH.panel.x, 1.95, CH.panel.z + 0.16); scene.add(pnS);
    // the two big pipes along the south wall, the walkway grating, emergency lamps
    for (const y of [0.9, 2.6]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, T.x1 - T.x0, 16).rotateZ(Math.PI / 2), M.pipe); pp.position.set((T.x0 + T.x1) / 2, y + (y < 1 ? 0 : 0), 1.6); pp.castShadow = true; scene.add(pp); }
    for (let x = T.x0; x < T.x1; x += 4) { if (x > D.x0 && x < D.x1) continue; w.addBox(V(x, 0, 0.85), V(x + 4, 3.4, T.z1), { walkable: false, surface: 'metal' }); }
    for (let x = D.x0; x < D.x1; x += 4) w.addBox(V(x, -3.2, 0.85), V(x + 4, 3.4, T.z1), { walkable: false, surface: 'metal' });
    for (let x = T.x0 + 6; x < T.x1; x += 14) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.16), M.redLamp); l.position.set(x, 3.6, -2.4); scene.add(l); this.anchors.push({ pos: V(x, 3.3, -1.8), color: 0xff4a2a, power: 9, dist: 10, area: 'tunnel', flicker: x % 3 === 0 }); }
    this.anchors.push({ pos: V(409, 3.4, 0), color: 0xffe0b0, power: 7, dist: 14, area: 'tunnel' }); for (const [x, z] of [[409, 0]]) { const fx = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), M.strip); fx.position.set(x, 4.35, z); scene.add(fx); }
    // the sump water: a flat sheet whose height the mission sets (pumps running / stopped); a flowing channel
    const wm = new THREE.MeshStandardMaterial({ color: 0x0c1c1c, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85, normalMap: this.seaNormal, normalScale: new THREE.Vector2(0.4, 0.4) });
    wm.userData.noBatch = true;
    this.sump = new THREE.Mesh(new THREE.PlaneGeometry(D.x1 - D.x0 + 8, T.z1 - T.z0).rotateX(-Math.PI / 2), wm); this.sump.position.set((D.x0 + D.x1) / 2, CH.WL_RUN, 0); this.sump.userData.dynamic = true; this.sump.userData.area = 'tunnel'; scene.add(this.sump);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(D.x1 - D.x0 + 8, T.z1 - T.z0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a3a38, transparent: true, opacity: 0.6, depthWrite: false }));
    under.position.copy(this.sump.position).setY(CH.WL_RUN - 0.01); under.userData.dynamic = true; under.userData.area = 'tunnel'; scene.add(under); this.sumpUnder = under;
    // fan chamber: a 5 m extract fan in the north wall turning slowly, catwalk, cable reels and lockers to hide behind
    const fan = new THREE.Group(); fan.position.set((F.x0 + F.x1) / 2, 3.8, F.z0 + 0.6); fan.userData.dynamic = true; scene.add(fan);
    for (let i = 0; i < 5; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 0.06), M.steel); bl.position.y = 1.25; const piv = new THREE.Group(); piv.rotation.z = i / 5 * Math.PI * 2; bl.rotation.y = 0.4; piv.add(bl); fan.add(piv); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14).rotateX(Math.PI / 2), M.paint); fan.add(hub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.18, 8, 32), M.steel); ring.position.copy(fan.position); scene.add(ring);
    this.fan = fan;
    for (const [x, z, sx, sz] of [[545, -5.5, 1.6, 1.6], [549, -5.6, 1.2, 1.2], [566, 5.5, 2, 1.2], [571, -5.2, 1.4, 2.6], [557, 5.6, 1.4, 1.4]]) props.box(V(sx, 1.5, sz), V(x, 0.75, z), x % 2 ? M.paint : M.yellow, { surface: 'metal' });
    for (let x = F.x0 + 4; x < F.x1; x += 10) this.anchors.push({ pos: V(x, 5, 0), color: 0xffc890, power: 12, dist: 12, area: 'tunnel' });
    // the shaft: an iron ladder up to the plant-room hatch, a caged light
    const S = CH.shaft; w.ladders.push({ min: V(S.x0, 0, S.z0), max: V(S.x1, 0, S.z1), top: S.top });
    const lr = []; for (const x of [S.x0 + 0.3, S.x1 - 0.3]) lr.push(new THREE.BoxGeometry(0.06, 9, 0.06).translate(x, 4.5, -2.35)); for (let y = 0.3; y < 9; y += 0.3) lr.push(new THREE.BoxGeometry(S.x1 - S.x0 - 0.6, 0.04, 0.04).translate((S.x0 + S.x1) / 2, y, -2.35));
    scene.add(new THREE.Mesh(mergeGeometries(lr), M.yellow));
    this.anchors.push({ pos: V(634, 6, -1), color: 0xfff0d0, power: 10, dist: 10, area: 'tunnel' });
    const ss = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('SHAFT 2 → PLANT B', '', '#c8a020', '#141414'), toneMapped: false })); ss.position.set(634, 2.4, -2.45); scene.add(ss);
  }
  setWater(level) { this.waterLevel = level; this.sump.position.y = level; this.sumpUnder.position.y = level - 0.01; }

  // ---------------- the flashback plate: GOP 3소초, sector 3, 04:21 KST, snow ----------------
  flashback() {
    const g = this.game, scene = g.renderer.scene, M = this.M, props = g.props, F = CH.F;
    const geo = new THREE.PlaneGeometry(F.x1 - F.x0, 160, 100, 80).rotateX(-Math.PI / 2); const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (F.x0 + F.x1) / 2, z = p.getZ(i); p.setY(i, heightAt(x, z)); uv.setXY(i, x / 6, z / 6); }
    geo.computeVertexNormals(); const snow = new THREE.Mesh(geo, M.snow); snow.position.set((F.x0 + F.x1) / 2, 0, 0); snow.receiveShadow = true; scene.add(snow);
    props.fence(F.x0 + 5, F.fenceZ, F.x1 - 5, F.fenceZ); props.fence(F.x0 + 5, F.fenceZ + 6, F.x1 - 5, F.fenceZ + 6, { height: 2.6 });
    for (const x of [1030, 1150]) props.sign(x, F.fenceZ + 7.2, '경고', { sub: '군사시설 · 접근 시 발포함', rotY: 0, height: 1.3, w: 1.4, h: 0.7 });
    props.watchtower(1118, F.fenceZ + 12, { light: false });
    // patrol track, mountains to the north under the snow cloud
    const trk = new THREE.Mesh(new THREE.PlaneGeometry(F.x1 - F.x0, 3).rotateX(-Math.PI / 2), pbr('dirt', { color: 0x9a948a, key: 'ch_trk' })); trk.position.set((F.x0 + F.x1) / 2, 0.08, F.fenceZ + 11); scene.add(trk);
    const mts = []; for (let i = 0; i < 9; i++) { const x = F.x0 + 10 + i * 24 + rnd() * 10; const c = new THREE.ConeGeometry(60 + rnd() * 50, 70 + rnd() * 60, 7); c.translate(x, 20, -260 - rnd() * 80); mts.push(c.toNonIndexed()); }
    scene.add(new THREE.Mesh(mergeGeometries(mts), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 1 })));
    // the sensors: same make as on M01's line, LEDs the flashback drives
    this.fbSensors = CH.sensors.map((x) => {
      const z = F.fenceZ + 1.3, grp = new THREE.Group(); grp.position.set(x, heightAt(x, z), z); scene.add(grp);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), pbr('paintedMetal', { color: 0x6a7060 })); pole.position.y = 0.8; grp.add(pole);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.22), pbr('paintedMetal', { color: 0x59604c })); box.position.y = 1.45; grp.add(box);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.2 })); eye.rotation.x = Math.PI / 2; eye.position.set(0, 1.47, -0.14); grp.add(eye);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x300804, toneMapped: false })); led.position.set(0.15, 1.58, -0.12); grp.add(led);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), pbr('metal')); ant.position.set(-0.15, 1.9, 0); grp.add(ant);
      grp.userData.dynamic = true;
      this.anchors.push({ pos: V(x + 0.15, 1.7, z - 0.4), color: 0xff2a10, power: 0, dist: 4, area: 'flash', sensor: true });
      return { grp, led };
    });
    // a lit post on the far side of the hill (the 소초)
    this.anchors.push({ pos: V(1180, 4, 40), color: 0xffd8a0, power: 25, dist: 30, area: 'flash' });
  }
  // flashback LEDs: 'idle' slow blink, 'fire' all at once with 0.2 s steps
  sensorFire() { this.fbFire = 0; }

  lightsInit() {
    const scene = this.game.renderer.scene; this.pool = [];
    const n = { low: 4, medium: 6, high: 8, ultra: 10 }[settings.data.graphics.preset] ?? 6;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); this.pool.push(l); }
    this.poolT = 0;
  }
  updateLights(dt) {
    this.poolT -= dt; if (this.poolT > 0) return; this.poolT = 0.2;
    const cam = this.game.renderer.camera.position, a = this.area || 'ext';
    const pool = this.anchors.filter((x) => x.area === a && x.power > 0).map((x) => ({ x, d: x.pos.distanceToSquared(cam) })).sort((p, q) => p.d - q.d);
    this.pool.forEach((l, i) => { const e = pool[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e.x.pos); l.color.setHex(e.x.color); l.intensity = e.x.power * (e.x.flicker ? 0.6 + Math.random() * 0.4 : 1); l.distance = e.x.dist; });
  }
  areaOf(x) { return x < 380 ? 'ext' : x < 900 ? 'tunnel' : 'flash'; }
  setArea(a) {
    const g = this.game, scene = g.renderer.scene;
    if (!this.areaMeshes) {
      this.areaMeshes = { ext: [], tunnel: [], flash: [] };
      const box = new THREE.Box3(), c = new THREE.Vector3();
      for (const o of scene.children) {
        if (o.isLight || o === this.sky?.mesh || o === this.rain?.points || o === this.spray?.points || o === this.snowF?.points) continue;
        let area = o.userData?.area || null;
        if (!area) { if (!(o.isMesh || o.isGroup || o.userData?.dynamic || o.userData?.batched)) continue; box.setFromObject(o); if (box.isEmpty()) continue; box.getCenter(c); area = this.areaOf(c.x); }
        this.areaMeshes[area]?.push(o);
      }
    }
    this.area = a;
    for (const [k, list] of Object.entries(this.areaMeshes)) for (const o of list) o.visible = k === a && !o.userData.hidden;
    this.sky.mesh.visible = a !== 'tunnel';
    this.rain.points.visible = this.spray.points.visible = a === 'ext'; this.snowF.points.visible = a === 'flash';
    this.search.spot.visible = a === 'ext';
    if (a === 'ext') { scene.fog = this.fogExt; this.hemi.color.setHex(0x8098b4); this.hemi.intensity = 0.85; this.key.intensity = 0.62; this.sky.uniforms.zenith.value.setHex(0x10151b); this.sky.uniforms.horizon.value.setHex(0x36424c); this.sky.uniforms.stars.value = 0; }
    else if (a === 'tunnel') { scene.fog = this.fogTun; this.hemi.intensity = 0.07; this.key.intensity = 0; }
    else { scene.fog = this.fogFlash; this.hemi.color.setHex(0x6a7a9a); this.hemi.intensity = 0.3; this.key.intensity = 0.12; this.sky.uniforms.zenith.value.setHex(0x05070e); this.sky.uniforms.horizon.value.setHex(0x182030); this.sky.uniforms.stars.value = 0.3; }
    g.audio.setIndoor?.(a === 'tunnel' ? 1 : 0);
    this.poolT = 0;
  }
  hide(o, v = true) { o.userData.hidden = v; o.visible = !v && (!this.area || this.areaOf(o.position.x) === this.area); }
  inHall(p) { const H = CH.hall; return p.x > H.x0 && p.x < H.x1 && p.z > H.z0 && p.z < H.z1 && p.y < H.h; }
  setAlarm(on) {
    this.alarm = on; for (const b of this.alarmLamps) b.visible = on;
    for (const a of this.anchors) if (a.alarm) a.power = on ? 30 : 0;
    this.M.strip.color.setHex(on ? 0xff9a8a : 0xe8f4ff);
  }
  // a sharp crash of surf (filtered noise burst) at a point
  surfSound(pos, gain = 0.5) {
    const a = this.game.audio; if (!a.ready || !a.ctx) return; const c = a.ctx, t = c.currentTime;
    const n = a.noiseSrc(a.brown); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + Math.random() * 500;
    const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(gain, t + 0.08); gg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 + Math.random());
    n.connect(lp).connect(gg); a.route(gg, pos, { ref: 25 }); n.start(t, Math.random() * 2); n.stop(t + 3.6);
  }

  update(dt, t) {
    const g = this.game, cam = g.renderer.camera.position; this.time += dt;
    if (!this.area) this.setArea('ext');
    this.seaTime.value += dt; this.seaNormal.offset.x += dt * 0.02; this.seaNormal.offset.y -= dt * 0.035;
    if (this.area !== 'tunnel') this.sky.update(dt, g.renderer.camera);
    this.updateLights(dt);
    this.agentT = (this.agentT || 0) - dt;
    if (this.agentT <= 0) { this.agentT = 0.3; for (const a of g.director.agents) a.actor.root.visible = this.areaOf(a.position.x) === this.area; }
    if (this.area === 'ext') {
      const indoor = g.world.isIndoor(cam);
      this.rain.points.visible = this.spray.points.visible = !indoor;
      if (!indoor) { this.rain.update(dt, cam); this.spray.update(dt, cam); }
      // inside the hall: cool fill light; outside: the storm
      const inH = this.inHall(cam);
      const wantHemi = inH ? 0.8 : 0.85; this.hemi.intensity += (wantHemi + (this.lightning || 0) - this.hemi.intensity) * Math.min(1, dt * 6);
      // gas in the hall
      if (this.gas > 0 && inH) { this.fogExt.color.setRGB(0.6, 0.64, 0.66); this.fogExt.density = 0.012 + this.gas * 0.09; } else { this.fogExt.color.setHex(0x2a343e); this.fogExt.density = 0.0042; }
      // lightning: a double flash over the sea, thunder a moment later
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashT = 9 + Math.random() * 16; this.lightning = 1.4; g.renderer.fx.flash = Math.max(g.renderer.fx.flash, inH ? 0.03 : 0.22); setTimeout(() => { this.lightning = 1.0; g.renderer.fx.flash = Math.max(g.renderer.fx.flash, inH ? 0.02 : 0.14); }, 140); setTimeout(() => g.audio.distantArtillery?.(), 900 + Math.random() * 2500); }
      if (this.lightning) { this.lightning = Math.max(0, this.lightning - dt * 4); this.key.intensity = 0.62 + this.lightning * 1.2; }
      // the searchlight sweeps the cliff face (or tracks what the mission gives it)
      const S = this.search;
      if (S.on) {
        S.t += dt;
        if (S.mode === 'sweep') S.aim.set(-58 + Math.sin(S.t * 0.42) * 46, -22 + Math.sin(S.t * 0.27) * 9, 42);
        else if (S.mode === 'sea') S.aim.set(-90 + Math.sin(S.t * 0.3) * 120, CH.SEA, 120 + Math.sin(S.t * 0.17) * 60);
        else if (S.mode === 'track' && S.target) S.aim.lerp(S.target, Math.min(1, dt * 2.5));
        S.head.lookAt(S.aim); S.spot.target.position.set(0, 0, 10); S.beam.visible = true; S.spot.intensity = 900;
      } else { S.beam.visible = false; S.spot.intensity = 0; }
      // surf against the foot of the cliff
      this.surfT -= dt;
      if (this.surfT <= 0) {
        this.surfT = 0.35;
        for (let k = 0; k < 2; k++) {
          const s = this.surfAt[Math.floor(Math.random() * this.surfAt.length)]; const sd = s.distanceTo(cam); if (sd > 240 || sd < 14) continue;
          for (let i = 0; i < 7; i++) g.effects.smoke.spawn({ x: s.x + (Math.random() - 0.5) * 6, y: CH.SEA + 1, z: s.z + (Math.random() - 0.5) * 3, vx: 2 + Math.random() * 2, vy: 5 + Math.random() * 7, vz: -2 - Math.random() * 3, size: 0.9, endSize: 3 + Math.random() * 2, life: 2.0, alpha: 0.24, r: 0.82, g: 0.86, b: 0.88, drag: 0.6, gravity: 3 });
          if (s.distanceTo(cam) < 90 && Math.random() < 0.5) this.surfSound(s.clone(), 0.35);
        }
      }
      // flapping windsock, blinking beacons, the lighthouse beam turning, pad lights
      this.sock.rotation.y = 0.7 + Math.sin(this.time * 7) * 0.12; this.sock.rotation.z = Math.sin(this.time * 11) * 0.06;
      const on = Math.sin(this.time * 2.2) > 0.2; for (const b of this.beacons) b.visible = on;
      this.lightBeam.rotation.y = this.time * 0.9;
      for (const [i, l] of this.padLights.entries()) l.visible = !this.padOff && (this.padStrobe ? Math.sin(this.time * 9 - i * 0.6) > 0 : true);
      if (this.alarm) for (const [i, b] of this.alarmLamps.entries()) { b.rotation.y += dt * 9; b.material.color.setHex(Math.sin(this.time * 9 + i) > 0 ? 0xff2a14 : 0x401006); }
      for (const a of this.anchors) if (a.alarm && this.alarm) a.power = Math.sin(this.time * 9) > 0 ? 34 : 6;
      // cameras pan back and forth
      for (const c of this.cams) { if (c.dead) continue; c.yaw = c.base + Math.sin(this.time * 0.4 + c.x) * 0.7; c.obj.rotation.y = c.yaw; c.led.visible = Math.sin(this.time * 3 + c.x) > 0; }
    } else if (this.area === 'tunnel') {
      this.fan.rotation.z += dt * (this.fanFast ? 4 : 1.4);
      // under water in the sump: green murk, muffled, slower
      const D = CH.dip; const p = g.player; const eyeY = p.position.y + p.eye;
      const under = p.position.x > D.x0 && p.position.x < D.x1 + 4 && eyeY < this.waterLevel;
      if (under !== this.under) { this.under = under; const u = g.renderer.grade?.uniforms; if (u) u.tint.value.set(...(under ? [0.45, 0.75, 0.72] : [1, 1, 1])); this.fogTun.color.setHex(under ? 0x0c2a26 : 0x0a0c0c); this.fogTun.density = under ? 0.22 : 0.045; p.speedScale = under ? 0.85 : (p.position.y < this.waterLevel - 0.6 && p.position.x > D.x0 && p.position.x < D.x1 + 4 ? 0.7 : 1); g.audio.setIndoor?.(1); }
      const inSump = p.position.x > D.x0 && p.position.x < D.x1;
      if (!under) p.speedScale = inSump && p.position.y < this.waterLevel - 0.3 ? 0.7 : 1;
      // deep water floats you to the surface unless you dive (crouch); under the baffle the roof keeps you down
      const floatY = this.waterLevel - 1.45;
      if (inSump && !p.crouching && p.position.y < floatY - 0.02 && g.world.ceilingAbove(p.position.x, p.position.z, p.position.y + 0.5) > this.waterLevel + 0.3) { p.position.y = Math.min(floatY, p.position.y + dt * 2.6); if (p.velocity.y < 0) p.velocity.y = 0; p.grounded = false; }
      this.swimming = inSump && p.position.y > tunnelFloor(p.position.x) + 0.3 && p.position.y < this.waterLevel;
      if (under) g.renderer.fx.blur = Math.max(g.renderer.fx.blur, 0.8);
    } else {
      this.snowF.update(dt, cam);
      // sensor LEDs: a dull blink, or the cascade
      for (const [i, s] of this.fbSensors.entries()) {
        let on;
        if (this.fbFire !== undefined) { const k = this.fbFire - i * 0.2; on = k > 0 && k < 1.4 ? (Math.sin(k * 30) > -0.2) : false; }
        else on = Math.sin(this.time * 1.2 + i * 2.1) > 0.97;
        s.led.material.color.setHex(on ? 0xff2a10 : 0x300804);
        const an = this.anchors.find((a) => a.sensor && Math.abs(a.pos.x - s.grp.position.x - 0.15) < 0.01); if (an) an.power = on ? 6 : 0;
      }
      if (this.fbFire !== undefined) this.fbFire += dt;
    }
  }
}
