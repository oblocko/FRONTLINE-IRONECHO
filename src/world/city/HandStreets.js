// Hand-made streets of the Seoul quarter west of the old centre. Everything here is placed by hand: every
// building, every sign, every planter, lamp and bench. The quarter replaces the generated region inside HAND
// (Region.js keeps its blocks clear of it).
//
// 1. 하늘길: a wide, contemporary shopping street (48 m between the building fronts), running north-south
//    z -130..30, crossed by a pedestrian passage at z -53..-45.
//    x -432..-392  west row: six modern buildings (glass retail podiums, towers of curtain wall / white panels / fins)
//    x -392..-384  west shop frontage (paved, shop entrances)
//    x -384..-358  the 하늘 plaza: stepped seating terraces with ramps and railings, raised tree planters, glass
//                  kiosks, a busking stage, bike docks, information totems
//    x -358..-349  a two-lane local road (one lane each way), curbs, crossings at the ends and at the passage
//    x -349..-341  east sidewalk with street trees in grates
//    x -341..-300  east row: six modern buildings
//    service lanes behind both rows (x -444..-432, -300..-290)
import * as THREE from 'three';
import { Rect } from './CityPlan.js';
import { wallMat, flatMat } from './CityMaterials.js';
import { CURB } from './Streets.js';
import { rooftop, edge, onFace } from './Buildings.js';
import { curtainMat, gridMat, balustradeMat } from './Modern.js';
import { boxSign, channelSign } from '../korea/Signs.js';
import * as SK from './SignKit.js';
import { shopInterior, interiorBatch, buildInteriors } from './ShopInterior.js';
const THEME_OF = { 0: 'store', 1: 'cafe', 2: 'salad', 3: 'pharmacy', 4: 'bank', 5: 'glasses', 6: 'music' };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HAND = { x0: -444, x1: -290, z0: -140, z1: 40 };   // grows as more of the quarter is built by hand

// street cross-section (x) and length (z)
const X = { wBack: -432, wFront: -392, plaza0: -384, plaza1: -358, road0: -358, road1: -349, eFront: -341, eBack: -300 };
const Z = { z0: -130, z1: 30, pass0: -53, pass1: -45 };
const PX = (X.plaza0 + X.plaza1) / 2;   // plaza centre line, -371

// ------------------------------------------------------------------ materials / textures
const cache = new Map();
function tex(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; cache.set(key, t); return t;
}
const FONT = '"WenQuanYi Zen Hei", "Noto Sans KR", sans-serif';
// large-format light granite slabs (1.2 x 0.6 m) with a darker band every 4.8 m; tile = 4.8 m
const paveTex = () => tex('hs_pave2', 512, 512, (g, W, H) => {
  g.fillStyle = '#9a9894'; g.fillRect(0, 0, W, H);
  const bw = 128, bh = 64;
  for (let y = 0; y < H; y += bh) for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < W; x += bw) { const v = 192 + Math.random() * 20; g.fillStyle = `rgb(${v},${v - 2},${v - 5})`; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); }
  g.fillStyle = '#7e7c78'; g.fillRect(0, H - 22, W, 22);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
});
// a full-colour LED screen ad (products only, no people)
export function ledTex(kind) {
  return tex(`hs_led${kind}`, 512, 384, (g, W, H) => {
    const ads = {
      serum: () => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f6d8e0'); gr.addColorStop(1, '#c87890'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 6 + Math.random() * 30, 0, 7); g.fill(); }
        g.fillStyle = '#fff6f0'; g.fillRect(300, 80, 70, 220); g.fillStyle = '#d8a0b0'; g.fillRect(300, 60, 70, 30); g.fillStyle = '#b05070'; g.fillRect(318, 150, 34, 90);
        g.fillStyle = '#5a1a30'; g.font = `bold 48px ${FONT}`; g.fillText('촉촉한 봄', 40, 140); g.font = `24px ${FONT}`; g.fillText('하루 세럼 · 신제품', 44, 190); g.font = `bold 30px ${FONT}`; g.fillText('HARU', 44, 320); },
      shoes: () => { g.fillStyle = '#101418'; g.fillRect(0, 0, W, H); const gr = g.createRadialGradient(330, 220, 10, 330, 220, 260); gr.addColorStop(0, '#2a6a9a'); gr.addColorStop(1, '#101418'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = '#f0f0f0'; g.beginPath(); g.moveTo(200, 260); g.quadraticCurveTo(260, 180, 360, 200); g.lineTo(460, 230); g.quadraticCurveTo(470, 270, 440, 280); g.lineTo(210, 285); g.closePath(); g.fill(); g.fillStyle = '#e04020'; g.fillRect(230, 270, 210, 12);
        g.fillStyle = '#ffffff'; g.font = `bold 54px ${FONT}`; g.fillText('RUN SEOUL', 30, 90); g.font = `22px ${FONT}`; g.fillText('모노 스포츠 · 새 시즌', 34, 130); },
      tea: () => { g.fillStyle = '#e8eed8'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a7a3a'; for (let i = 0; i < 9; i++) { g.save(); g.translate(60 + i * 50, 300 - (i % 3) * 30); g.rotate(i); g.beginPath(); g.ellipse(0, 0, 30, 12, 0, 0, 7); g.fill(); g.restore(); }
        g.fillStyle = '#2a4a2a'; g.font = `bold 50px ${FONT}`; g.fillText('제주 녹차 크림', 30, 90); g.font = `24px ${FONT}`; g.fillText('그린 리프 · 자연에서 온 보습', 34, 132); g.fillStyle = '#ffffff'; g.fillRect(360, 150, 110, 110); g.fillStyle = '#4a7a3a'; g.fillRect(360, 150, 110, 30); },
      tour: () => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a3a6a'); gr.addColorStop(1, '#0a1a3a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd040'; g.font = `bold 46px ${FONT}`; g.fillText('WELCOME TO', 30, 90); g.fillText('SEOUL', 30, 150); g.fillStyle = '#ffffff'; g.font = `24px ${FONT}`; g.fillText('면세 · TAX FREE · 스카이몰', 34, 200);
        g.fillStyle = 'rgba(255,255,255,0.8)'; for (let x = 0; x < W; x += 24) { const h = 40 + Math.abs(Math.sin(x * 0.07)) * 90 + (x % 72 === 0 ? 50 : 0); g.fillRect(x, H - h, 20, h); } },
      music: () => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#2a0a4a'); gr.addColorStop(1, '#a01a6a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${120 + Math.random() * 120},220,${0.2 + Math.random() * 0.4})`; const x = i * 13; const h = 30 + Math.abs(Math.sin(i * 0.6)) * 160; g.fillRect(x, H - h, 9, h); }
        g.fillStyle = '#ffffff'; g.font = `bold 52px ${FONT}`; g.fillText('LIVE TONIGHT', 30, 90); g.font = `26px ${FONT}`; g.fillText('K-뮤직 홀 · 7PM 공연', 34, 136); },
      cinema: () => { g.fillStyle = '#0a0c10'; g.fillRect(0, 0, W, H); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#d86a1a'); gr.addColorStop(1, '#3a1a0a'); g.fillStyle = gr; g.fillRect(260, 0, 252, H);
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(260, H); g.lineTo(380, 150); g.lineTo(512, H); g.fill();
        g.fillStyle = '#ffffff'; g.font = `bold 44px ${FONT}`; g.fillText('마지막 항구', 24, 100); g.font = `22px ${FONT}`; g.fillText('모션 시네마 · 절찬 상영중', 26, 140); g.fillStyle = '#d8a040'; g.fillText('IMAX · 4DX', 26, 330); },
    };
    ads[kind]();
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);   // LED pixel rows
  });
}
const M = {};
// the street's light granite paving, shared with the rest of the quarter (plazas, pedestrian streets)
export function lightPave() { return mats().pave; }
function mats() {
  if (M.pave) return M;
  M.pave = new THREE.MeshStandardMaterial({ map: paveTex(), roughness: 0.7 }); M.pave.userData.uM = 4.8; M.pave.userData.vM = 4.8;
  M.asph = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.92 });
  M.clear = new THREE.MeshStandardMaterial({ color: 0xdfeaf0, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.3, depthWrite: false, envMapIntensity: 1.4 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x34444e, roughness: 0.05, metalness: 0.65, envMapIntensity: 1.3 });
  M.mullion = flatMat(0x2a2c2e, { roughness: 0.35, metalness: 0.7, key: 'hs_mull' });
  M.alu = flatMat(0xc8ccd0, { roughness: 0.35, metalness: 0.7, key: 'hs_alu' });
  M.white = flatMat(0xeceae6, { roughness: 0.45, key: 'hs_white' });
  M.black = flatMat(0x16171a, { roughness: 0.45, key: 'hs_black' });
  M.steel = flatMat(0x6a6e72, { roughness: 0.4, metalness: 0.6, key: 'hs_steel' });
  M.pole = flatMat(0x3c6a9a, { roughness: 0.4, metalness: 0.5, key: 'hs_pole' });   // the street's blue lamp poles
  M.conc = wallMat('concrete', 0xc4c2bc);
  M.granite = flatMat(0x8e8c88, { roughness: 0.6, key: 'hs_gran' });
  M.soil = flatMat(0x3a2e24, { roughness: 1, key: 'hs_soil' });
  M.trunk = flatMat(0x4a3c30, { roughness: 0.95, key: 'hs_trunk' });
  M.leaf = new THREE.MeshStandardMaterial({ color: 0x5a7e3a, roughness: 0.9, flatShading: true });
  M.leaf2 = new THREE.MeshStandardMaterial({ color: 0x4a6e34, roughness: 0.9, flatShading: true });
  M.lampHead = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, emissive: 0xfff2d8, emissiveIntensity: 0.9 });
  M.wood = flatMat(0x9a7450, { roughness: 0.75, key: 'hs_wood' });
  M.rail = balustradeMat();
  M.paint = new THREE.MeshBasicMaterial({ color: 0xe8e6e0 }); M.yellow = new THREE.MeshBasicMaterial({ color: 0xe0b020 });
  return M;
}
function ledScreen(ctx, kind, w, h, x, y, z, rotY) {
  const g = new THREE.Group(); const t = ledTex(kind);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.3), M.black); frame.position.z = 0.15; g.add(frame);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.z = 0.31; g.add(scr);
  g.position.set(x, y, z); g.rotation.y = rotY; ctx.scene.add(g); ctx.own(g); return g;
}

// ------------------------------------------------------------------ one modern building, fully specified
// b: { name, z0, z1, front: [nx, 0], x0, x1,
//      podium: height of the glass retail podium (ground floor 5.5 m + upper retail), shops: [{ w, type, ch: [text, colour] }],
//      tower: { floors, setback (m back from the front), skin: 'curtain' | 'grid' | 'fins', glass, frame, fins },
//      brand: { text, color, h } on the podium fascia, crown: [text, colour] letters on the roof, led: { kind, w, h, y } on the front }
const GF = 5.5, FH = 3.8;
function modernBuilding(ctx, b) {
  const m = mats(), B = ctx.batch, w = ctx.world, y0 = CURB, [nx] = b.front, rot = Math.atan2(nx, 0);
  const rect = new Rect(b.x0, b.z0, b.x1, b.z1), T = b.tower, pH = b.podium, tH = T.floors * FH, H = pH + tH;
  const it = ctx.plan.add({ kind: 'building', id: b.name, use: 'shops', zone: 'commercial', rect, y0, h: H, entrances: [] }); ctx.ownBegin(it);
  const e = edge(rect, nx, 0), at = (a, o = 0) => onFace(e, nx, 0, a, o);
  // podium: ground floor is D deep of walk-in shops behind real glass; behind them and above the ground
  // floor the podium is solid (sides / back in light stone)
  const body = wallMat('panel', b.body ?? 0xd8d6d0), D = 11, CH = 4.0, len = e.len;
  const back = nx > 0 ? new Rect(rect.x0, rect.z0, rect.x1 - D, rect.z1) : new Rect(rect.x0 + D, rect.z0, rect.x1, rect.z1);
  B.box(body, back.w, pH, back.d, back.cx, y0 + pH / 2, back.cz);
  it.colliders.push(w.addBox(V(back.x0, y0, back.z0), V(back.x1, y0 + pH, back.z1), { surface: 'concrete', cover: true, walkable: false }));
  const fr = nx > 0 ? new Rect(rect.x1 - D, rect.z0, rect.x1, rect.z1) : new Rect(rect.x0, rect.z0, rect.x0 + D, rect.z1);
  B.box(body, fr.w, pH - CH, fr.d, fr.cx, y0 + CH + (pH - CH) / 2, fr.cz);
  it.colliders.push(w.addBox(V(fr.x0, y0 + CH, fr.z0), V(fr.x1, y0 + pH, fr.z1), { surface: 'concrete', cover: true, walkable: false }));
  for (const zz of [rect.z0 + 0.15, rect.z1 - 0.15]) { B.box(body, D, CH, 0.3, fr.cx, y0 + CH / 2, zz); w.addBoxCentered(V(fr.cx, y0 + CH / 2, zz), V(D, CH, 0.3), { surface: 'concrete', cover: true, walkable: false }); }
  // ground floor shops: each a real interior behind clear glass with a door opening, slim dark piers
  // between them, the shop's own sign on a black fascia
  let a = -len / 2; const total = b.shops.reduce((s, sh) => s + (sh.w ?? 0), 0), free = b.shops.filter((sh) => !sh.w).length;
  const IB = interiorBatch(ctx);
  b.shops.forEach((sh, si) => {
    const sw = sh.w ?? (len - total) / free, c = a + sw / 2;
    const [px, pz] = at(a + 0.15, 0.06); B.box(m.mullion, 0.3, GF, 0.3, px, y0 + GF / 2, pz);
    if (si > 0) { const [wx, wz] = at(a, -D / 2); B.box(body, D, CH, 0.2, wx, y0 + CH / 2, wz); w.addBoxCentered(V(wx, y0 + CH / 2, wz), V(D, CH, 0.2), { surface: 'concrete', cover: true, walkable: false }); }
    // glass with a 2 m door opening, a transom above it
    const du = c + (sh.doorAt ?? 0.22) * sw, d0 = du - 1.0, d1 = du + 1.0;
    for (const [u0, u1] of [[a + 0.3, d0], [d1, a + sw - 0.15]]) { if (u1 - u0 < 0.2) continue; const [gx, gz] = at((u0 + u1) / 2, -0.04);
      B.box(m.clear, 0.03, CH + 0.35, u1 - u0, gx, y0 + (CH + 0.35) / 2, gz, 0, { cast: false });
      const gc = w.addBoxCentered(V(gx, y0 + (CH + 0.35) / 2, gz), V(0.1, CH + 0.35, u1 - u0), { surface: 'glass', cover: false, walkable: false }); if (gc) gc.seeThrough = true; }
    { const [gx, gz] = at(du, -0.04); B.box(m.mullion, 0.08, 0.12, 2.0, gx, y0 + 2.4, gz); B.box(m.clear, 0.03, CH + 0.35 - 2.46, 2.0, gx, y0 + 2.46 + (CH + 0.35 - 2.46) / 2, gz, 0, { cast: false });
      for (const sgn of [-1, 1]) { const [qx, qz] = at(du + sgn * 1.0, -0.04); B.box(m.mullion, 0.08, 2.4, 0.06, qx, y0 + 1.2, qz); } }
    const theme = sh.in ?? THEME_OF[sh.type] ?? 'store';
    const [ix, iz] = at(c, 0); const nm = sh.sign ? sh.sign[1] : sh.ch?.[0] ?? b.name;
    shopInterior(ctx, IB, { fx: ix - nx * 0.06, zc: iz, nx, w: sw - 0.4, D: D - 0.1, y0, h: CH - 0.4, theme, name: sh.inName ?? nm.replace(/\n/g, ' '), color: sh.color ?? (sh.sign?.[2]?.color) ?? '#ffffff', metal: sh.metal ?? (theme === 'pharmacy' || theme === 'bank' ? 'silver' : theme === 'cafe' || theme === 'books' ? 'brass' : 'black'), seed: 11 + si * 31 + Math.round(Math.abs(b.z0) * 7), doorU: du - c });
    const [fx, fz] = at(c, 0.1); B.box(m.black, 0.2, 1.1, sw - 0.3, fx, y0 + GF - 0.55, fz);
    if (sh.sign) { const [kind, ...args] = sh.sign; const sg = SK[kind](...args); const [gx, gz] = at(c, 0.12); sg.position.set(gx, y0 + GF - 0.55, gz); sg.rotation.y = rot; SK.bake(ctx, sg); }
    else if (sh.ch) { const cs = channelSign(sh.ch[0], sh.ch[1], 0.75, { raceway: null, lit: true }); const [gx, gz] = at(c, 0.22); cs.position.set(gx, y0 + GF - 0.55, gz); cs.rotation.y = rot; ctx.scene.add(cs); ctx.own(cs); }
    const [dx, dz] = at(du, 0.6); it.entrances.push({ x: dx, z: dz, nx, nz: 0 });
    a += sw;
  });
  { const [px, pz] = at(len / 2 - 0.15, 0.06); B.box(m.mullion, 0.3, GF, 0.3, px, y0 + GF / 2, pz); }
  // canopy over the shop fronts (thin aluminium blade)
  { const [cx, cz] = at(0, 1.2); B.box(m.alu, 2.4, 0.14, len - 0.4, cx, y0 + GF - 1.25, cz, 0, { cast: true }); }
  // upper retail floors: frameless glass with slim mullions every 3 m, floor lines, lit interiors
  const up = pH - GF;
  if (up > 0.5) {
    const [gx, gz] = at(0, 0.04); B.box(m.glass, 0.06, up - 0.2, len - 0.4, gx, y0 + GF + up / 2, gz);
    for (let u = -len / 2 + 0.2; u <= len / 2 - 0.1; u += 3) { const [mx, mz] = at(u, 0.08); B.box(m.mullion, 0.08, up - 0.2, 0.06, mx, y0 + GF + up / 2, mz); }
    const nf = Math.round(up / 4.4);
    for (let f = 0; f <= nf; f++) { const [mx, mz] = at(0, 0.1); B.box(m.mullion, 0.1, 0.16, len - 0.4, mx, y0 + GF + f * (up / nf), mz); }
    for (let u = -len / 2 + 1.7; u < len / 2 - 1; u += 3) for (let f = 0; f < nf; f++) { const [wx, wz] = at(u, 0.0); ctx.fac.get('commercial').shop(wx, y0 + GF + f * (up / nf) + up / nf / 2, wz, rot, 2.8, up / nf - 0.4, { type: b.upperType ?? 0, lit: 0.6 }); }
  }
  // the podium brand across the upper retail glass
  if (b.brand) { const br = b.brand; const cs = channelSign(br.text, br.color, br.h ?? 2, { raceway: null, lit: true }); const [bx, bz] = at(br.a ?? 0, 0.3); cs.position.set(bx, y0 + pH - (br.h ?? 2) / 2 - 0.6, bz); cs.rotation.y = rot; ctx.scene.add(cs); ctx.own(cs); }
  // tower above the podium, set back from the front
  const sb = T.setback ?? 0, tr = nx > 0 ? new Rect(rect.x0 + (T.backInset ?? 0), rect.z0 + (T.sideInset ?? 0), rect.x1 - sb, rect.z1 - (T.sideInset ?? 0)) : new Rect(rect.x0 + sb, rect.z0 + (T.sideInset ?? 0), rect.x1 - (T.backInset ?? 0), rect.z1 - (T.sideInset ?? 0));
  const skin = T.skin === 'grid' ? gridMat({ frame: T.frame ?? 0xe8e6e0, glass: T.glass ?? 0x46586a, floorH: FH, key: 'hs' })
    : curtainMat({ glass: T.glass ?? 0x4a6474, spandrel: T.spandrel ?? 0x9aa2a8, mullion: T.frame ?? 0xc8ccd0, floorH: FH, spandrelH: 0.8, bays: T.bays ?? 4, key: 'hs' });
  B.box(skin, tr.w, tH, tr.d, tr.cx, y0 + pH + tH / 2, tr.cz);
  B.box(m.white, tr.w - 0.4, 0.06, tr.d - 0.4, tr.cx, y0 + H + 0.03, tr.cz);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const te = edge(tr, sx, sz); B.box(m.alu, sx ? 0.3 : te.len, 1.2, sx ? te.len : 0.3, te.cx - sx * 0.15, y0 + H + 0.6, te.cz - sz * 0.15); }
  it.colliders.push(w.addBox(V(tr.x0, y0 + pH, tr.z0), V(tr.x1, y0 + H, tr.z1), { surface: 'concrete', cover: true, walkable: false }));
  // vertical fins on the tower front
  if (T.skin === 'fins' || T.fins) { const te = edge(tr, nx, 0); const fm = T.finMat === 'wood' ? m.wood : m.alu;
    for (let u = -te.len / 2 + 0.6; u < te.len / 2; u += T.finStep ?? 1.5) { const [fx, fz] = onFace(te, nx, 0, u, 0.35); B.box(fm, 0.7, tH - 0.3, 0.14, fx, y0 + pH + tH / 2, fz); } }
  // a corner band of colour running the height of the tower
  if (T.band) { const te = edge(tr, nx, 0); const [bx, bz] = onFace(te, nx, 0, T.band[1] * (te.len / 2 - 0.9), 0.08); B.box(flatMat(T.band[0], { roughness: 0.4, key: `hsband${T.band[0]}` }), 0.16, tH, 1.6, bx, y0 + pH + tH / 2, bz); }
  // the podium roof: a terrace in front of the setback, glass balustrade, planters
  B.box(m.granite, rect.w - 0.3, 0.06, rect.d - 0.3, rect.cx, y0 + pH + 0.03, rect.cz);
  if (sb > 0) { const [rx, rz] = at(0, -0.15); B.box(m.rail, 0.04, 1.1, len - 0.4, rx, y0 + pH + 0.55, rz); B.box(m.alu, 0.08, 0.06, len - 0.4, rx, y0 + pH + 1.1, rz);
    for (let u = -len / 2 + 3; u < len / 2 - 2; u += 6) { const [px, pz] = at(u, -sb / 2); B.box(m.conc, 1.2, 0.6, 1.8, px, y0 + pH + 0.3, pz); B.add(new THREE.IcosahedronGeometry(0.8, 1).translate(px, y0 + pH + 1.1, pz), m.leaf); } }
  // LED screen on the front of the tower or podium, crown letters on the roof
  if (b.led) { const L = b.led; const [lx, lz] = onFace(edge(L.onPodium ? rect : tr, nx, 0), nx, 0, L.a ?? 0, 0); ledScreen(ctx, L.kind, L.w, L.h, lx, y0 + L.y, lz, rot); }
  if (b.crown) { const cs = channelSign(b.crown[0], b.crown[1], b.crown[2] ?? 2.4, { raceway: '#2a2a2a', lit: true }); const te = edge(tr, nx, 0); const [cx, cz] = onFace(te, nx, 0, 0, -0.6); cs.position.set(cx, y0 + H + 1.2 + (b.crown[2] ?? 2.4) / 2, cz); cs.rotation.y = rot; ctx.scene.add(cs); ctx.own(cs); }
  // the building's other signs, placed one by one: [kind, args, a (along the front, m from centre), y (m above ground), out (m off the wall), on ('podium' | 'tower')]
  for (const [kind, args, aa, yy, out = 0, on = 'podium'] of b.extra ?? []) {
    const sg = SK[kind](...args), fe = on === 'tower' ? edge(tr, nx, 0) : e, [sx, sz] = onFace(fe, nx, 0, aa, out);
    sg.position.set(sx, y0 + (yy === 'top' ? (on === 'tower' ? H : pH) : yy), sz); sg.rotation.y = rot; SK.bake(ctx, sg);
    if (sg.userData.spin) (ctx.spinners ??= []).push(sg.userData.spin);
    if (out > 0.5 && yy < 0.5) w.addBoxCentered(V(sx, y0 + 0.6, sz), V(0.7, 1.2, 0.7), { surface: 'metal', walkable: false });
  }
  rooftop(ctx, new Rect(tr.x0 + 2, tr.z0 + 2, tr.x1 - 2, tr.z1 - 2), y0 + H, [-nx, 0], { units: 3, tank: false });
  // the back (service lane): plain service doors
  { const be = edge(rect, -nx, 0); for (let u = -be.len / 2 + 4; u < be.len / 2 - 2; u += 9) { const [dx, dz] = onFace(be, -nx, 0, u, 0.03); B.box(m.steel, 0.06, 2.2, 1.2, dx, y0 + 1.1, dz); } }
  ctx.ownEnd(); return it;
}

// ------------------------------------------------------------------ 1. 하늘길: the buildings (one by one)
// Signs per shop: ['channel' | 'flex' | 'scashi' | 'metal' | 'neon' | 'wood', text, options] (SignKit.js), on the fascia.
// extra: the building's other signs, each placed by hand: [kind, [args], a, y, out, on]
const W_ROW = [
  { name: '스카이몰 하늘점', z0: -130, z1: -100, podium: 11, body: 0xd0d4d8, upperType: 0,
    shops: [{ in: 'fashion', w: 12, type: 0, sign: ['channel', 'SKYMALL', { color: '#ffffff', h: 0.85, light: 'front' }] }, { in: 'cafe', type: 1, sign: ['channel', '블루보틀 하우스', { color: '#9ad0ff', h: 0.7, light: 'halo', returns: '#1a2a3a' }] }],
    tower: { floors: 15, setback: 5, skin: 'curtain', glass: 0x3e6a8a, spandrel: 0x6a8aa0, frame: 0xd0d8e0, bays: 5, band: [0x2a7ab8, -1] },
    brand: { text: '스카이몰', color: '#7ac8ff', h: 2.4 }, crown: ['SKYMALL', '#7ac8ff', 3], led: { kind: 'tour', w: 12, h: 8, y: 22, a: 2 },
    extra: [['point', ['SKY\nMALL', { shape: 'cube', bg: '#1a4a7a', fg: '#ffffff', size: 0.9 }], 14.4, 3.4],
            ['stand', ['스카이몰', { sub: 'B1 푸드홀 · 1F 뷰티 · 2F 패션', bg: '#1a4a7a', fg: '#ffffff' }], -9, 0, 2.4],
            ['xBanner', ['겨울 정기 세일', { sub: '최대 50%', accent: '#2a7ab8' }], 3, 0, 1.6]] },
  { name: '코너스톤 뷰티', z0: -100, z1: -76, podium: 10, body: 0xeeece8,
    shops: [{ in: 'cosmetics', w: 12, type: 0, sign: ['scashi', 'CORNERSTONE', { color: '#2a2a2a', panel: '#f4f2ee', h: 0.6, font: 'serif', lamps: 4, w: 10.5 }] }, { in: 'glasses', type: 5, sign: ['flex', '렌즈 스튜디오', { sub: '콘택트렌즈 · 안경', bg: '#ffffff', fg: '#1a3a6a', accent: '#2a7ab8', w: 9, h: 1.0 }] }],
    tower: { floors: 6, setback: 0, skin: 'grid', frame: 0xf0eeea, glass: 0x3e4e5a, fins: true, finStep: 1.2 },
    brand: { text: 'CORNERSTONE', color: '#c8a060', h: 1.6 },
    extra: [['aFrame', ['오늘의 추천', { sub: '수분 크림 1+1', bg: '#2a2c2e', fg: '#f4ecd8', chalk: true }], 5, 0, 1.4],
            ['blade', ['하늘피부과', { bg: '#f4f2ee', fg: '#6a3a8a', w: 0.7 }], -11.4, 7.6]] },
  { name: '모노 스포츠 플래그십', z0: -76, z1: -53, podium: 10, body: 0x2a2c30,
    shops: [{ in: 'sports', type: 0, sign: ['channel', 'MONO SPORTS', { color: '#ffffff', h: 0.8, light: 'side' }] }],
    tower: { floors: 8, setback: 3, skin: 'curtain', glass: 0x22282e, spandrel: 0x1a1c1e, frame: 0x3a3e42, bays: 3 },
    brand: { text: 'MONO', color: '#ffffff', h: 3 }, led: { kind: 'shoes', w: 9, h: 6.5, y: 15, onPodium: false },
    extra: [['blade', ['필라테스 MOVE', { bg: '#101010', fg: '#ff5a3a', w: 0.75 }], 10.9, 13.5, 0, 'tower'],
            ['xBanner', ['RUN SEOUL 2026', { sub: '러닝화 신상', accent: '#ff5a3a', bg: '#101418', fg: '#ffffff' }], -6, 0, 1.6]] },
  { name: '하루 코스메틱', z0: -45, z1: -20, podium: 10, body: 0xe6e0d8,
    shops: [{ in: 'cosmetics', w: 14, type: 0, sign: ['metal', 'HARU', { kind: 'brass', h: 0.9, light: '#fff0c8', sub: 'COSMETICS' }] }, { in: 'pharmacy', type: 3, sign: ['flex', '하늘약국', { bg: '#1e8a4a', fg: '#ffffff', w: 8, h: 1.0, logo: '약' }] }],
    tower: { floors: 5, setback: 4, skin: 'grid', frame: 0xd8d0c4, glass: 0x4a5a66 },
    brand: { text: '하루 코스메틱', color: '#5ab8d8', h: 2 }, led: { kind: 'serum', w: 8, h: 6, y: 1.5 + GF, onPodium: true, a: -4 },
    extra: [['point', ['약', { shape: 'round', bg: '#1e8a4a', fg: '#ffffff', size: 0.8 }], -12.1, 3.6],
            ['stand', ['하늘약국', { sub: '감기약 · 영양제 · 연중무휴', bg: '#ffffff', fg: '#1e8a4a' }], -9, 0, 1.4]] },
  { name: 'K-뮤직 홀', z0: -20, z1: 6, podium: 11, body: 0x3a3440,
    shops: [{ in: 'music', w: 12, type: 6, sign: ['neon', 'K-Music Hall', { color: '#ff4ad8', h: 1.0 }] }, { in: 'cafe', type: 1, sign: ['wood', '카페 온도', { font: 'serif', tone: '#6a4a2e', sub: 'COFFEE & BAKERY', h: 0.75 }] }],
    tower: { floors: 10, setback: 0, skin: 'fins', glass: 0x3a3a4e, spandrel: 0x2a2a34, frame: 0x4a4a58, finStep: 1.8 },
    led: { kind: 'music', w: 10, h: 7.5, y: 20 }, crown: ['K-MUSIC', '#ff7ad8', 2.4],
    extra: [['awning', ['카페 온도', { w: 6, depth: 1.5, color: '#1e3a2e', ink: '#f0e6d0', sub: 'since 2019' }], -6.5, 4.1],
            ['aFrame', ['오늘의 원두', { sub: '에티오피아 예가체프', bg: '#1e3a2e', fg: '#f0e6d0', chalk: true }], -4.5, 0, 2.2],
            ['blade', ['연습실 대관', { bg: '#2a0a4a', fg: '#ff9ae8', w: 0.7 }], 12.6, 7.2],
            ['xBanner', ['LIVE TONIGHT', { sub: '7PM 공연', accent: '#ff4ad8', bg: '#1a1020', fg: '#ffffff' }], 4, 0, 1.8]] },
  { name: '온도 로스터리', z0: 6, z1: 30, podium: 6, body: 0xf0ede6,
    shops: [{ in: 'cafe', w: 13, type: 1, sign: ['scashi', 'ONDO ROASTERY', { color: '#3a2a1a', panel: null, h: 0.7, font: 'serif', lamps: 3, w: 10 }] }, { in: 'books', type: 5, sign: ['wood', '북스 하늘', { tone: '#a07a50', ink: '#2a1a10', font: 'serif', sub: 'BOOKS & TEA', h: 0.7 }] }],
    tower: { floors: 4, setback: 4, skin: 'fins', finMat: 'wood', glass: 0x4a5660, spandrel: 0xe8e4dc, frame: 0xe8e4dc, finStep: 1.0 },
    extra: [['awning', ['ONDO', { w: 11, depth: 1.8, drop: 0.7, stripes: ['#f4f0e6', '#2a2a2a'], ink: '#ffffff', sub: 'ONDO ROASTERY · 커피 볶는 집' }], 5.2, 4.0],
            ['point', ['BOOKS', { shape: 'square', bg: '#f4ecd8', fg: '#2a1a10', size: 0.7 }], -11.6, 3.6],
            ['aFrame', ['북스 하늘', { sub: '이달의 책 · 신간 입고', bg: '#f4ecd8', fg: '#2a1a10' }], -7, 0, 1.4]] },
];
const E_ROW = [
  { name: '한빛 타워', z0: -130, z1: -98, podium: 11, body: 0xb8c0c4,
    shops: [{ in: 'fashion', w: 16, type: 0, sign: ['channel', 'HANBIT GALLERIA', { color: '#d8b060', h: 0.8, light: 'halo', returns: '#2a2418', font: 'serif' }] }, { in: 'bank', type: 4, sign: ['flex', '하늘은행', { sub: 'HANEUL BANK', bg: '#1a5aa8', fg: '#ffffff', w: 9, h: 1.1, logo: '하' }] }],
    tower: { floors: 17, setback: 4, sideInset: 2, skin: 'curtain', glass: 0x4a6a64, spandrel: 0x7a8a86, frame: 0xc0c8c4, bays: 4 },
    brand: { text: '한빛 갤러리아', color: '#d8b060', h: 2.2 }, crown: ['HANBIT', '#d8b060', 3.2],
    extra: [['pylon', ['한빛 타워', [['한빛 갤러리아', '#2a2418', '#d8b060'], ['하늘은행', '#1a5aa8', '#ffffff'], ['한빛 치과', '#ffffff', '#1a6a8a'], ['서울 영어', '#c8141a', '#ffffff'], ['한빛 내과', '#ffffff', '#2a6a3a']], { h: 6.5 }], 13, 0, 5.2],
            ['point', ['ATM', { shape: 'square', bg: '#1a5aa8', fg: '#ffffff', size: 0.7 }], -15.6, 3.6]] },
  { name: '보라 뷰티', z0: -98, z1: -74, podium: 10, body: 0xe8e0ea,
    shops: [{ in: 'cosmetics', type: 0, sign: ['neon', 'bora beauty', { color: '#c060ff', h: 1.0 }] }],
    tower: { floors: 7, setback: 0, skin: 'grid', frame: 0xdcd8e0, glass: 0x48506a, fins: true, finStep: 2.4 },
    brand: { text: 'BORA', color: '#c070e8', h: 2.6 },
    extra: [['point', ['BORA', { shape: 'round', bg: '#f4eaf8', fg: '#8a3ab8', size: 0.8 }], 11.6, 3.6],
            ['hologram', ['BORA', { color: '#d07aff' }], -6, 0, 1.6],
            ['blade', ['네일 · 속눈썹', { bg: '#f4eaf8', fg: '#8a3ab8', w: 0.65 }], -11.6, 7.0]] },
  { name: '블랙 스완', z0: -74, z1: -53, podium: 10, body: 0x18181a,
    shops: [{ in: 'fashion', type: 0, sign: ['metal', 'BLACK SWAN', { kind: 'black', h: 0.8, light: '#e8c070', font: 'serif' }] }],
    tower: { floors: 9, setback: 2, skin: 'curtain', glass: 0x1e2226, spandrel: 0x121416, frame: 0x8a7a50, bays: 3 },
    brand: { text: '블랙 스완', color: '#d8b060', h: 2 },
    extra: [['metal', ['BLACK SWAN', { kind: 'corten', h: 1.0, w: 4.2, light: '#ffcf80', vertical: true }], -10.2, 7.5],
            ['stand', ['BLACK SWAN', { sub: 'LOUNGE · 2F', bg: '#18181a', fg: '#d8b060' }], 4, 0, 1.4]] },
  { name: '그린 리프', z0: -45, z1: -22, podium: 10, body: 0xdedad0,
    shops: [{ in: 'cosmetics', w: 12, type: 0, sign: ['wood', 'GREEN LEAF', { tone: '#4a6a3a', ink: '#f4f0e0', font: 'sans', h: 0.7 }] }, { in: 'salad', type: 2, sign: ['flex', '샐러드 하우스', { sub: 'SALAD · BOWL', bg: '#f4f8ec', fg: '#3a6a2a', accent: '#8ab84a', w: 8.5, h: 1.0, border: '#8ab84a' }] }],
    tower: { floors: 6, setback: 3, skin: 'fins', finMat: 'wood', glass: 0x46564a, spandrel: 0xdedad0, frame: 0xdedad0, finStep: 1.2 },
    led: { kind: 'tea', w: 7, h: 5, y: 1.5 + GF, onPodium: true, a: 3 },
    extra: [['awning', ['샐러드 하우스', { w: 7.5, depth: 1.4, color: '#5a8a3a', ink: '#ffffff', shape: 'dome', sub: '오늘의 샐러드' }], -6.8, 4.2],
            ['aFrame', ['런치 세트', { sub: '샐러드 + 수프 9,900원', bg: '#f4f8ec', fg: '#3a6a2a' }], -5, 0, 2.3]] },
  { name: '올리브 하우스', z0: -22, z1: 4, podium: 10, body: 0xeeeeea,
    shops: [{ in: 'pharmacy', w: 14, type: 3, sign: ['flex', '올리브 하우스', { sub: 'HEALTH & BEAUTY', bg: '#ffffff', fg: '#5a8a1a', w: 12, h: 1.1 }] }, { in: 'glasses', type: 5, sign: ['flex', '밝은안경', { bg: '#1a2a4a', fg: '#ffffff', w: 8, h: 1.0, bulbs: true }] }],
    tower: { floors: 8, setback: 0, skin: 'grid', frame: 0xf2f2ee, glass: 0x405060 },
    brand: { text: 'OLIVE HOUSE', color: '#6a9a1a', h: 1.8 },
    extra: [['roofBoard', ['올리브 하우스', { sub: 'HEALTH & BEAUTY', bg: '#ffffff', fg: '#5a8a1a', w: 16, h: 3.6 }], 0, 'top', -2, 'tower'],
            ['point', ['안경', { shape: 'round', bg: '#1a2a4a', fg: '#ffffff', size: 0.75 }], -12.6, 3.6],
            ['blade', ['서울 수학학원', { bg: '#1d3f8a', fg: '#ffffff', w: 0.7 }], 12.6, 7.8]] },
  { name: '모션 시네마', z0: 4, z1: 30, podium: 12, body: 0x26282c,
    shops: [{ in: 'cinema', w: 14, type: 0, sign: ['channel', 'MOTION CINEMA', { color: '#ffb040', h: 0.9, light: 'front', raceway: '#1a1a1a' }] }, { in: 'cafe', type: 1, sign: ['flex', '팝콘 팩토리', { bg: '#f4d040', fg: '#c8261c', w: 8, h: 1.0, bulbs: true, font: 'sans' }] }],
    tower: { floors: 11, setback: 0, skin: 'curtain', glass: 0x2a3640, spandrel: 0x1c2024, frame: 0x50565c, bays: 4, band: [0xd8801a, 1] },
    led: { kind: 'cinema', w: 11, h: 8, y: 26 }, crown: ['MOTION', '#ffb040', 2.6],
    extra: [['blade', ['MOTION CINEMA', { bg: '#1a1a1a', fg: '#ffb040', w: 0.9, h: 6.5 }], 12.6, 8.5],
            ['stand', ['상영 시간표', { sub: '마지막 항구 · 14:20 16:50 19:30', bg: '#1a1a1a', fg: '#ffb040' }], 6, 0, 1.4],
            ['xBanner', ['마지막 항구', { sub: '절찬 상영중', accent: '#d86a1a', bg: '#0a0c10', fg: '#ffffff' }], 2, 0, 1.6],
            ['hologram', ['4DX', { color: '#ffb040' }], -3, 0, 1.6]] },
];

// ------------------------------------------------------------------ street furniture (each placed by hand below)
function tree(B, m, x, z, y = CURB, s = 1) {
  B.add(new THREE.CylinderGeometry(0.13 * s, 0.18 * s, 3.6 * s, 7).translate(x, y + 1.8 * s, z), m.trunk);
  for (const [dx, dy, dz, r, mm] of [[0, 4.6, 0, 1.9, m.leaf], [1.1, 4.1, 0.5, 1.3, m.leaf2], [-1.0, 4.2, -0.6, 1.4, m.leaf], [0.3, 5.5, -0.2, 1.3, m.leaf2], [-0.4, 4.0, 1.0, 1.1, m.leaf2]]) B.add(new THREE.IcosahedronGeometry(r * s, 1).translate(x + dx * s, y + dy * s, z + dz * s), mm);
}
export function buildHandStreets(ctx) {
  const m = mats(), B = ctx.batch, plan = ctx.plan, w = ctx.world, y = CURB;
  const box = (mat, sx, sy, sz, x, yy, z, col) => { B.box(mat, sx, sy, sz, x, yy, z); if (col) w.addBoxCentered(V(x, yy, z), V(sx, sy, sz), { surface: col, cover: sy > 0.8, walkable: false }); };
  // ---- land, walks, road surface
  plan.block(new Rect(HAND.x0, HAND.z0, HAND.x1, HAND.z1), 'commercial', '하늘길');
  plan.walk(new Rect(X.wFront, Z.z0, X.plaza1, Z.z1), 'plaza');
  plan.walk(new Rect(X.road1, Z.z0, X.eFront, Z.z1), 'sidewalk');
  plan.walk(new Rect(HAND.x0, HAND.z0, HAND.x1, Z.z0), 'sidewalk'); plan.walk(new Rect(HAND.x0, Z.z1, HAND.x1, HAND.z1), 'sidewalk');
  plan.walk(new Rect(X.wBack, Z.pass0, X.wFront, Z.pass1), 'path'); plan.walk(new Rect(X.eFront, Z.pass0, X.eBack, Z.pass1), 'path');
  plan.walk(new Rect(HAND.x0, Z.z0, X.wBack, Z.z1), 'path'); plan.walk(new Rect(X.eBack, Z.z0, HAND.x1, Z.z1), 'path');
  const L = HAND.z1 - HAND.z0, cz = (HAND.z0 + HAND.z1) / 2;
  B.box(m.pave, X.road0 - HAND.x0, 0.02, L, (HAND.x0 + X.road0) / 2, y + 0.01, cz, 0, { cast: false });
  B.box(m.pave, HAND.x1 - X.road1, 0.02, L, (X.road1 + HAND.x1) / 2, y + 0.01, cz, 0, { cast: false });
  B.box(m.asph, X.road1 - X.road0, 0.02, L, (X.road0 + X.road1) / 2, y + 0.005, cz, 0, { cast: false });
  // curbs (granite, 15 cm), broken at the crossings
  for (const x of [X.road0 + 0.15, X.road1 - 0.15]) for (const [a, b] of [[HAND.z0, Z.z0 - 4], [Z.z0 + 4, Z.pass0 - 1], [Z.pass1 + 1, Z.z1 - 4], [Z.z1 + 4, HAND.z1]]) B.box(m.granite, 0.3, 0.15, b - a, x, y + 0.075, (a + b) / 2);
  // road paint: centre line (double yellow), crossings (zebra) at both ends and at the passage
  for (const dx of [-0.12, 0.12]) B.box(m.yellow, 0.1, 0.01, L - 2, (X.road0 + X.road1) / 2 + dx, y + 0.025, cz, 0, { cast: false });
  for (const zc of [Z.z0, (Z.pass0 + Z.pass1) / 2, Z.z1]) for (let x = X.road0 + 0.7; x < X.road1 - 0.4; x += 1.0) B.box(m.paint, 0.5, 0.01, 4, x, y + 0.03, zc, 0, { cast: false });
  // ---- the two rows of buildings
  for (const b of W_ROW) modernBuilding(ctx, { ...b, x0: X.wBack, x1: X.wFront, front: [1, 0] });
  for (const b of E_ROW) modernBuilding(ctx, { ...b, x0: X.eFront, x1: X.eBack, front: [-1, 0] });
  // the pedestrian passage between the rows' halves: a glass bridge at the third floor on the west side
  box(m.glass, X.wFront - X.wBack - 2, 3.2, Z.pass1 - Z.pass0, (X.wBack + X.wFront) / 2 - 1, y + 13.6, (Z.pass0 + Z.pass1) / 2);
  box(m.alu, X.wFront - X.wBack - 2, 0.5, Z.pass1 - Z.pass0 + 0.2, (X.wBack + X.wFront) / 2 - 1, y + 11.75, (Z.pass0 + Z.pass1) / 2);

  // ---- 하늘 plaza (x -384..-358), from south to north
  // a) south entrance: the street sign wall, an abstract steel ring sculpture, information totem
  { const s = boxSign('하늘길', 'HANEUL-GIL', ['#1a4a7a', '#ffffff', '#7ac8ff'], 5.5, 1.3, { lit: true });
    box(m.conc, 6.2, 1.0, 0.6, PX - 6, y + 0.5, Z.z0 + 3, 'concrete'); s.position.set(PX - 6, y + 1.65, Z.z0 + 3); s.rotation.y = Math.PI; ctx.scene.add(s);
    const ring = new THREE.TorusGeometry(2.4, 0.22, 10, 40); ring.rotateY(0.5); B.add(ring.translate(PX + 5, y + 2.9, Z.z0 + 6), m.alu); box(m.granite, 1.6, 0.4, 1.6, PX + 5, y + 0.2, Z.z0 + 6, 'concrete'); }
  const totem = (x, z, rotY) => { box(m.black, 0.9, 2.4, 0.35, x, y + 1.2, z, 'metal'); const t = boxSign('하늘길 안내', 'MAP · 지도 · 地图', ['#1a4a7a', '#ffffff', '#7ac8ff'], 0.8, 1.6, { lit: true }); t.position.set(x, y + 1.4, z); t.rotation.y = rotY; ctx.scene.add(t); };
  totem(PX + 9, Z.z0 + 10, Math.PI); totem(PX - 9, Z.z1 - 4, 0);
  // b) stepped terrace A (z -112..-90): three seating tiers rising toward the shops, a ramp on the road side,
  //    glass railings on the top, trees in the top tier
  const terrace = (z0, z1, dir) => {   // dir: +1 tiers rise toward the west shops, -1 toward the road
    const xs = dir > 0 ? [X.plaza0 + 2, X.plaza0 + 6, X.plaza0 + 10] : [X.plaza1 - 6, X.plaza1 - 10, X.plaza1 - 14];
    const d = z1 - z0, zc = (z0 + z1) / 2;
    for (let i = 0; i < 3; i++) { const h = 0.45 * (3 - i), x = (dir > 0 ? X.plaza0 + 2 + i * 3 : X.plaza1 - 7 - i * 3) + 1.5; box(m.conc, 3, h, d, x, y + h / 2, zc, 'concrete'); B.box(m.wood, 3, 0.05, d - 0.2, x, y + h + 0.02, zc); }
    // top: a raised planter with two trees and a glass rail on the open side
    const topX = dir > 0 ? X.plaza0 + 3.5 : X.plaza1 - 5.5; tree(B, m, topX, z0 + d * 0.3, y + 1.35, 0.9); tree(B, m, topX, z1 - d * 0.3, y + 1.35, 0.9);
    for (const zz of [z0 + 0.1, z1 - 0.1]) { B.box(m.rail, 9, 1.0, 0.04, (dir > 0 ? X.plaza0 + 6.5 : X.plaza1 - 11.5), y + 1.35 + 0.5, zz); B.box(m.alu, 9, 0.06, 0.08, (dir > 0 ? X.plaza0 + 6.5 : X.plaza1 - 11.5), y + 1.85, zz); }
    // ramp beside the tiers (1:12), with a steel handrail
    const rx = dir > 0 ? X.plaza0 + 12.5 : X.plaza1 - 18.5; const ramp = new THREE.BoxGeometry(2.2, 0.2, d - 2); ramp.rotateX(Math.atan2(1.35, d - 2) * -dir); B.add(ramp.translate(rx, y + 0.68, zc), m.conc);
    for (const dx of [-1.15, 1.15]) { const r = new THREE.CylinderGeometry(0.035, 0.035, d - 2, 6); r.rotateX(Math.PI / 2 - Math.atan2(1.35, d - 2) * dir); B.add(r.translate(rx + dx, y + 1.6, zc), m.steel); }
    w.addBoxCentered(V(rx, y + 0.4, zc), V(2.4, 0.8, d - 2), { surface: 'concrete', cover: false, walkable: false });
  };
  terrace(-112, -92, 1);
  // c) the grove (z -88..-60): three raised planters with trees, long timber benches on their edges
  const bigPlanter = (x, z, len, n) => { box(m.conc, 4, 0.6, len, x, y + 0.3, z, 'concrete'); B.box(m.soil, 3.6, 0.04, len - 0.4, x, y + 0.61, z);
    for (let i = 0; i < n; i++) tree(B, m, x, z - len / 2 + len * (i + 0.5) / n, y + 0.6, 1.05);
    for (const s of [-1, 1]) B.box(m.wood, 0.5, 0.06, len - 0.6, x + s * 2.2, y + 0.63, z); };
  bigPlanter(PX - 4, -80, 12, 2); bigPlanter(PX + 5, -68, 10, 2); bigPlanter(PX - 4, -62, 4, 1);
  // d) a glass coffee kiosk at the passage
  const kiosk = (x, z, name, sub, cols) => { box(m.glass, 4.2, 3.0, 3.2, x, y + 1.5, z, 'glass'); box(m.white, 4.6, 0.3, 3.6, x, y + 3.15, z);
    ctx.fac.get('commercial').shop(x + 2.12, y + 1.4, z, Math.PI / 2, 3.0, 2.4, { type: 1, lit: 1 });
    const s = boxSign(name, sub, cols, 3.6, 0.5, { lit: true }); s.position.set(x + 2.35, y + 3.0, z); s.rotation.y = Math.PI / 2; ctx.scene.add(s); };
  kiosk(PX - 6, -57, '하늘 커피', 'COFFEE · TAKE OUT', ['#2a2a2e', '#f0e6d0', '#d8b080']);
  // passage (z -53..-45): open, flush, bollards on the road edge (crossing)
  for (let z = Z.pass0 - 1; z <= Z.pass1 + 1; z += 1.6) for (const x of [X.road0 - 0.4, X.road1 + 0.4]) { B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.85, 10).translate(x, y + 0.42, z), m.steel); w.addBoxCentered(V(x, y + 0.42, z), V(0.2, 0.85, 0.2), { surface: 'metal', walkable: false }); }
  // e) stepped terrace B (z -42..-22), rising toward the road, and the busking stage in front of it
  terrace(-42, -22, -1);
  { const st = new THREE.CylinderGeometry(3, 3, 0.35, 32); B.add(st.translate(X.plaza0 + 4.5, y + 0.18, -32), m.granite); w.addBoxCentered(V(X.plaza0 + 4.5, y + 0.18, -32), V(4.2, 0.35, 4.2), { surface: 'concrete', walkable: false });
    box(m.black, 0.6, 1.0, 0.5, X.plaza0 + 3.2, y + 0.85, -33, 'metal'); box(m.black, 0.6, 1.0, 0.5, X.plaza0 + 3.2, y + 0.85, -31, 'metal'); }   // speakers
  // f) north grove (z -18..4): planters and benches, bike-share docks along the road edge
  bigPlanter(PX + 4, -10, 14, 2); bigPlanter(PX - 6, -2, 8, 1);
  { const bikeMat = flatMat(0x2a9a4a, { roughness: 0.5, key: 'hs_bike' });
    for (let i = 0; i < 8; i++) { const z = 8 + i * 1.0; box(m.steel, 0.2, 1.0, 0.2, X.plaza1 - 1.6, y + 0.5, z); B.box(bikeMat, 1.7, 0.08, 0.06, X.plaza1 - 2.4, y + 0.6, z); for (const dx of [-0.65, 0.65]) B.add(new THREE.TorusGeometry(0.33, 0.04, 6, 16).rotateY(Math.PI / 2).translate(X.plaza1 - 2.4 + dx, y + 0.35, z), m.black); } }
  // g) a ticket / information kiosk near the north end
  kiosk(PX - 6, 16, '하늘길 안내소', 'INFORMATION', ['#1a4a7a', '#ffffff', '#7ac8ff']);
  // benches along the shop frontage between the terraces (back to the plaza)
  const bench = (x, z) => { B.box(m.wood, 0.55, 0.08, 2.4, x, y + 0.45, z); B.box(m.conc, 0.5, 0.42, 0.4, x, y + 0.21, z - 0.9); B.box(m.conc, 0.5, 0.42, 0.4, x, y + 0.21, z + 0.9); w.addBoxCentered(V(x, y + 0.25, z), V(0.55, 0.5, 2.4), { surface: 'wood', walkable: false }); };
  for (const z of [-84, -72, -16, -4, 22]) bench(X.plaza1 - 1.2, z);
  // ---- lamp posts: blue L-poles on both road edges, staggered every 18 m, arms over the lanes
  const lampPost = (x, z, dir) => { B.add(new THREE.CylinderGeometry(0.1, 0.13, 7.5, 10).translate(x, y + 3.75, z), m.pole); B.box(m.pole, 2.6, 0.16, 0.16, x + dir * 1.3, y + 7.4, z); B.box(m.lampHead, 0.9, 0.12, 0.35, x + dir * 2.4, y + 7.28, z);
    w.addBoxCentered(V(x, y + 1.5, z), V(0.26, 3, 0.26), { surface: 'metal', walkable: false }); };
  for (const z of [-124, -106, -88, -70, -40, -22, -4, 14]) lampPost(X.road0 - 0.6, z, 1);
  for (const z of [-115, -97, -79, -61, -31, -13, 5, 23]) lampPost(X.road1 + 0.6, z, -1);
  // street trees in grates on the east sidewalk (between the lamps), and in the west frontage strip
  for (const z of [-121, -103, -85, -67, -37, -19, -1, 17]) { B.box(m.steel, 1.4, 0.02, 1.4, X.road1 + 1.6, y + 0.02, z); tree(B, m, X.road1 + 1.6, z, y, 0.95); w.addBoxCentered(V(X.road1 + 1.6, y + 1, z), V(0.4, 2, 0.4), { surface: 'wood', walkable: false }); }
  // bollards closing the plaza to cars at both ends
  for (const z of [Z.z0 - 1, Z.z1 + 1]) for (let x = X.plaza0 + 1; x < X.plaza1 - 0.5; x += 2.2) { B.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10).translate(x, y + 0.45, z), m.steel); w.addBoxCentered(V(x, y + 0.45, z), V(0.24, 0.9, 0.24), { surface: 'metal', walkable: false }); }
  buildInteriors(ctx);
}
