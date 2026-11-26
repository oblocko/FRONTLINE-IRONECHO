// Background city (Region.js) — what makes it a city and not a field of boxes:
//   signs       one sign per ground-floor shop (not a band printed on every floor), in the kinds of the signage
//               reference: LED channel letters (front-lit / halo / side), scashi, metal (galva / brass / corten),
//               wood, neon, flex; vertical blade signs (돌출) on some mid-rises, rooftop boards on a few tall ones.
//               All from one atlas (2 draw calls per chunk).
//   facilities  blocks that are not shops: school (+ running track, gym), church (red neon cross), gas station,
//               parking lot, traditional market arcade, hospital, construction site (tower crane), neighbourhood
//               park with a playground, sports courts, detached houses (단독주택).
import * as THREE from 'three';
import { flatMat, groundMat, wallMat } from './CityMaterials.js';
import { CURB } from './Streets.js';

function boxGeo(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); }

// ------------------------------------------------------------------ sign atlas
const NAMES = ['행복약국', '새마을식당', '서울치과', '온누리안경', '한솔부동산', '미소헤어', '청춘 PC방', '24시 코인세탁', '바다횟집', '엄마손칼국수',
  '동네커피', '다온 베이커리', '라온 필라테스', '하나내과', '튼튼정형외과', '해법영어', '수학의 숲', '용인 태권도', '코인노래방', '당구장',
  '꽃집 봄날', '한우 정육점', '중화요리 홍', '치킨 & 호프', '분식나라', '곱창이야기', '휴대폰 할인', '참좋은 마트', '스시 하루', '돈까스 클럽',
  '북카페 오후', '네일 스튜디오', '한방 한의원', '소아과', '독서실', '피아노 학원', '포토 스튜디오', '전주 비빔밥', '마라탕', '와인 바 노을'];
const STYLES = ['channel', 'halo', 'scashi', 'metal', 'wood', 'neon', 'flex', 'side'];
const COLS = [['#d8261c', '#ffffff'], ['#1d4f9a', '#ffffff'], ['#2a7a3a', '#ffffff'], ['#f2c21a', '#2a1a10'], ['#141414', '#f4d040'], ['#ffffff', '#c8261c'],
  ['#7a2a6a', '#ffffff'], ['#e86a1a', '#ffffff'], ['#0a6a7a', '#ffffff'], ['#f4f0e6', '#1a1a1a']];
const NEON = ['#ff4ad8', '#7ad8ff', '#ffb040', '#8aff6a', '#ff5a3a', '#c060ff'];
export const ATLAS = { cols: 4, rows: 10, vcols: 8 };
let atlasMat = null, bladeMat = null;
const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif', SERIF = '"Noto Serif KR", "Batang", serif';
function drawSign(g, x, y, w, h, name, style, k) {
  const [bg, fg] = COLS[k % COLS.length], neon = NEON[k % NEON.length];
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const text = (font, color, size, { glow = null, stroke = null, dx = 0 } = {}) => { g.font = font.replace(/^(\S+) /, `$1 ${Math.round(size)}px `); /* '<weight> <size>px <family>' */ g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = glow; g.shadowBlur = 14; } if (stroke) { g.lineWidth = 5; g.strokeStyle = stroke; g.strokeText(name, x + w / 2 + dx, y + h / 2 + 2); }
    g.fillStyle = color; g.fillText(name, x + w / 2 + dx, y + h / 2 + 2, w * 0.9); g.shadowBlur = 0; };
  if (style === 'channel') {   // front-lit channel letters on a dark raceway (transparent around)
    g.fillStyle = '#2a2a2a'; g.fillRect(x + w * 0.08, y + h * 0.44, w * 0.84, h * 0.12);
    text(`bold ${FONT}`, bg === '#ffffff' || bg === '#f4f0e6' ? fg : bg, h * 0.62, { stroke: '#ffffff' });
  } else if (style === 'halo') {   // back-lit (후광): dark letters with a white glow on the wall behind them
    text(`bold ${FONT}`, '#1a1a1a', h * 0.6, { glow: '#ffffff' }); text(`bold ${FONT}`, '#1a1a1a', h * 0.6, { glow: '#fff6d8' });
  } else if (style === 'side') {   // side-lit: coloured returns, white faces
    text(`bold ${FONT}`, bg === '#ffffff' ? '#1d4f9a' : bg, h * 0.6, { dx: 3 }); text(`bold ${FONT}`, '#ffffff', h * 0.6);
  } else if (style === 'scashi') {   // 스카시: thin cut letters on a light stone / plaster panel
    g.fillStyle = ['#efece6', '#e2ddd2', '#d8d4cc'][k % 3]; g.fillRect(x, y, w, h);
    text(k % 2 ? `300 ${SERIF}` : `300 ${FONT}`, '#2a2a2a', h * 0.48);
  } else if (style === 'metal') {   // 갈바 / brass / corten panel with engraved letters
    const m = [['#8a8c8e', '#2a2a2a'], ['#b8964a', '#2a1a08'], ['#7a3e1e', '#f0e0c8'], ['#222426', '#d8d8d8']][k % 4];
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, m[0]); gr.addColorStop(1, '#00000000'); g.fillStyle = m[0]; g.fillRect(x, y, w, h); g.fillStyle = gr; g.globalAlpha = 0.3; g.fillRect(x, y, w, h); g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.04})`; g.fillRect(x, y + (i / 40) * h, w, 1); }
    text(`bold ${SERIF}`, m[1], h * 0.5);
  } else if (style === 'wood') {
    g.fillStyle = ['#6a4a2e', '#8a6440', '#3a2a1e'][k % 3]; g.fillRect(x, y, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + (i / 8) * h, w, 2); }
    text(`bold ${SERIF}`, '#f4ecd8', h * 0.5);
  } else if (style === 'neon') {
    g.fillStyle = '#121214'; g.fillRect(x, y, w, h);
    text(`bold ${FONT}`, '#ffffff', h * 0.55, { glow: neon }); g.globalAlpha = 0.6; text(`bold ${FONT}`, neon, h * 0.55, { glow: neon }); g.globalAlpha = 1;
  } else {   // flex: printed, lit from inside
    g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = fg; g.fillRect(x, y + h - 6, w, 6);
    text(`bold ${FONT}`, fg, h * 0.58);
  }
  g.restore();
}
function canvasTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function signAtlasMat() {
  if (atlasMat) return atlasMat;
  const TW = 512, TH = 96, cv = document.createElement('canvas'); cv.width = TW * ATLAS.cols; cv.height = 1024; const g = cv.getContext('2d');
  for (let i = 0; i < ATLAS.cols * ATLAS.rows; i++) { const c = i % ATLAS.cols, r = Math.floor(i / ATLAS.cols); drawSign(g, c * TW + 4, r * TH + 4, TW - 8, TH - 8, NAMES[i % NAMES.length], STYLES[i % STYLES.length], i); }
  const t = canvasTex(cv);
  atlasMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.5, alphaTest: 0.35, transparent: false });
  return atlasMat;
}
// vertical blade signs (돌출 간판): one name per tile, letters stacked
export function bladeAtlasMat() {
  if (bladeMat) return bladeMat;
  const TW = 128, TH = 512, cv = document.createElement('canvas'); cv.width = TW * ATLAS.vcols; cv.height = TH; const g = cv.getContext('2d');
  const B = ['치과', '내과', '학원', '노래방', 'PC방', '당구장', '필라테스', '한의원'];
  for (let i = 0; i < ATLAS.vcols; i++) { const [bg, fg] = COLS[(i * 3) % COLS.length], x = i * TW;
    g.fillStyle = bg; g.fillRect(x + 6, 6, TW - 12, TH - 12); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(x + 12, 12, TW - 24, TH - 24);
    const ch = [...B[i]]; g.fillStyle = fg; g.font = `bold ${Math.min(84, (TH - 60) / ch.length)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    ch.forEach((c, k) => g.fillText(c, x + TW / 2, 30 + (k + 0.5) * ((TH - 60) / ch.length))); }
  const t = canvasTex(cv);
  bladeMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.5 });
  return bladeMat;
}
// a sign quad: w x h, facing (nx, nz), centre (x, y, z), atlas tile i (horizontal) — or a vertical tile with v = true
export function signQuad(x, y, z, w, h, nx, nz, i, v = false) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  const cols = v ? ATLAS.vcols : ATLAS.cols, c = i % cols, r = v ? 0 : Math.floor(i / cols) % ATLAS.rows;
  const u0 = c / cols, du = 1 / cols, v1 = v ? 1 : 1 - (r * 96) / 1024, dv = v ? 1 : 96 / 1024;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * du, v1 - dv + uv.getY(k) * dv);
  g.rotateY(Math.atan2(nx, nz)); g.translate(x, y, z); return g;
}

// ------------------------------------------------------------------ shopfront signs for a background building
// face: 'n' | 's' | 'w' | 'e' (the street side), box: x0, z0, x1, z1, h
export function frontSigns(spec, rnd, [x0, z0, x1, z1], h, faces) {
  const geos = [], blades = [];
  for (const f of faces) {
    const nx = f === 'e' ? 1 : f === 'w' ? -1 : 0, nz = f === 's' ? 1 : f === 'n' ? -1 : 0, len = nx ? z1 - z0 : x1 - x0;
    const n = Math.max(1, Math.round(len / (6 + rnd() * 3))), uw = len / n;
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.12) continue;   // a vacant unit / a lobby
      const a = -len / 2 + (k + 0.5) * uw, px = nx ? (nx > 0 ? x1 : x0) + nx * 0.08 : (x0 + x1) / 2 + a, pz = nz ? (nz > 0 ? z1 : z0) + nz * 0.08 : (z0 + z1) / 2 + a;
      const sw = Math.min(uw - 0.8, 6.5), tile = Math.floor(rnd() * ATLAS.cols * ATLAS.rows);
      geos.push(signQuad(px, CURB + 3.6, pz, sw, sw * 96 / 512 * 1.15, nx, nz, tile));
      // the floor above: a second tenant's window sign on some (학원 / 병원 / 사무실)
      if (h > 8 && rnd() < 0.3) geos.push(signQuad(px + nx * 0.02, CURB + 6.6, pz + nz * 0.02, sw * 0.8, sw * 0.8 * 96 / 512 * 1.1, nx, nz, Math.floor(rnd() * 40)));
    }
    // 돌출 간판: a vertical blade at one end of the façade
    if (h > 9 && rnd() < 0.35) { const a = (rnd() < 0.5 ? -1 : 1) * (len / 2 - 0.8), bh = Math.min(h - 5, 4 + rnd() * 4);
      const bx = nx ? (nx > 0 ? x1 : x0) + nx * 0.55 : (x0 + x1) / 2 + a, bz = nz ? (nz > 0 ? z1 : z0) + nz * 0.55 : (z0 + z1) / 2 + a, tile = Math.floor(rnd() * ATLAS.vcols);
      // the blade stands out from the wall: its faces look along the façade
      for (const s of [-1, 1]) blades.push(signQuad(bx + (nx ? 0 : s * 0.1), CURB + 5 + bh / 2, bz + (nz ? 0 : s * 0.1), 0.9, bh, nz ? s : 0, nx ? s : 0, tile, true)); }
  }
  // a rooftop board on a few taller buildings (옥상 간판)
  if (h > 16 && rnd() < 0.12) { const f = faces[0], nx = f === 'e' ? 1 : f === 'w' ? -1 : 0, nz = f === 's' ? 1 : f === 'n' ? -1 : 0;
    const bw = Math.min(14, (nx ? z1 - z0 : x1 - x0) * 0.7), cx = nx ? (nx > 0 ? x1 - 2 : x0 + 2) : (x0 + x1) / 2, cz = nz ? (nz > 0 ? z1 - 2 : z0 + 2) : (z0 + z1) / 2;
    geos.push(signQuad(cx, CURB + h + 2.6, cz, bw, bw * 96 / 512 * 1.4, nx, nz, Math.floor(rnd() * 40)));
    spec(cx, cz, { geo: () => boxGeo(nx ? 0.3 : bw, 1.4, nx ? bw : 0.3, cx - nx * 0.3, CURB + h, cz - nz * 0.3), mat: () => flatMat(0x3a3c3e, { metalness: 0.5, key: 'rgframe' }), box: [cx - 1, cz - 1, cx + 1, cz + 1, h + 1.4], color: 0x3a3c3e, np: true }); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (geos.length) spec(cx, cz, { geo: () => merge(geos), mat: signAtlasMat, box: [cx - 1, cz - 1, cx + 1, cz + 1, 4], color: 0xffffff, np: true });
  if (blades.length) spec(cx, cz, { geo: () => merge(blades), mat: bladeAtlasMat, box: [cx - 1, cz - 1, cx + 1, cz + 1, 4], color: 0xffffff, np: true });
}
function merge(gs) {
  const pos = [], nor = [], uv = [], idx = []; let o = 0;
  for (const g of gs) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); } for (const k of g.index.array) idx.push(k + o); o += p.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); m.setIndex(idx); m.userData.keepUV = true; return m;   // atlas UVs: the batch must not re-map them
}

// ------------------------------------------------------------------ facilities (one block each)
const M = {
  white: () => flatMat(0xeeece6, { key: 'rx-white' }), cream: () => wallMat('render', 0xe8e0c8), brick: () => wallMat('brick', 0x9a5a44), grey: () => wallMat('panel', 0xa8acae),
  glass: () => flatMat(0x46586a, { roughness: 0.15, metalness: 0.4, key: 'rx-glass' }), dark: () => flatMat(0x2a2c2e, { key: 'rx-dark' }), steel: () => flatMat(0x8a8e92, { metalness: 0.6, roughness: 0.4, key: 'rx-steel' }),
  track: () => flatMat(0xa8543e, { roughness: 0.95, key: 'rx-track' }), field: () => groundMat('lawn'), dirt: () => flatMat(0xb89a72, { roughness: 1, key: 'rx-dirt' }),
  court: () => flatMat(0x2e6a8a, { roughness: 0.9, key: 'rx-court' }), court2: () => flatMat(0x3a7a4a, { roughness: 0.9, key: 'rx-court2' }), line: () => flatMat(0xf4f4f0, { key: 'rx-line' }),
  red: () => flatMat(0xd8261c, { key: 'rx-red' }), neonRed: () => { const m = flatMat(0xff2a2a, { key: 'rx-neonred' }); m.emissive = new THREE.Color(0xff1a1a); m.emissiveIntensity = 1.6; return m; },
  yellow: () => flatMat(0xf2c21a, { key: 'rx-yellow' }), orange: () => flatMat(0xe86a1a, { key: 'rx-orange' }), blue: () => flatMat(0x1d4f9a, { key: 'rx-blue' }), green: () => flatMat(0x2a8a4a, { key: 'rx-green' }),
  roofTile: () => flatMat(0x4a5258, { roughness: 0.8, key: 'rx-rooftile' }), roofRed: () => flatMat(0x8a3a2a, { roughness: 0.8, key: 'rx-roofred' }), arcade: () => flatMat(0xc8d4d8, { roughness: 0.3, metalness: 0.2, key: 'rx-arcade' }),
  fence: () => flatMat(0x2a5a8a, { key: 'rx-fence' }), fence2: () => flatMat(0xe8e8e4, { key: 'rx-fence2' }), conc: () => wallMat('concrete', 0xa8a6a0), crane: () => flatMat(0xf2b81a, { metalness: 0.3, key: 'rx-crane' }),
  pave: () => groundMat('plaza', { color: 0x9a9890 }), asph: () => groundMat('asphalt', { roughness: 0.85 }),
};
export const FACILITIES = ['school', 'church', 'gas', 'parking', 'market', 'hospital', 'construction', 'playpark', 'courts', 'houses'];
// H: { put, flat, lawn, pave, tree(x, z, s), occl, rnd, pick, spec }
export function facility(kind, r, H) {
  const { flat, lawn, pave, rnd, pick, occl } = H, W = r.x1 - r.x0, D = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const box = (m, w, h, d, x, y, z, color = 0xc8c4bc) => flat(() => boxGeo(w, h, d, x, y, z), m, x, z, [x - w / 2, z - d / 2, x + w / 2, z + d / 2, y - CURB + h], color);
  const deco = (m, w, h, d, x, y, z, color = 0xc8c4bc) => H.spec(x, z, { geo: () => boxGeo(w, h, d, x, y, z), mat: m, box: [x - w / 2, z - d / 2, x + w / 2, z + d / 2, y - CURB + h], color, np: true });
  const trees = (pts) => { for (const [x, z] of pts) H.tree(x, z, 0.8 + rnd() * 0.5); };
  const edgeTrees = (inset, step) => { const t = []; for (let x = r.x0 + inset; x < r.x1 - inset; x += step) t.push([x, r.z0 + inset], [x, r.z1 - inset]); for (let z = r.z0 + inset + step; z < r.z1 - inset - step / 2; z += step) t.push([r.x0 + inset, z], [r.x1 - inset, z]); trees(t); };
  const signs = (x0, z0, x1, z1, h, faces) => frontSigns(H.spec, rnd, [x0, z0, x1, z1], h, faces);
  switch (kind) {
    case 'school': {   // 학교: L-shaped 4-storey building, a gym with a barrel roof, a running track round a field
      pave(r.x0, r.z0, r.x1, r.z1, 0xb4aea4);
      const bw = Math.min(W - 10, 90), sh = 15;
      box(M.cream, bw, sh, 16, r.x0 + 5 + bw / 2, CURB, r.z0 + 13, 0xe8e0c8); box(M.cream, 16, sh, Math.min(D * 0.5, 50), r.x0 + 13, CURB, r.z0 + 21 + Math.min(D * 0.5, 50) / 2, 0xe8e0c8);
      for (let f = 1; f < 4; f++) deco(M.glass, bw - 2, 1.5, 0.1, r.x0 + 5 + bw / 2, CURB + f * 3.7 - 2.2, r.z0 + 21.06, 0x46586a);   // window bands toward the field
      deco(M.green, 6, 1.4, 0.2, r.x0 + 5 + bw / 2, CURB + sh - 1.6, r.z0 + 21.1, 0x2a8a4a);   // the school name board
      occl(r.x0 + 5, r.z0 + 5, r.x0 + 5 + bw, r.z0 + 21, sh);
      const gx = r.x1 - 22, gz = r.z0 + 20; box(M.grey, 30, 8, 26, gx, CURB, gz, 0xa8acae);
      flat(() => { const g = new THREE.CylinderGeometry(13, 13, 30, 16, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.scale(1, 0.35, 1); g.translate(gx, CURB + 8, gz); return g; }, M.steel, gx, gz, [gx - 15, gz - 13, gx + 15, gz + 13, 12.5], 0x8a8e92);
      const tw = Math.min(W - 40, 110), td = Math.min(D - 50, 60), tz = r.z1 - 8 - td / 2;
      if (tw > 40 && td > 30) {
        flat(() => { const g = new THREE.CapsuleGeometry(td / 2, tw - td, 8, 24); g.rotateZ(Math.PI / 2); g.scale(1, 0.0012, 1); g.translate(cx, CURB + 0.03, tz); return g; }, M.track, cx, tz, [cx - tw / 2, tz - td / 2, cx + tw / 2, tz + td / 2, 0.05], 0xa8543e);
        flat(() => { const g = new THREE.CapsuleGeometry(td / 2 - 7, tw - td, 8, 24); g.rotateZ(Math.PI / 2); g.scale(1, 0.0012, 1); g.translate(cx, CURB + 0.06, tz); return g; }, M.field, cx, tz, [cx - tw / 2 + 7, tz - td / 2 + 7, cx + tw / 2 - 7, tz + td / 2 - 7, 0.06], 0x56603a);
        for (const s of [-1, 1]) { deco(M.white, 0.15, 2.4, 7, cx + s * (tw / 2 - 12), CURB, tz, 0xffffff); }   // goals
      }
      deco(M.steel, 0.15, 9, 0.15, r.x0 + 30, CURB, r.z0 + 26, 0x8a8e92);   // flag pole
      edgeTrees(3, 9); return;
    }
    case 'church': {   // 교회: a brick nave, a bell tower with a spire and a red neon cross, a car park, a few houses beside it
      pave(r.x0, r.z0, r.x1, r.z1, 0x8a8a86);
      const nx = r.x0 + Math.min(W * 0.35, 30), nz = cz; box(M.brick, 18, 11, 32, nx, CURB, nz, 0x9a5a44);
      flat(() => { const g = new THREE.CylinderGeometry(0.01, 13.5, 6, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, 1.8); g.translate(nx, CURB + 14, nz); return g; }, M.roofTile, nx, nz, [nx - 9, nz - 16, nx + 9, nz + 16, 17], 0x4a5258);
      const tz = nz - 19; box(M.white, 6, 22, 6, nx, CURB, tz, 0xeeece6);
      flat(() => new THREE.ConeGeometry(4.2, 9, 4).rotateY(Math.PI / 4).translate(nx, CURB + 26.5, tz), M.roofTile, nx, tz, [nx - 3, tz - 3, nx + 3, tz + 3, 31], 0x4a5258);
      deco(M.neonRed, 0.4, 5, 0.4, nx, CURB + 31, tz, 0xff2a2a); deco(M.neonRed, 3, 0.4, 0.4, nx, CURB + 34, tz, 0xff2a2a);   // 십자가
      occl(nx - 9, nz - 16, nx + 9, nz + 16, 11);
      for (let k = 0; k < 4; k++) { const hx = r.x1 - 16, hz = r.z0 + 14 + k * ((D - 20) / 4); if (hz + 8 > r.z1) break; house(hx, hz); }
      edgeTrees(3, 12); return;
    }
    case 'gas': {   // 주유소 + 편의점 + 세차장, the rest a car park
      pave(r.x0, r.z0, r.x1, r.z1, 0x7e7e7a);
      const gx = r.x0 + 22, gz = r.z0 + 16, br = pick([[M.red, 0xd8261c], [M.green, 0x2a8a4a], [M.blue, 0x1d4f9a], [M.orange, 0xe86a1a]]);
      deco(M.white, 26, 0.9, 16, gx, CURB + 5.2, gz, 0xeeece6); deco(br[0], 26.2, 0.5, 16.2, gx, CURB + 5.6, gz, br[1]);
      for (const [px, pz] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) { deco(M.steel, 0.5, 5.2, 0.5, gx + px, CURB, gz + pz, 0x8a8e92); deco(M.white, 1, 1.8, 0.6, gx + px + (px > 0 ? -3 : 3), CURB, gz + pz, 0xeeece6); }
      box(M.white, 16, 4.2, 9, gx + 24, CURB, gz - 2, 0xeeece6); deco(br[0], 16.2, 0.8, 9.2, gx + 24, CURB + 3.4, gz - 2, br[1]);
      signs(gx + 16, gz - 6.5, gx + 32, gz + 2.5, 4.2, ['s']);
      deco(M.steel, 0.6, 9, 0.6, r.x0 + 4, CURB, r.z0 + 4, 0x8a8e92); deco(br[0], 2.6, 3.2, 0.5, r.x0 + 4, CURB + 6, r.z0 + 4, br[1]);   // price pylon
      parking(r.x0 + 6, gz + 14, r.x1 - 6, r.z1 - 6); return;
    }
    case 'parking': { pave(r.x0, r.z0, r.x1, r.z1, 0x6a6a68); parking(r.x0 + 4, r.z0 + 4, r.x1 - 4, r.z1 - 4);
      box(M.conc, Math.min(40, W * 0.4), 9, Math.min(30, D * 0.4), r.x1 - 4 - Math.min(40, W * 0.4) / 2, CURB, r.z0 + 4 + Math.min(30, D * 0.4) / 2, 0xa8a6a0);   // a parking tower
      edgeTrees(2, 10); return; }
    case 'market': {   // 전통시장: two rows of 2-storey shops under an arched translucent arcade, gates at both ends
      pave(r.x0, r.z0, r.x1, r.z1, 0x8e8a84);
      const L = W - 12, ax = cx, lane = 8, dep = 10;
      for (const s of [-1, 1]) { const rz = cz + s * (lane / 2 + dep / 2), n = Math.max(2, Math.round(L / 5));
        for (let k = 0; k < n; k++) { const x = r.x0 + 6 + (k + 0.5) * (L / n), c = pick([0xd8d2c4, 0xc9c0ae, 0xe0dcd0, 0xb8b4aa]); box(() => wallMat('render', c), L / n - 0.3, 6.5, dep, x, CURB, rz, c);
          if (rnd() < 0.7) deco(pick([M.red, M.blue, M.green, M.yellow, M.orange]), L / n - 0.8, 0.7, 0.12, x, CURB + 3.3, rz - s * (dep / 2 + 0.06), 0xd8261c); } }
      flat(() => { const g = new THREE.CylinderGeometry(lane / 2 + 1, lane / 2 + 1, L, 12, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.translate(ax, CURB + 6.5, cz); return g; }, M.arcade, ax, cz, [ax - L / 2, cz - lane / 2, ax + L / 2, cz + lane / 2, 11.5], 0xc8d4d8);
      for (const s of [-1, 1]) deco(M.blue, 0.6, 2, lane + 2, ax + s * (L / 2 + 0.4), CURB + 8.5, cz, 0x1d4f9a);
      signs(r.x0 + 6, cz - lane / 2 - dep, r.x1 - 6, cz - lane / 2 - dep, 6.5, ['n']); signs(r.x0 + 6, cz + lane / 2 + dep, r.x1 - 6, cz + lane / 2 + dep, 6.5, ['s']);
      return;
    }
    case 'hospital': {   // 병원: a white slab with a red cross on top, an emergency canopy, a car park, a garden
      lawn(r.x0, r.z0, r.x1, r.z1);
      const w = Math.min(W - 20, 80), d = 22, hz = r.z0 + 6 + d / 2; box(M.white, w, 34, d, cx, CURB, hz, 0xeeece6);
      deco(M.glass, w - 4, 26, 0.1, cx, CURB + 5, hz + d / 2 + 0.05, 0x46586a); box(M.white, w + 10, 6, d + 12, cx, CURB, hz + 4, 0xeeece6);
      deco(M.red, 6, 2, 0.4, cx + w / 2 - 6, CURB + 36, hz, 0xd8261c); deco(M.red, 2, 6, 0.4, cx + w / 2 - 6, CURB + 34, hz, 0xd8261c);
      deco(M.white, 12, 0.6, 7, cx - w / 2 + 10, CURB + 4, hz + d / 2 + 9, 0xeeece6); deco(M.red, 12.1, 0.5, 0.2, cx - w / 2 + 10, CURB + 4.1, hz + d / 2 + 12.5, 0xd8261c);   // 응급실 canopy
      signs(cx - w / 2 - 5, hz - d / 2 - 2, cx + w / 2 + 5, hz + d / 2 + 10, 6, ['s']);
      occl(cx - w / 2, hz - d / 2, cx + w / 2, hz + d / 2, 34);
      parking(r.x0 + 6, hz + d / 2 + 16, r.x1 - 6, r.z1 - 6); return;
    }
    case 'construction': {   // 공사장: hoarding round the site, a concrete frame rising, a tower crane, site offices, stacked material
      // a big block is only partly a site: the rest stays a car park
      if (W > 96 || D > 76) { const sw = Math.min(W, 90), sd = Math.min(D, 70); pave(r.x0, r.z0, r.x1, r.z1, 0x8a8a86); parking(r.x0 + sw + 6, r.z0 + 4, r.x1 - 4, r.z1 - 4); if (sd < D - 14) parking(r.x0 + 4, r.z0 + sd + 6, r.x0 + sw, r.z1 - 4);
        return facility('construction', { x0: r.x0, z0: r.z0, x1: r.x0 + sw, z1: r.z0 + sd }, H); }
      flat(() => boxGeo(W - 4, 0.05, D - 4, cx, CURB, cz), M.dirt, cx, cz, [r.x0 + 2, r.z0 + 2, r.x1 - 2, r.z1 - 2, 0.05], 0xb89a72);
      for (let k = 0; k < 3; k++) { box(M.white, 6, 2.6, 2.5, r.x0 + 8, CURB + (k === 2 ? 2.6 : 0), r.z0 + 6 + (k % 2) * 2.7, 0xeeece6); }   // 현장사무실 containers
      for (let k = 0; k < 4; k++) deco(k % 2 ? M.steel : M.conc, 6, 0.6, 1.2, r.x1 - 12, CURB + k * 0.6, r.z1 - 8, 0x8a8e92);   // rebar / formwork stacks
      deco(M.dark, 8, 0.05, 6, r.x1 - 14, CURB + 0.06, r.z0 + 8, 0x2a2c2e);   // wheel wash
      for (const [w, d, x, z] of [[W - 4, 0.2, cx, r.z0 + 2], [W - 4, 0.2, cx, r.z1 - 2], [0.2, D - 4, r.x0 + 2, cz], [0.2, D - 4, r.x1 - 2, cz]]) deco(M.fence, w, 2.6, d, x, CURB, z, 0x2a5a8a);
      const fw = Math.min(W - 24, 40), fd = Math.min(D - 24, 26), fl = 4 + Math.floor(rnd() * 8);
      box(M.conc, fw, 3.2 * fl - 3.2, fd, cx, CURB, cz, 0xa8a6a0);
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) deco(M.conc, 0.6, 3.2, 0.6, cx - fw / 2 + (i * fw) / 4, CURB + 3.2 * fl - 3.2, cz - fd / 2 + (j * fd) / 2, 0xa8a6a0);
      const mx = cx + fw / 2 + 5, mz = cz, mh = 3.2 * fl + 18;
      deco(M.crane, 2, mh, 2, mx, CURB, mz, 0xf2b81a); deco(M.crane, 46, 1.4, 1.4, mx - 14, CURB + mh, mz, 0xf2b81a); deco(M.conc, 4, 2.4, 3, mx + 7, CURB + mh - 1.2, mz, 0xa8a6a0);
      deco(M.dark, 3, 3, 3, mx, CURB + mh + 1.4, mz, 0x2a2c2e);
      return;
    }
    case 'playpark': {   // 근린공원: lawn, looping paths, a playground, a pergola, outdoor gym, lots of trees
      lawn(r.x0, r.z0, r.x1, r.z1);
      pave(r.x0 + 6, cz - 2, r.x1 - 6, cz + 2, 0xc8c0b0); pave(cx - 2, r.z0 + 6, cx + 2, r.z1 - 6, 0xc8c0b0);
      const px = cx + Math.min(W / 4, 30), pz = cz + Math.min(D / 4, 22);
      flat(() => boxGeo(22, 0.06, 16, px, CURB, pz), () => flatMat(0xc87a4a, { roughness: 1, key: 'rx-rubber' }), px, pz, [px - 11, pz - 8, px + 11, pz + 8, 0.06], 0xc87a4a);
      deco(M.yellow, 4, 3, 4, px - 5, CURB, pz - 3, 0xf2c21a); deco(M.red, 1.2, 0.2, 5, px - 5, CURB + 1.5, pz + 1.5, 0xd8261c); deco(M.blue, 6, 0.2, 0.2, px + 4, CURB + 2.4, pz, 0x1d4f9a);
      for (const s of [-1, 1]) deco(M.blue, 0.2, 2.4, 0.2, px + 4 + s * 3, CURB, pz, 0x1d4f9a);
      const gx = cx - Math.min(W / 4, 30), gz = cz - Math.min(D / 4, 22);   // pergola with benches
      for (const [a, b] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) deco(() => flatMat(0x6a4a2e, { key: 'rx-wood' }), 0.3, 2.6, 0.3, gx + a, CURB, gz + b, 0x6a4a2e);
      deco(() => flatMat(0x6a4a2e, { key: 'rx-wood' }), 9, 0.25, 5, gx, CURB + 2.6, gz, 0x6a4a2e);
      const t = []; for (let k = 0; k < Math.floor(W * D / 260); k++) { const x = r.x0 + 6 + rnd() * (W - 12), z = r.z0 + 6 + rnd() * (D - 12); if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || (Math.abs(x - px) < 14 && Math.abs(z - pz) < 11) || (Math.abs(x - gx) < 7 && Math.abs(z - gz) < 5)) continue; t.push([x, z]); }
      trees(t); return;
    }
    case 'courts': {   // 체육공원: tennis / basketball courts, a futsal pitch, a small sports centre
      lawn(r.x0, r.z0, r.x1, r.z1);
      let x = r.x0 + 8; const z = r.z0 + 8;
      while (x + 20 < r.x1 - 30) { const m = rnd() < 0.5 ? M.court : M.court2; flat(() => boxGeo(18, 0.06, 34, x + 9, CURB, z + 17), m, x + 9, z + 17, [x, z, x + 18, z + 34, 0.06], 0x2e6a8a);
        deco(M.line, 0.15, 0.02, 30, x + 9, CURB + 0.07, z + 17, 0xf4f4f0); deco(M.line, 14, 0.02, 0.15, x + 9, CURB + 0.07, z + 17, 0xf4f4f0); deco(M.dark, 18, 1.0, 0.05, x + 9, CURB, z + 17, 0x2a2c2e);
        for (const [w, d, ox, oz] of [[18, 0.06, 9, 0], [18, 0.06, 9, 34], [0.06, 34, 0, 17], [0.06, 34, 18, 17]]) deco(() => flatMat(0x3a5a3a, { key: 'rx-net' }), w, 3.5, d, x + ox, CURB, z + oz, 0x3a5a3a);
        x += 22; }
      box(M.grey, 26, 10, 30, r.x1 - 18, CURB, r.z0 + 20, 0xa8acae); signs(r.x1 - 31, r.z0 + 5, r.x1 - 5, r.z0 + 35, 10, ['s']);
      edgeTrees(3, 10); return;
    }
    case 'houses': default: {   // 단독주택: walled garden lots, pitched roofs, a few with a rooftop deck
      pave(r.x0, r.z0, r.x1, r.z1, 0x9a9890);
      for (let z = r.z0 + 2; z + 18 <= r.z1 - 1; z += 20) for (let x = r.x0 + 2; x + 16 <= r.x1 - 1; x += 18) house(x + 8, z + 9);
      return;
    }
  }
  function house(hx, hz) {
    const w = 9 + rnd() * 3, d = 8 + rnd() * 2, fl = 1 + (rnd() < 0.6 ? 1 : 0), h = 0.6 + 2.9 * fl, wc = pick([0xe8e0d0, 0xd8cab0, 0xc8b8a0, 0x9a5a44, 0xf0ece4]);
    flat(() => boxGeo(w + 4, 0.05, d + 5, hx, CURB, hz), M.field, hx, hz, [hx - w / 2 - 2, hz - d / 2 - 2.5, hx + w / 2 + 2, hz + d / 2 + 2.5, 0.05], 0x56603a);
    for (const [ww, dd, ox, oz] of [[w + 4, 0.25, 0, -(d + 5) / 2], [w + 4, 0.25, 0, (d + 5) / 2], [0.25, d + 5, -(w + 4) / 2, 0], [0.25, d + 5, (w + 4) / 2, 0]]) deco(() => wallMat('brick', 0x8a6a5a), ww, 1.6, dd, hx + ox, CURB, hz + oz, 0x8a6a5a);
    box(() => wallMat(wc === 0x9a5a44 ? 'brick' : 'render', wc), w, h, d, hx, CURB, hz, wc);
    if (rnd() < 0.75) flat(() => { const g = new THREE.CylinderGeometry(0.01, 1, 2.6, 4, 1); g.rotateY(Math.PI / 4); g.scale((w + 1) / Math.SQRT2, 1, (d + 1) / Math.SQRT2); g.translate(hx, CURB + h + 1.3, hz); return g; }, pick([M.roofTile, M.roofRed]), hx, hz, [hx - w / 2, hz - d / 2, hx + w / 2, hz + d / 2, h + 2.6], 0x4a5258);
    else deco(() => flatMat(0x6a4a2e, { key: 'rx-wood' }), w - 1, 0.15, d - 1, hx, CURB + h, hz, 0x6a4a2e);
    if (rnd() < 0.5) H.tree(hx + w / 2 + 1, hz + d / 2 + 1.2, 0.6);
  }
  function parking(x0, z0, x1, z1) {
    if (x1 - x0 < 8 || z1 - z0 < 8) return;
    const lines = [], cars = [];
    for (let z = z0 + 1; z + 5 <= z1; z += 12) for (let x = x0 + 1; x + 2.5 <= x1; x += 2.6) { lines.push([x, z]); if (rnd() < 0.62) cars.push([x + 1.3, z + 2.5, pick([0xeeece6, 0x2a2c2e, 0x8a8e92, 0x6a7a8a, 0x8a2a2a, 0x1d3f6a, 0xc8c4bc])]); }
    if (!lines.length) return;
    H.spec((x0 + x1) / 2, (z0 + z1) / 2, { geo: () => merge(lines.map(([x, z]) => boxGeo(0.12, 0.02, 5, x, CURB + 0.05, z + 2.5))), mat: M.line, box: [x0, z0, x0 + 1, z0 + 1, 0.05], color: 0xf4f4f0, np: true });
    const byCol = new Map(); for (const c of cars) { if (!byCol.has(c[2])) byCol.set(c[2], []); byCol.get(c[2]).push(c); }
    for (const [col, list] of byCol) H.spec(list[0][0], list[0][1], { geo: () => merge(list.flatMap(([x, z]) => [boxGeo(1.8, 0.75, 4.4, x, CURB + 0.3, z), boxGeo(1.6, 0.6, 2.3, x, CURB + 1.05, z + 0.2)])), mat: () => flatMat(col, { roughness: 0.35, metalness: 0.4, key: `rxcar${col}` }), box: [list[0][0] - 1, list[0][1] - 1, list[0][0] + 1, list[0][1] + 1, 1.6], color: col, np: true });
  }
}
