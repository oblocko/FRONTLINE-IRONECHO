// ISO shipping containers (20 ft / 40 ft), modelled rather than textured boxes:
//  - trapezoidal corrugated side walls, vertically corrugated front end, a roof with shallow pressings
//  - double doors with four locking bars, cam keepers and handles, corner posts, top / bottom rails and
//    corner castings with their twist-lock holes
//  - liveries of fictional Korean shipping lines (Korean name, English name, owner code + serial + size
//    type on the doors), painted onto the corrugation, with weathering (dirt streaks, rust at the seams)
// Everything is instanced: one draw call per (length, line) body plus one for all frames and hardware.
// Usage: const yard = new ContainerYard(game); yard.add({ x, y, z, rotY, len: 40, line: 'hanbada' }); …; yard.build();
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FT40 = 12.192, FT20 = 6.058, W = 2.438, H = 2.591;

// fictional lines (no real company names or marks)
export const LINES = {
  hanbada: { ko: '한바다해운', en: 'HANBADA LINE', code: 'HBDU', color: '#1f4f8f', ink: '#f2f2ee', mark: 'wave' },
  garam:   { ko: '가람해운',   en: 'GARAM SHIPPING', code: 'GRMU', color: '#c4671f', ink: '#ffffff', mark: 'ring' },
  mir:     { ko: '미르마린',   en: 'MIR MARINE', code: 'MIRU', color: '#9a2a24', ink: '#f5f0e8', mark: 'diamond' },
  solbit:  { ko: '솔빛물류',   en: 'SOLBIT LOGISTICS', code: 'SBTU', color: '#2f6a46', ink: '#f4f4ec', mark: 'sun' },
  taebaek: { ko: '태백리스',   en: 'TAEBAEK LEASING', code: 'TBLU', color: '#7c8186', ink: '#1d2328', mark: 'bar' },
  plain:   { ko: '',          en: '', code: 'KRXU', color: '#5a3a30', ink: '#e8e0d0', mark: null },
};

const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// ---------- textures (canvas) ----------
function grime(x, w, h, { streaks = 60, rust = 40, seed = 0 } = {}) {
  for (let i = 0; i < streaks; i++) {   // rain streaks running down from the top rail
    const sx = rnd() * w, len = h * (0.15 + rnd() * 0.6), a = 0.03 + rnd() * 0.07;
    const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(40,32,24,${a})`); g.addColorStop(1, 'rgba(40,32,24,0)');
    x.fillStyle = g; x.fillRect(sx, 0, 2 + rnd() * 6, len);
  }
  for (let i = 0; i < rust; i++) {      // rust spots, more at the bottom
    const rx = rnd() * w, ry = h * (rnd() < 0.6 ? 0.85 + rnd() * 0.15 : rnd()), r = 2 + rnd() * 10;
    const g = x.createRadialGradient(rx, ry, 0, rx, ry, r); g.addColorStop(0, `rgba(110,52,24,${0.25 + rnd() * 0.35})`); g.addColorStop(1, 'rgba(110,52,24,0)');
    x.fillStyle = g; x.beginPath(); x.arc(rx, ry, r, 0, Math.PI * 2); x.fill();
  }
  const g = x.createLinearGradient(0, h * 0.75, 0, h); g.addColorStop(0, 'rgba(50,40,30,0)'); g.addColorStop(1, 'rgba(50,40,30,0.28)'); x.fillStyle = g; x.fillRect(0, h * 0.75, w, h * 0.25);
}
function mark(x, kind, cx, cy, r, ink) {
  x.save(); x.strokeStyle = x.fillStyle = ink; x.lineWidth = r * 0.22;
  if (kind === 'wave') { for (let k = 0; k < 3; k++) { x.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24; const px = cx - r + t * 2 * r, py = cy - r * 0.5 + k * r * 0.5 + Math.sin(t * Math.PI * 2) * r * 0.16; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); } }
  else if (kind === 'ring') { x.beginPath(); x.arc(cx, cy, r * 0.8, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(cx, cy, r * 0.28, 0, Math.PI * 2); x.fill(); }
  else if (kind === 'diamond') { x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.8, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r * 0.8, cy); x.closePath(); x.stroke(); }
  else if (kind === 'sun') { x.beginPath(); x.arc(cx, cy, r * 0.45, 0, Math.PI * 2); x.fill(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke(); } }
  else if (kind === 'bar') { x.fillRect(cx - r, cy - r * 0.5, r * 2, r * 0.32); x.fillRect(cx - r, cy + r * 0.18, r * 2, r * 0.32); }
  x.restore();
}
const FONT_KO = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Nanum Gothic",sans-serif';
// side livery: u along the length (0 = door end), v up
function sideTexture(L, len) {
  const w = len === 40 ? 2048 : 1024, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = L.color; x.fillRect(0, 0, w, h);
  if (L.ko) {
    const big = len === 40;
    x.fillStyle = L.ink; x.textBaseline = 'middle';
    x.font = `900 ${big ? 104 : 78}px ${FONT_KO}`; const kw = x.measureText(L.ko).width;
    const total = kw + (big ? 150 : 100), x0 = w * 0.5 - total / 2 + (big ? 0 : 20);
    mark(x, L.mark, x0 + (big ? 55 : 38), h * 0.44, big ? 52 : 38, L.ink);
    x.fillText(L.ko, x0 + (big ? 130 : 90), h * 0.42);
    x.font = `700 ${big ? 34 : 26}px Arial, sans-serif`; x.fillText(L.en, x0 + (big ? 134 : 92), h * 0.74);
  }
  // owner code at the top right corner of the side (near the door end, as on real boxes)
  x.fillStyle = L.ink; x.font = '700 18px Arial, sans-serif'; x.fillText(`${L.code} ${L.serial}`, 24, 26);
  grime(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// door end: two leaves, owner code / serial / check digit / size-type at the top right, data plate
function doorTexture(L, len) {
  const w = 512, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = L.color; x.fillRect(0, 0, w, h);
  x.fillStyle = L.ink; x.font = '700 30px Arial, sans-serif'; x.textBaseline = 'top';
  x.font = '700 24px Arial, sans-serif'; x.fillText(`${L.code} ${L.serial.slice(0, 6)}`, 272, 24); x.strokeStyle = L.ink; x.lineWidth = 2; x.fillText(L.serial.slice(6), 476, 24); x.strokeRect(470, 20, 24, 30);
  x.font = '700 22px Arial, sans-serif'; x.fillText(len === 40 ? '45G1' : '22G1', 400, 62);
  x.font = '500 14px Arial, sans-serif'; ['MAX.GR.  30,480 KG', 'TARE      3,750 KG', 'NET      26,730 KG', 'CU.CAP.  67.7 CU.M'].forEach((s, i) => x.fillText(s, 286, 130 + i * 18));
  if (L.ko) { x.font = `800 30px ${FONT_KO}`; x.fillText(L.ko, 40, 30); }
  x.fillStyle = '#b8b4a8'; x.fillRect(60, 380, 90, 56); x.fillStyle = '#333'; x.font = '9px Arial'; for (let i = 0; i < 5; i++) x.fillRect(66, 388 + i * 9, 78 - (i % 2) * 20, 3);   // CSC plate
  grime(x, w, h, { streaks: 30, rust: 30 });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function plainTexture(L, rot = false) {
  const w = 256, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = L.color; x.fillRect(0, 0, w, h); grime(x, w, h, { streaks: 25, rust: 20 });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- geometry ----------
// corrugated panel in the XY plane facing +Z: length lx along X (u 0..1), height ly (v 0..1), trapezoid
// waves of pitch p and depth d pushed toward +Z
function corrugated(lx, ly, p, d, flipU = false) {
  const n = Math.max(1, Math.round(lx / p)), pitch = lx / n;
  // trapezoid: flat crest 40 %, slope 10 %, valley 40 %, slope 10 %
  const prof = [[0, 0], [0.4, 0], [0.5, 1], [0.9, 1], [1, 0]];
  const xs = [], zs = [];
  for (let i = 0; i < n; i++) for (let k = i ? 1 : 0; k < prof.length; k++) { xs.push(-lx / 2 + (i + prof[k][0]) * pitch); zs.push(prof[k][1] * d); }
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < xs.length; i++) { const u = (xs[i] + lx / 2) / lx; for (const y of [-ly / 2, ly / 2]) { pos.push(xs[i], y, zs[i]); uv.push(flipU ? 1 - u : u, y > 0 ? 1 : 0); } }
  for (let i = 0; i < xs.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const boxG = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const cylG = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 8).translate(x, y, z);

// container frame: +Z = door end, origin at the floor centre. Returns { body (groups 0 sides, 1 doors, 2 front+roof), frame }
function containerGeometry(len) {
  const Lz = len === 40 ? FT40 : FT20, post = 0.16, rail = 0.16, inset = 0.012;
  const sideL = Lz - post * 2, sideH = H - rail * 2;
  // sides: corrugation runs along the length; the panel is in XY, rotate so X → Z
  const right = corrugated(sideL, sideH, 0.278, 0.036, false).rotateY(Math.PI / 2).translate(W / 2 - 0.04 - inset, H / 2, 0);   // faces +X
  const left = corrugated(sideL, sideH, 0.278, 0.036, false).rotateY(-Math.PI / 2).translate(-W / 2 + 0.04 + inset, H / 2, 0);   // faces −X
  // front end (−Z), vertical corrugation
  const front = corrugated(W - post * 2, sideH, 0.25, 0.03).rotateY(Math.PI).translate(0, H / 2, -Lz / 2 + 0.035);
  // roof: shallow pressings across the width
  const roof = corrugated(Lz - post * 2, W - 0.1, 0.5, 0.015).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, H - 0.03, 0);
  // doors (+Z): two leaves, flat with a few horizontal stiffener ridges
  const doorL = [];
  for (const s of [-1, 1]) { const leaf = new THREE.PlaneGeometry(W / 2 - post - 0.01, sideH); const uv = leaf.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, s < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5); leaf.translate(s * (W / 4 - post / 2 + 0.005) - 0, H / 2, Lz / 2 - 0.02); doorL.push(leaf); }
  const body = mergeGeometries([mergeGeometries([right, left]), mergeGeometries(doorL), mergeGeometries([front, roof])], true);
  // frame + hardware (one dark steel material)
  const fr = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    fr.push(boxG(post, H, post, sx * (W / 2 - post / 2), H / 2, sz * (Lz / 2 - post / 2)));                       // corner post
    for (const y of [0.09, H - 0.09]) fr.push(boxG(0.178, 0.118, 0.178, sx * (W / 2 - 0.089), y, sz * (Lz / 2 - 0.089)));   // corner casting
  }
  for (const sx of [-1, 1]) for (const y of [rail / 2, H - rail / 2]) fr.push(boxG(0.1, rail, Lz - post * 2, sx * (W / 2 - 0.05), y, 0));   // side rails
  for (const sz of [-1, 1]) for (const y of [rail / 2 + 0.02, H - rail / 2]) fr.push(boxG(W - post * 2, rail + (y < 1 ? 0.04 : 0), 0.1, 0, y, sz * (Lz / 2 - 0.05)));   // end rails / header / sill
  // fork pockets on 20 ft boxes
  if (len === 20) for (const z of [-1.03, 1.03]) for (const sx of [-1, 1]) fr.push(boxG(0.02, 0.12, 0.36, sx * (W / 2 - 0.01), 0.14, z));
  // locking bars: two per leaf, with keepers top and bottom and a handle
  for (const bx of [-0.82, -0.36, 0.36, 0.82]) {
    fr.push(cylG(0.016, H - 0.32, bx, H / 2, Lz / 2 + 0.03));
    for (const y of [0.24, H - 0.24]) fr.push(boxG(0.07, 0.07, 0.05, bx, y, Lz / 2 + 0.025));
    for (const y of [0.9, 1.75]) fr.push(boxG(0.04, 0.03, 0.04, bx, y, Lz / 2 + 0.03));
    fr.push(boxG(0.035, 0.03, 0.34, bx + (bx < 0 ? 0.08 : -0.08), 1.15, Lz / 2 + 0.05).rotateZ(0));        // handle
  }
  fr.push(boxG(0.02, sideH, 0.03, 0, H / 2, Lz / 2 - 0.002));                                                     // door seam
  return { body, frame: mergeGeometries(fr.map((g) => g.index ? g.toNonIndexed() : g)) };
}

const geoCache = {};
const geo = (len) => (geoCache[len] ||= containerGeometry(len));

export class ContainerYard {
  constructor(game) { this.game = game; this.items = []; this.matCache = {}; }
  // { x, y (bottom), z, rotY, len: 20|40, line, collide = true, walkable }
  add(o) { this.items.push({ len: 40, rotY: 0, y: 0, line: 'hanbada', collide: true, ...o }); return this; }
  materials(lineKey, len) {
    const k = lineKey + len; if (this.matCache[k]) return this.matCache[k];
    const L = { ...LINES[lineKey] }; L.serial = String(100000 + Math.floor(rnd() * 899999)) + Math.floor(rnd() * 10);
    const paint = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.25, envMapIntensity: 0.6 });
    const roofTex = plainTexture(L); roofTex.repeat.set(len === 40 ? 4 : 2, 1);
    return (this.matCache[k] = [paint(sideTexture(L, len)), paint(doorTexture(L, len)), paint(roofTex)]);
  }
  build() {
    const scene = this.game.renderer.scene, w = this.game.world, groups = {};
    for (const it of this.items) (groups[`${it.len}|${it.line}`] ||= []).push(it);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7, metalness: 0.45 });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    this.meshes = [];
    for (const [key, list] of Object.entries(groups)) {
      const [len, line] = key.split('|'); const g = geo(+len);
      const body = new THREE.InstancedMesh(g.body, this.materials(line, +len), list.length);
      list.forEach((it, i) => { q.setFromAxisAngle(up, it.rotY); m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, one); body.setMatrixAt(i, m4); });
      body.castShadow = body.receiveShadow = true; body.userData.dynamic = true; scene.add(body); this.meshes.push(body);
    }
    // frames are painted like the body, a shade darker (instance colour)
    frameMat.color.setHex(0xffffff); const col = new THREE.Color();
    for (const len of [20, 40]) {
      const list = this.items.filter((it) => it.len === len); if (!list.length) continue;
      const fm = new THREE.InstancedMesh(geo(len).frame, frameMat, list.length);
      list.forEach((it, i) => { q.setFromAxisAngle(up, it.rotY); m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, one); fm.setMatrixAt(i, m4); fm.setColorAt(i, col.set(LINES[it.line].color).convertSRGBToLinear().multiplyScalar(0.55).convertLinearToSRGB()); });
      fm.castShadow = true; fm.receiveShadow = true; fm.userData.dynamic = true; scene.add(fm); this.meshes.push(fm);
    }
    // colliders (axis-aligned; boxes are placed at quarter turns)
    for (const it of this.items) {
      if (!it.collide) continue;
      const Lz = it.len === 40 ? FT40 : FT20, along = Math.abs(Math.sin(it.rotY)) > 0.5;
      w.addBoxCentered(new THREE.Vector3(it.x, it.y + H / 2, it.z), new THREE.Vector3(along ? Lz : W, H, along ? W : Lz), { surface: 'metal', cover: true, walkable: it.walkable ?? true });
    }
    return this;
  }
}
export const CONTAINER = { W, H, FT20, FT40 };

// a single (non-instanced) container whose origin is its centre — for one that moves (the crane load)
export function containerMesh(game, line = 'hanbada', len = 40) {
  const yard = (game._contMats ||= new ContainerYard(game)); const g = geo(len);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g.body, yard.materials(line, len)); const frame = new THREE.Mesh(g.frame, new THREE.MeshStandardMaterial({ color: new THREE.Color(LINES[line].color).multiplyScalar(0.55), roughness: 0.7, metalness: 0.45 }));
  for (const o of [body, frame]) { o.position.y = -H / 2; o.castShadow = o.receiveShadow = true; grp.add(o); }
  return grp;
}
