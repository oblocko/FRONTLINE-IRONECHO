// Hand-made streets of the Seoul quarter west of the old centre (everything here is placed by hand: every
// building, every sign, every cart). The quarter replaces the generated region inside HAND (Region.js skips it).
//
// 1. 하늘길 (pedestrian shopping street, after Myeongdong): x -357..-345, z -94..-10, paved full width, no cars.
//    West row (front x -357) and east row (front x -345), 7 buildings each, 4-10 floors; ground + upper floors of
//    glass shops, big brand signs, LED screens, projecting vertical signs for the clinics / academies upstairs;
//    planters with trees down the middle, string lights over the street, food carts, benches.
//    Service lanes behind the rows (x -386..-379, -323..-318).
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { wallMat, flatMat, groundMat } from './CityMaterials.js';
import { CURB } from './Streets.js';
import { mass, rooftop, windows, edge, onFace } from './Buildings.js';
import { boxSign, channelSign, verticalSign } from '../korea/Signs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HAND = { x0: -392, x1: -312, z0: -100, z1: -4 };   // grows as more of the quarter is built by hand

// ------------------------------------------------------------------ materials / textures
const cache = new Map();
function tex(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); return t;
}
const FONT = '"WenQuanYi Zen Hei", "Noto Sans KR", sans-serif';
// granite pavers in a running bond with a darker border course every 6 m (the street is paved wall to wall)
const paveTex = () => tex('hs_pave', 512, 512, (g, W, H) => {
  g.fillStyle = '#8a8680'; g.fillRect(0, 0, W, H);
  const bw = 64, bh = 32;
  for (let y = 0; y < H; y += bh) for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < W; x += bw) { const v = 150 + Math.random() * 28; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4); }
  g.fillStyle = '#6a6660'; g.fillRect(0, 0, W, 34); for (let x = 0; x < W; x += 34) { g.fillStyle = `rgb(${96 + Math.random() * 16},${92 + Math.random() * 14},${88})`; g.fillRect(x + 2, 2, 30, 30); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(30,26,22,${0.04 + Math.random() * 0.05})`; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 8 + Math.random() * 30, 5 + Math.random() * 14, Math.random() * 3, 0, 7); g.fill(); }   // gum / stains
});
// a full-colour LED screen ad (products only, no people): background, product, copy
function ledTex(kind) {
  return tex(`hs_led${kind}`, 512, 384, (g, W, H) => {
    const ads = {
      serum: () => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f6d8e0'); gr.addColorStop(1, '#c87890'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 6 + Math.random() * 30, 0, 7); g.fill(); }
        g.fillStyle = '#fff6f0'; g.fillRect(300, 80, 70, 220); g.fillStyle = '#d8a0b0'; g.fillRect(300, 60, 70, 30); g.fillStyle = '#b05070'; g.fillRect(318, 150, 34, 90);
        g.fillStyle = '#5a1a30'; g.font = `bold 48px ${FONT}`; g.fillText('촉촉한 봄', 40, 140); g.font = `24px ${FONT}`; g.fillText('루나 세럼 · 1+1 행사', 44, 190); g.font = `bold 30px ${FONT}`; g.fillText('LUNA', 44, 320); },
      shoes: () => { g.fillStyle = '#101418'; g.fillRect(0, 0, W, H); const gr = g.createRadialGradient(330, 220, 10, 330, 220, 260); gr.addColorStop(0, '#2a6a9a'); gr.addColorStop(1, '#101418'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = '#f0f0f0'; g.beginPath(); g.moveTo(200, 260); g.quadraticCurveTo(260, 180, 360, 200); g.lineTo(460, 230); g.quadraticCurveTo(470, 270, 440, 280); g.lineTo(210, 285); g.closePath(); g.fill(); g.fillStyle = '#e04020'; g.fillRect(230, 270, 210, 12);
        g.fillStyle = '#ffffff'; g.font = `bold 54px ${FONT}`; g.fillText('RUN SEOUL', 30, 90); g.font = `22px ${FONT}`; g.fillText('아이엠 슈즈 · 새 시즌', 34, 130); },
      tea: () => { g.fillStyle = '#e8eed8'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a7a3a'; for (let i = 0; i < 9; i++) { g.save(); g.translate(60 + i * 50, 300 - (i % 3) * 30); g.rotate(i); g.beginPath(); g.ellipse(0, 0, 30, 12, 0, 0, 7); g.fill(); g.restore(); }
        g.fillStyle = '#2a4a2a'; g.font = `bold 50px ${FONT}`; g.fillText('제주 녹차 크림', 30, 90); g.font = `24px ${FONT}`; g.fillText('그린 리프 · 자연에서 온 보습', 34, 132); g.fillStyle = '#ffffff'; g.fillRect(360, 150, 110, 110); g.fillStyle = '#4a7a3a'; g.fillRect(360, 150, 110, 30); },
      tour: () => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a3a6a'); gr.addColorStop(1, '#0a1a3a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd040'; g.font = `bold 46px ${FONT}`; g.fillText('WELCOME TO', 30, 90); g.fillText('SEOUL', 30, 150); g.fillStyle = '#ffffff'; g.font = `24px ${FONT}`; g.fillText('면세 · TAX FREE · 환전 우대', 34, 200);
        g.fillStyle = 'rgba(255,255,255,0.8)'; for (let x = 0; x < W; x += 24) { const h = 40 + Math.abs(Math.sin(x * 0.07)) * 90 + (x % 72 === 0 ? 50 : 0); g.fillRect(x, H - h, 20, h); } },
    };
    ads[kind]();
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);   // LED pixel rows
  });
}
const M = {};
function mats() {
  if (M.pave) return M;
  const pt = paveTex(); pt.repeat.set(1, 1);
  M.pave = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.75 }); M.pave.userData.uM = 8; M.pave.userData.vM = 8;
  M.glass = new THREE.MeshStandardMaterial({ color: 0x3a4a54, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.2 });
  M.mullion = flatMat(0x2a2c2e, { roughness: 0.4, metalness: 0.6, key: 'hs_mull' });
  M.white = flatMat(0xe8e6e0, { roughness: 0.5, key: 'hs_white' });
  M.black = flatMat(0x16171a, { roughness: 0.5, key: 'hs_black' });
  M.steel = flatMat(0x5a5e62, { roughness: 0.45, metalness: 0.6, key: 'hs_steel' });
  M.planter = wallMat('stone', 0x8a8680);
  M.soil = flatMat(0x3a2e24, { roughness: 1, key: 'hs_soil' });
  M.trunk = flatMat(0x4a3c30, { roughness: 0.95, key: 'hs_trunk' });
  M.leaf = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.9, flatShading: true });
  M.bulb = new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false });
  M.lampHead = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, emissive: 0xfff2d8, emissiveIntensity: 0.8 });
  M.wire = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  M.cartRed = flatMat(0xb8261e, { roughness: 0.5, key: 'hs_cartr' }); M.cartBlue = flatMat(0x1e4a8a, { roughness: 0.5, key: 'hs_cartb' });
  M.awnStripe = new THREE.MeshStandardMaterial({ map: tex('hs_awn', 64, 16, (g, W, H) => { for (let x = 0; x < W; x += 8) { g.fillStyle = (x / 8) % 2 ? '#f0ece0' : '#c8261e'; g.fillRect(x, 0, 8, H); } }), roughness: 0.7, side: THREE.DoubleSide });
  M.wood = flatMat(0x8a6a48, { roughness: 0.8, key: 'hs_wood' });
  return M;
}
// a lit LED screen on a face (local +z of the group points out of the wall)
function ledScreen(ctx, kind, w, h, x, y, z, rotY) {
  const g = new THREE.Group(); const t = ledTex(kind);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.3), M.black); frame.position.z = 0.15; g.add(frame);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.z = 0.31; g.add(scr);
  g.position.set(x, y, z); g.rotation.y = rotY; ctx.scene.add(g); ctx.own(g); return g;
}

// ------------------------------------------------------------------ one shop building, fully specified
// b: { x0, x1, z0, z1, front: [nx, nz], floors, wall: [kind, color], upper: facade style, glass: floors of full
//      glazing above the ground floor (shop floors), shops: [{ w, type, sign: [name, sub, [bg, fg, ac], style] | { ch: [text, colour] } }],
//      brand: { text, color, h, y? (floor) } channel letters across the glass floors, led: { kind, w, h, floor, at: 'front' | 'side' },
//      verticals: [[text, bg, at (-1 left / 1 right), floor]], sides: faces that get windows, name }
function shopBuilding(ctx, b) {
  const m = mats(), y0 = CURB, gfH = 4.4, upH = 3.3, rect = new Rect(b.x0, b.z0, b.x1, b.z1), [nx, nz] = b.front;
  const h = gfH + (b.floors - 1) * upH, wall = wallMat(b.wall[0], b.wall[1]), rot = Math.atan2(nx, nz);
  const it = ctx.plan.add({ kind: 'building', id: b.name, use: 'shops', zone: 'commercial', rect, y0, h, entrances: [] }); ctx.ownBegin(it);
  it.colliders.push(mass(ctx, rect, y0, h, wall));
  const e = edge(rect, nx, nz), B = ctx.batch;
  const at = (a, o = 0) => onFace(e, nx, nz, a, o);
  // ground floor: shops side by side between thin dark piers, a fascia band carrying each shop's sign
  let a = -e.len / 2; const shops = b.shops;
  const total = shops.reduce((s, sh) => s + (sh.w ?? 0), 0), free = shops.filter((sh) => !sh.w).length;
  for (const sh of shops) {
    const w = sh.w ?? (e.len - total) / free, c = a + w / 2;
    const [px, pz] = at(a + 0.2, 0.05); B.box(m.black, nx ? 0.3 : 0.4, gfH, nx ? 0.4 : 0.3, px, y0 + gfH / 2, pz);
    const [sx, sz] = at(c, 0.03);
    ctx.fac.get('commercial').shop(sx, y0 + 1.75, sz, rot, w - 0.7, 3.1, { type: sh.type, lit: 1 });
    const [fx, fz] = at(c, 0.12); B.box(m.black, nx ? 0.24 : w - 0.4, 0.95, nx ? w - 0.4 : 0.24, fx, y0 + gfH - 0.45, fz);
    if (sh.sign) {
      const [name, sub, cols, style] = sh.sign; const sg = boxSign(name, sub, cols, Math.min(w - 0.9, 7.5), 0.8, { style: style || 'plain', lit: true });
      const [gx, gz] = at(c, 0.25); sg.position.set(gx, y0 + gfH - 0.45, gz); sg.rotation.y = rot; ctx.scene.add(sg); ctx.own(sg);
    } else if (sh.ch) { const cs = channelSign(sh.ch[0], sh.ch[1], 0.7, { raceway: null, lit: true }); const [gx, gz] = at(c, 0.26); cs.position.set(gx, y0 + gfH - 0.45, gz); cs.rotation.y = rot; ctx.scene.add(cs); ctx.own(cs); }
    const [dx, dz] = at(c, 0.6); it.entrances.push({ x: dx, z: dz, nx, nz });
    a += w;
  }
  const [px, pz] = at(e.len / 2 - 0.2, 0.05); B.box(m.black, nx ? 0.3 : 0.4, gfH, nx ? 0.4 : 0.3, px, y0 + gfH / 2, pz);
  // glass shop floors above the ground floor: a curtain of glass across the front, mullions every 1.5 m
  const gl = b.glass ?? 0;
  if (gl > 0) {
    const gh = gl * upH, [gx, gz] = at(0, 0.04);
    B.box(m.glass, nx ? 0.06 : e.len - 0.6, gh - 0.3, nx ? e.len - 0.6 : 0.06, gx, y0 + gfH + gh / 2, gz);
    for (let u = -e.len / 2 + 0.3; u <= e.len / 2 - 0.3; u += 1.5) { const [mx, mz] = at(u, 0.09); B.box(m.mullion, nx ? 0.08 : 0.07, gh - 0.3, nx ? 0.07 : 0.08, mx, y0 + gfH + gh / 2, mz); }
    for (let f = 0; f <= gl; f++) { const [mx, mz] = at(0, 0.1); B.box(m.mullion, nx ? 0.1 : e.len - 0.6, 0.12, nx ? e.len - 0.6 : 0.1, mx, y0 + gfH + f * upH, mz); }
    // lit shop interior behind the glass (one shop window per bay keeps the interior shader)
    for (let u = -e.len / 2 + 1.05; u < e.len / 2 - 0.6; u += 1.5) for (let f = 0; f < gl; f++) { const [wx, wz] = at(u, 0.0); ctx.fac.get('commercial').shop(wx, y0 + gfH + f * upH + upH / 2, wz, rot, 1.4, upH - 0.4, { type: b.glassType ?? 0, lit: 1 }); }
  }
  // brand letters across the glass floors (or above the ground floor)
  if (b.brand) { const br = b.brand; const cs = channelSign(br.text, br.color, br.h ?? 1.6, { raceway: null, lit: true, outline: br.outline ?? null }); const [bx, bz] = at(br.a ?? 0, 0.3); cs.position.set(bx, y0 + gfH + (br.floor ?? gl) * upH - (br.h ?? 1.6) / 2 - 0.4, bz); cs.rotation.y = rot; ctx.scene.add(cs); ctx.own(cs); }
  // ordinary windows on the floors above the glass, on the front and any listed side
  const restFloors = b.floors - 1 - gl;
  if (restFloors > 0) for (const [sx, sz] of [b.front, ...(b.sides ?? [])]) windows(ctx, b.upper ?? 'commercial', rect, sx, sz, { y0: y0 + gfH + gl * upH - upH, floors: restFloors + 1, startFloor: 1, wall: b.wall[1], frame: b.frame ?? 0x3a3e42, tenants: b.tenants ?? 0.3 });
  else for (const [sx, sz] of b.sides ?? []) windows(ctx, b.upper ?? 'commercial', rect, sx, sz, { y0: y0 + gfH - upH, floors: b.floors, startFloor: 1, wall: b.wall[1], frame: b.frame ?? 0x3a3e42 });
  // LED screen
  if (b.led) { const L = b.led; const [lx, lz] = at(L.a ?? 0, 0); ledScreen(ctx, L.kind, L.w, L.h, lx, y0 + gfH + (L.floor ?? 1) * upH + L.h / 2, lz, rot); }
  // projecting vertical signs (clinics, academies, cafés upstairs)
  for (const [text, bg, side, floor] of b.verticals ?? []) { const vs = verticalSign(text, bg, '#ffffff', 0.62, Math.min(4.2, 0.62 * [...text].length + 0.6)); const [vx, vz] = at(side * (e.len / 2 - 0.45), 0); vs.position.set(vx, y0 + gfH + (floor ?? 1) * upH, vz); vs.rotation.y = rot + Math.PI / 2 * side * 0 ; ctx.scene.add(vs); ctx.own(vs); }
  if (b.roofSign) { const rs = boxSign(b.roofSign[0], '', [b.roofSign[1], '#ffffff', '#ffffff'], b.roofSign[2] ?? 8, 1.6, { lit: true }); const [rx, rz] = at(0, -1.5); rs.position.set(rx, y0 + h + 1.6, rz); rs.rotation.y = rot; ctx.scene.add(rs); ctx.own(rs); B.box(m.steel, 0.15, 1.6, 0.15, rx, y0 + h + 0.8, rz); }
  rooftop(ctx, rect, y0 + h, [-nx, -nz], { units: 2 });
  ctx.ownEnd(); return it;
}

// ------------------------------------------------------------------ 1. 하늘길
const ST = { x0: -357, x1: -345, z0: -94, z1: -10 };
const W = -1, E = 1;   // row sides
// west row: front faces +x (toward the street); east row faces -x
const WEST = [
  { name: '루나 코스메틱', z0: -94, z1: -82, floors: 6, wall: ['panel', 0xe8e6e2], glass: 2, glassType: 0,
    shops: [{ type: 0, sign: ['LUNA', '루나 코스메틱', ['#f4d8e0', '#8a2a4a', '#8a2a4a']] }], brand: { text: '루나', color: '#e8708a', h: 2.0 }, led: { kind: 'serum', w: 5.5, h: 4.0, floor: 3, a: 0, at: 'side' }, sides: [[0, -1]] },
  { name: '꿈 환전', z0: -82, z1: -72, floors: 4, wall: ['tile', 0xc8b8a0], glass: 0,
    shops: [{ w: 5, type: 4, sign: ['환전', 'EXCHANGE · 換錢', ['#1d3f8a', '#ffffff', '#ffd040'], 'split'] }, { type: 3, sign: ['하늘약국', '', ['#1e6a3a', '#ffffff', '#ffffff']] }],
    verticals: [['밝은치과', '#00708a', 1, 1], ['피부과', '#7a2a6a', -1, 1]] },
  { name: '모노 스포츠', z0: -72, z1: -58, floors: 8, wall: ['panel', 0x2a2c30], glass: 2, upper: 'office',
    shops: [{ type: 0, sign: ['MONO SPORTS', '모노 스포츠', ['#111111', '#ffffff', '#ffffff']] }], brand: { text: 'MONO', color: '#ffffff', h: 2.2 } },
  { name: '카페 온도', z0: -58, z1: -49, floors: 5, wall: ['tile', 0xd8d0c0], glass: 0,
    shops: [{ type: 1, sign: ['카페 온도', 'COFFEE & BAKERY', ['#3a2a22', '#f0e6d0', '#d8b080']] }], verticals: [['영어학원', '#c8141a', 1, 1], ['네일', '#d8508a', -1, 2]] },
  { name: '데이지 마켓', z0: -49, z1: -36, floors: 7, wall: ['stone', 0xb8b0a4], glass: 1,
    shops: [{ w: 7, type: 0, sign: ['데이지 마켓', 'DAISY MARKET', ['#f4e8a0', '#5a4a10', '#c8a020'], 'logo'] }, { type: 5, sign: ['밝은안경', '', ['#1a2a4a', '#ffffff', '#ffffff']] }],
    led: { kind: 'tour', w: 8, h: 5.5, floor: 2, a: 0 } },
  { name: '아이엠 슈즈', z0: -36, z1: -25, floors: 5, wall: ['panel', 0x3a3e44], glass: 1,
    shops: [{ type: 0, ch: ['I AM SHOES', '#ffffff'] }], brand: { text: '아이엠', color: '#ff5a3a', h: 1.4, floor: 1 }, verticals: [['수학학원', '#1d3f8a', 1, 2]] },
  { name: '하루 화장품', z0: -25, z1: -10, floors: 9, wall: ['stone', 0xd8d4cc], glass: 2, upper: 'office',
    shops: [{ w: 8, type: 0, sign: ['하루 화장품', 'HARU', ['#ffffff', '#2a6a8a', '#2a6a8a']] }, { type: 0, sign: ['서울 기념품', 'SOUVENIR', ['#8a1a1a', '#ffffff', '#ffd040'], 'border'] }],
    brand: { text: 'HARU', color: '#2a8aaa', h: 2.0 }, roofSign: ['하루', '#2a6a8a', 7], sides: [[0, 1]] },
];
const EAST = [
  { name: '한빛 패션몰', z0: -94, z1: -80, floors: 10, wall: ['panel', 0xc8ccd0], glass: 3, upper: 'office',
    shops: [{ type: 0, sign: ['한빛 패션몰', 'HANBIT FASHION MALL', ['#141414', '#ffffff', '#d8b060']] }], brand: { text: 'HANBIT', color: '#d8b060', h: 2.4 }, roofSign: ['한빛 패션몰', '#141414', 10], sides: [[0, -1]] },
  { name: '보라 뷰티', z0: -80, z1: -70, floors: 5, wall: ['panel', 0xe8d8e8], glass: 1,
    shops: [{ type: 0, sign: ['보라 뷰티', 'BORA BEAUTY', ['#6a2a8a', '#ffffff', '#ffffff']] }], brand: { text: 'BORA', color: '#a050c8', h: 1.5, floor: 1 }, verticals: [['한의원', '#5a3a1a', 1, 1]] },
  { name: '블랙 스완', z0: -70, z1: -58, floors: 6, wall: ['panel', 0x18181a], glass: 2,
    shops: [{ type: 0, ch: ['BLACK SWAN', '#d8b060'] }], brand: { text: '블랙 스완', color: '#d8b060', h: 1.6 } },
  { name: '명가 칼국수', z0: -58, z1: -47, floors: 4, wall: ['tile', 0xc0a890], glass: 0,
    shops: [{ w: 6, type: 2, sign: ['명가 칼국수', 'since 1978', ['#f0e8d0', '#6a1a1a', '#6a1a1a'], 'border'] }, { type: 6, sign: ['헤어 살롱', '', ['#2a2a2e', '#ffffff', '#ffffff']] }],
    verticals: [['노래연습장', '#c83a1a', -1, 1], ['당구장', '#1e6a3a', 1, 1]] },
  { name: '빛 공방', z0: -47, z1: -38, floors: 5, wall: ['render', 0xe0dcd0], glass: 0,
    shops: [{ type: 5, sign: ['빛 공방', 'ACCESSORY', ['#f0f0f0', '#1a1a1a', '#c8a020']] }], verticals: [['K-POP 스토어', '#1a1a2a', 1, 1]] },
  { name: '그린 리프', z0: -38, z1: -25, floors: 8, wall: ['panel', 0x5a7a4a], glass: 2,
    shops: [{ type: 0, sign: ['그린 리프', 'GREEN LEAF', ['#2a4a2a', '#e8f0d8', '#a0c070'], 'logo'] }], led: { kind: 'tea', w: 6, h: 4.5, floor: 3 } },
  { name: '올리브 하우스', z0: -25, z1: -10, floors: 7, wall: ['stone', 0xc8c0b4], glass: 1,
    shops: [{ w: 9, type: 3, sign: ['올리브 하우스', 'HEALTH & BEAUTY', ['#5a8a1a', '#ffffff', '#ffffff']] }, { type: 1, sign: ['커피 한 잔', '', ['#1a1a1a', '#f0e6d0', '#f0e6d0']] }],
    led: { kind: 'shoes', w: 7, h: 5, floor: 2 }, sides: [[0, 1]] },
];

export function buildHandStreets(ctx) {
  const m = mats(), B = ctx.batch, plan = ctx.plan, w = ctx.world;
  // land of the quarter piece and the street (paved wall to wall), service lanes behind the rows
  plan.block(new Rect(HAND.x0, HAND.z0, HAND.x1, HAND.z1), 'commercial', '하늘길');
  plan.walk(new Rect(ST.x0, ST.z0, ST.x1, ST.z1), 'plaza');
  plan.walk(new Rect(-386, ST.z0, -379, ST.z1), 'path'); plan.walk(new Rect(-323, ST.z0, -318, ST.z1), 'path');
  plan.walk(new Rect(HAND.x0, HAND.z0, HAND.x1, ST.z0), 'sidewalk'); plan.walk(new Rect(HAND.x0, ST.z1, HAND.x1, HAND.z1), 'sidewalk');
  B.box(m.pave, ST.x1 - ST.x0, 0.02, HAND.z1 - HAND.z0, (ST.x0 + ST.x1) / 2, CURB + 0.01, (HAND.z0 + HAND.z1) / 2, 0, { cast: false });
  B.box(m.pave, HAND.x1 - HAND.x0, 0.02, 6, (HAND.x0 + HAND.x1) / 2, CURB + 0.01, HAND.z0 + 3, 0, { cast: false });
  B.box(m.pave, HAND.x1 - HAND.x0, 0.02, 6, (HAND.x0 + HAND.x1) / 2, CURB + 0.01, HAND.z1 - 3, 0, { cast: false });
  B.box(groundMat('plaza', { color: 0x7e7c78 }), 7, 0.02, ST.z1 - ST.z0, -382.5, CURB + 0.01, (ST.z0 + ST.z1) / 2, 0, { cast: false });
  B.box(groundMat('plaza', { color: 0x7e7c78 }), 5, 0.02, ST.z1 - ST.z0, -320.5, CURB + 0.01, (ST.z0 + ST.z1) / 2, 0, { cast: false });
  // the two rows
  for (const b of WEST) shopBuilding(ctx, { ...b, x0: -379, x1: ST.x0, front: [E, 0] });
  for (const b of EAST) shopBuilding(ctx, { ...b, x0: ST.x1, x1: -323, front: [W, 0] });
  // backs of the rows facing the service lanes: plain walls with service doors and AC units (on the batch)
  for (const [x, nx] of [[-379, -1], [-323, 1]]) for (let z = ST.z0 + 4; z < ST.z1 - 2; z += 7) { B.box(m.white, 0.4, 0.7, 0.9, x + nx * 0.25, CURB + 2.6 + (Math.abs(z) % 3), z); B.box(m.steel, 0.06, 2.1, 1.0, x + nx * 0.03, CURB + 1.05, z + 2.5); }
  // ---- the middle of the street (placed one by one) ----
  // planters with trees, alternating with carts and benches; every 20 m
  const planter = (z, leafy = true) => {
    B.box(m.planter, 2.4, 0.55, 2.4, -351, CURB + 0.28, z); B.box(m.soil, 2.0, 0.05, 2.0, -351, CURB + 0.56, z);
    w.addBoxCentered(V(-351, CURB + 0.28, z), V(2.4, 0.55, 2.4), { surface: 'concrete', cover: true, walkable: false });
    B.add(new THREE.CylinderGeometry(0.12, 0.16, 3.6, 7).translate(-351, CURB + 2.3, z), m.trunk);
    if (leafy) for (const [dx, dy, dz, r] of [[0, 4.4, 0, 1.7], [0.9, 4.0, 0.4, 1.2], [-0.8, 4.1, -0.5, 1.3], [0.2, 5.1, -0.2, 1.1]]) B.add(new THREE.IcosahedronGeometry(r, 1).translate(-351 + dx, CURB + dy, z + dz), m.leaf);
    else for (let i = 0; i < 7; i++) { const a = i * 0.9, g = new THREE.CylinderGeometry(0.02, 0.05, 1.8, 4); g.rotateZ(0.6); g.rotateY(a); B.add(g.translate(-351 + Math.cos(a) * 0.6, CURB + 4.4, z + Math.sin(a) * 0.6), m.trunk); }
  };
  planter(-86); planter(-66, false); planter(-46); planter(-26, false);
  // food carts: 떡볶이, 호떡, 닭꼬치, 군밤 — each its own colours and canopy
  const cart = (z, name, body, sub) => {
    B.box(body, 1.1, 1.0, 2.2, -351, CURB + 0.75, z); B.box(m.steel, 1.2, 0.06, 2.3, -351, CURB + 1.27, z);
    for (const dz of [-1, 1]) B.add(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(-351 + 0.5, CURB + 1.95, z + dz), m.steel);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 2.8), m.awnStripe); canopy.position.set(-351, CURB + 2.65, z); ctx.scene.add(canopy);
    for (const s of [-1, 1]) { const sg = boxSign(name, sub, ['#fff2c8', '#a01a10', '#a01a10'], 1.8, 0.45, { lit: true }); sg.position.set(-351 + s * 0.56, CURB + 1.0, z); sg.rotation.y = s * Math.PI / 2; ctx.scene.add(sg); }
    w.addBoxCentered(V(-351, CURB + 0.6, z), V(1.2, 1.2, 2.3), { surface: 'metal', cover: true, walkable: false });
    ctx.anchors?.push?.({ pos: V(-351, CURB + 2.3, z), color: 0xffd8a0 });
  };
  cart(-76, '떡볶이', m.cartRed, '어묵 · 순대'); cart(-56, '호떡', m.cartBlue, '꿀 · 씨앗'); cart(-36, '닭꼬치', m.cartRed, '매운맛 · 간장'); cart(-16, '군밤', m.cartBlue, '군고구마');
  const bench = (x, z) => { B.box(m.wood, 0.5, 0.08, 1.8, x, CURB + 0.45, z); for (const dz of [-0.7, 0.7]) B.box(m.steel, 0.45, 0.42, 0.06, x, CURB + 0.21, z + dz); w.addBoxCentered(V(x, CURB + 0.25, z), V(0.5, 0.5, 1.8), { surface: 'wood', walkable: false }); };
  bench(-353.6, -86); bench(-348.4, -66); bench(-353.6, -46); bench(-348.4, -26);
  // lamp posts along the shop fronts (staggered left / right every 16 m)
  const lampPost = (x, z) => { B.add(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8).translate(x, CURB + 2.6, z), m.black); B.add(new THREE.SphereGeometry(0.28, 12, 8).translate(x, CURB + 5.4, z), m.lampHead); w.addBoxCentered(V(x, CURB + 1, z), V(0.22, 2, 0.22), { surface: 'metal', walkable: false }); };
  for (const [x, z] of [[-356, -90], [-346, -82], [-356, -74], [-346, -62], [-356, -54], [-346, -42], [-356, -32], [-346, -20], [-356, -14]]) lampPost(x, z);
  // string lights zig-zagging across the street at 7 m between the rows, sagging
  const bulbs = []; const pts = [];
  const zs = [-92, -84, -76, -68, -60, -52, -44, -36, -28, -20, -12];
  for (let i = 0; i < zs.length - 1; i++) {
    const a = V(i % 2 ? ST.x1 : ST.x0, CURB + 7.2, zs[i]), b = V(i % 2 ? ST.x0 : ST.x1, CURB + 7.2, zs[i + 1]);
    for (let k = 0; k <= 16; k++) { const t = k / 16, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 0.9; pts.push(p); if (k % 2 === 0) bulbs.push(new THREE.SphereGeometry(0.07, 6, 4).translate(p.x, p.y - 0.08, p.z)); }
  }
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m.wire); ctx.scene.add(wire);
  B.add(mergeAll(bulbs), m.bulb, { cast: false });
  // bollards closing the street to cars at both ends, a street sign on a pole at each end
  for (const z of [ST.z0 + 0.6, ST.z1 - 0.6]) for (let x = ST.x0 + 1.5; x < ST.x1 - 1; x += 1.8) { B.add(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 10).translate(x, CURB + 0.45, z), m.steel); w.addBoxCentered(V(x, CURB + 0.45, z), V(0.22, 0.9, 0.22), { surface: 'metal', walkable: false }); }
  for (const z of [ST.z0 + 1.5, ST.z1 - 1.5]) { B.add(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8).translate(ST.x0 + 0.6, CURB + 1.7, z), m.steel); const s = boxSign('하늘길', 'HANEUL-GIL · 보행자 전용', ['#1d4f8a', '#ffffff', '#ffffff'], 1.8, 0.5); s.position.set(ST.x0 + 0.6, CURB + 3.2, z); s.rotation.y = z < -50 ? Math.PI : 0; ctx.scene.add(s); }
}
function mergeAll(list) { const pos = []; for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(n); } return pos.length === 1 ? pos[0] : (() => { let all = pos[0]; const out = []; for (const p of pos) out.push(p); return mergeSimple(out); })(); }
function mergeSimple(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(P, 3)); r.setAttribute('normal', new THREE.BufferAttribute(N, 3)); r.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return r;
}
