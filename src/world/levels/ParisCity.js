// Level: Paris, Mission 05 (OFF THE GRID). Night, light rain. All names are fictional.
//
// SURFACE (y = 0)
//   rue Saint-Vérène runs north (-Z) to south (+Z) through x = 0: road x ±6, pavements to ±10,
//   six-storey stone apartment blocks with zinc mansard roofs on both sides.
//   Boulevard crossing at z ≈ -59. Small square (NE corner) with the métro entrance.
//   West side: a covered passage (alley) at z 16..22 leads to a service courtyard
//   (x -86..-66, z 6..34). The archive's street door is in the courtyard; a carriage lane runs
//   from the courtyard south to the boulevard.
// UNDERGROUND (separate enclosed areas, reached by fade transitions)
//   Métro: entrance corridor → ticket hall → platform with a train that pulls in (x 300..420, z -20..20).
//   Archive: limestone quarry tunnels under the courtyard — guard room, main tunnel, storage room
//   with the ventilation shaft, the archive hall with shelving and the vault cage, the exit tunnel
//   to a service ladder (x 300..400, z 60..160).
import * as THREE from 'three';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { Weather } from '../../render/Effects.js';
import { settings } from '../../core/Settings.js';
import { CityKit, signTexture } from '../CityProps.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seedN = 1; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);

export const PARIS = {
  bounds: { minX: -112, maxX: 430, minZ: -128, maxZ: 172 },
  road: 6, walk: 10,
  alley: { x0: -66, x1: -10, z0: 16, z1: 22 },
  court: { x0: -86, x1: -66, z0: 6, z1: 34 },
  lane: { x0: -82, x1: -72, z0: -52, z1: 6 },
  boulevard: { z0: -66, z1: -52 },
  square: { x0: 10, x1: 46, z0: -52, z1: -26 },
  metroTop: V(27, 0, -38),          // top of the métro stairs (surface)
  archiveDoor: V(-85.4, 0, 20),     // courtyard door to the archive
  vent: V(-70, 0, 30.5),            // ventilation grate in the courtyard
  junction: V(-67, 0, 10),          // the building's power junction box
  van: V(-77, 0, -40),              // Maya's van in the carriage lane
  // métro
  m: { stairIn: V(304, 0, 0), hall: { x0: 336, x1: 356, z0: -10, z1: 10 }, plat: { x0: 356, x1: 424, z0: 0, z1: 7 }, track: { z0: -5, z1: 0 } },
  // archive
  a: { front: V(310, 0, 66), vent: V(352, 0, 95), hall: { x0: 300, x1: 362, z0: 120, z1: 152 }, vault: V(356, 0, 146), ladder: V(397, 0, 134) },
};

// ----------------------------------------------------------------------------------------
// canvas textures (original, procedural)
const cache = new Map();
function canvasTex(key, w, h, draw, { repeat = true, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  cache.set(key, t); return t;
}
const speckle = (g, w, h, n, a, dark = true) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${dark ? '20,18,16' : '255,250,240'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };

// Stone apartment facade: 4 bays x 5 floors (floors 1..5 above the shops). Ashlar joints, tall
// French windows with frames and inner shutters, carved lintels. Returns { map, emissive }.
function facadeTex(kind) {
  const tone = [['#cfc3a8', '#b3a68b'], ['#d6cbb3', '#bcae92'], ['#c8bea6', '#a99c82'], ['#d9d0bd', '#c2b59b']][kind % 4];
  const lit = [];
  const map = canvasTex(`fac${kind}`, 512, 640, (g, W, H) => {
    g.fillStyle = tone[0]; g.fillRect(0, 0, W, H);
    // ashlar courses
    g.strokeStyle = 'rgba(90,80,62,0.35)'; g.lineWidth = 1;
    for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / 16) % 2 ? 0 : 24; x < W; x += 48) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } }
    // rain grime under sills and down the walls
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(60,52,40,${Math.random() * 0.07})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 7, 30 + Math.random() * 140); }
    speckle(g, W, H, 3000, 0.12);
    const bw = W / 4, fh = H / 5;
    for (let f = 0; f < 5; f++) for (let b = 0; b < 4; b++) {
      const x0 = b * bw, y0 = f * fh; const ww = bw * 0.44, wh = fh * (f === 4 ? 0.58 : 0.7); const wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.14;
      // stone surround + lintel
      g.fillStyle = tone[1]; g.fillRect(wx - 6, wy - 10, ww + 12, wh + 14); g.fillStyle = 'rgba(70,60,45,0.4)'; g.fillRect(wx - 6, wy - 10, ww + 12, 3);
      if (f === 0 || f === 3) { g.fillStyle = tone[1]; g.beginPath(); g.moveTo(wx - 10, wy - 10); g.lineTo(wx + ww / 2, wy - 22); g.lineTo(wx + ww + 10, wy - 10); g.fill(); }
      // window: lit warm, curtained, or dark glass
      const r = Math.random(); const isLit = r < 0.32; lit.push(isLit ? (r < 0.12 ? 2 : 1) : 0);
      const grd = g.createLinearGradient(wx, wy, wx, wy + wh);
      if (isLit) { grd.addColorStop(0, '#f3c27a'); grd.addColorStop(1, '#b27a3a'); } else { grd.addColorStop(0, '#2d3a44'); grd.addColorStop(0.6, '#161d24'); grd.addColorStop(1, '#29333b'); }
      g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
      if (isLit && r > 0.2) { g.fillStyle = 'rgba(250,236,210,0.55)'; g.fillRect(wx + 2, wy + 2, ww * 0.28, wh - 4); g.fillRect(wx + ww * 0.72 - 2, wy + 2, ww * 0.28, wh - 4); }   // net curtains
      // casement frame: two leaves, three panes each
      g.strokeStyle = '#efe9dc'; g.lineWidth = 3; g.strokeRect(wx, wy, ww, wh);
      g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); for (let k = 1; k < 3; k++) { g.moveTo(wx, wy + wh * k / 3); g.lineTo(wx + ww, wy + wh * k / 3); } g.stroke();
      // folding shutters (grey) on some
      if (!isLit && Math.random() < 0.35) { g.fillStyle = '#7d8380'; g.fillRect(wx, wy, ww, wh); g.strokeStyle = 'rgba(30,30,30,0.5)'; for (let y = wy + 4; y < wy + wh; y += 5) { g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke(); } }
      // small iron guard rail on floors without a balcony
      if (f !== 0 && f !== 3) { g.strokeStyle = '#1f2120'; g.lineWidth = 2; g.strokeRect(wx - 2, wy + wh * 0.62, ww + 4, wh * 0.38); for (let x = wx; x < wx + ww; x += 6) { g.beginPath(); g.moveTo(x, wy + wh * 0.62); g.lineTo(x, wy + wh); g.stroke(); } }
    }
    // string courses (balcony floors are 1 and 4 in this texture: floors 2 and 5 of the building)
    g.fillStyle = tone[1]; for (const f of [1, 4]) g.fillRect(0, f * fh - 6, W, 8);
  });
  const emissive = canvasTex(`face${kind}`, 512, 640, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const bw = W / 4, fh = H / 5; let i = 0;
    for (let f = 0; f < 5; f++) for (let b = 0; b < 4; b++) {
      const v = lit[i++]; if (!v) continue;
      const ww = bw * 0.44, wh = fh * (f === 4 ? 0.58 : 0.7); const wx = b * bw + (bw - ww) / 2, wy = f * fh + fh * 0.14;
      g.fillStyle = v === 2 ? '#c88a40' : '#7a5222'; g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
    }
  });
  return { map, emissive };
}
const zincTex = () => canvasTex('zinc', 256, 256, (g, W, H) => {
  g.fillStyle = '#5e6870'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(30,36,40,0.55)'; g.fillRect(x, 0, 2, H); g.fillStyle = 'rgba(160,170,176,0.18)'; g.fillRect(x + 2, 0, 1, H); }
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(20,24,26,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 10, 20 + Math.random() * 60); }
});
const slabTex = () => canvasTex('slabs', 512, 512, (g, W, H) => {
  g.fillStyle = '#7d7a73'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 128) { const o = (y / 64) % 2 ? 64 : 0; const v = 108 + Math.random() * 26; g.fillStyle = `rgb(${v},${v - 3},${v - 9})`; g.fillRect(x + o + 2, y + 2, 124, 60); }
  g.fillStyle = '#4f4c47'; for (let y = 0; y < H; y += 64) g.fillRect(0, y, W, 2);
  speckle(g, W, H, 9000, 0.16); speckle(g, W, H, 2000, 0.08, false);
});
const asphaltTex = () => canvasTex('wetasph', 512, 512, (g, W, H) => {
  g.fillStyle = '#2c2d2f'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(12,12,12,0.6)'; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
});
// roughness: puddles are smooth (dark), the rest rough-ish wet asphalt
const puddleRough = () => canvasTex('puddles', 256, 256, (g, W, H) => {
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) { const x = Math.random() * W, y = Math.random() * H, r = 8 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#0c0c0c'); gr.addColorStop(0.7, '#151515'); gr.addColorStop(1, 'rgba(138,138,138,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.6, r, Math.random() * 3, 0, 7); g.fill(); }
}, { srgb: false });
const cobbleTex = () => canvasTex('cobble', 512, 512, (g, W, H) => {
  g.fillStyle = '#3a3936'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? -12 : 0; x < W; x += 24) { const v = 70 + Math.random() * 40; g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.beginPath(); g.roundRect?.(x + 2, y + 2, 20, 20, 5); if (!g.roundRect) g.rect(x + 2, y + 2, 20, 20); g.fill(); }
  speckle(g, W, H, 6000, 0.2);
});
const tileTex = () => canvasTex('metrotile', 256, 256, (g, W, H) => {
  g.fillStyle = '#c9c7bd'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < W; x += 64) {
    const gr = g.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, '#f4f2ea'); gr.addColorStop(0.5, '#e6e3d8'); gr.addColorStop(1, '#cfccbf');
    g.fillStyle = gr; g.beginPath(); if (g.roundRect) g.roundRect(x + 2, y + 2, 60, 28, 8); else g.rect(x + 2, y + 2, 60, 28); g.fill();
  }
  speckle(g, W, H, 900, 0.1);
});
const stoneTex = () => canvasTex('limestone', 512, 512, (g, W, H) => {
  g.fillStyle = '#a59a82'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 48) for (let x = (y / 48) % 2 ? -40 : 0; x < W; x += 80) { const v = 140 + Math.random() * 40; g.fillStyle = `rgb(${v},${v - 10},${v - 32})`; g.fillRect(x + 3, y + 3, 74, 42); }
  g.fillStyle = 'rgba(60,52,40,0.6)'; for (let y = 0; y < H; y += 48) g.fillRect(0, y, W, 3);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(50,40,28,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 6, 20 + Math.random() * 80); }
  speckle(g, W, H, 12000, 0.18);
});
const posterTex = (i) => canvasTex(`poster${i}`, 256, 360, (g, W, H) => {
  const pal = [['#1d3557', '#f1faee', 'EXPOSITION', 'Lumières du Nord'], ['#7a1c1c', '#f5e6c8', 'THÉÂTRE', 'La Dernière Ligne'], ['#203a2a', '#e8f0d0', 'CONCERT', 'Orchestre Vérène'], ['#3a2a52', '#ffe8a0', 'CINÉMA', 'Signal Fantôme']][i % 4];
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H);
  g.fillStyle = pal[1]; g.globalAlpha = 0.18; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(Math.random() * W, 80 + Math.random() * 180, 30 + Math.random() * 60, 0, 7); g.fill(); } g.globalAlpha = 1;
  g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(pal[2], W / 2, 290); g.font = 'italic 20px serif'; g.fillText(pal[3], W / 2, 322);
  g.font = '12px sans-serif'; g.fillText('MARS 2029', W / 2, 346);
});
const balusterTex = () => canvasTex('balust', 256, 64, (g, W, H) => {
  g.clearRect(0, 0, W, H); g.strokeStyle = '#151716'; g.fillStyle = '#151716'; g.lineWidth = 3;
  g.fillRect(0, 0, W, 5); g.fillRect(0, H - 4, W, 4);
  for (let x = 4; x < W; x += 16) { g.fillRect(x, 4, 2, H - 8); }
  g.lineWidth = 2; for (let x = 12; x < W; x += 32) { g.beginPath(); g.ellipse(x, H / 2, 6, 14, 0, 0, 7); g.stroke(); }
}, { srgb: true });
const meshTex = () => canvasTex('wiremesh', 128, 128, (g, W, H) => {
  g.clearRect(0, 0, W, H); g.strokeStyle = '#8a8c88'; g.lineWidth = 2;
  for (let i = -W; i < W * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke(); }
});
const boxesTex = () => canvasTex('archboxes', 256, 128, (g, W, H) => {
  g.fillStyle = '#1c1c1a'; g.fillRect(0, 0, W, H);
  for (let x = 2; x < W - 20; x += 22 + Math.random() * 6) { const v = 150 + Math.random() * 40; g.fillStyle = `rgb(${v},${v - 18},${v - 50})`; const h = H - 10 - Math.random() * 14; g.fillRect(x, H - h, 20, h - 4); g.fillStyle = '#f0ece0'; g.fillRect(x + 4, H - h + 10, 12, 8); g.fillStyle = '#333'; g.fillRect(x + 6, H - h + 12, 8, 1); }
});

const at = (o, p) => { o.position.copy(p); return o; };
// box with UVs in world metres (texture repeats every `tile` m)
function wbox(sx, sy, sz, tile = 2) {
  const g = new THREE.BoxGeometry(sx, sy, sz); const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    if (ay > 0.5) uv.setXY(i, px / tile, pz / tile); else if (ax > 0.5) uv.setXY(i, pz / tile, py / tile); else uv.setXY(i, px / tile, py / tile);
  }
  return g;
}

// ----------------------------------------------------------------------------------------
export class ParisCity {
  constructor(game) { this.game = game; this.lampAnchors = []; this.under = 0; this.archiveDark = false; this.trainCar = null; }

  async build() {
    const g = this.game, w = g.world, P = PARIS; seedN = 7;
    w.bounds = { ...P.bounds };
    const tr = P.m.track, pl = P.m.plat;
    // the only terrain feature: the métro track bed
    w.setTerrain((x, z) => (x > pl.x0 + 0.2 && x < pl.x1 + 30 && z > tr.z0 && z < tr.z1 ? -1.15 : 0), (x, z) => (Math.abs(x) < P.road && x < 200 ? 'concrete' : 'concrete'));
    this.hf = w.heightFn;
    this.kit = new CityKit(g);
    this.mats();
    this.atmosphere();
    this.streets();
    this.blocks();
    this.furniture();
    this.courtyard();
    this.metroEntrance();
    this.buildMetro();
    this.buildArchive();
    this.lights();
    this.weather = new Weather(g.renderer.scene, 'rain', 0.55);
    this.weather.mat.opacity = 0.22;
    w.ladders = [];
  }

  mats() {
    const M = this.M = {};
    M.zinc = new THREE.MeshStandardMaterial({ map: zincTex(), color: 0x9aa6ae, metalness: 0.55, roughness: 0.45 });
    M.stone = new THREE.MeshStandardMaterial({ color: 0xc9bea6, roughness: 0.85 });
    M.stoneDark = new THREE.MeshStandardMaterial({ color: 0xa69a80, roughness: 0.9 });
    M.iron = new THREE.MeshStandardMaterial({ color: 0x1a1d1c, metalness: 0.6, roughness: 0.5 });
    M.green = new THREE.MeshStandardMaterial({ color: 0x26392c, metalness: 0.5, roughness: 0.45 });
    M.rail = new THREE.MeshStandardMaterial({ map: balusterTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
    M.slab = new THREE.MeshStandardMaterial({ map: slabTex(), color: 0xb9b6ae, roughness: 0.5, metalness: 0.0 });
    const at = asphaltTex(); const pr = puddleRough();
    M.asphalt = new THREE.MeshStandardMaterial({ map: at, roughnessMap: pr, roughness: 0.55, metalness: 0.15, color: 0x8a8a8c });
    M.cobble = new THREE.MeshStandardMaterial({ map: cobbleTex(), roughnessMap: pr, roughness: 0.6, metalness: 0.1 });
    M.granite = new THREE.MeshStandardMaterial({ color: 0x77767a, roughness: 0.6 });
    M.tile = new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.18, metalness: 0.05 });
    M.lime = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95, color: 0xd8ccb6 });
    M.limeFloor = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.92, color: 0x9a8f7a });
    M.concrete = pbr('concrete', { color: 0x8a8884, key: 'pcon' });
    M.wood = pbr('wood', { color: 0x6a5240, key: 'pwood' });
    M.metal = pbr('metal', { color: 0x8a8e90, key: 'pmetal' });
    M.glassDark = new THREE.MeshStandardMaterial({ color: 0x0d1216, metalness: 0.7, roughness: 0.06 });
    M.lampGlow = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    M.lampOff = new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.6 });
    M.mesh = new THREE.MeshStandardMaterial({ map: meshTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
    M.boxes = new THREE.MeshStandardMaterial({ map: boxesTex(), roughness: 0.9 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  }

  // ---------------- atmosphere ----------------
  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    this.fogOut = new THREE.FogExp2(0x1a1f27, 0.021);
    scene.fog = this.fogOut;
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.32;
    this.sky = new Sky(scene, { zenith: 0x080b12, horizon: 0x2a2a33, stars: 0, sunDir: [0.2, 0.4, -0.8], sunColor: 0x8a8a9a, sunSize: 0.9999 });
    this.hemi = new THREE.HemisphereLight(0x6a7488, 0x2a2620, 0.7); scene.add(this.hemi);
    // city glow from above (sodium + LED mix): a soft key from the south-west that casts the shadows
    const key = new THREE.DirectionalLight(0xb8a890, 0.55); const sh = settings.data.graphics.shadows;
    key.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    key.shadow.mapSize.set(size, size); Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key); scene.add(key.target); g.sun = key; g.sunOffset = V(-30, 60, 40); this.key = key;
    g.renderer.renderer.toneMappingExposure = 1.25;
    g.effects.setSmokeLight(0.4);
  }

  // ---------------- streets ----------------
  streets() {
    const P = PARIS, scene = this.game.renderer.scene, w = this.game.world, M = this.M;
    const plane = (x0, x1, z0, z1, mat, y = 0, tile = 4) => {
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0); const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
      const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
    };
    // base ground under everything outdoors
    plane(-112, 60, -128, 128, M.slab, -0.005, 3);
    // rue Saint-Vérène + boulevard (asphalt), crossing (cobbles)
    plane(-P.road, P.road, -128, 128, M.asphalt, 0.004, 6);
    plane(-112, 60, P.boulevard.z0, P.boulevard.z1, M.asphalt, 0.006, 6);
    plane(-P.road, P.road, P.boulevard.z0, P.boulevard.z1, M.cobble, 0.008, 3);
    // courtyard + lane + alley: cobbles
    plane(P.court.x0, P.court.x1, P.court.z0, P.court.z1, M.cobble, 0.006, 3);
    plane(P.lane.x0, P.lane.x1, P.lane.z0, P.lane.z1, M.cobble, 0.006, 3);
    plane(P.alley.x0, P.alley.x1, P.alley.z0, P.alley.z1, M.cobble, 0.006, 3);
    // pavements: granite kerbs (walkable 14 cm step) along the street
    const kerbs = [[-1, -128, P.boulevard.z0], [-1, P.boulevard.z1, P.alley.z0], [-1, P.alley.z1, 128], [1, -128, P.boulevard.z0], [1, P.boulevard.z1, 128]];
    for (const [s, z0, z1] of kerbs) {
      const len = z1 - z0; const k = new THREE.Mesh(wbox(P.walk - P.road, 0.14, len, 3), M.slab);
      k.position.set(s * (P.road + (P.walk - P.road) / 2), 0.07, (z0 + z1) / 2); k.receiveShadow = true; scene.add(k);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, len), M.granite); edge.position.set(s * (P.road + 0.12), 0.08, (z0 + z1) / 2); scene.add(edge);
      w.addBoxCentered(V(s * (P.road + (P.walk - P.road) / 2), 0.07, (z0 + z1) / 2), V(P.walk - P.road, 0.14, len), { surface: 'concrete', cover: false });
    }
    // lane markings: dashed centre + zebra at the boulevard
    this.kit.laneLine(0, -128, P.boulevard.z0 - 2, { color: 0xd8d6cc, width: 0.12 }); this.kit.laneLine(0, P.boulevard.z1 + 4, 128, { color: 0xd8d6cc, width: 0.12 });
    this.kit.crosswalk(0, P.boulevard.z1 + 2, 12); this.kit.crosswalk(0, P.boulevard.z0 - 2, 12);
    // square paving
    plane(P.square.x0, P.square.x1, P.square.z0, P.square.z1, M.slab, 0.01, 3);
  }

  // ---------------- apartment blocks ----------------
  // Builds one stone block: ground floor shops, 5 floors of facade texture, balconies on floors 2 and 5,
  // a cornice, a zinc mansard roof with dormers and chimney stacks. `face`: the street side normal (±1 on x or z).
  block({ x0, x1, z0, z1, face, kind = 0, shops = true }) {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M;
    const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const GF = 4.6, FL = 3.2, H = GF + FL * 5;   // 20.6 m to the cornice
    const tex = facadeTex(kind);
    const fm = (len) => { const m = new THREE.MeshStandardMaterial({ map: tex.map.clone(), emissiveMap: tex.emissive.clone(), emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.85 });
      m.map.repeat.set(len / 12.8, 1); m.emissiveMap.repeat.set(len / 12.8, 1); m.map.needsUpdate = m.emissiveMap.needsUpdate = true; return m; };
    // upper storeys
    const up = new THREE.Mesh(new THREE.BoxGeometry(W, FL * 5, D), [fm(D), fm(D), M.stone, M.stone, fm(W), fm(W)]);
    up.position.set(cx, GF + FL * 2.5, cz); up.castShadow = true; up.receiveShadow = true; scene.add(up);
    // ground floor: stone base with rustication
    const base = new THREE.Mesh(wbox(W, GF, D, 3), M.stoneDark); base.position.set(cx, GF / 2, cz); base.receiveShadow = true; scene.add(base);
    w.addBoxCentered(V(cx, H / 2, cz), V(W, H, D), { surface: 'concrete', cover: true, walkable: false });
    // cornices
    const along = face[0] === 0;   // street side along X (block faces ±Z) or along Z
    for (const [y, t] of [[GF, 0.35], [GF + FL * 5, 0.55]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(W + t * 2, 0.28, D + t * 2), M.stone); c.position.set(cx, y, cz); c.castShadow = true; scene.add(c); }
    // balconies on floors 2 and 5 (street side): stone slab + wrought iron rail
    const len = along ? W : D;
    for (const f of [1, 4]) {
      const y = GF + FL * f + 0.02;
      const ox = face[0] * ((along ? 0 : W / 2) + 0.55), oz = face[1] * ((along ? D / 2 : 0) + 0.55);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(along ? len - 0.4 : 1.1, 0.16, along ? 1.1 : len - 0.4), M.stone); slab.position.set(cx + ox, y, cz + oz); slab.castShadow = true; scene.add(slab);
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, 1.0), M.rail.clone()); rail.material.map = M.rail.map.clone(); rail.material.map.repeat.set((len - 0.4) / 1.6, 1); rail.material.map.needsUpdate = true;
      rail.position.set(cx + ox + face[0] * 0.5, y + 0.58, cz + oz + face[1] * 0.5); rail.rotation.y = Math.atan2(face[0], face[1]); scene.add(rail);
    }
    // mansard: sloped zinc box (top inset 1.3 m), dormers on the street side, chimney stacks
    const RH = 3.8, inset = 1.3;
    const geo = new THREE.BoxGeometry(W, RH, D); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * (W - inset * 2) / W); p.setZ(i, p.getZ(i) * (D - inset * 2) / D); }
    geo.computeVertexNormals(); const roof = new THREE.Mesh(geo, M.zinc); roof.position.set(cx, H + RH / 2, cz); roof.castShadow = true; scene.add(roof);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W - inset * 2 - 0.4, 0.6, D - inset * 2 - 0.4), M.zinc); top.position.set(cx, H + RH + 0.3, cz); scene.add(top);
    const nD = Math.max(1, Math.floor(len / 3.2));
    for (let i = 0; i < nD; i++) {
      const o = -len / 2 + (i + 0.5) * len / nD;
      const dx = along ? cx + o : cx + face[0] * (W / 2 - 0.55), dz = along ? cz + face[1] * (D / 2 - 0.55) : cz + o;
      const d = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.2 : 1.1, 1.6, along ? 1.1 : 1.2), M.stone); d.position.set(dx, H + 1.4, dz); d.castShadow = true; scene.add(d);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, along ? 1.2 : 1.2, 10, 1, false, 0, Math.PI), M.zinc); cap.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
      if (along) cap.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      cap.position.set(dx, H + 2.2, dz); scene.add(cap);
      const lit = rnd() < 0.25;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.9), lit ? new THREE.MeshBasicMaterial({ color: 0xd09050 }) : M.glassDark); win.position.set(dx + face[0] * 0.56, H + 1.38, dz + face[1] * 0.56); win.rotation.y = Math.atan2(face[0], face[1]); scene.add(win);
    }
    for (const s of [-1, 1]) {
      const sx = along ? cx + s * (W / 2 - 0.6) : cx, sz = along ? cz : cz + s * (D / 2 - 0.6);
      const st = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.7 : 2.4, 2.2, along ? 2.4 : 0.7), M.stone); st.position.set(sx, H + RH + 1.0, sz); st.castShadow = true; scene.add(st);
      for (let k = 0; k < 4; k++) { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 0.8 })); pot.position.set(sx + (along ? 0 : (k - 1.5) * 0.5), H + RH + 2.35, sz + (along ? (k - 1.5) * 0.5 : 0)); scene.add(pot); }
    }
    if (shops) this.shopfronts({ cx, cz, W, D, face, along, GF });
  }

  shopfronts({ cx, cz, W, D, face, along, GF }) {
    const scene = this.game.renderer.scene, M = this.M; const len = along ? W : D; const n = Math.max(1, Math.floor(len / 7.5));
    const names = this.shopNames ||= [['CAFÉ DES ARCHIVES', '#2a3a2c', 'cafe'], ['BOULANGERIE VÉRÈNE', '#5a3a22', 'bakery'], ['PHARMACIE', '#1f6a3a', 'pharma'], ['LIBRAIRIE DU QUAI', '#2a2a44', 'books'], ['TABAC · PRESSE', '#7a1f1f', 'tabac'],
      ['FLEURS ODILE', '#3a5a3a', 'flowers'], ['OPTIQUE', '#1a3a5a', 'shop'], ['BISTROT LE SIGNAL', '#4a2020', 'cafe'], ['PRESSING', '#2a4a5a', 'shop'], ['ÉPICERIE FINE', '#4a3a1a', 'shop'], ['GALERIE NORD', '#222', 'shop'], ['HORLOGERIE', '#3a2a1a', 'shop']];
    this.shopIdx ??= 0;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * len / n; const [name, col, type] = names[this.shopIdx++ % names.length];
      const fx = along ? cx + o : cx + face[0] * (W / 2 + 0.02), fz = along ? cz + face[1] * (D / 2 + 0.02) : cz + o; const rot = Math.atan2(face[0], face[1]);
      const sw = len / n - 1.4;
      // lit interior seen through the glass (emissive warm gradient) + dark mullions
      const lit = rnd() < 0.7; const interior = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: lit ? (type === 'pharma' ? 0x2a6a4a : 0x8a6234) : 0x050505, emissiveIntensity: lit ? 0.55 : 1, roughness: 0.05, metalness: 0.6 });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(sw, 3.0), interior); glass.position.set(fx, 1.65, fz); glass.rotation.y = rot; scene.add(glass);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, 3.4, 0.12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })); frame.position.set(fx - face[0] * 0.04, 1.75, fz - face[1] * 0.04); frame.rotation.y = rot; scene.add(frame);
      glass.position.x += face[0] * 0.03; glass.position.z += face[1] * 0.03;
      for (let k = 1; k < 3; k++) { const mu = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.0, 0.06), M.iron); const t = -sw / 2 + k * sw / 3; mu.position.set(fx + (along ? t : 0) + face[0] * 0.06, 1.65, fz + (along ? 0 : t) + face[1] * 0.06); scene.add(mu); }
      // fascia sign
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.2, 0.62), new THREE.MeshStandardMaterial({ map: signTexture(name, '', col, '#efe6cf'), emissive: 0xffffff, emissiveMap: signTexture(name, '', col, '#efe6cf'), emissiveIntensity: 0.35, roughness: 0.5 }));
      sign.position.set(fx + face[0] * 0.09, 3.75, fz + face[1] * 0.09); sign.rotation.y = rot; scene.add(sign);
      // awning on cafés / bakeries
      if (type === 'cafe' || type === 'bakery' || type === 'flowers') {
        const aw = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.3, 2.0), new THREE.MeshStandardMaterial({ map: canvasTex(`awn${col}`, 128, 64, (g, Wc, Hc) => { for (let x = 0; x < Wc; x += 16) { g.fillStyle = (x / 16) % 2 ? col : '#d8d0bc'; g.fillRect(x, 0, 16, Hc); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, Hc - 8, Wc, 8); }), side: THREE.DoubleSide, roughness: 0.8 }));
        aw.material.map.repeat.set((sw + 0.3) / 2.2, 1);
        aw.position.set(fx + face[0] * 0.9, 3.1, fz + face[1] * 0.9); aw.rotation.set(0, rot, 0); aw.rotateX(-1.05); aw.castShadow = true; scene.add(aw);
        if (type === 'cafe') this.terrace(fx + face[0] * 2.4, fz + face[1] * 2.4, along, sw);
      }
      this.shopWindows ||= []; this.shopWindows.push({ pos: V(fx, 1.6, fz), normal: V(face[0], 0, face[1]), w: sw, name, mesh: glass });
    }
  }

  terrace(x, z, along, len) {
    const scene = this.game.renderer.scene; const M = this.M;
    const n = Math.max(1, Math.floor(len / 1.8));
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * len / n; const tx = along ? x + o : x, tz = along ? z : z + o;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 })); top.position.set(tx, 0.86, tz); scene.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), M.iron); leg.position.set(tx, 0.5, tz); scene.add(leg);
      for (const s of [-1, 1]) {
        const cxp = tx + (along ? s * 0.5 : 0.0), czp = tz + (along ? 0 : s * 0.5);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7 })); seat.position.set(cxp, 0.46, czp); scene.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.04 : 0.4, 0.4, along ? 0.4 : 0.04), seat.material); back.position.set(cxp + (along ? s * 0.2 : 0), 0.68, czp + (along ? 0 : s * 0.2)); scene.add(back);
      }
    }
  }

  blocks() {
    const P = PARIS; let k = 0;
    // east side of the street (facing -X), split by the square
    for (const [z0, z1] of [[-26, 8], [8, 50], [50, 90], [90, 126]]) this.block({ x0: P.walk, x1: P.walk + 18, z0, z1, face: [-1, 0], kind: k++ });
    this.block({ x0: P.square.x1, x1: 60, z0: -52, z1: -26, face: [-1, 0], kind: k++ });               // square's east side
    this.block({ x0: 10, x1: 60, z0: -128, z1: -66, face: [0, 1], kind: k++, shops: false });          // north of the boulevard (east)
    // west side of the street (facing +X): south of the alley and north of it down to the boulevard
    for (const [z0, z1] of [[P.alley.z1, 60], [60, 96], [96, 126]]) this.block({ x0: -P.walk - 18, x1: -P.walk, z0, z1, face: [1, 0], kind: k++ });
    for (const [z0, z1] of [[-52, -18], [-18, P.alley.z0]]) this.block({ x0: -P.walk - 18, x1: -P.walk, z0, z1, face: [1, 0], kind: k++ });
    this.block({ x0: -60, x1: -10, z0: -128, z1: -66, face: [0, 1], kind: k++, shops: false });       // north of the boulevard (west)
    this.block({ x0: -112, x1: -60, z0: -128, z1: -66, face: [0, 1], kind: k++, shops: false });
    // inner blocks around the alley / courtyard (backs, no shops)
    this.block({ x0: -66, x1: -28, z0: P.alley.z1, z1: 70, face: [0, -1], kind: k++, shops: false });   // north side of the alley: x -66..-28
    this.block({ x0: -66, x1: -28, z0: -52, z1: P.alley.z0, face: [0, 1], kind: k++, shops: false });                       // south side of the alley
    this.block({ x0: -112, x1: P.court.x0, z0: -52, z1: 70, face: [1, 0], kind: k++, shops: false });                      // west of the courtyard
    this.block({ x0: P.court.x0, x1: -66, z0: P.court.z1, z1: 70, face: [0, -1], kind: k++, shops: false });             // north of the courtyard
    this.block({ x0: P.lane.x1, x1: -66, z0: -52, z1: P.court.z0, face: [0, 1], kind: k++, shops: false });            // east of the lane
    this.block({ x0: P.court.x0, x1: P.lane.x0, z0: -52, z1: P.court.z0, face: [0, 1], kind: k++, shops: false });     // west of the lane
    // far side of the boulevard (south side of block "west of courtyard" etc. are covered); close the world edges
    const w = this.game.world; for (const [x, z, sx, sz] of [[0, -129, 240, 2], [0, 129, 240, 2], [-113, 0, 2, 260], [61, 0, 2, 260]]) w.addBoxCentered(V(x, 10, z), V(sx, 20, sz), { surface: 'concrete', walkable: false });
    // the alley is a covered passage for its first 14 m (an arch through the street block)
    const scene = this.game.renderer.scene, A = P.alley;
    const arch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, A.z1 - A.z0 + 0.4), this.M.stone); arch.position.set(-P.walk + 0.4, 4.6, (A.z0 + A.z1) / 2); scene.add(arch);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(18, 16, A.z1 - A.z0), this.M.stone); fill.position.set(-P.walk - 9, 5.2 + 8, (A.z0 + A.z1) / 2); fill.castShadow = true; scene.add(fill);
    const ceil = new THREE.Mesh(wbox(18, 0.3, A.z1 - A.z0, 3), this.M.stoneDark); ceil.position.set(-P.walk - 9, 5.05, (A.z0 + A.z1) / 2); scene.add(ceil);
    w.addBoxCentered(V(-P.walk - 9, 13.2, (A.z0 + A.z1) / 2), V(18, 16, A.z1 - A.z0), { surface: 'concrete', walkable: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('PASSAGE VÉRÈNE', '', '#203050', '#ffffff') })); plate.position.set(-P.walk + 0.02, 5.6, (A.z0 + A.z1) / 2); plate.rotation.y = Math.PI / 2; scene.add(plate);
    // street name plates (blue enamel)
    for (const [x, z, r] of [[P.walk - 0.02, 40, -Math.PI / 2], [-P.walk + 0.02, 70, Math.PI / 2]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('RUE SAINT-VÉRÈNE', '', '#1d3f8a', '#ffffff') })); pl.position.set(x, 3.4, z); pl.rotation.y = r; scene.add(pl); }
  }

  // ---------------- street furniture ----------------
  furniture() {
    const P = PARIS, scene = this.game.renderer.scene, M = this.M, w = this.game.world;
    // cast-iron street lamps (lantern heads) on both pavements and the square
    const lamp = (x, z) => {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 4.2, 10), M.green); post.position.y = 2.1; post.castShadow = true; g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), M.green); foot.position.y = 0.3; g.add(foot);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.55, 6, 1, true), M.lampGlow); head.position.y = 4.55; g.add(head);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 6), M.green); cap.position.y = 4.95; g.add(cap);
      scene.add(g); w.addBoxCentered(V(x, 2, z), V(0.25, 4, 0.25), { surface: 'metal', walkable: false });
      this.lampAnchors.push({ pos: V(x, 4.4, z), color: 0xffc888, power: 70, dist: 18, zone: 'street' });
    };
    for (let z = -118; z < 126; z += 16) { if (z > P.boulevard.z0 - 3 && z < P.boulevard.z1 + 3) continue; lamp(P.road + 0.7, z); if (!(z > P.alley.z0 - 3 && z < P.alley.z1 + 3)) lamp(-P.road - 0.7, z + 8); }
    lamp(14, -30); lamp(42, -48); lamp(-30, -52.6); lamp(-60, -52.6);
    // plane trees in grates on the square + bollards along the kerb
    this.game.props.bareTrees([{ x: 16, z: -46, s: 1.4 }, { x: 38, z: -32, s: 1.3 }, { x: 40, z: -46, s: 1.5 }]);
    for (let z = -110; z < 126; z += 4) { if ((z > P.boulevard.z0 - 2 && z < P.boulevard.z1 + 2) || (z > P.alley.z0 - 1 && z < P.alley.z1 + 1)) continue; for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 8), M.green); b.position.set(s * (P.road + 0.45), 0.5, z + 2); scene.add(b); } }
    // advertising column on the square
    const col = new THREE.Group(); col.position.set(20, 0, -32);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.4, 20), new THREE.MeshStandardMaterial({ map: posterTex(1), roughness: 0.6 })); shaft.material.map.repeat.set(3, 1); shaft.material.map.wrapS = THREE.RepeatWrapping; shaft.position.y = 2.0; col.add(shaft);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.green); dome.position.y = 3.75; col.add(dome);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), M.green); ring.position.y = 3.72; col.add(ring);
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.3, 20), M.green); bot.position.y = 0.15; col.add(bot);
    scene.add(col); w.addBoxCentered(V(20, 2, -32), V(1.5, 4, 1.5), { surface: 'metal', walkable: false });
    // newspaper kiosk
    this.game.props.box(V(2.6, 2.6, 1.8), V(34, 1.3, -30), M.green, { surface: 'metal' });
    // parked cars along both kerbs (small European hatchbacks), and a few on the boulevard
    const cols = [0x2a3a4a, 0x8a1c1c, 0xb8b8b0, 0x1a1a1a, 0x3a4a3a, 0x6a6a72, 0xd0c8b0, 0x22324a];
    let ci = 0; const park = (x, z, rot) => this.kit.car({ x, z, rotY: rot, color: cols[ci++ % cols.length], kind: ci % 4 === 0 ? 'suv' : 'sedan' });
    for (const z of [-100, -92, -40, -32, -6, 2, 30, 38, 62, 70, 86, 104, 112]) park(4.6, z, 0);
    for (const z of [-104, -96, -88, -44, -26, -8, 0, 34, 44, 52, 80, 96, 116]) { if (z > P.alley.z0 - 4 && z < P.alley.z1 + 4) continue; park(-4.6, z, Math.PI); }
    for (const x of [-46, -30, 26, 48]) park(x, -54.2, Math.PI / 2);
    // scooters / bins along the pavement
    for (const [x, z] of [[8.8, -14], [8.8, 22], [-8.8, 46], [-8.8, -30], [8.8, 74]]) this.game.propLib?.place('metal_trash_can', x, z, { rotQ: 0 });
    // the alley: bins, crates, back doors, pipes, wall lamps
    const A = P.alley;
    for (const [x, z, id] of [[-24, 21, 'metal_trash_can'], [-26, 21.2, 'metal_trash_can'], [-38, 16.9, 'wooden_crate_01'], [-50, 21.1, 'utility_box_01'], [-58, 17, 'wooden_crate_02']]) this.game.propLib?.place(id, x, z, { rotQ: 0 });
    // dumpster (the hiding spot for the ambush)
    const dump = new THREE.Group(); dump.position.set(-33, 0, 20.9);
    const db = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 1.15), new THREE.MeshStandardMaterial({ color: 0x2e4a34, metalness: 0.4, roughness: 0.6 })); db.position.y = 0.72; db.castShadow = true; dump.add(db);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.8 })); lid.position.set(0, 1.37, -0.02); lid.rotation.x = -0.08; dump.add(lid);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.black); wh.rotation.x = Math.PI / 2; wh.position.set(s * 0.8, 0.08, t * 0.4); dump.add(wh); }
    scene.add(dump); w.addBoxCentered(V(-33, 0.7, 20.9), V(2.0, 1.4, 1.15), { surface: 'metal', cover: true });
    this.dumpster = dump;
    for (const [x, z] of [[-30, A.z1 - 0.02], [-46, A.z0 + 0.02], [-60, A.z1 - 0.02]]) { const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.7 })); door.position.set(x, 1.15, z); door.rotation.y = z > 19 ? Math.PI : 0; scene.add(door); }
    for (const x of [-22, -44, -62]) this.lampAnchors.push({ pos: V(x, 3.6, A.z1 - 0.4), color: 0xffb070, power: 22, dist: 11, zone: 'alley' }), scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), M.lampGlow), V(x, 3.6, A.z1 - 0.15)));
    for (const x of [-20, -40, -56]) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 14, 6), M.iron); pipe.position.set(x, 7, A.z0 + 0.1); scene.add(pipe); }
    // the shop window used for the reflection trick (east pavement, bookshop at z ≈ 66)
  }

  courtyard() {
    const P = PARIS, C = P.court, scene = this.game.renderer.scene, M = this.M, w = this.game.world;
    // archive street door: heavy steel door with keypad and a brass plate
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 1.5), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.45 }));
    door.position.set(C.x0 + 0.06, 1.2, P.archiveDoor.z); scene.add(door); this.archiveDoorMesh = door;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x30ff60, emissiveIntensity: 0.25 })); pad.position.set(C.x0 + 0.14, 1.35, P.archiveDoor.z + 1.05); scene.add(pad); this.keypad = pad;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('ARCHIVES PRIVÉES', 'DÉPÔT · ACCÈS RÉSERVÉ', '#8a7440', '#1a1408'), metalness: 0.6, roughness: 0.35 }));
    plate.position.set(C.x0 + 0.03, 1.8, P.archiveDoor.z - 1.2); plate.rotation.y = Math.PI / 2; scene.add(plate);
    // ventilation grate (vent entry) in the courtyard floor by the north wall
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.0), new THREE.MeshStandardMaterial({ map: meshTex(), color: 0x666666, metalness: 0.6, roughness: 0.5 })); grate.position.set(P.vent.x, 0.03, P.vent.z); scene.add(grate);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.2), M.metal); hood.position.set(P.vent.x, 0.25, P.vent.z + 1.4); scene.add(hood);
    // power junction box (cut the archive's power)
    const jb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a6058, metalness: 0.5, roughness: 0.5 })); jb.position.set(P.junction.x - 0.2, 1.3, P.junction.z); jb.rotation.y = Math.PI / 2; scene.add(jb);
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshBasicMaterial({ map: signTexture('⚡ EDF', '', '#e8c020', '#111') })); warn.position.set(P.junction.x - 0.36, 1.5, P.junction.z); warn.rotation.y = -Math.PI / 2; scene.add(warn);
    for (let i = 0; i < 3; i++) { const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6), M.iron); cab.position.set(P.junction.x - 0.1 + i * 0.05, 4.2, P.junction.z); scene.add(cab); }
    // clutter: bins, crates, bicycles shed, wall lamp
    for (const [x, z, id] of [[-80, 9, 'wooden_crate_01'], [-81.5, 9.5, 'wooden_crate_02'], [-70, 13, 'metal_trash_can'], [-84, 31, 'Barrel_01'], [-78, 32, 'utility_box_02']]) this.game.propLib?.place(id, x, z, { rotQ: 0 });
    this.lampAnchors.push({ pos: V(C.x0 + 0.5, 3.2, P.archiveDoor.z), color: 0xfff0d0, power: 28, dist: 14, zone: 'court' });
    scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.3), M.lampGlow), V(C.x0 + 0.15, 3.2, P.archiveDoor.z)));
    this.lampAnchors.push({ pos: V(-77, 3.4, -20), color: 0xffb070, power: 20, dist: 12, zone: 'lane' });
    // Maya's van (dark grey panel van) waiting in the lane
    const van = new THREE.Group(); van.userData.dynamic = true; van.position.copy(P.van);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.1, 5.2), new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.5, roughness: 0.4 })); body.position.y = 1.4; body.castShadow = true; van.add(body);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 0.05), M.glassDark); ws.position.set(0, 1.9, -2.62); ws.rotation.x = 0.25; van.add(ws);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), M.black); wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.95, 0.36, t * 1.7); van.add(wh); }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2010 })); tail.position.set(0, 1.0, 2.62); van.add(tail);
    scene.add(van); this.van = van; w.addBoxCentered(V(P.van.x, 1.2, P.van.z), V(2.0, 2.4, 5.2), { surface: 'metal' });
    // courtyard gate to the lane (open)
    for (const s of [-1, 1]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), M.stone); pier.position.set(-77 + s * 5.3, 1.6, 6); scene.add(pier); }
  }

  // ---------------- métro entrance (original art-nouveau-inspired cast iron) ----------------
  metroEntrance() {
    const P = PARIS, scene = this.game.renderer.scene, M = this.M, w = this.game.world; const c = P.metroTop;
    const g = new THREE.Group(); g.position.copy(c); scene.add(g);
    // stair well opening (dark) and steps going down toward +Z... visual only
    const well = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.4), new THREE.MeshBasicMaterial({ color: 0x050505 })); well.rotation.x = -Math.PI / 2; well.position.set(0, 0.012, 0); g.add(well);
    for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.17, 0.6), M.granite); st.position.set(0, -0.1 - i * 0.17, -2.8 + i * 0.6); g.add(st); }
    // railing: U around the opening with ornamental panels
    const rp = new THREE.MeshStandardMaterial({ map: canvasTex('metrorail', 256, 64, (gg, W, H) => { gg.clearRect(0, 0, W, H); gg.strokeStyle = '#1c3a2a'; gg.fillStyle = '#1c3a2a'; gg.lineWidth = 3; gg.fillRect(0, 0, W, 6); gg.fillRect(0, H - 6, W, 6);
      for (let x = 16; x < W; x += 32) { gg.beginPath(); gg.moveTo(x, 6); gg.bezierCurveTo(x - 14, 24, x + 14, 40, x, H - 6); gg.stroke(); gg.beginPath(); gg.arc(x, H / 2, 5, 0, 7); gg.stroke(); } }), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45, color: 0x9fcfa8 });
    for (const [x, z, l, r] of [[-1.65, 0, 6.4, Math.PI / 2], [1.65, 0, 6.4, Math.PI / 2], [0, -3.2, 3.3, 0]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.0), rp); panel.position.set(x, 0.55, z); panel.rotation.y = r; g.add(panel);
      const top = new THREE.Mesh(new THREE.BoxGeometry(r ? 0.06 : l, 0.06, r ? l : 0.06), M.green); top.position.set(x, 1.06, z); g.add(top);
    }
    // two curved lamp posts with orange globes, the sign between them
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([V(s * 1.65, 0, 3.0), V(s * 1.7, 1.8, 3.0), V(s * 1.55, 3.0, 3.0), V(s * 1.2, 3.6, 3.0)]);
      const post = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.07, 8), M.green); g.add(post);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false })); globe.position.set(s * 1.1, 3.7, 3.0); globe.scale.set(0.8, 1.2, 0.8); g.add(globe);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.42), new THREE.MeshBasicMaterial({ map: canvasTex('metrosign', 512, 110, (gg, W, H) => { gg.fillStyle = '#e8dcb0'; gg.fillRect(0, 0, W, H); gg.strokeStyle = '#1c3a2a'; gg.lineWidth = 8; gg.strokeRect(4, 4, W - 8, H - 8); gg.fillStyle = '#1c3a2a'; gg.font = 'italic bold 66px serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('MÉTRO', W / 2, H / 2 + 4); }) }));
    sign.position.set(0, 3.35, 3.02); sign.rotation.y = Math.PI; g.add(sign);
    this.lampAnchors.push({ pos: V(c.x, 3.4, c.z + 3), color: 0xff9a50, power: 26, dist: 12, zone: 'street' });
    for (const [x, z, sx, sz] of [[c.x - 1.65, c.z, 0.12, 6.4], [c.x + 1.65, c.z, 0.12, 6.4], [c.x, c.z - 3.2, 3.3, 0.12]]) w.addBoxCentered(V(x, 0.55, z), V(sx, 1.1, sz), { surface: 'metal', walkable: false });
  }

  // ---------------- métro station (underground, x 300..430) ----------------
  buildMetro() {
    const P = PARIS, m = P.m, scene = this.game.renderer.scene, M = this.M, w = this.game.world, props = this.game.props;
    const wall = (cx, cz, sx, sz, h = 3.4, mat = M.tile) => props.box(V(sx, h, sz), V(cx, h / 2, cz), mat, { surface: 'concrete', walkable: false, uvScale: 1.3 });
    const floor = (x0, x1, z0, z1, y = 0, mat = M.granite) => { const f = new THREE.Mesh(wbox(x1 - x0, 0.1, z1 - z0, 2), mat); f.position.set((x0 + x1) / 2, y - 0.05, (z0 + z1) / 2); f.receiveShadow = true; scene.add(f); };
    const ceil = (x0, x1, z0, z1, y = 3.2) => { const c = new THREE.Mesh(wbox(x1 - x0, 0.3, z1 - z0, 2), M.tile); c.position.set((x0 + x1) / 2, y + 0.15, (z0 + z1) / 2); scene.add(c); w.addBoxCentered(V((x0 + x1) / 2, y + 0.15, (z0 + z1) / 2), V(x1 - x0, 0.3, z1 - z0), { surface: 'concrete', walkable: false, cover: false }); };
    // entrance corridor: x 300..336, z -2..2 (stairs arrive at x 304)
    floor(298, 336, -2, 2); ceil(298, 336, -2, 2, 3.0);
    wall(317, -2.15, 38, 0.3); wall(317, 2.15, 38, 0.3); wall(298.0, 0, 0.3, 4.6);
    // stairs from the street (visual, at the corridor's west end)
    for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 3.9), M.granite); st.position.set(299 + i * 0.5, 2.8 - i * 0.17 - (5 - i) * 0.25, 0); scene.add(st); }
    // ticket hall
    const H = m.hall; floor(H.x0, H.x1, H.z0, H.z1); ceil(H.x0, H.x1, H.z0, H.z1, 3.4);
    wall(H.x0, -6.1, 0.3, 8.2); wall(H.x0, 6.1, 0.3, 8.2); wall((H.x0 + H.x1) / 2, H.z0 - 0.15, H.x1 - H.x0, 0.3); wall((H.x0 + H.x1) / 2, H.z1 + 0.15, H.x1 - H.x0, 0.3);
    wall(H.x1, -5, 0.3, 10); wall(H.x1, 8.7, 0.3, 2.6);   // opening to the platform at z 0..7.4 is left free (x = 356)
    // turnstiles (line at x 346) with gaps
    for (let z = -8; z <= 8; z += 2) { if (Math.abs(z) < 1) continue; props.box(V(1.2, 1.0, 0.25), V(346, 0.5, z), M.metal, { surface: 'metal' }); }
    const tb = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('SAINT-VÉRÈNE', 'Direction PORTE NORD', '#1d3f8a', '#ffffff') })); tb.position.set(H.x0 + 0.18, 2.6, 0); tb.rotation.y = Math.PI / 2; scene.add(tb);
    // ticket machines + map board
    props.box(V(0.7, 1.7, 0.6), V(340, 0.85, -9.3), new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.4 }), { surface: 'metal' });
    props.box(V(0.7, 1.7, 0.6), V(342, 0.85, -9.3), new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.4 }), { surface: 'metal' });
    // platform (x 356..424, z 0..7), track bed (z -5..0, y -1.15), far wall z -5.2, vaulted tiled ceiling
    const PL = m.plat, T = m.track;
    floor(PL.x0, PL.x1, PL.z0, PL.z1); const edge = new THREE.Mesh(new THREE.BoxGeometry(PL.x1 - PL.x0, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.6 })); edge.position.set((PL.x0 + PL.x1) / 2, 0.01, 0.2); scene.add(edge);
    const bed = new THREE.Mesh(wbox(PL.x1 - PL.x0 + 30, 0.1, T.z1 - T.z0, 2), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 })); bed.position.set((PL.x0 + PL.x1 + 30) / 2, -1.2, (T.z0 + T.z1) / 2); scene.add(bed);
    for (const z of [-3.3, -1.7]) { const r = new THREE.Mesh(new THREE.BoxGeometry(PL.x1 - PL.x0 + 30, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.9, roughness: 0.3 })); r.position.set((PL.x0 + PL.x1 + 30) / 2, -1.08, z); scene.add(r); }
    const pf = new THREE.Mesh(new THREE.BoxGeometry(PL.x1 - PL.x0, 1.15, 0.2), M.granite); pf.position.set((PL.x0 + PL.x1) / 2, -0.58, 0.0); scene.add(pf);
    w.addBoxCentered(V((PL.x0 + PL.x1) / 2, -0.58, -0.05), V(PL.x1 - PL.x0, 1.15, 0.1), { surface: 'concrete' });
    // vault: half cylinder over platform + track
    const vgeo = new THREE.CylinderGeometry(6.4, 6.4, PL.x1 - PL.x0 + 30, 24, 1, true, 0, Math.PI); vgeo.rotateZ(Math.PI / 2);
    const vmap = tileTex().clone(); vmap.repeat.set(30, 10); vmap.needsUpdate = true;
    const vault = new THREE.Mesh(vgeo, new THREE.MeshStandardMaterial({ map: vmap, side: THREE.DoubleSide, roughness: 0.2 }));
    vault.position.set((PL.x0 + PL.x1 + 30) / 2, 0.4, 1); vault.scale.set(1, 0.55, 1); scene.add(vault);
    w.addBoxCentered(V((PL.x0 + PL.x1) / 2, 3.2, 3.6), V(PL.x1 - PL.x0, 0.4, 7.4), { surface: 'concrete', walkable: false, cover: false });
    wall((PL.x0 + PL.x1 + 30) / 2, T.z0 - 0.2, PL.x1 - PL.x0 + 30, 0.3, 5); wall((PL.x0 + PL.x1) / 2, PL.z1 + 0.15, PL.x1 - PL.x0, 0.3, 4); wall(PL.x1 + 0.15, 3.5, 0.3, 7, 4);
    w.addBoxCentered(V(PL.x1 + 15, 2, -2.5), V(30, 4, 5), { surface: 'concrete', walkable: false });   // tunnel beyond the platform end (train only)
    w.addBoxCentered(V((PL.x0 + PL.x1) / 2, 1.0, -0.25), V(PL.x1 - PL.x0, 2, 0.1), { surface: 'concrete', walkable: false, cover: false });   // keeps people off the track
    // platform furniture: benches, posters, station name plates, lights
    for (let x = 364; x < 420; x += 12) {
      props.box(V(1.8, 0.45, 0.45), V(x, 0.23, 6.3), new THREE.MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.5 }), { surface: 'metal' });
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshStandardMaterial({ map: posterTex(Math.floor(x / 12)), roughness: 0.4, emissive: 0xffffff, emissiveMap: posterTex(Math.floor(x / 12)), emissiveIntensity: 0.15 }));
      poster.position.set(x + 6, 1.9, T.z0 - 0.04); scene.add(poster);
      const name = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('SAINT-VÉRÈNE', '', '#1d3f8a', '#ffffff') })); name.position.set(x, 2.5, PL.z1 - 0.02); name.rotation.y = Math.PI; scene.add(name);
      const name2 = name.clone(); name2.position.set(x + 6, 3.2, T.z0 - 0.04); name2.rotation.y = 0; scene.add(name2);
      this.lampAnchors.push({ pos: V(x + 3, 3.4, 2.5), color: 0xfff2d8, power: 36, dist: 16, zone: 'metro' });
      const tube = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.12), M.lampGlow); tube.position.set(x + 3, 3.9, 2.5); scene.add(tube);
    }
    for (const x of [306, 318, 330, 342, 350]) { this.lampAnchors.push({ pos: V(x, 2.7, 0), color: 0xfff2d8, power: 26, dist: 12, zone: 'metro' }); const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.1), M.lampGlow); tube.position.set(x, x > 336 ? 3.3 : 2.95, 0); scene.add(tube); }
    this.metroTrain();
  }

  // a 5-car train (original generic design: white/blue body, ribbon windows, double doors); moves along +X
  metroTrain() {
    const scene = this.game.renderer.scene; const g = new THREE.Group(); g.userData.dynamic = true;
    const body = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, metalness: 0.35, roughness: 0.35 }), band = new THREE.MeshStandardMaterial({ color: 0x1d3f8a, metalness: 0.3, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2428, emissive: 0xc8d8e0, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.1 }), dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
    const L = 15, gap = 0.6; this.trainDoors = [];
    for (let c = 0; c < 4; c++) {
      const car = new THREE.Group(); car.position.x = c * (L + gap); g.add(car);
      const b = new THREE.Mesh(new THREE.BoxGeometry(L, 2.6, 2.7), body); b.position.y = 1.55; b.castShadow = false; car.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.35, 2.72), band); s.position.y = 0.6; car.add(s);
      const win = new THREE.Mesh(new THREE.BoxGeometry(L - 1, 0.9, 2.74), glass); win.position.y = 2.05; car.add(win);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(L, 0.25, 2.3), body); roof.position.y = 2.95; car.add(roof);
      const under = new THREE.Mesh(new THREE.BoxGeometry(L - 1, 0.4, 2.2), dark); under.position.y = 0.2; car.add(under);
      for (const dx of [-4.5, 0, 4.5]) {
        const door = new THREE.Group(); door.position.set(dx, 0, 1.36); car.add(door);
        const lft = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.95, 0.05), band); lft.position.set(-0.33, 1.27, 0); door.add(lft);
        const rgt = lft.clone(); rgt.position.x = 0.33; door.add(rgt);
        const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), glass); wl.position.set(-0.33, 1.7, 0.03); lft.add(wl.clone()); const wr = wl.clone(); wr.position.x = 0; rgt.add(wl.clone());
        this.trainDoors.push({ car: c, dx, l: lft, r: rgt });
      }
      const nose = c === 3 ? new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 2.6), band) : null; if (nose) { nose.position.set(L / 2 + 0.1, 1.5, 0); car.add(nose); const hl = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); hl.position.set(L / 2 + 0.26, 0.9, 0.8); hl.rotation.y = Math.PI / 2; car.add(hl); const hr = hl.clone(); hr.position.z = -0.8; car.add(hr); }
    }
    g.position.set(200, -1.1, -2.5); g.visible = false; scene.add(g); this.train = g; this.trainLen = 4 * (L + gap);
    this.trainDoorOpen = 0;
  }
  setTrainDoors(k) { this.trainDoorOpen = k; for (const d of this.trainDoors || []) { d.l.position.x = -0.33 - k * 0.6; d.r.position.x = 0.33 + k * 0.6; } }

  // ---------------- archive (underground, x 300..400, z 60..160) ----------------
  buildArchive() {
    const P = PARIS, A = P.a, scene = this.game.renderer.scene, M = this.M, w = this.game.world, props = this.game.props;
    const wall = (x0, x1, z0, z1, h = 3.4) => props.box(V(x1 - x0, h, z1 - z0), V((x0 + x1) / 2, h / 2, (z0 + z1) / 2), M.lime, { surface: 'concrete', walkable: false, uvScale: 0.9 });
    const room = (x0, x1, z0, z1, h = 3.2) => {
      const f = new THREE.Mesh(wbox(x1 - x0, 0.1, z1 - z0, 3), M.limeFloor); f.position.set((x0 + x1) / 2, -0.05, (z0 + z1) / 2); f.receiveShadow = true; scene.add(f);
      const c = new THREE.Mesh(wbox(x1 - x0, 0.4, z1 - z0, 3), M.lime); c.position.set((x0 + x1) / 2, h + 0.2, (z0 + z1) / 2); scene.add(c);
      w.addBoxCentered(V((x0 + x1) / 2, h + 0.2, (z0 + z1) / 2), V(x1 - x0, 0.4, z1 - z0), { surface: 'concrete', walkable: false, cover: false });
    };
    this.archiveLamps = [];
    const lamp = (x, z, y = 2.7) => { this.lampAnchors.push({ pos: V(x, y, z), color: 0xffd8a0, power: 24, dist: 13, zone: 'archive' }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.lampGlow.clone()); b.position.set(x, y + 0.1, z); scene.add(b); const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), M.iron); cbl.position.set(x, y + 0.4, z); scene.add(cbl); this.archiveLamps.push(b); };
    this.emergencyAnchors = [];
    const emer = (x, z) => { this.emergencyAnchors.push({ pos: V(x, 2.6, z), color: 0xff2a14, power: 9, dist: 9, zone: 'archiveDark' }); const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x6a1008 })); b.position.set(x, 2.9, z); scene.add(b); (this.emerBulbs ||= []).push(b); };
    // front stairs landing + guard room (x 302..322, z 62..86)
    room(302, 322, 60, 86); wall(301.7, 302, 60, 86); wall(322, 322.3, 60, 86); wall(302, 322, 59.7, 60);
    wall(302, 310, 86, 86.3); wall(314, 322, 86, 86.3);
    const desk = props.box(V(3.0, 0.9, 1.0), V(316, 0.45, 72), M.wood, { surface: 'wood' });
    for (const dx of [-0.8, 0.4]) { const mon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x6a9ab0, emissiveIntensity: 0.6 })); mon.position.set(316 + dx, 1.15, 71.7); scene.add(mon); (this.monitors ||= []).push(mon); }
    props.box(V(0.6, 1.9, 0.6), V(304, 0.95, 84.5), M.metal, { surface: 'metal' });   // lockers
    props.box(V(0.6, 1.9, 0.6), V(305, 0.95, 84.5), M.metal, { surface: 'metal' });
    lamp(312, 68); lamp(312, 80); emer(306, 64); emer(318, 82);
    // main tunnel T1 (x 310..314, z 86..120)
    room(310, 314, 86, 120); wall(309.7, 310, 86, 120); wall(314, 314.3, 86, 96); wall(314, 314.3, 100, 120);
    lamp(312, 92); lamp(312, 106); emer(312, 114);
    // side tunnel T2 (x 314..340, z 96..100) to the storage room
    room(314, 340, 96, 100); wall(314, 340, 95.7, 96); wall(314, 340, 100, 100.3);
    lamp(326, 98); emer(334, 98);
    // storage room S1 (x 340..362, z 88..106): vent shaft arrives at (352, 95)
    room(340, 362, 88, 106); wall(339.7, 340, 88, 96); wall(339.7, 340, 100, 106); wall(362, 362.3, 88, 106); wall(340, 362, 87.7, 88); wall(340, 348, 106, 106.3); wall(352, 362, 106, 106.3);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), new THREE.MeshStandardMaterial({ map: meshTex(), color: 0x777777 })); shaft.position.set(A.vent.x, 3.2, A.vent.z); scene.add(shaft);
    for (const [x, z] of [[344, 90], [345.4, 90], [358, 103], [356.6, 103], [344, 104]]) this.game.propLib?.place('wooden_crate_01', x, z, { rotQ: 0 }) || props.box(V(1.2, 1.2, 1.2), V(x, 0.6, z), M.wood, { surface: 'wood' });
    props.box(V(5, 1.4, 1.2), V(351, 0.7, 91), M.wood, { surface: 'wood' });
    lamp(350, 98); emer(358, 92);
    // storage room → hall: corridor x 348..352, z 106..120
    room(348, 352, 106, 120); wall(347.7, 348, 106, 120); wall(352, 352.3, 106, 120);
    // archive hall H (x 300..362, z 120..152): pillars, shelving rows, vault cage in the NE corner
    const Hh = A.hall; room(Hh.x0, Hh.x1, Hh.z0, Hh.z1, 4.2);
    wall(Hh.x0 - 0.3, Hh.x0, Hh.z0, Hh.z1, 4.4); wall(Hh.x1, Hh.x1 + 0.3, Hh.z0, 132, 4.4); wall(Hh.x1, Hh.x1 + 0.3, 136, Hh.z1, 4.4);
    wall(Hh.x0, 310, Hh.z0 - 0.3, Hh.z0, 4.4); wall(314, 348, Hh.z0 - 0.3, Hh.z0, 4.4); wall(352, Hh.x1, Hh.z0 - 0.3, Hh.z0, 4.4); wall(Hh.x0, Hh.x1, Hh.z1, Hh.z1 + 0.3, 4.4);
    for (let x = 308; x < 360; x += 12) for (const z of [128, 144]) props.box(V(1.0, 4.2, 1.0), V(x, 2.1, z), M.lime, { surface: 'concrete', walkable: false, uvScale: 0.9 });
    // shelving rows (metal racks with archive boxes), aisles between
    const rack = (x, z, len) => {
      const r = new THREE.Group(); r.position.set(x, 0, z);
      for (const s of [-1, 1]) for (const e of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6, 0.05), M.metal); post.position.set(e * (len / 2), 1.3, s * 0.42); r.add(post); }
      for (let k = 0; k < 5; k++) { const sh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.9), M.metal); sh.position.y = 0.1 + k * 0.6; r.add(sh); if (k < 4) { const bx = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.5, 0.8), M.boxes.clone()); bx.material.map = M.boxes.map.clone(); bx.material.map.repeat.set(len / 2.4, 1); bx.material.map.needsUpdate = true; bx.position.y = 0.38 + k * 0.6; r.add(bx); } }
      scene.add(r); w.addBoxCentered(V(x, 1.3, z), V(len, 2.6, 0.95), { surface: 'wood', cover: true, walkable: false });
    };
    for (const z of [124, 133, 140, 148]) { rack(306.5, z, 5); rack(320, z, 7); rack(334, z, 7); }
    // vault cage around the safe / terminal (x 350..361, z 140..151), door on the west side at z 145.5
    const cage = (x0, x1, z0, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.0), M.mesh.clone()); p.material.map = M.mesh.map.clone(); p.material.map.repeat.set(len / 1.2, 2.5); p.material.map.needsUpdate = true; p.position.set((x0 + x1) / 2, 1.5, (z0 + z1) / 2); p.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2; scene.add(p); w.addBox(V(Math.min(x0, x1) - 0.03, 0, Math.min(z0, z1) - 0.03), V(Math.max(x0, x1) + 0.03, 3, Math.max(z0, z1) + 0.03), { surface: 'metal', cover: false, walkable: false }); };
    cage(350, 361.9, 139, 139); cage(350, 350, 139, 144.5); cage(350, 350, 146.5, 151.9);
    const safe = props.box(V(1.0, 1.4, 0.9), V(360.8, 0.7, 147), new THREE.MeshStandardMaterial({ color: 0x3a3c3a, metalness: 0.7, roughness: 0.4 }), { surface: 'metal' });
    const term = props.box(V(1.4, 0.8, 0.7), V(356, 0.4, 150.9), M.metal, { surface: 'metal' });
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x40c0a0, emissiveIntensity: 0.6 })); scr.position.set(356, 1.15, 150.6); scene.add(scr); this.vaultScreen = scr;
    for (let i = 0; i < 3; i++) props.box(V(0.6, 2.0, 0.9), V(352 + i * 0.7, 1.0, 140.2), new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.5, roughness: 0.4 }), { surface: 'metal' });   // server racks
    for (let i = 0; i < 18; i++) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x30ff60 : 0xffa020 })); led.position.set(352 + (i % 3) * 0.7 - 0.15 + (i % 2) * 0.1, 0.4 + Math.floor(i / 3) * 0.25, 140.66); scene.add(led); }
    for (const [x, z] of [[306, 124], [320, 136], [334, 136], [306, 146], [320, 148], [340, 128], [355, 133], [355, 146]]) lamp(x, z, 3.6);
    for (const [x, z] of [[312, 130], [330, 150], [345, 124], [358, 140]]) emer(x, z);
    // generator (noise source) in the hall's SW corner
    props.box(V(2.2, 1.4, 1.2), V(303, 0.7, 150), new THREE.MeshStandardMaterial({ color: 0x5a6a3a, metalness: 0.4, roughness: 0.6 }), { surface: 'metal' });
    // exit tunnel E (x 362..400, z 132..136) to the ladder
    room(362, 400, 132, 136); wall(362, 400, 131.7, 132); wall(362, 400, 136, 136.3); wall(400, 400.3, 132, 136);
    for (let i = 0; i < 9; i++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M.iron); rung.rotation.z = Math.PI / 2; rung.position.set(399.6, 0.3 + i * 0.35, 134); scene.add(rung); }
    lamp(372, 134); lamp(390, 134); emer(382, 134);
  }

  // ---------------- dynamic light pool ----------------
  // Dozens of lamp anchors but only a handful of real point lights: each frame the nearest anchors
  // (of the active zone set) to the camera get one.
  lights() {
    const scene = this.game.renderer.scene; this.pool = [];
    const n = { low: 4, medium: 6, high: 8, ultra: 10 }[settings.data.graphics.preset] ?? 6;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); this.pool.push(l); }
    this.poolT = 0;
  }
  updateLights(dt) {
    this.poolT -= dt; if (this.poolT > 0) return; this.poolT = 0.2;
    const cam = this.game.renderer.camera.position;
    const zones = this.under === 'metro' ? ['metro'] : this.under === 'archive' ? (this.archiveDark ? ['archiveDark'] : ['archive']) : ['street', 'alley', 'court', 'lane'];
    const pool = [...this.lampAnchors, ...(this.emergencyAnchors || [])].filter((a) => zones.includes(a.zone)).map((a) => ({ a, d: a.pos.distanceToSquared(cam) })).sort((p, q) => p.d - q.d);
    this.pool.forEach((l, i) => { const e = pool[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e.a.pos); l.color.setHex(e.a.color); l.intensity = e.a.power * (e.a.flicker ? 0.7 + Math.random() * 0.3 : 1); l.distance = e.a.dist; });
  }
  // underground areas: no rain, no sky, close fog
  setUnderground(where) {
    const scene = this.game.renderer.scene; this.under = where || 0;
    this.weather.points.visible = !where; this.sky.mesh.visible = !where;
    scene.fog = where ? (this.fogUnder ||= new THREE.FogExp2(0x0c0b0a, 0.03)) : this.fogOut;
    this.hemi.intensity = where === 'archive' ? (this.archiveDark ? 0.04 : 0.16) : where === 'metro' ? 0.35 : 0.7;
    this.key.intensity = where ? 0 : 0.55;
    this.poolT = 0;
  }
  setArchiveDark(on) {
    this.archiveDark = on;
    for (const b of this.archiveLamps || []) b.material.color.setHex(on ? 0x221d16 : 0xffd9a0);
    for (const b of this.emerBulbs || []) b.material.color.setHex(on ? 0xff2a14 : 0x6a1008);
    for (const m of this.monitors || []) m.material.emissiveIntensity = on ? 0 : 0.6;
    if (this.under === 'archive') this.setUnderground('archive');
    this.poolT = 0;
  }
  update(dt, t) {
    const g = this.game;
    this.sky.update(dt, g.renderer.camera);
    if (!this.under) this.weather.update(dt, g.renderer.camera.position);
    this.updateLights(dt);
  }
}
