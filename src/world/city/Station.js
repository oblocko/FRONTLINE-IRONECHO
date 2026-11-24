// 연서중앙역 — the central station of the new district (original design, after the user's references:
// a glass train shed crossed by a concourse, a great arched portal, a lattice canopy over the plaza).
//
//   tracks        8 tracks on the E-W viaduct (deck y 9), island platforms, three trains standing
//   roof          one continuous grid shell: a long barrel along the tracks with three soft bulges, crossed by
//                 the taller concourse vault, which runs out over the plaza as a canopy
//   concourse     a 100 m wide, ~34 m high glass front with a huge steel arch; through the glass the open hall:
//                 two mezzanine bridges, escalators, columns, shops, the departure board
//   twin towers   two glass office towers rising either side of the concourse
//   plaza         sunken plaza (to the metro) with glass entrances, water + trees, a bus terminal under a wave
//                 canopy (sawtooth bays), a taxi rank, bike racks; a footbridge to the landmark
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { flatMat, groundMat, wallMat } from './CityMaterials.js';
import { modernTower, shell, cap, outline, curtainMat } from './Modern.js';
import { channelSign, boxSign } from '../korea/Signs.js';
import { placeCar, CURB } from './Streets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const meshOf = (pos, idx, uv) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
// a height-field surface over a rect: f(u, v) -> y, u along x, v along z; uv tiles for the lattice texture
function surface(x0, x1, z0, z1, nu, nv, f, tu = 1, tv = 1) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = i / nu, v = j / nv; pos.push(x0 + u * (x1 - x0), f(u, v), z0 + v * (z1 - z0)); uv.push(u * tu, v * tv); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return meshOf(pos, idx, uv);
}
let _lat = null;
function latticeMat(color = '#d8dcde', cell = 32) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = 5;
  for (let i = -256; i < 512; i += cell) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
  g.lineWidth = 7; for (let i = 0; i <= 256; i += cell * 2) { g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35, color: 0xffffff });
}
const glassRoof = () => new THREE.MeshStandardMaterial({ color: 0xa8c0cc, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 });

// streamlined high-speed train (original shape): nose + 8 cars, white with a blue band and window strip
function train(scene, x0, z, cars = 8, dir = 1) {
  const g = new THREE.Group(); const body = flatMat(0xeef0f2, { roughness: 0.35, metalness: 0.3, key: 'trainbody' }), band = flatMat(0x1d4f9a, { roughness: 0.4, key: 'trainband' }), win = flatMat(0x16202a, { roughness: 0.1, metalness: 0.5, key: 'trainwin' }), under = flatMat(0x2a2c2e, { key: 'trainunder' });
  const L = 25, W = 3.0, H = 3.6;
  for (let i = 0; i < cars; i++) {
    const cx = i * (L + 0.6);
    const nose = i === 0 || i === cars - 1;
    if (!nose) { const b = new THREE.Mesh(new THREE.BoxGeometry(L, H - 0.8, W), body); b.position.set(cx, 0.8 + (H - 0.8) / 2, 0); g.add(b); }
    else { // nose car: side profile with a long sloping nose
      const s = new THREE.Shape(); const f = i === 0 ? -1 : 1, hl = L / 2;
      const P = f < 0 ? [[-hl, 0.8], [hl, 0.8], [hl, H], [-hl + 9, H], [-hl + 2, 1.9], [-hl, 1.1]] : [[-hl, 0.8], [hl, 0.8], [hl, 1.1], [hl - 2, 1.9], [hl - 9, H], [-hl, H]];
      P.forEach(([a, b], k) => (k ? s.lineTo(a, b) : s.moveTo(a, b)));
      const eg = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3 }); eg.translate(cx, 0, -W / 2); g.add(new THREE.Mesh(eg, body));
    }
    for (const sz of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(L - (nose ? 9 : 1), 0.35, 0.02), band); st.position.set(cx + (nose ? (i === 0 ? 4 : -4) : 0), 1.45, sz * (W / 2 + (nose ? 0.27 : 0.01))); g.add(st);
      const w = new THREE.Mesh(new THREE.BoxGeometry(L - (nose ? 10 : 2), 0.75, 0.02), win); w.position.set(cx + (nose ? (i === 0 ? 4.5 : -4.5) : 0), 2.45, sz * (W / 2 + (nose ? 0.27 : 0.01))); g.add(w); }
    const u = new THREE.Mesh(new THREE.BoxGeometry(L - 2, 0.7, W - 0.4), under); u.position.set(cx, 0.45, 0); g.add(u);
  }
  g.position.set(x0, 0, z); g.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(g); return g;
}

export function buildCentralStation(ctx, { block, rail }) {
  const { plan, batch, scene, world } = ctx, R = rail;
  const steel = flatMat(0xd6dade, { roughness: 0.35, metalness: 0.75, key: 'stnsteel' }), dark = flatMat(0x2a2e32, { roughness: 0.5, metalness: 0.5, key: 'stndark' });
  const floorM = groundMat('plaza', { color: 0xd8d4cc }), stone = wallMat('stone', 0xc8c4bc);
  // ---------------------------------------------------------------- layout
  const conc = { x0: block.cx - 50, x1: block.cx + 50, z0: Math.max(block.z0, R.z0 - 20), z1: R.z1 + 14 };          // concourse (crosses the tracks)
  const front = conc.z1;                                                                          // glass front on the plaza
  const shed = { x0: block.x0 + 6, x1: block.x1 + 116, z0: R.z0 - 3, z1: R.z1 + 3 };            // train shed over the viaduct (crosses the boulevard)
  const plazaR = new Rect(block.x0, front, block.x1, block.z1 - 4);

  // ---------------------------------------------------------------- platforms + trains on the viaduct
  const pw = 6; const nTr = 8, tz = (k) => R.z0 + 2.5 + k * ((R.z1 - R.z0 - 5) / (nTr - 1));
  for (let k = 0; k < 4; k++) { const z = (tz(2 * k) + tz(2 * k + 1)) / 2; batch.box(flatMat(0xb8b4ac, { key: 'platform' }), shed.x1 - shed.x0, 1.1, pw - 2, (shed.x0 + shed.x1) / 2, R.y + 0.55, z);
    batch.box(flatMat(0xd8b020, { key: 'platedge' }), shed.x1 - shed.x0, 0.02, 0.4, (shed.x0 + shed.x1) / 2, R.y + 1.11, z - (pw - 2) / 2 + 0.3, 0, { cast: false });
    batch.box(flatMat(0xd8b020, { key: 'platedge' }), shed.x1 - shed.x0, 0.02, 0.4, (shed.x0 + shed.x1) / 2, R.y + 1.11, z + (pw - 2) / 2 - 0.3, 0, { cast: false }); }
  // re-lay the tracks to match the 8 lines
  const rail2 = flatMat(0x6a6460, { roughness: 0.5, metalness: 0.7, key: 'rail' });
  for (let k = 0; k < nTr; k++) { const z = tz(k) + (k % 2 ? 1.4 : -1.4); for (const s of [-0.72, 0.72]) batch.box(rail2, shed.x1 - shed.x0 + 300, 0.16, 0.08, (shed.x0 + shed.x1) / 2, R.y + 0.1, z + s, 0, { cast: false }); }
  for (const [k, x, d] of [[0, shed.x0 + 40, 1], [3, shed.x0 + 90, -1], [6, shed.x0 + 30, 1]]) train(scene, x, tz(k) + (k % 2 ? 1.4 : -1.4), 8, d).position.y = R.y + 0.15;

  // ---------------------------------------------------------------- the roof: train shed barrel with three bulges + concourse vault
  const lat = latticeMat(), glass = glassRoof();
  const spring = R.y + 8, shedRise = 13;
  const shedY = (u, v) => spring + Math.sin(v * Math.PI) * (shedRise + 4 * Math.pow(Math.sin(u * Math.PI * 3), 2));
  for (const m of [glass, lat]) { const gm = surface(shed.x0, shed.x1, shed.z0, shed.z1, 90, 16, (u, v) => shedY(u, v) + (m === lat ? 0.25 : 0), (shed.x1 - shed.x0) / 12, (shed.z1 - shed.z0) / 12); scene.add(new THREE.Mesh(gm, m)); }
  // the concourse vault: taller, along z, from behind the tracks out over the front as a canopy
  const cvTop = 40, cvSpring = 26, cz0 = conc.z0 - 6, cz1 = front + 16;
  const cvY = (u, v) => cvSpring + Math.sin(u * Math.PI) * (cvTop - cvSpring) - Math.max(0, (v - 0.78) / 0.22) * 6;
  for (const m of [glass, lat]) { const gm = surface(conc.x0 - 6, conc.x1 + 6, cz0, cz1, 24, 40, (u, v) => cvY(u, v) + (m === lat ? 0.25 : 0), (conc.x1 - conc.x0 + 12) / 10, (cz1 - cz0) / 10); scene.add(new THREE.Mesh(gm, m)); }
  // main ribs: arches across the shed every 24 m, across the concourse every 12 m (steel boxes along the curve)
  const rib = (pts, s = 0.9) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const d = b.clone().sub(a), L = d.length(); const g = new THREE.BoxGeometry(s, s, L); g.lookAt(d); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); batch.add(g, steel); } };
  for (let x = shed.x0; x <= shed.x1 + 0.1; x += 24) { const u = (x - shed.x0) / (shed.x1 - shed.x0), pts = []; for (let j = 0; j <= 12; j++) { const v = j / 12; pts.push(V(x, shedY(u, v), shed.z0 + v * (shed.z1 - shed.z0))); } rib(pts);
    for (const z of [shed.z0, shed.z1]) batch.box(steel, 1, spring - R.y, 1, x, (spring + R.y) / 2, z); }
  for (let z = cz0; z <= cz1 + 0.1; z += 12) { const v = (z - cz0) / (cz1 - cz0), pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(V(conc.x0 - 6 + u * (conc.x1 - conc.x0 + 12), cvY(u, v), z)); } rib(pts, 1.1); }
  // tree columns holding the canopy over the plaza
  for (const x of [conc.x0 + 6, conc.x1 - 6]) { const top = cvY(x === conc.x0 + 6 ? 0.06 : 0.94, 1); batch.box(steel, 1.4, top - CURB, 1.4, x, (top + CURB) / 2, cz1 - 2); }

  // ---------------------------------------------------------------- concourse front: glass wall with the arch, open hall inside
  const fw = conc.x1 - conc.x0, fh = cvSpring + 6;
  { // glass front (shape with an arched head following the vault), transparent so the hall reads through
    const s = new THREE.Shape(); s.moveTo(-fw / 2, 0); s.lineTo(fw / 2, 0); for (let i = 0; i <= 24; i++) { const u = 1 - i / 24; s.lineTo(-fw / 2 + u * fw, cvY(u, 0.78) - CURB); }
    const g = new THREE.ShapeGeometry(s); g.translate(conc.x0 + fw / 2, CURB, front); scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9ab4c2, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
    for (let x = conc.x0; x <= conc.x1 + 0.1; x += 5) { const u = (x - conc.x0) / fw; batch.box(steel, 0.25, cvY(u, 0.78) - CURB, 0.5, x, (cvY(u, 0.78) + CURB) / 2, front); }   // mullion fins
    for (let y = CURB + 6; y < fh; y += 6) batch.box(steel, fw, 0.2, 0.4, conc.x0 + fw / 2, y, front);
    // the great arch: a steel box section in front of the glass
    const ar = fw * 0.42, ah = cvTop - 4, pts = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); pts.push(V(conc.x0 + fw / 2 + Math.cos(a) * ar, CURB + Math.sin(a) * ah, front + 1.6)); } rib(pts, 2.4);
    // entrance doors under the arch
    batch.box(dark, 30, 0.6, 1, conc.x0 + fw / 2, CURB + 6.2, front + 0.6);
    for (let x = -12; x <= 12; x += 4) batch.box(steel, 0.15, 6, 0.3, conc.x0 + fw / 2 + x, CURB + 3, front + 0.4);
  }
  // inside the hall: floor, two mezzanine bridges (glass balustrades), escalators, columns, shops, departure board
  batch.box(floorM, fw, 0.1, front - conc.z0, conc.x0 + fw / 2, CURB + 0.05, (conc.z0 + front) / 2, 0, { cast: false });
  for (const [y, z0, z1] of [[CURB + 9, front - 30, front - 18], [CURB + 17, conc.z0 + 6, front - 34]]) {
    batch.box(flatMat(0xe8e6e0, { key: 'mezz' }), fw - 8, 0.8, z1 - z0, conc.x0 + fw / 2, y, (z0 + z1) / 2);
    batch.box(flatMat(0x9ab4c2, { roughness: 0.1, key: 'balus' }), fw - 8, 1.1, 0.06, conc.x0 + fw / 2, y + 0.95, z1);
  }
  for (const x of [conc.x0 + 22, conc.x1 - 22]) { const g = new THREE.BoxGeometry(2.4, 0.6, 14); g.rotateX(-Math.atan2(9, 14)); g.translate(x, CURB + 4.6, front - 9); batch.add(g, steel); }
  for (let x = conc.x0 + 12; x < conc.x1 - 6; x += 20) for (const z of [front - 14, front - 40]) batch.box(stone, 1.4, cvSpring, 1.4, x, CURB + cvSpring / 2, z);
  for (let x = conc.x0 + 6; x < conc.x1 - 10; x += 14) { batch.box(flatMat([0xd8a040, 0x3a7ab0, 0xb04a3a, 0x4a8a5a][Math.floor(x) % 4], { key: 'shopbox' + (Math.floor(x) % 4) }), 10, 4, 6, x + 5, CURB + 2, conc.z0 + 8); }
  { const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#0a0e14'; g.fillRect(0, 0, 1024, 200);
      g.font = 'bold 28px "WenQuanYi Zen Hei", sans-serif'; g.fillStyle = '#ffcc33'; ['07:40  KTX 101  부산      3번', '07:52  KTX 213  목포      5번', '08:05  ITX 1104 춘천      7번', '08:10  KTX 105  부산      2번'].forEach((t, i) => g.fillText(t, 30, 44 + i * 44)); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), toneMapped: false }));
    board.position.set(conc.x0 + fw / 2, CURB + 13.5, front - 31); scene.add(board); }
  // sides + back of the concourse (glass), colliders: the hall is not entered, its front is solid
  const sideGlass = curtainMat({ glass: 0x6a8494, spandrel: 0xb8c0c4, mullion: 0xe0e4e6, bays: 6, floorH: 6, spandrelH: 0.25, key: 'conc' });
  for (const x of [conc.x0, conc.x1]) batch.box(sideGlass, 0.3, cvSpring, front - conc.z0, x, CURB + cvSpring / 2, (conc.z0 + front) / 2);
  plan.add({ kind: 'building', id: 'central-station', use: 'civic', zone: 'public', rect: new Rect(conc.x0, conc.z0, conc.x1, front), y0: CURB, h: cvTop, tags: ['support'], entrances: [{ x: conc.x0 + fw / 2, z: front, nx: 0, nz: 1 }],
    colliders: [world.addBox(V(conc.x0, CURB, conc.z0), V(conc.x1, CURB + cvSpring, front), { surface: 'concrete', cover: true, walkable: false })] });
  // name on the arch
  const sn = channelSign('연서중앙역', '#f4f6f8', 4.2, { raceway: null }); sn.position.set(conc.x0 + fw / 2, CURB + cvTop - 9, front + 2.2); scene.add(sn);
  const se = channelSign('YEONSEO CENTRAL', '#f4f6f8', 1.8, { raceway: null }); se.position.set(conc.x0 + fw / 2, CURB + cvTop - 13.2, front + 2.2); scene.add(se);

  // ---------------------------------------------------------------- twin towers either side of the concourse
  const tw = conc.x0 - block.x0 - 10;
  for (const [cx, key] of [[block.x0 + 4 + tw / 2, 'tw1'], [conc.x1 + 6 + tw / 2, 'tw2']]) {
    if (cx + tw / 2 > block.x1 - 2) continue;
    modernTower(ctx, { x: cx, z: front + 1, y0: CURB, sections: [{ kind: 'chamfer', w: tw, d: 26, c: 5, h: 72, floorH: 4, rims: 2 }, { kind: 'chamfer', w: tw * 0.8, d: 21, c: 4, h: 20, floorH: 4, rims: 2 }], crown: 'fin', zone: 'business', use: 'office', front: [0, 1], palette: { glass: 0x56707e, spandrel: 0x8a96a0, mullion: 0xd0d6da, key } });
  }

  // ---------------------------------------------------------------- the plaza: paving, sunken plaza to the metro, water + trees,
  // bus terminal (sawtooth bays under a wave canopy), taxi rank, bike racks
  plan.walk(plazaR, 'plaza');
  batch.add(cap(outline('rect', plazaR.w, plazaR.d), CURB + 0.015, { cx: plazaR.cx, cz: plazaR.cz }), groundMat('plaza', { color: 0xd4d0c8 }), { cast: false });
  // sunken plaza: stepped pit with glass entrance pavilions (railing collider round it)
  const pit = new Rect(conc.x0 + 30, front + 6, conc.x1 - 30, front + 22);
  for (let k = 0; k < 6; k++) batch.box(stone, pit.w - k * 3, 0.5, pit.d - k * 1.6, pit.cx, CURB - 0.25 - k * 0.5, pit.cz + k * 0.8, 0, { cast: false });
  batch.box(flatMat(0x16202a, { key: 'pitfloor' }), pit.w - 18, 0.05, pit.d - 9, pit.cx, CURB - 3.0, pit.cz + 4, 0, { cast: false });
  world.addBox(V(pit.x0, CURB, pit.z0), V(pit.x1, CURB + 1.1, pit.z1), { surface: 'metal', walkable: false, cover: false });
  plan.add({ kind: 'structure', id: 'sunken-plaza', rect: pit, y0: CURB, h: 1.1 });
  for (const x of [pit.x0 - 6, pit.x1 + 6]) { const pv = new Rect(x - 4, pit.z0 + 2, x + 4, pit.z0 + 10); batch.add(shell([{ y: CURB, pts: outline('rect', 8, 8) }, { y: CURB + 3.2, pts: outline('rect', 8, 8) }], { cx: pv.cx, cz: pv.cz, uM: 6, vM: 3.2 }), sideGlass); batch.add(cap(outline('rect', 9, 9), CURB + 3.2, { cx: pv.cx, cz: pv.cz }), steel);
    plan.add({ kind: 'structure', id: `metro-pav${x | 0}`, rect: pv, y0: CURB, h: 3.2, colliders: [world.addBox(V(pv.x0, CURB, pv.z0), V(pv.x1, CURB + 3.2, pv.z1), { surface: 'metal' })] }); }
  // water strip + trees
  batch.box(flatMat(0x3a5a64, { roughness: 0.05, metalness: 0.3, key: 'pool' }), 34, 0.05, 4, conc.x0 + fw / 2, CURB + 0.05, plazaR.z1 - 6, 0, { cast: false });
  ctx.trees([...Array(10)].map((_, i) => [plazaR.x0 + 8 + i * 6, plazaR.z1 - 4]).concat([...Array(6)].map((_, i) => [conc.x1 + 8 + i * 6, plazaR.z1 - 4])));
  // bus terminal (west part of the plaza): sawtooth bays, shelters, a wave lattice canopy on columns, buses
  const bt = new Rect(plazaR.x0 + 2, front + 4, conc.x0 - 4, plazaR.z1 - 10);
  if (bt.w > 30) {
    plan.park(bt); batch.add(cap(outline('rect', bt.w, bt.d), CURB + 0.02, { cx: bt.cx, cz: bt.cz }), groundMat('asphalt'), { cast: false });
    for (let i = 0; i < 4; i++) { const x = bt.x0 + 6 + i * (bt.w - 12) / 3; batch.box(flatMat(0x3a4046, { key: 'busshelter' }), 7, 2.8, 0.2, x, CURB + 1.4, bt.z0 + 1); batch.box(steel, 7.4, 0.15, 2.4, x, CURB + 2.9, bt.z0 + 1.8);
      const b = ctx.kit?.bus?.({ x: x + 1, z: bt.z0 + 9, rotY: Math.PI / 2 + 0.35, color: [0x2a6ab0, 0x2a8a4a, 0xc84030, 0x2a6ab0][i] }); if (b) b.userData.dynamic = false; }
    const lat2 = latticeMat('#3a4046', 22);
    const wg = surface(bt.x0, bt.x1, bt.z0, bt.z0 + 14, 30, 6, (u, v) => CURB + 7 + Math.sin(u * Math.PI * 3) * 1.6 + Math.sin(v * Math.PI) * 0.8, bt.w / 8, 2); scene.add(new THREE.Mesh(wg, lat2));
    for (let x = bt.x0 + 4; x < bt.x1; x += 12) batch.box(steel, 0.4, 7, 0.4, x, CURB + 3.5, bt.z0 + 12);
  }
  // taxi rank along the east part
  const tr = new Rect(conc.x1 + 4, plazaR.z1 - 14, block.x1 - 4, plazaR.z1 - 9); if (tr.w > 12) { plan.park(tr); for (let x = tr.x0 + 3; x < tr.x1 - 3; x += 5.4) placeCar(ctx, 'taxi', x, tr.cz, Math.PI / 2, { state: 'clean' }); }
  for (let i = 0; i < 8; i++) batch.box(dark, 0.06, 0.8, 1.6, conc.x1 + 10 + i * 1.2, CURB + 0.4, front + 6);

  // ---------------------------------------------------------------- footbridge from the plaza to the landmark forecourt (y 7)
  const fb = flatMat(0xe0dcd4, { key: 'footbridge' });
  return { conc, front, shed, plaza: plazaR, footbridgeMat: fb };
}

// the footbridge: from (x0, z0) east to x1, then south to z1 (deck y 7, glass parapets, two stair towers)
export function footbridge(ctx, { x0, z0, x1, z1 }) {
  const { batch, world, plan } = ctx, y = 7.2, w = 5;
  const m = flatMat(0xe0dcd4, { roughness: 0.6, key: 'fbdeck' }), gl = flatMat(0x9ab4c2, { roughness: 0.08, metalness: 0.3, key: 'fbglass' });
  batch.box(m, x1 - x0, 0.8, w, (x0 + x1) / 2, y, z0); batch.box(m, w, 0.8, Math.abs(z1 - z0), x1, y, (z0 + z1) / 2);
  for (const s of [-1, 1]) { batch.box(gl, x1 - x0, 1.1, 0.06, (x0 + x1) / 2, y + 0.95, z0 + s * w / 2); batch.box(gl, 0.06, 1.1, Math.abs(z1 - z0), x1 + s * w / 2, y + 0.95, (z0 + z1) / 2); }
  for (const [px, pz] of [[x0 + 20, z0], [(x0 + x1) / 2, z0], [x1, (z0 + z1) / 2]]) { batch.box(m, 1.2, y - CURB, 1.2, px, (y + CURB) / 2, pz); }
  plan.add({ kind: 'structure', id: 'footbridge', rect: new Rect(x0, z0 - w / 2, x1 + w / 2, z1), y0: y - 0.4, h: 2, tags: ['elevated', 'onRoad'] });
}

// ---------------------------------------------------------------- the station quarter (역세권) around the building:
// plaza furniture, a north entrance with a drop-off lane, shop arcades under the viaduct, and the mixed-use
// development across the boulevard (department store podium + hotel tower) that the footbridge lands on
export function stationQuarter(ctx, { st, block, rail, east, streetsZ }) {
  const { plan, batch, scene, world } = ctx, R = rail, { conc, front } = st;
  const steel = flatMat(0xd6dade, { roughness: 0.35, metalness: 0.75, key: 'stnsteel' }), dark = flatMat(0x2a2e32, { roughness: 0.5, metalness: 0.5, key: 'stndark' });
  const wood = flatMat(0x8a6a48, { roughness: 0.8, key: 'bench' }), planter = wallMat('stone', 0xb8b4ac);
  const prop = (id, rect, h, add) => { if (!plan.free(rect, { roads: true })) return null; add(); return plan.add({ kind: 'prop', id, rect, y0: CURB, h, colliders: [world.addBox(V(rect.x0, CURB, rect.z0), V(rect.x1, CURB + h, rect.z1), { surface: 'concrete', walkable: false, cover: h > 1 })] }); };
  const plaza = st.plaza;

  // --- plaza furniture: a sculpture on the axis, planters with trees + benches, kiosks, a media pylon, bollards
  const ax = conc.x0 + (conc.x1 - conc.x0) / 2;
  prop('sculpture', Rect.c(ax, plaza.z1 - 12, 3, 3), 9, () => { batch.box(planter, 4, 0.6, 4, ax, CURB + 0.3, plaza.z1 - 12); const g = new THREE.TorusKnotGeometry(1.6, 0.35, 64, 8); g.scale(1, 1.6, 1); g.translate(ax, CURB + 4.6, plaza.z1 - 12); batch.add(g, steel); });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const x = ax + s * (24 + k * 14), z = plaza.z1 - 14;
    prop(`planter${s}${k}`, Rect.c(x, z, 5, 3), 0.6, () => { batch.box(planter, 5, 0.6, 3, x, CURB + 0.3, z); batch.box(groundMat('lawn'), 4.6, 0.02, 2.6, x, CURB + 0.61, z, 0, { cast: false }); });
    ctx.treeBatch.add(x, z, { kind: k === 1 ? 'pine' : 'leaf' });
    prop(`bench${s}${k}`, Rect.c(x, z + 2.4, 3, 0.6), 0.5, () => { batch.box(wood, 3, 0.08, 0.55, x, CURB + 0.45, z + 2.4); batch.box(dark, 0.08, 0.45, 0.5, x - 1.3, CURB + 0.22, z + 2.4); batch.box(dark, 0.08, 0.45, 0.5, x + 1.3, CURB + 0.22, z + 2.4); });
  }
  const kioskCols = [0xc8402a, 0x2a6ab0, 0x3a8a4a, 0xd8a020];
  for (let k = 0; k < 4; k++) { const x = ax + (k < 2 ? -1 : 1) * (12 + (k % 2) * 7), z = front + 30;
    prop(`kiosk${k}`, Rect.c(x, z, 3, 2.4), 2.6, () => { batch.box(flatMat(0xe8e6e0, { key: 'kiosk' }), 3, 2.3, 2.4, x, CURB + 1.15, z); batch.box(flatMat(kioskCols[k], { key: 'kioskroof' + k }), 3.6, 0.2, 3.0, x, CURB + 2.5, z); batch.box(dark, 2.2, 0.9, 0.05, x, CURB + 1.4, z + 1.22); }); }
  { const x = conc.x1 + 10, z = front + 26; prop('media-pylon', Rect.c(x, z, 2, 1), 12, () => { batch.box(dark, 1.4, 12, 0.8, x, CURB + 6, z);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.6), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 440; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 440); gr.addColorStop(0, '#1d3f8a'); gr.addColorStop(1, '#0a1a3a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 440); g.fillStyle = '#fff'; g.font = 'bold 34px "WenQuanYi Zen Hei", sans-serif'; g.textAlign = 'center'; g.fillText('연서중앙역', 128, 120); g.font = '22px sans-serif'; g.fillText('YEONSEO CENTRAL', 128, 160); g.fillStyle = '#ffcc33'; g.font = 'bold 26px "WenQuanYi Zen Hei", sans-serif'; g.fillText('KTX · ITX · 지하철 3·7호선', 128, 260); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), toneMapped: false }));
      scr.position.set(x, CURB + 7.6, z + 0.42); scene.add(scr); }); }
  for (let x = plaza.x0 + 4; x < plaza.x1 - 4; x += 2.4) if (Math.abs(x - ax) > 20) batch.box(steel, 0.25, 0.9, 0.25, x, CURB + 0.45, plaza.z1 - 1.2);   // bollards on the curb

  // --- north entrance: canopy, glass doors, a drop-off lane along the north street, bike racks
  const nz = conc.z0, nw = 40;
  batch.add(new THREE.BoxGeometry(nw, 0.6, 10).translate(ax, CURB + 7, nz - 5), steel);
  for (const s of [-1, 1]) batch.box(steel, 0.6, 7, 0.6, ax + s * (nw / 2 - 1), CURB + 3.5, nz - 9.5);
  batch.box(flatMat(0x7e98a8, { roughness: 0.06, metalness: 0.4, key: 'ndoor' }), nw - 8, 5.5, 0.2, ax, CURB + 2.75, nz - 0.1);
  const nn = channelSign('연서중앙역 북측 출입구', '#1d3f8a', 1.1, { raceway: null }); nn.position.set(ax, CURB + 6, nz - 0.25); nn.rotation.y = Math.PI; scene.add(nn);
  plan.walk(new Rect(block.x0, block.z0, block.x1, nz), 'plaza');
  batch.add(cap(outline('rect', block.x1 - block.x0, nz - block.z0), CURB + 0.015, { cx: (block.x0 + block.x1) / 2, cz: (block.z0 + nz) / 2 }), groundMat('plaza', { color: 0xc8c4bc }), { cast: false });
  { const lane = new Rect(ax - 40, block.z0 + 0.5, ax + 40, block.z0 + 6); plan.park(lane); batch.add(cap(outline('rect', lane.w, lane.d), CURB + 0.02, { cx: lane.cx, cz: lane.cz }), groundMat('asphalt'), { cast: false });
    for (let i = 0; i < 4; i++) placeCar(ctx, i % 2 ? 'taxi' : 'sedan', lane.x0 + 8 + i * 14, lane.cz, -Math.PI / 2, { state: 'clean' }); }
  for (let i = 0; i < 10; i++) batch.box(dark, 0.06, 0.8, 1.6, ax + 24 + i * 1.2, CURB + 0.4, nz - 12);

  // --- shop arcades under the viaduct (deck underside y ~7.4): rows of small units with glass fronts, both sides
  const arcade = curtainMat({ glass: 0x3e4c54, spandrel: 0x2e3236, mullion: 0x8a9094, floorH: 5, spandrelH: 1.2, bays: 3, key: 'arcade' });
  for (const [x0, x1] of [[block.x0, conc.x0 - 40], [conc.x1 + 40, block.x1], ...east.map((r) => [r.x0, r.x1])]) {
    if (x1 - x0 < 14) continue;
    const pc = (R.z0 + R.z1) / 2;   // the viaduct piers stand on the centre line: one arcade strip either side of them
    for (const r of [new Rect(x0 + 2, R.z0 + 4, x1 - 2, pc - 4), new Rect(x0 + 2, pc + 4, x1 - 2, R.z1 - 4)]) {
    if (plan.items.some((o) => (o.kind === 'building' || o.kind === 'structure' || o.kind === 'car') && !o.tags.includes('elevated') && o.rect?.hits(r))) continue;   // under the deck is fine
    batch.add(shell([{ y: CURB, pts: outline('rect', r.w, r.d) }, { y: CURB + 5, pts: outline('rect', r.w, r.d) }], { cx: r.cx, cz: r.cz, uM: 6, vM: 5 }), arcade);
    batch.add(cap(outline('rect', r.w, r.d), CURB + 5, { cx: r.cx, cz: r.cz }), flatMat(0x6e7270, { key: 'arcroof' }));
    for (let x = r.x0 + 6; x < r.x1 - 4; x += 9) for (const zz of [r.z0, r.z1]) { const s2 = boxSignFor(x, zz, zz === r.z1 ? 0 : Math.PI); scene.add(s2); }
    plan.add({ kind: 'building', id: `arcade${x0 | 0}${r.z0 | 0}`, use: 'shops', zone: 'commercial', rect: r, y0: CURB, h: 5, tags: ['support'], colliders: [world.addBox(V(r.x0, CURB, r.z0), V(r.x1, CURB + 5, r.z1), { surface: 'concrete', cover: true, walkable: false })], entrances: [] });
    }
  }
  function boxSignFor(x, z, rot) { const names = [['김밥나라', '#ffffff', '#d8261c'], ['역전우동', '#1d3f8a', '#ffffff'], ['편의점', '#1f6e4c', '#ffffff'], ['커피', '#2b2420', '#e8d7b8'], ['약국', '#1f8a4c', '#ffffff'], ['휴대폰', '#e2231a', '#ffffff']];
    const [n, bg, fg] = names[Math.abs(Math.floor(x * 7 + z)) % names.length]; const s2 = boxSign(n, '', [bg, fg, fg], 6, 0.8); s2.position.set(x, CURB + 4.3, z); s2.rotation.y = rot; return s2; }
}
