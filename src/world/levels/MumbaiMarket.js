// Level: Mumbai, Mission 06 (NIGHT MARKET). Humid night, neon. Every name here is fictional.
//
// Z north (-) to south (+):
//   bazaar lane      x -4..4, z -60..80 — stalls on both sides under string lights, 3-5 storey buildings behind
//   cross lane       z 7..13, x -70..60 — east to the harbour yard, west to the laundry ghat
//   elevated railway z -24..-16, deck at y 8.5, piers every 18 m; station stairs east (x 14..17) and west (x -52..-49)
//   rooftop vantage  the block x 7..21, z -58..-34 (roof y 12.4) with an outside stair on its south face
//   harbour yard     x 40..100, z -80..-26: containers, the auction warehouse (x 70..95, z -74..-52) open to the west
//   laundry ghat     x -70..-20, z 24..84: grid of wash pens, lines of hanging cloth
//   godown           x -88..-72, z 40..70 at the ghat's west end — the courier's handover
import { ContainerYard, CONTAINER } from '../Containers.js';
import * as THREE from 'three';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { settings } from '../../core/Settings.js';
import { signTexture } from '../CityProps.js';
import { Facades } from '../Facade.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seedN = 11; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);

export const MUMBAI = {
  bounds: { minX: -96, maxX: 108, minZ: -96, maxZ: 92 },
  lane: { x0: -4, x1: 4, z0: -60, z1: 80 }, cross: { z0: 7, z1: 13 },
  rail: { z0: -24, z1: -16, y: 8.5 },
  roof: { x0: 7, x1: 21, z0: -58, z1: -34, y: 12.4 }, roofStairTop: V(19.5, 12.4, -35.2),
  yard: { x0: 40, x1: 100, z0: -80, z1: -26 }, warehouse: { x0: 70, x1: 95, z0: -74, z1: -52 },
  auctionTable: V(78, 0, -63),
  ghat: { x0: -70, x1: -20, z0: 24, z1: 84 },
  godown: { x0: -88, x1: -72, z0: 40, z1: 70 }, godownDoor: V(-72, 0, 55),
  stationE: { x0: 41, x1: 44, z0: -16, z1: -2 }, stationW: { x0: -76, x1: -73, z0: -16, z1: -2 },
  start: V(1, 0, 74),
};

const cache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); return t;
}
const speckle = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(20,16,12,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
// weathered plaster facade with shuttered windows, stains and AC units painted in; some windows lit
function facadeTex(k) {
  const pal = [['#c9a77c', '#9c7c56'], ['#b9c2b0', '#8a9480'], ['#d6c39a', '#a8946a'], ['#a9b8c4', '#7b8a96'], ['#c79e8e', '#986e60'], ['#d8d2c2', '#a8a090']][k % 6];
  const lit = [];
  const map = canvasTex(`mfac${k}`, 512, 512, (g, W, H) => {
    g.fillStyle = pal[0]; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.09})`; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 10, 30 + Math.random() * 160); }   // monsoon stains
    speckle(g, W, H, 4000, 0.14);
    const bw = W / 4, fh = H / 4;
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
      const wx = b * bw + bw * 0.22, wy = f * fh + fh * 0.2, ww = bw * 0.56, wh = fh * 0.55; const r = Math.random(); const isLit = r < 0.4; lit.push(isLit ? (r < 0.15 ? 2 : 1) : 0);
      g.fillStyle = pal[1]; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      const gr = g.createLinearGradient(wx, wy, wx, wy + wh); if (isLit) { gr.addColorStop(0, r < 0.08 ? '#9fd0c0' : '#f0c070'); gr.addColorStop(1, '#a06a30'); } else { gr.addColorStop(0, '#1c2226'); gr.addColorStop(1, '#2c3236'); }
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = '#2a2a28'; g.lineWidth = 2; for (let x = wx; x <= wx + ww; x += ww / 4) { g.beginPath(); g.moveTo(x, wy); g.lineTo(x, wy + wh); g.stroke(); }   // window grilles
      if (Math.random() < 0.3) { g.fillStyle = '#d8d8d0'; g.fillRect(wx + ww * 0.6, wy + wh + 6, bw * 0.3, fh * 0.14); }    // AC unit
      if (Math.random() < 0.35) { g.fillStyle = ['#b83a2a', '#2a6ab8', '#e0b030', '#3a8a4a'][Math.floor(Math.random() * 4)]; g.fillRect(wx - 8, wy + wh * 0.3, 6, wh * 0.7); }   // hanging cloth
    }
    g.fillStyle = 'rgba(30,24,18,0.5)'; for (let f = 1; f < 4; f++) g.fillRect(0, f * fh - 4, W, 6);
  });
  const emissive = canvasTex(`mface${k}`, 512, 512, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const bw = W / 4, fh = H / 4; let i = 0;
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) { const v = lit[i++]; if (!v) continue; g.fillStyle = v === 2 ? '#c08040' : '#704a20'; g.fillRect(b * bw + bw * 0.22 + 2, f * fh + fh * 0.2 + 2, bw * 0.56 - 4, fh * 0.55 - 4); }
  });
  return { map, emissive };
}
// the same plaster without windows, for the street faces that carry 3D windows (Facade.js)
const MPAL = ['#c9a77c', '#b9c2b0', '#d6c39a', '#a9b8c4', '#c79e8e', '#d8d2c2'];
const plainTex = (k) => canvasTex(`mfacp${k % 6}`, 512, 512, (g, W, H) => {
  g.fillStyle = MPAL[k % 6]; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { const r = 30 + Math.random() * 90, x = Math.random() * W, y = Math.random() * H, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(70,60,40,${0.05 + Math.random() * 0.08})`); gr.addColorStop(1, 'rgba(70,60,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.1})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 9, 30 + Math.random() * 200); }   // monsoon stains
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(250,245,230,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 60, 14 + Math.random() * 40); }   // patched render
  speckle(g, W, H, 5000, 0.16);
  g.fillStyle = 'rgba(30,24,18,0.35)'; for (let f = 1; f < 4; f++) g.fillRect(0, f * H / 4 - 3, W, 4);
});
const tarpTex = (col) => canvasTex(`tarp${col}`, 128, 128, (g, W, H) => { g.fillStyle = col; g.fillRect(0, 0, W, H); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); } for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, 0, 2, H); } });
const goodsTex = () => canvasTex('goods', 256, 128, (g, W, H) => { g.fillStyle = '#2a2420'; g.fillRect(0, 0, W, H);
  // stacked wares: cloth bolts, sacks, tins and boxes in market colours, muted by dust and lamplight
  const cols = ['#8a3a2a', '#a07a3a', '#4a6a3a', '#3a4a6a', '#b8ac98', '#6a3a5a', '#a0602a', '#7a7a6a'];
  for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? -10 : 0; x < W; x += 18 + Math.random() * 10) { const w = 14 + Math.random() * 10, h = 12 + Math.random() * 3; g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, y + 1, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y + 1, w, 2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + h - 2, w, 3); }
  speckle(g, W, H, 1500, 0.2); });
const clothTex = (col) => canvasTex(`cloth${col}`, 64, 128, (g, W, H) => { g.fillStyle = col; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 6) { g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`; g.fillRect(0, y, W, 2); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, H - 6, W, 6); });

export class MumbaiMarket {
  constructor(game) { this.game = game; this.anchors = []; this.signs = []; }

  async build() {
    const g = this.game, w = g.world, M = MUMBAI; seedN = 11;
    w.bounds = { ...M.bounds };
    // ghat wash pens are a few cm below the walkway; everything else flat
    w.setTerrain(() => 0, (x, z) => (x > M.ghat.x0 && x < M.ghat.x1 && z > M.ghat.z0 && z < M.ghat.z1 ? 'concrete' : 'concrete'));
    this.hf = w.heightFn;
    this.mats();
    this.atmosphere();
    this.ground();
    this.fac = new Facades(g, 'mumbai', { night: true });
    this.bazaar();
    this.cross();
    this.railway();
    this.vantage();
    this.harbour();
    this.ghat();
    this.godown();
    this.blockers();
    this.fac.build();
    this.lightsInit();
    w.ladders = [];
  }

  mats() {
    const M = this.M = {};
    M.asph = pbr('asphalt', { color: 0x5c5a56, key: 'mb_asph' }); M.asph.roughness = 0.55;
    M.conc = pbr('concrete', { color: 0x8c8880, key: 'mb_conc' });
    M.concDark = pbr('concrete', { color: 0x5e5c58, key: 'mb_concd' });
    M.metal = pbr('metal', { color: 0x7a7e80, key: 'mb_metal' });
    M.rust = pbr('corrugated', { color: 0x8a5a3a, key: 'mb_rust' });
    M.corr = pbr('corrugated', { color: 0x9a9a92, key: 'mb_corr' });
    M.wood = pbr('wood', { color: 0x6a5240, key: 'mb_wood' });
    M.iron = new THREE.MeshStandardMaterial({ color: 0x1c1d1c, metalness: 0.5, roughness: 0.6 });
    M.bulb = new THREE.MeshBasicMaterial({ color: 0xffd290, toneMapped: false });
    M.goods = new THREE.MeshStandardMaterial({ map: goodsTex(), roughness: 0.7 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x1a2a2c, metalness: 0.2, roughness: 0.08 });
    M.sea = new THREE.MeshStandardMaterial({ color: 0x0c1418, metalness: 0.3, roughness: 0.15 });
    M.wire = new THREE.MeshBasicMaterial({ color: 0x111111 });
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    scene.fog = new THREE.FogExp2(0x1c1a22, 0.018);
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.3;
    this.sky = new Sky(scene, { zenith: 0x07080e, horizon: 0x3a2a2a, stars: 0.1, sunDir: [-0.3, 0.35, 0.8], sunColor: 0x9a8a7a, sunSize: 0.9999 });
    this.hemi = new THREE.HemisphereLight(0x6a6070, 0x2a2018, 0.7); scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xc0a080, 0.45); const sh = settings.data.graphics.shadows;
    key.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    key.shadow.mapSize.set(size, size); Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key); scene.add(key.target); g.sun = key; g.sunOffset = V(30, 60, 30);
    g.renderer.renderer.toneMappingExposure = 1.3; g.effects.setSmokeLight(0.5);
  }

  plane(x0, x1, z0, z1, mat, y = 0, tile = 4) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; this.game.renderer.scene.add(m); return m;
  }
  ground() {
    const M = MUMBAI;
    this.plane(-110, 120, -110, 110, this.M.asph, -0.01, 5);
    this.plane(M.ghat.x0, M.ghat.x1, M.ghat.z0, M.ghat.z1, this.M.conc, 0.005, 3);
    this.plane(M.yard.x0, M.yard.x1, M.yard.z0, M.yard.z1, this.M.concDark, 0.006, 4);
    // the sea east of the quay
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.M.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(300, -1.4, 0); this.game.renderer.scene.add(sea);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 200), this.M.concDark); quay.position.set(101, -0.7, -10); this.game.renderer.scene.add(quay);
  }

  // a 3-5 storey block with plaster facade, balconies and roof clutter; `face` = street side normal
  block(x0, x1, z0, z1, { floors = 4, k = 0, face = null, roof = false } = {}) {
    const scene = this.game.renderer.scene, w = this.game.world, M = this.M;
    const W = x1 - x0, D = z1 - z0, H = floors * 3.1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const tex = facadeTex(k);
    const fm = (len) => { const m = new THREE.MeshStandardMaterial({ map: tex.map.clone(), emissiveMap: tex.emissive.clone(), emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.9 }); m.map.repeat.set(len / 12, floors / 4); m.emissiveMap.repeat.set(len / 12, floors / 4); m.map.needsUpdate = m.emissiveMap.needsUpdate = true; return m; };
    const pm = (len) => { const m = new THREE.MeshStandardMaterial({ map: plainTex(k).clone(), roughness: 0.92 }); m.map.repeat.set(len / 12, floors / 4); m.map.needsUpdate = true; return m; };
    const isF = (nx, nz) => face && face[0] === nx && face[1] === nz;
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [(isF(1, 0) ? pm : fm)(D), (isF(-1, 0) ? pm : fm)(D), M.concDark, M.concDark, (isF(0, 1) ? pm : fm)(W), (isF(0, -1) ? pm : fm)(W)]);
    if (face) this.fac.face({ cx: cx + face[0] * W / 2, cz: cz + face[1] * D / 2, nx: face[0], nz: face[1], len: face[0] ? D : W, floors, startFloor: 1,
      wall: new THREE.Color(MPAL[k % 6]).getHex(), frame: [0x2a5a5a, 0x6a3a22, 0x3a4a6a, 0x5a5a4a, 0x2a4a2a][k % 5], lit: 0.38, ac: 0.22 }); b.position.set(cx, H / 2, cz); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    w.addBoxCentered(V(cx, H / 2, cz), V(W, H, D), { surface: 'concrete', cover: true, walkable: roof });
    // parapet + water tank + dish on the roof
    const par = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, D), M.conc); par.scale.set(1, 1, 1); par.position.set(cx, H + 0.45, cz);
    const parW = 0.25; for (const [px, pz, sx, sz] of [[cx, z0 + parW / 2, W, parW], [cx, z1 - parW / 2, W, parW], [x0 + parW / 2, cz, parW, D], [x1 - parW / 2, cz, parW, D]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.9, sz), M.conc); p.position.set(px, H + 0.45, pz); scene.add(p); if (roof && pz !== z1 - parW / 2) w.addBoxCentered(V(px, H + 0.45, pz), V(sx, 0.9, sz), { surface: 'concrete', cover: true, walkable: false }); }
    if (rnd() < 0.7) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); tank.position.set(cx + (rnd() - 0.5) * W * 0.5, H + 0.7, cz + (rnd() - 0.5) * D * 0.5); scene.add(tank); }
    // balconies with railings + hanging laundry on the street side
    if (face) {
      const along = face[0] === 0; const len = along ? W : D; const n = Math.max(1, Math.floor(len / 4));
      for (let f = 1; f < floors; f++) for (let i = 0; i < n; i++) {
        if (rnd() < 0.45) continue;
        const o = -len / 2 + (i + 0.5) * len / n; const bx = along ? cx + o : cx + face[0] * (W / 2 + 0.5), bz = along ? cz + face[1] * (D / 2 + 0.5) : cz + o;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(along ? 2.6 : 1.0, 0.12, along ? 1.0 : 2.6), M.conc); slab.position.set(bx, f * 3.1, bz); scene.add(slab);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(along ? 2.6 : 0.05, 0.9, along ? 0.05 : 2.6), M.iron); rail.position.set(bx + face[0] * 0.5, f * 3.1 + 0.5, bz + face[1] * 0.5); scene.add(rail);
        if (rnd() < 0.5) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshStandardMaterial({ map: clothTex(['#c83a2a', '#e8d8b0', '#2a5aa8', '#e8a020', '#3a8a5a'][Math.floor(rnd() * 5)]), side: THREE.DoubleSide, roughness: 0.9 })); cl.position.set(bx + face[0] * 0.56, f * 3.1 + 0.4, bz + face[1] * 0.56); cl.rotation.y = Math.atan2(face[0], face[1]); scene.add(cl); }
      }
    }
    return b;
  }

  // market stall: frame, sloping tarp, counter with goods, string of bulbs
  stall(x, z, rotY, k) {
    const scene = this.game.renderer.scene, M = this.M, w = this.game.world;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const col = ['#b83a2a', '#2a6ab8', '#e0a030', '#3a8a4a', '#8a3aa0', '#d86a2a', '#2a8a8a'][k % 7];
    for (const [px, pz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), M.iron); p.position.set(px, 1.3, pz); g.add(p); }
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.8), new THREE.MeshStandardMaterial({ map: tarpTex(col), side: THREE.DoubleSide, roughness: 0.85 })); tarp.rotation.x = -Math.PI / 2 + 0.22; tarp.position.set(0, 2.6, 0.1); g.add(tarp);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.9), M.wood); counter.position.set(0, 0.45, 0.6); g.add(counter);
    const goods = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 0.8), M.goods); goods.position.set(0, 1.0, 0.6); g.add(goods);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 0.4), M.goods); back.position.set(0, 0.8, -0.9); g.add(back);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M.bulb); b.position.set(-1.2 + i * 0.6, 2.35 + Math.sin(i * 1.3) * 0.05, 1.25); g.add(b); }
    const wp = new THREE.Vector3(0, 0, 0.6).applyAxisAngle(V(0, 1, 0), rotY);
    w.addBoxCentered(V(x + wp.x, 0.5, z + wp.z), Math.abs(Math.sin(rotY)) > 0.5 ? V(0.9, 1, 2.6) : V(2.6, 1, 0.9), { surface: 'wood', cover: true });
    if (k % 2 === 0) this.anchors.push({ pos: V(x + wp.x * 1.8, 2.3, z + wp.z * 1.8), color: [0xffc080, 0xff9a60, 0xffe0a0][k % 3], power: 14, dist: 8 });
  }
  neon(x, y, z, rotY, text, col) {
    const tex = canvasTex(`neon${text}`, 512, 128, (g, W, H) => { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H); g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.fillText(text, W / 2, H / 2); g.shadowBlur = 0; g.fillStyle = '#fff8f0'; g.globalAlpha = 0.6; g.fillText(text, W / 2, H / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = rotY; this.game.renderer.scene.add(m);
    this.anchors.push({ pos: V(x + Math.sin(rotY) * 1.2, y, z + Math.cos(rotY) * 1.2), color: new THREE.Color(col).getHex(), power: 10, dist: 9 });
  }

  bazaar() {
    const M = MUMBAI; let k = 0;
    // buildings both sides of the lane (gaps for the cross lane and the railway)
    const spans = [[-60, -26], [-14, 7], [13, 40], [40, 80]];
    for (const [z0, z1] of spans) { this.block(-20, -7, z0, z1, { floors: 3 + (k % 3), k: k++, face: [1, 0] }); if (!(z0 === -60)) this.block(7, 21, z0, z1, { floors: 3 + (k % 3), k: k++, face: [-1, 0] }); }
    // stalls along both sides
    for (let z = -54; z < 78; z += 3.2) { if ((z > -27 && z < -12) || (z > 5 && z < 15)) continue; this.stall(-5.2, z, Math.PI / 2, k++); this.stall(5.2, z, -Math.PI / 2, k++); }
    // neon / shop signs (fictional)
    const signs = [['SHREE MOBILE', '#40e0ff'], ['CHAI 24H', '#ffb040'], ['MEHTA SAREES', '#ff50a0'], ['RAJ ELECTRICALS', '#60ff80'], ['NOOR STORES', '#ffe060'], ['LUCKY TAILORS', '#ff7040'], ['SAI MEDICALS', '#40ff90'], ['GOLDEN BAKERY', '#ffd040']];
    signs.forEach(([t, c], i) => { const s = i % 2 ? 1 : -1; this.neon(s * 6.98, 4.2 + (i % 3) * 0.6, -48 + i * 16, s > 0 ? -Math.PI / 2 : Math.PI / 2, t, c); });
    // overhead wires + bulb strings across the lane
    const scene = this.game.renderer.scene;
    for (let z = -50; z < 80; z += 7) { const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 14, 4), this.M.wire); wire.rotation.z = Math.PI / 2; wire.position.set(0, 5.5 + Math.sin(z) * 0.3, z); scene.add(wire);
      for (let x = -6; x <= 6; x += 1.5) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), this.M.bulb); b.position.set(x, 5.4 + Math.sin(z) * 0.3 - (1 - (x / 7) ** 2) * 0.5, z); scene.add(b); } }
  }

  cross() {
    // cross lane: buildings to its north/south outside the bazaar, plus a few parked rickshaws (boxes)
    let k = 30; const M = this.M;
    this.block(-70, -20, -14, 7, { floors: 3, k: k++, face: [0, 1] });
    this.block(21, 40, -14, 7, { floors: 4, k: k++, face: [0, 1] });
    this.block(21, 40, 13, 40, { floors: 3, k: k++, face: [0, -1] });
    this.block(40, 60, 13, 40, { floors: 3, k: k++ });
    this.block(-20, -7, 13, 24, { floors: 3, k: k++ });
    for (const [x, z, r] of [[26, 10, 0.2], [32, 9.2, -0.1], [-30, 10.5, 1.5], [-42, 9, 1.7]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; g.userData.dynamic = false;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); body.position.y = 1.0; g.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 })); top.position.y = 1.85; g.add(top);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.6 })); nose.position.set(0, 0.8, 1.5); g.add(nose);
      this.game.renderer.scene.add(g); this.game.world.addBoxCentered(V(x, 0.9, z), V(1.8, 1.8, 2.8), { surface: 'metal', cover: true });
    }
  }

  // elevated railway: deck on piers, parapets, tracks; stairs east and west
  railway() {
    const R = MUMBAI.rail, M = this.M, scene = this.game.renderer.scene, w = this.game.world, props = this.game.props;
    const x0 = -96, x1 = 108, L = x1 - x0, cx = (x0 + x1) / 2, cz = (R.z0 + R.z1) / 2, D = R.z1 - R.z0;
    props.box(V(L, 1.0, D), V(cx, R.y - 0.5, cz), M.concDark, { surface: 'concrete', walkable: true, uvScale: 0.5 });
    // parapets (gaps where the station stairs come up on the south side)
    props.box(V(L, 1.1, 0.3), V(cx, R.y + 0.55, cz - (D / 2 - 0.15)), M.conc, { surface: 'concrete', walkable: false });
    const gaps = [MUMBAI.stationW, MUMBAI.stationE].map((S) => [S.x0 - 0.3, S.x1 + 0.3]); let px = x0;
    for (const [g0, g1] of [...gaps, [x1, x1]]) { if (g0 - px > 0.1) props.box(V(g0 - px, 1.1, 0.3), V((px + g0) / 2, R.y + 0.55, cz + (D / 2 - 0.15)), M.conc, { surface: 'concrete', walkable: false }); px = g1; }
    for (let x = x0 + 9; x < x1; x += 18) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, R.y - 1, 2.2), M.concDark); p.position.set(x, (R.y - 1) / 2, cz); p.castShadow = true; scene.add(p); w.addBoxCentered(V(x, (R.y - 1) / 2, cz), V(1.4, R.y - 1, 2.2), { surface: 'concrete', walkable: false }); }
    for (const z of [cz - 1.8, cz - 0.7, cz + 0.7, cz + 1.8]) { const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.8, roughness: 0.3 })); r.position.set(cx, R.y + 0.06, z); scene.add(r); }
    for (let x = x0; x < x1; x += 30) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), M.iron); pole.position.set(x, R.y + 3, R.z0 + 0.3); scene.add(pole); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, D - 0.6), M.iron); arm.position.set(x, R.y + 5.8, cz); scene.add(arm); }
    // stairs (steps as walkable boxes) from the street up to the deck
    const stair = (S, dir) => { const n = 30; const len = S.z1 - S.z0; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const z = dir > 0 ? S.z0 + t * len : S.z1 - t * len; const h = (i + 1) * (R.y / n); props.box(V(S.x1 - S.x0, h, len / n + 0.02), V((S.x0 + S.x1) / 2, h / 2, z), M.conc, { surface: 'concrete', walkable: true, uvScale: 0.6 }); } };
    stair(MUMBAI.stationE, -1); stair(MUMBAI.stationW, -1);
    for (const S of [MUMBAI.stationE, MUMBAI.stationW]) this.neon((S.x0 + S.x1) / 2, 3.2, S.z1 + 0.3, 0, 'STATION', '#80c0ff');
    for (let x = x0 + 15; x < x1; x += 30) this.anchors.push({ pos: V(x, R.y + 5.4, cz), color: 0xd0e0ff, power: 20, dist: 14 });
  }

  // the block with the outside stair; its roof overlooks the harbour yard
  vantage() {
    const R = MUMBAI.roof, M = this.M, props = this.game.props;
    this.block(R.x0, R.x1, R.z0, R.z1, { floors: 4, k: 9, face: [-1, 0], roof: true });
    // outside steel stair on the south face (zig-zag of walkable steps) up to the roof
    const n = 40; for (let i = 0; i < n; i++) { const h = (i + 1) * R.y / n; props.box(V(0.32, 0.12, 1.2), V(R.x0 + 1.2 + i * 0.3, h - 0.06, R.z1 + 0.65), M.metal, { surface: 'metal', walkable: true }); }
    props.box(V(12.4, 0.08, 1.3), V((R.x0 + R.x1) / 2, R.y + 0.02, R.z1 + 0.65), M.metal, { surface: 'metal', walkable: true, collide: false });
    this.roofStair = { from: V(R.x0 + 1.0, 0, R.z1 + 0.65), to: V(R.x0 + 1.2 + n * 0.3, R.y, R.z1 + 0.65) };
  }

  harbour() {
    const Y = MUMBAI.yard, Wh = MUMBAI.warehouse, M = this.M, scene = this.game.renderer.scene, props = this.game.props, w = this.game.world;
    // containers (stacks) around the yard
    const yard = new ContainerYard(this.game); const lines = ['garam', 'hanbada', 'mir', 'plain', 'solbit', 'taebaek'];
    const cont = (x, z, rotQ, lvl, c) => yard.add({ x, y: lvl * CONTAINER.H, z, rotY: rotQ * Math.PI / 2, len: 20, line: lines[c % lines.length] });
    let c = 0; for (const [x, z, r, n] of [[46, -74, 0, 2], [49, -74, 0, 1], [46, -40, 0, 2], [52, -34, 1, 1], [60, -32, 1, 2], [66, -42, 0, 1], [56, -56, 0, 1], [62, -78, 1, 2], [97, -40, 0, 2], [97, -32, 0, 1]]) for (let l = 0; l < n; l++) cont(x, z, r, l, c++);
    yard.build();
    // auction warehouse: walls on 3 sides + roof, the west side open (roll-up door raised)
    const H = 7.5, cx = (Wh.x0 + Wh.x1) / 2, cz = (Wh.z0 + Wh.z1) / 2, D = Wh.z1 - Wh.z0, W = Wh.x1 - Wh.x0;
    props.box(V(0.3, H, D), V(Wh.x1, H / 2, cz), M.corr, { surface: 'metal', walkable: false });
    for (const z of [Wh.z0, Wh.z1]) props.box(V(W, H, 0.3), V(cx, H / 2, z), M.corr, { surface: 'metal', walkable: false });
    for (const [z0, z1] of [[Wh.z0, -68], [-58, Wh.z1]]) props.box(V(0.3, H, z1 - z0), V(Wh.x0, H / 2, (z0 + z1) / 2), M.corr, { surface: 'metal', walkable: false });
    props.box(V(0.3, 1.6, 10), V(Wh.x0, H - 0.8, -63), M.corr, { surface: 'metal', walkable: false });   // rolled-up door housing
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.2, D + 0.6), M.rust); roof.position.set(cx, H + 0.1, cz); scene.add(roof); w.addBoxCentered(V(cx, H + 0.1, cz), V(W, 0.2, D), { surface: 'metal', walkable: false });
    // skylight strip: lets the rooftop see in from above at an angle (no glass collider)
    // the auction: table, lamps, chairs, crates of "lots"
    const A = MUMBAI.auctionTable;
    props.box(V(3.6, 0.85, 1.2), V(A.x, 0.42, A.z), M.wood, { surface: 'wood' });
    for (const dx of [-1.2, 0, 1.2]) { const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide })); lamp.position.set(A.x + dx, 4.2, A.z); scene.add(lamp); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.bulb); b.position.set(A.x + dx, 4.05, A.z); scene.add(b); }
    this.anchors.push({ pos: V(A.x, 4.0, A.z), color: 0xfff0d0, power: 60, dist: 16, keep: true });
    this.anchors.push({ pos: V(A.x - 6, 4.0, A.z), color: 0xffe0b0, power: 30, dist: 14, keep: true });
    for (const [x, z] of [[90, -70], [91.4, -70], [90, -56], [92, -57.2]]) this.game.propLib?.place('wooden_crate_02', x, z, { rotQ: 0 });
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.36), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.3 })); caseM.position.set(A.x, 0.93, A.z); scene.add(caseM); this.case = caseM;
    for (const [x, z] of [[56, -50], [60, -70], [92, -30]]) this.anchors.push({ pos: V(x, 6, z), color: 0xffb060, power: 26, dist: 18 });
    for (const [x, z] of [[56, -50], [60, -70], [92, -30]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), M.iron); p.position.set(x, 3, z); scene.add(p); const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), M.bulb); h.position.set(x, 6, z); scene.add(h); }
    // yard fence on the cross-lane side with a gate at z 10
    for (const [z0, z1] of [[-80, -30]]) props.fence?.(40, z0, 40, z1, { height: 2.4 });
  }

  ghat() {
    const G = MUMBAI.ghat, M = this.M, scene = this.game.renderer.scene, props = this.game.props;
    // wash pens: low concrete walls in a grid, water in each pen
    for (let z = G.z0 + 4; z < G.z1 - 4; z += 6) for (let x = G.x0 + 4; x < G.x1 - 6; x += 6) {
      if ((Math.round((x - G.x0) / 6) + Math.round(z / 6)) % 4 === 0) continue;   // walkways
      for (const [dx, dz, sx, sz] of [[0, -2.2, 4.6, 0.25], [0, 2.2, 4.6, 0.25], [-2.2, 0, 0.25, 4.6], [2.2, 0, 0.25, 4.6]]) props.box(V(sx, 0.8, sz), V(x + dx, 0.4, z + dz), M.conc, { surface: 'concrete', walkable: true });
      const wtr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), M.water); wtr.rotation.x = -Math.PI / 2; wtr.position.set(x, 0.35, z); scene.add(wtr);
      const stone = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.6), M.concDark); stone.position.set(x + 1.2, 0.25, z - 1.4); stone.rotation.x = -0.4; scene.add(stone);
    }
    // drying lines with hanging cloth (sight blockers)
    const cols = ['#e8e4dc', '#d8d0c0', '#c83a2a', '#2a5aa8', '#e8a020', '#3a8a5a', '#a83a8a', '#f0f0e8'];
    for (let z = G.z0 + 1; z < G.z1; z += 4.5) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, G.x1 - G.x0, 4), M.wire); wire.rotation.z = Math.PI / 2; wire.position.set((G.x0 + G.x1) / 2, 2.6, z); scene.add(wire);
      for (let x = G.x0 + 1; x < G.x1 - 1; x += 1.3) { if (rnd() < 0.35) continue; const h = 1.2 + rnd() * 0.6; const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, h, 1, 3), new THREE.MeshStandardMaterial({ map: clothTex(cols[Math.floor(rnd() * cols.length)]), side: THREE.DoubleSide, roughness: 0.95 }));
        const p = cl.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2 + x) * 0.06); cl.geometry.computeVertexNormals();
        cl.position.set(x, 2.6 - h / 2, z); cl.rotation.y = (rnd() - 0.5) * 0.2; scene.add(cl); (this.cloths ||= []).push(cl); }
      for (const x of [G.x0, G.x1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), M.wood); p.position.set(x, 1.4, z); scene.add(p); }
    }
    for (let i = 0; i < 6; i++) this.anchors.push({ pos: V(G.x0 + 6 + i * 8, 3.5, G.z0 + 8 + (i % 3) * 18), color: 0xffd8a0, power: 16, dist: 12 });
    // block south and west of the ghat
    this.block(-96, -70, 72, 92, { floors: 3, k: 40 }); this.block(-70, -20, 84, 92, { floors: 3, k: 41, face: [0, -1] }); this.block(-96, -88, 24, 72, { floors: 3, k: 42 });
  }

  godown() {
    const Gd = MUMBAI.godown, M = this.M, props = this.game.props, scene = this.game.renderer.scene, w = this.game.world;
    const H = 5.5, cx = (Gd.x0 + Gd.x1) / 2, cz = (Gd.z0 + Gd.z1) / 2, W = Gd.x1 - Gd.x0, D = Gd.z1 - Gd.z0;
    props.box(V(0.3, H, D), V(Gd.x0, H / 2, cz), M.concDark, { surface: 'concrete', walkable: false });
    for (const z of [Gd.z0, Gd.z1]) props.box(V(W, H, 0.3), V(cx, H / 2, z), M.concDark, { surface: 'concrete', walkable: false });
    for (const [z0, z1] of [[Gd.z0, 52.5], [57.5, Gd.z1]]) props.box(V(0.3, H, z1 - z0), V(Gd.x1, H / 2, (z0 + z1) / 2), M.concDark, { surface: 'concrete', walkable: false });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.2, D + 0.4), M.rust); roof.position.set(cx, H + 0.1, cz); scene.add(roof); w.addBoxCentered(V(cx, H + 0.1, cz), V(W, 0.2, D), { surface: 'metal', walkable: false });
    // jute sacks and crates inside (cover), a table with a lamp
    for (const [x, z] of [[-84, 44], [-84, 46.5], [-80, 60], [-82.5, 66], [-76, 44], [-86, 62]]) props.box(V(1.6, 1.0, 1.1), V(x, 0.5, z), pbr('fabric', { color: 0x8a7a5a, key: 'jute' }), { surface: 'wood' });
    for (const [x, z] of [[-78, 50], [-79.4, 50], [-78, 63]]) this.game.propLib?.place('wooden_crate_01', x, z, { rotQ: 0 });
    props.box(V(1.8, 0.85, 0.9), V(-81, 0.42, 55), M.wood, { surface: 'wood' });
    this.anchors.push({ pos: V(-81, 3.6, 55), color: 0xffc880, power: 26, dist: 12, keep: true, zone: 'godown' });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.bulb); b.position.set(-81, 3.8, 55); scene.add(b); this.godownBulb = b;
  }

  blockers() {
    const w = this.game.world, B = MUMBAI.bounds;
    for (const [x, z, sx, sz] of [[0, B.minZ - 1, 220, 2], [0, B.maxZ + 1, 220, 2], [B.minX - 1, 0, 2, 200], [B.maxX + 1, 0, 2, 200]]) w.addBoxCentered(V(x, 10, z), V(sx, 20, sz), { surface: 'concrete', walkable: false });
    w.addBox(V(100, -5, -96), V(102, 30, 92), { surface: 'concrete', walkable: false, cover: false }).passBullets = true;   // quay edge
  }

  // nearest lamps get real point lights (as in M05)
  lightsInit() {
    const scene = this.game.renderer.scene; this.pool = []; const n = { low: 5, medium: 7, high: 9, ultra: 11 }[settings.data.graphics.preset] ?? 7;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); this.pool.push(l); } this.poolT = 0;
  }
  updateLights(dt) {
    this.poolT -= dt; if (this.poolT > 0) return; this.poolT = 0.2;
    const cam = this.game.renderer.camera.position;
    const list = this.anchors.filter((a) => !a.off).map((a) => ({ a, d: a.pos.distanceToSquared(cam) - (a.keep ? 400 : 0) })).sort((p, q) => p.d - q.d);
    this.pool.forEach((l, i) => { const e = list[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e.a.pos); l.color.setHex(e.a.color); l.intensity = e.a.power; l.distance = e.a.dist; });
  }
  setGodownDark(on) { for (const a of this.anchors) if (a.zone === 'godown') a.off = on; if (this.godownBulb) this.godownBulb.visible = !on; this.poolT = 0; }
  update(dt, t) {
    this.sky.update(dt, this.game.renderer.camera);
    this.updateLights(dt);
    if (this.cloths) for (let i = 0; i < this.cloths.length; i += 3) this.cloths[i].rotation.y = Math.sin(t * 0.8 + i) * 0.12;
  }
}
