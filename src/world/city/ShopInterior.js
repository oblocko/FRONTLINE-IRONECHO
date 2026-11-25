// Walk-in shop interiors (ground floor, behind real glass). One builder, one theme per shop, every detail
// from the interior checklist:
//   lighting     line lights in the ceiling, hidden cove light at the wall heads, track rails with spot heads
//                and their light pools on the merchandise / menu, pendants over the counter, wall lights
//   counter      tambour / tile / stainless / engineered-stone fronts, raised on a recessed plinth with a strip
//                of light under it (floats), stone top, recessed POS and machine niche, back shelving
//   finishes     minus-moulding shadow gap at the ceiling, stucco / exposed concrete / split brick / wood louver
//                feature walls, tile / epoxy / timber floors, a brass separator bar at the back-of-house door
//   signage      halo-lit logo on the back wall, neon slogan on a feature wall, pictogram plates (WC, Wi-Fi,
//                staff only) in the shop's material
//   hardware     door pulls in the shop's metal, bag hooks under tables, flush sockets, recessed bins
//
// Frame: a shop is `w` wide along its front and `D` deep. Local u runs along the front, d from the glass (0)
// to the back wall (D). World: x = fx - nx * d, z = zc - nx * u (the shop fronts face +x or -x).
import * as THREE from 'three';
import { Batch } from './CityPlan.js';
import * as SK from './SignKit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const texCache = new Map(), matCache = new Map();
function tex(key, w, h, draw, rep = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; texCache.set(key, t); return t;
}
const mat = (k, f) => { if (!matCache.has(k)) matCache.set(k, f()); return matCache.get(k); };
const std = (k, o, uM = 2, vM = uM) => mat(k, () => { const m = new THREE.MeshStandardMaterial(o); m.userData.uM = uM; m.userData.vM = vM; return m; });
const noise = (g, W, H, n, a, c = '0,0,0') => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${c},${Math.random() * a})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); } };

// ------------------------------------------------------------------ finishes
const F = {
  tambour: (tone = '#b08458') => std(`tamb${tone}`, { map: tex(`tamb${tone}`, 128, 128, (g, W, H) => { g.fillStyle = tone; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 4, H); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 5, 0, 3, H); } noise(g, W, H, 300, 0.08); }), roughness: 0.6 }, 0.6, 0.6),
  stucco: (tone = '#d8d0c4') => std(`stuc${tone}`, { map: tex(`stuc${tone}`, 256, 256, (g, W, H) => { g.fillStyle = tone; g.fillRect(0, 0, W, H); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 40, 4 + Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); } }), roughness: 0.85 }, 2.5),
  concrete: () => std('iconc', { map: tex('iconc', 256, 256, (g, W, H) => { g.fillStyle = '#9a9894'; g.fillRect(0, 0, W, H); noise(g, W, H, 3000, 0.08); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.strokeRect(1, 1, W - 2, H / 2 - 2); g.strokeRect(1, H / 2 + 1, W - 2, H / 2 - 2); for (const [x, y] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) { g.fillStyle = 'rgba(40,40,40,0.5)'; g.beginPath(); g.arc(x * W, y * H, 4, 0, 7); g.fill(); } }), roughness: 0.8 }, 2.4, 1.2),
  brick: () => std('ibrick', { map: tex('ibrick', 256, 256, (g, W, H) => { g.fillStyle = '#d8d2c8'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? -24 : 0; x < W; x += 48) { const r = 150 + Math.random() * 50; g.fillStyle = Math.random() < 0.3 ? `rgb(${r * 0.9},${r * 0.86},${r * 0.8})` : `rgb(${r},${r * 0.55},${r * 0.42})`; g.fillRect(x + 1.5, y + 1.5, 45, 13); } noise(g, W, H, 800, 0.12); }), roughness: 0.9 }, 1.6),
  louver: (tone = '#8a6440') => std(`louv${tone}`, { map: tex(`louv${tone}`, 128, 64, (g, W, H) => { g.fillStyle = '#1a1612'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 32) { g.fillStyle = tone; g.fillRect(x + 4, 0, 18, H); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 4, 0, 3, H); } }), roughness: 0.65 }, 0.4, 1),
  tileFloor: (tone = '#d8d6d2') => std(`tfl${tone}`, { map: tex(`tfl${tone}`, 256, 256, (g, W, H) => { g.fillStyle = '#a8a6a2'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) { g.fillStyle = tone; g.fillRect(x + 1, y + 1, 126, 126); } noise(g, W, H, 600, 0.04); }), roughness: 0.25, metalness: 0.05 }, 1.2),
  epoxy: (tone = '#8a8c8e') => std(`epx${tone}`, { color: tone, roughness: 0.18, metalness: 0.05 }),
  timber: () => std('itimb', { map: tex('itimb', 256, 256, (g, W, H) => { for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? -64 : 0; x < W; x += 128) { const r = 150 + Math.random() * 40; g.fillStyle = `rgb(${r},${r * 0.72},${r * 0.48})`; g.fillRect(x, y, 127, 31); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + 31, 128, 1); } noise(g, W, H, 1500, 0.06); }), roughness: 0.55 }, 2),
  marble: () => std('imarb', { map: tex('imarb', 256, 256, (g, W, H) => { g.fillStyle = '#eeece8'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(120,120,128,0.35)'; for (let i = 0; i < 9; i++) { g.lineWidth = 0.5 + Math.random() * 1.5; g.beginPath(); let x = Math.random() * W, y = 0; g.moveTo(x, y); while (y < H) { x += (Math.random() - 0.5) * 40; y += 12 + Math.random() * 20; g.lineTo(x, y); } g.stroke(); } }), roughness: 0.15 }, 1.5),
  tile: (tone = '#2a5a6a') => std(`itile${tone}`, { map: tex(`itile${tone}`, 128, 128, (g, W, H) => { g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < W; x += 32) { g.fillStyle = tone; g.globalAlpha = 0.85 + Math.random() * 0.15; g.fillRect(x + 1, y + 1, 30, 14); } g.globalAlpha = 1; }), roughness: 0.2 }, 0.8),
  stainless: () => std('istain', { color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }),
  paint: (c) => std(`ipaint${c}`, { color: c, roughness: 0.8 }),
  ceiling: () => std('iceil', { color: 0xf0eeea, roughness: 0.9 }),
  black: () => std('iblack', { color: 0x141516, roughness: 0.4, metalness: 0.4 }),
  brass: () => std('ibrass', { color: 0xb8904a, roughness: 0.3, metalness: 0.9 }),
  glassI: () => mat('iglass', () => new THREE.MeshStandardMaterial({ color: 0xdfeaf0, transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.2, depthWrite: false })),
  mirror: () => std('imirr', { color: 0xc8d4dc, roughness: 0.02, metalness: 1 }),
  wood: (tone = 0x8a6440) => std(`iwood${tone}`, { color: tone, roughness: 0.6 }),
  fabric: (c) => std(`ifab${c}`, { color: c, roughness: 0.95 }),
  // light sources (emissive, no real lights): line / cove strips, lamp heads, light pools
  line: (c = 0xfff6e8, k = 1.6) => mat(`iline${c}${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false })),
  pool: (warm = true) => mat(`ipool${warm}`, () => new THREE.MeshBasicMaterial({ map: tex(`ipool${warm}`, 64, 64, (g, W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2); gr.addColorStop(0, warm ? 'rgba(255,226,180,0.55)' : 'rgba(230,240,255,0.5)'); gr.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }, false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })),
};
// product colour palettes for shelves
const PAL = { cosmetics: [0xf4d8e0, 0xffffff, 0xe8b0c0, 0xd8d0f0, 0xf0e0c8, 0x2a2a2a], sports: [0x1a1a1a, 0xffffff, 0xe04020, 0x2a6a9a, 0x8a8a8a], fashion: [0x1a1a1a, 0xe8e0d0, 0x6a5a4a, 0x3a4a6a, 0xa8a090, 0x8a2a2a], books: [0x8a2a2a, 0x1a3a6a, 0xe8e0c8, 0x2a5a3a, 0xd8a040, 0x3a3a3a, 0xf0f0f0], pharmacy: [0xffffff, 0x2a8a4a, 0xe8f0f8, 0xd8261c, 0x2a6aa8], glasses: [0x1a1a1a, 0x8a6a4a, 0xc8a060, 0xd8d8d8], food: [0xd8a040, 0x8a5a2a, 0xf0e0c0, 0xc8261c] };
const pick = (a, r) => a[Math.floor(r() * a.length)];

// ------------------------------------------------------------------ the builder
// s: { fx, zc, nx, w, D, y0, h (ceiling height), theme, name, color (brand), metal: 'black' | 'brass' | 'silver', seed }
export function shopInterior(ctx, B, s) {
  const { fx, zc, nx, w, D, y0 } = s, h = s.h ?? 3.6, th = THEMES[s.theme] ?? THEMES.store, rot = Math.atan2(nx, 0);
  let sd = s.seed ?? 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const X = (d) => fx - nx * d, Z = (u) => zc - nx * u;
  const box = (m, su, sy, sdp, u, y, d, o) => B.box(m, sdp, sy, su, X(d), y0 + y, Z(u), 0, o);
  const col = (su, sy, sdp, u, y, d, surface = 'wood') => ctx.world.addBoxCentered(V(X(d), y0 + y, Z(u)), V(sdp, sy, su), { surface, cover: sy > 0.9, walkable: false });
  const put = (g, u, y, d, face = 'front') => { g.position.set(X(d), y0 + y, Z(u)); g.rotation.y = face === 'front' ? rot : face === 'back' ? rot + Math.PI : face === 'left' ? rot - Math.PI / 2 : rot + Math.PI / 2; SK.bake(ctx, g, B); return g; };
  const metal = s.metal === 'brass' ? F.brass() : s.metal === 'silver' ? F.stainless() : F.black();
  const W2 = w / 2;
  // ---- shell: floor, walls with their finishes, ceiling with a minus-moulding shadow gap
  box(th.floor(), w, 0.02, D, 0, 0.01, D / 2, { cast: false });
  box(th.back(), w, h, 0.1, 0, h / 2, D - 0.05, { cast: false });
  for (const sgn of [-1, 1]) box(th.side(), 0.1, h, D, sgn * (W2 - 0.05), h / 2, D / 2, { cast: false });
  box(F.ceiling(), w, 0.06, D, 0, h + 0.03, D / 2, { cast: false });
  box(F.black(), w - 0.2, 0.03, 0.04, 0, h - 0.02, D - 0.12, { cast: false });   // shadow gap (minus moulding) on the back wall
  for (const sgn of [-1, 1]) box(F.black(), 0.04, 0.03, D - 0.2, sgn * (W2 - 0.12), h - 0.02, D / 2, { cast: false });
  // feature wall: one side wall gets the theme's texture panel
  const fs = rnd() < 0.5 ? -1 : 1; box(th.feature(), 0.06, h - 0.3, D * 0.7, fs * (W2 - 0.13), (h - 0.3) / 2, D * 0.45, { cast: false });
  // ---- lighting: ceiling line lights, cove at the wall heads, track rail with spots
  const lineC = th.cool ? 0xeef4ff : 0xfff2dc;
  for (let u = -W2 + 1.6; u < W2 - 1; u += th.lineStep ?? 2.6) box(F.line(lineC, 1.4), 0.05, 0.02, D - 2.4, u, h - 0.01, D / 2, { cast: false });
  box(F.line(lineC, 1.1), w - 0.4, 0.02, 0.05, 0, h - 0.12, D - 0.2, { cast: false });   // cove on the back wall
  box(F.black(), w - 1, 0.04, 0.05, 0, h - 0.04, 1.8, { cast: false });                    // track rail near the glass
  for (let u = -W2 + 1; u < W2 - 0.6; u += 1.6) { box(F.black(), 0.09, 0.2, 0.09, u, h - 0.16, 1.8, { cast: false }); box(F.line(0xfff0d0, 1.5), 0.07, 0.02, 0.07, u, h - 0.27, 1.8, { cast: false }); }
  // ---- the counter: raised on a recessed plinth with a light strip under it, stone top, machine niche
  const cw = Math.min(th.counterW ?? 3.2, w - 2.4), cu = s.counterU ?? (fs < 0 ? W2 - cw / 2 - 0.9 : -W2 + cw / 2 + 0.9), cd = D - (th.counterD ?? 3.0);
  box(th.counterFront(), cw, 0.95, 0.65, cu, 0.15 + 0.475, cd, { cast: false });
  box(F.black(), cw - 0.12, 0.15, 0.5, cu, 0.075, cd + 0.05, { cast: false });                         // recessed plinth
  box(F.line(0xffe6c0, 1.3), cw - 0.16, 0.02, 0.03, cu, 0.11, cd - 0.27, { cast: false });              // under-counter light
  box(th.counterTop(), cw + 0.1, 0.05, 0.75, cu, 1.125, cd + 0.02, { cast: false });
  col(cw + 0.1, 1.15, 0.75, cu, 0.575, cd + 0.02);
  box(F.black(), 0.36, 0.26, 0.3, cu - cw / 2 + 0.5, 1.28, cd + 0.12, { cast: false });                // POS in its niche
  box(F.line(0xbfe0ff, 1.2), 0.3, 0.2, 0.01, cu - cw / 2 + 0.5, 1.3, cd - 0.035, { cast: false });
  // back counter and shelving behind it
  box(th.counterFront(), cw, 0.9, 0.6, cu, 0.45, D - 0.4, { cast: false }); box(th.counterTop(), cw, 0.04, 0.62, cu, 0.92, D - 0.4, { cast: false });
  for (const y of [1.6, 2.1]) { box(F.wood(0x6a4a2e), cw, 0.04, 0.3, cu, y, D - 0.25, { cast: false }); box(F.line(0xffe6c0, 1.0), cw - 0.1, 0.01, 0.02, cu, y - 0.025, D - 0.14, { cast: false }); }
  // pendants over the counter
  for (let k = 0; k < 3; k++) { const u = cu - cw / 3 + k * cw / 3; box(F.black(), 0.01, h - 2.3, 0.01, u, 2.3 + (h - 2.3) / 2, cd, { cast: false }); B.add(new THREE.ConeGeometry(0.16, 0.22, 16, 1, true).translate(X(cd), y0 + 2.25, Z(u)), metal, { cast: false }); B.add(new THREE.CircleGeometry(0.12, 12).rotateX(Math.PI / 2).translate(X(cd), y0 + 2.15, Z(u)), F.line(0xffe0b0, 1.8), { cast: false }); }
  // ---- back-of-house: staff door, brass separator bar at the floor change, pictograms
  const du = fs < 0 ? -W2 + 1.0 : W2 - 1.0;
  box(F.paint(0x3a3c3e), 0.9, 2.1, 0.05, du, 1.05, D - 0.12, { cast: false }); box(metal, 0.03, 0.3, 0.05, du + 0.32, 1.05, D - 0.17, { cast: false });
  box(F.brass(), 1.1, 0.012, 0.03, du, 0.02, D - 0.9, { cast: false }); box(F.epoxy('#6a6c6e'), 1.1, 0.012, 0.7, du, 0.015, D - 0.52, { cast: false });
  put(SK.point('STAFF\nONLY', { shape: 'square', bg: s.plate ?? '#2a2c2e', fg: '#ffffff', size: 0.3 }), du, 2.35, D - 0.1 - 0.3 * 0, 'front');
  put(SK.point('WC →', { shape: 'square', bg: s.plate ?? '#2a2c2e', fg: '#ffffff', size: 0.26 }), fs * (W2 - 0.1), 2.2, D - 1.2, fs < 0 ? 'left' : 'right');
  // ---- signage inside: halo logo on the back wall above the counter, the theme's slogan in neon on the feature wall
  put(SK.channel(s.name, { color: s.color ?? '#ffffff', h: 0.45, light: 'halo', returns: s.metal === 'brass' ? '#b8904a' : '#2a2a2a', font: th.font ?? 'sans' }), cu, 2.75, D - 0.1, 'front');
  if (th.slogan) { const n = SK.neon(th.slogan, { color: th.neon ?? '#ff6ab0', h: 0.5, board: true }); put(n, fs * (W2 - 0.16), 2.4, D * 0.45, fs < 0 ? 'left' : 'right'); }
  // ---- theme fixtures
  th.fit({ box, col, put, rnd, w, W2, D, h, cu, cd, cw, fs, metal, X, Z, y0, B, s });
  // ---- door hardware: long pulls on the glass door leaves at the opening (handled by the caller's opening u)
  if (s.doorU !== undefined) for (const sgn of [-1, 1]) box(metal, 0.03, 1.2, 0.03, s.doorU + sgn * 0.12, 1.1, -0.06, { cast: false });
}
// light pool on a surface (floor / table / wall)
const poolFloor = (k, u, d, r = 1.2, y = 0.025) => k.B.add(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(k.X(d), k.y0 + y, k.Z(u)), F.pool(true), { cast: false });
// ------------------------------------------------------------------ fixtures
const productRow = (k, u, y, d, len, palette, depth = 0.25, size = [0.08, 0.16]) => { for (let a = -len / 2 + size[0]; a < len / 2 - size[0]; a += size[0] * 1.6) { const hh = size[1] * (0.7 + k.rnd() * 0.6); k.box(F.paint(pick(palette, k.rnd)), size[0], hh, depth * 0.5, u + a, y + hh / 2, d, { cast: false }); } };
const wallBay = (k, u, len, palette, { shelves = [0.4, 0.9, 1.4, 1.9], depth = 0.35, light = true, size } = {}) => {
  for (const y of shelves) { k.box(F.paint(0xf4f2ee), len, 0.03, depth, u, y, k.D - 0.2 - depth / 2, { cast: false }); productRow(k, u, y + 0.015, k.D - 0.2 - depth / 2, len, palette, depth, size); if (light) k.box(F.line(0xfff4e0, 1.1), len - 0.05, 0.01, 0.02, u, y - 0.02, k.D - 0.21 - depth + 0.03, { cast: false }); }
};
const sideBay = (k, sgn, d0, d1, palette, o = {}) => { const shelves = o.shelves ?? [0.5, 1.0, 1.5, 2.0], depth = o.depth ?? 0.35;
  for (const y of shelves) { k.box(F.paint(0xf4f2ee), depth, 0.03, d1 - d0, sgn * (k.W2 - 0.12 - depth / 2), y, (d0 + d1) / 2, { cast: false });
    for (let d = d0 + 0.1; d < d1 - 0.1; d += 0.14) { const hh = 0.12 + k.rnd() * 0.12; k.box(F.paint(pick(palette, k.rnd)), depth * 0.5, hh, 0.09, sgn * (k.W2 - 0.12 - depth / 2), y + 0.015 + hh / 2, d, { cast: false }); } } };
const table = (k, u, d, { r = 0.38, hgt = 0.74, chairs = 2, top = F.marble() } = {}) => {
  k.B.add(new THREE.CylinderGeometry(r, r, 0.04, 20).translate(k.X(d), k.y0 + hgt, k.Z(u)), top, { cast: false }); k.box(k.metal, 0.06, hgt, 0.06, u, hgt / 2, d, { cast: false }); k.B.add(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 16).translate(k.X(d), k.y0 + 0.015, k.Z(u)), k.metal, { cast: false });
  k.box(k.metal, 0.08, 0.03, 0.02, u, hgt - 0.08, d + r - 0.05, { cast: false });   // bag hook
  for (let i = 0; i < chairs; i++) { const a = i * Math.PI * 2 / chairs + 0.4, cu = u + Math.cos(a) * (r + 0.35), cdd = d + Math.sin(a) * (r + 0.35);
    k.box(F.wood(0x9a7450), 0.4, 0.04, 0.4, cu, 0.45, cdd, { cast: false }); for (const [du, dd] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) k.box(k.metal, 0.025, 0.45, 0.025, cu + du, 0.225, cdd + dd, { cast: false }); }
  k.col(r * 2 + 0.7, 0.8, r * 2 + 0.7, u, 0.4, d);
};
const island = (k, u, d, len, dep, palette, { tiers = 2, top = F.paint(0xf4f2ee), front = F.paint(0xf4f2ee) } = {}) => {
  k.box(front, len, 0.8, dep, u, 0.48, d, { cast: false }); k.box(F.black(), len - 0.1, 0.08, dep - 0.1, u, 0.04, d, { cast: false }); k.box(top, len + 0.04, 0.03, dep + 0.04, u, 0.895, d, { cast: false });
  for (let t = 0; t < tiers; t++) { const yy = 0.91 + t * 0.18; k.box(top, len * (1 - t * 0.25), 0.16, dep * (1 - t * 0.35), u, yy + 0.08, d, { cast: false }); productRow(k, u, yy + (t === tiers - 1 ? 0.16 : 0.16), d, len * (1 - t * 0.25) - 0.1, palette, dep * 0.3); }
  k.col(len, 1.2, dep, u, 0.6, d); poolFloor(k, u, d, Math.max(len, dep) * 0.6, 0.95 + tiers * 0.18);
};
const rail = (k, u, d, len, palette) => { // free-standing garment rail with hanging pieces
  for (const s of [-1, 1]) k.box(k.metal, 0.03, 1.5, 0.03, u + s * len / 2, 0.75, d, { cast: false }); k.box(k.metal, len, 0.03, 0.03, u, 1.5, d, { cast: false });
  for (let a = -len / 2 + 0.1; a < len / 2 - 0.05; a += 0.12) { const hh = 0.7 + k.rnd() * 0.35; k.box(F.fabric(pick(palette, k.rnd)), 0.04, hh, 0.5, u + a, 1.48 - hh / 2, d, { cast: false }); }
  k.col(len, 1.5, 0.6, u, 0.75, d);
};
// themes: floor, walls, counter, fixtures (each a small hand-arranged layout scaled to the shop)
const THEMES = {
  cafe: { floor: () => F.timber(), back: () => F.stucco('#e0d6c8'), side: () => F.stucco('#e0d6c8'), feature: () => F.brick(), counterFront: () => F.tambour('#a87c50'), counterTop: () => F.marble(), slogan: 'good coffee, good day', neon: '#ffb070', font: 'serif',
    fit(k) { // espresso machine + grinder on the counter, pastry case, menu board with spots, tables, a wall bench
      k.box(F.stainless(), 0.75, 0.45, 0.5, k.cu + 0.4, 1.38, k.cd + 0.05, { cast: false }); k.box(F.black(), 0.18, 0.4, 0.18, k.cu + 1.0, 1.35, k.cd + 0.05, { cast: false });
      k.box(F.glassI(), 0.9, 0.35, 0.55, k.cu - 0.6, 1.33, k.cd, { cast: false }); productRow(k, k.cu - 0.6, 1.17, k.cd, 0.8, PAL.food, 0.4, [0.1, 0.06]);
      const mb = SK.wood('MENU', { tone: '#3a2a1e', ink: '#f0e6d0', h: 0.3, w: k.cw * 0.8, sub: 'AMERICANO 4.5 · LATTE 5.0 · TEA 5.0' }); k.put(mb, k.cu, 2.2, k.D - 0.12, 'front'); poolFloor(k, k.cu, k.D - 0.3, 0.9, 2.2);
      const n = Math.max(1, Math.floor((k.w - 2) / 2.2)); for (let i = 0; i < n; i++) table(k, -k.W2 + 1.4 + i * ((k.w - 2.4) / Math.max(1, n - 1 || 1)), 2.0 + (i % 2) * 1.6);
      k.box(F.tambour('#7a5a3a'), 0.5, 0.45, k.D * 0.5, -k.fs * (k.W2 - 0.4), 0.225, k.D * 0.4, { cast: false }); k.box(F.fabric(0x5a6a5a), 0.5, 0.08, k.D * 0.5, -k.fs * (k.W2 - 0.4), 0.49, k.D * 0.4, { cast: false });
      k.box(F.black(), 0.08, 0.06, 0.02, -k.fs * (k.W2 - 0.12), 0.3, k.D * 0.3, { cast: false });   // flush socket by the bench
      k.put(SK.point('Wi-Fi\nondo2019', { shape: 'square', bg: '#3a2a1e', fg: '#f0e6d0', size: 0.3 }), -k.fs * (k.W2 - 0.1), 1.9, k.D * 0.55, k.fs < 0 ? 'right' : 'left');
    } },
  cosmetics: { floor: () => F.tileFloor('#eeece8'), back: () => F.paint(0xf6f2f0), side: () => F.paint(0xf6f2f0), feature: () => F.stucco('#f0dce0'), counterFront: () => F.marble(), counterTop: () => F.marble(), slogan: 'glow every day', neon: '#ff7aa8', cool: true, lineStep: 1.8,
    fit(k) { wallBay(k, 0, k.w - 1, PAL.cosmetics); sideBay(k, -k.fs, 1.5, k.D - 1.5, PAL.cosmetics);
      const n = Math.max(1, Math.floor((k.w - 3) / 3.2)); for (let i = 0; i < n; i++) island(k, -k.W2 + 2.2 + i * 3.2, 3.4, 1.8, 0.9, PAL.cosmetics);
      k.box(F.mirror(), 0.04, 1.2, 0.8, k.fs * (k.W2 - 0.14), 1.6, 2.4, { cast: false }); for (let y = 1.0; y <= 2.2; y += 0.6) k.box(F.line(0xffffff, 1.4), 0.03, 0.03, 0.8, k.fs * (k.W2 - 0.16), y, 2.4, { cast: false }); } },
  sports: { floor: () => F.epoxy('#5a5c5e'), back: () => F.concrete(), side: () => F.concrete(), feature: () => F.paint(0x1a1a1a), counterFront: () => F.stainless(), counterTop: () => F.paint(0x1a1a1a), slogan: 'RUN SEOUL', neon: '#ff5a3a', cool: true,
    fit(k) { wallBay(k, 0, k.w - 1, PAL.sports, { shelves: [0.6, 1.0, 1.4, 1.8, 2.2], depth: 0.3, size: [0.28, 0.12] }); sideBay(k, -k.fs, 1.2, k.D - 1.6, PAL.sports, { shelves: [0.7, 1.2, 1.7], depth: 0.3 });
      for (let i = 0; i < Math.max(1, Math.floor((k.w - 3) / 3)); i++) rail(k, -k.W2 + 2.4 + i * 3, 3.0, 1.6, PAL.sports);
      island(k, 0, 5.4, 2.4, 1.0, PAL.sports, { tiers: 1, top: F.paint(0x2a2a2a), front: F.concrete() });
      k.box(F.fabric(0x2a2c2e), 1.0, 2.2, 0.02, k.fs * (k.W2 - 0.7), 1.1, k.D - 1.8, { cast: false }); } },        // fitting room curtain
  fashion: { floor: () => F.timber(), back: () => F.stucco('#e8e2d8'), side: () => F.stucco('#e8e2d8'), feature: () => F.louver('#8a6440'), counterFront: () => F.tambour('#c8b090'), counterTop: () => F.marble(), slogan: null, font: 'serif',
    fit(k) { for (let i = 0; i < Math.max(1, Math.floor((k.w - 2) / 3)); i++) { const u = -k.W2 + 1.8 + i * 3; rail(k, u, 2.6, 1.8, PAL.fashion); poolFloor(k, u, 2.6, 1.1); }
      island(k, 0, 4.8, 2.0, 1.0, PAL.fashion, { tiers: 1, top: F.wood(0x9a7450), front: F.tambour('#c8b090') }); sideBay(k, -k.fs, 1.4, k.D - 1.6, PAL.fashion, { shelves: [0.4, 1.2, 1.9], depth: 0.45 });
      k.box(F.mirror(), 0.04, 2.0, 0.9, k.fs * (k.W2 - 0.14), 1.1, 2.0, { cast: false }); k.box(F.fabric(0x6a5a4a), 1.0, 2.2, 0.02, k.fs * (k.W2 - 0.7), 1.1, k.D - 1.8, { cast: false }); } },
  pharmacy: { floor: () => F.tileFloor('#f4f4f2'), back: () => F.paint(0xf8f8f6), side: () => F.paint(0xf8f8f6), feature: () => F.tile('#2a8a4a'), counterFront: () => F.stainless(), counterTop: () => F.paint(0xffffff), slogan: null, cool: true, lineStep: 1.6,
    fit(k) { wallBay(k, 0, k.w - 1, PAL.pharmacy, { shelves: [0.4, 0.8, 1.2, 1.6, 2.0, 2.4] }); for (let i = 0; i < Math.max(1, Math.floor((k.w - 3) / 2.6)); i++) { const u = -k.W2 + 2 + i * 2.6; k.box(F.paint(0xf4f4f2), 0.6, 1.5, 2.4, u, 0.75, 3.4, { cast: false }); for (const sgn of [-1, 1]) for (const y of [0.4, 0.8, 1.2]) productRow(k, u + sgn * 0.2, y, 3.4, 0.01, PAL.pharmacy); k.col(0.6, 1.5, 2.4, u, 0.75, 3.4); }
      k.put(SK.point('+', { shape: 'square', bg: '#2a8a4a', fg: '#ffffff', size: 0.5 }), k.cu, 3.05, k.D - 0.1, 'front'); } },
  bank: { floor: () => F.tileFloor('#c8c4bc'), back: () => F.marble(), side: () => F.paint(0xece8e0), feature: () => F.louver('#6a4a30'), counterFront: () => F.marble(), counterTop: () => F.paint(0x2a2c2e), slogan: null, counterW: 6, cool: true,
    fit(k) { for (let i = 0; i < 3; i++) k.box(F.glassI(), 0.02, 0.6, 0.02, k.cu - k.cw / 2 + 1.5 + i * 1.5, 1.45, k.cd - 0.3, { cast: false });   // teller partitions
      for (let i = 0; i < 2; i++) { const u = -k.fs * (k.W2 - 0.6), d = 1.8 + i * 1.3; k.box(F.paint(0xd8dcdf), 0.8, 1.7, 0.6, u, 0.85, d, { cast: false }); k.box(F.line(0xbfe0ff, 1.2), 0.04, 0.35, 0.3, u + k.fs * 0.41, 1.3, d, { cast: false }); k.col(0.8, 1.7, 0.6, u, 0.85, d, 'metal'); }
      for (let i = 0; i < 4; i++) { const u = -1.5 + i * 1.0; k.box(F.fabric(0x2a4a7a), 0.5, 0.45, 0.5, u, 0.225, 3.6, { cast: false }); }
      k.put(SK.point('번호표\n0127', { shape: 'square', bg: '#101418', fg: '#ff5a3a', size: 0.4 }), k.cu + k.cw / 2 + 0.3, 2.5, k.D - 0.1, 'front'); } },
  cinema: { floor: () => F.epoxy('#2a2228'), back: () => F.paint(0x1a1a1e), side: () => F.paint(0x1a1a1e), feature: () => F.louver('#3a2a1a'), counterFront: () => F.paint(0xd86a1a), counterTop: () => F.paint(0x1a1a1a), slogan: 'enjoy the show', neon: '#ffb040', counterW: 5,
    fit(k) { k.box(F.glassI(), 0.7, 0.8, 0.6, k.cu + 1.6, 1.55, k.cd, { cast: false }); productRow(k, k.cu + 1.6, 1.18, k.cd, 0.6, [0xf0e0a0, 0xf8f0c0], 0.5, [0.06, 0.1]);   // popcorn
      for (let i = 0; i < 3; i++) { const u = -k.fs * (k.W2 - 0.5), d = 1.6 + i * 1.4; k.box(F.black(), 0.5, 1.6, 0.5, u, 0.8, d, { cast: false }); k.box(F.line(0x7ad0ff, 1.3), 0.02, 0.5, 0.36, u + k.fs * 0.26, 1.25, d, { cast: false }); k.col(0.5, 1.6, 0.5, u, 0.8, d, 'metal'); }
      for (let i = 0; i < 3; i++) { const u = -k.W2 + 1.2 + i * 1.3; k.box(F.line(0xffd8a0, 0.9), 0.9, 1.3, 0.04, u, 1.8, k.D - 0.14, { cast: false }); k.box(F.black(), 1.0, 1.4, 0.05, u, 1.8, k.D - 0.11, { cast: false }); } } },     // poster lightboxes
  books: { floor: () => F.timber(), back: () => F.wood(0x6a4a2e), side: () => F.wood(0x6a4a2e), feature: () => F.louver('#a07a50'), counterFront: () => F.tambour('#a07a50'), counterTop: () => F.wood(0x5a3a22), slogan: null, font: 'serif',
    fit(k) { wallBay(k, 0, k.w - 1, PAL.books, { shelves: [0.3, 0.75, 1.2, 1.65, 2.1, 2.55], depth: 0.3, light: false, size: [0.04, 0.22] }); sideBay(k, -k.fs, 1.0, k.D - 1.2, PAL.books, { shelves: [0.3, 0.8, 1.3, 1.8, 2.3], depth: 0.3 });
      for (let i = 0; i < Math.max(1, Math.floor((k.w - 3) / 2.6)); i++) { const u = -k.W2 + 2.2 + i * 2.6; k.box(F.wood(0x8a6440), 1.6, 0.8, 0.9, u, 0.4, 3.2, { cast: false }); productRow(k, u, 0.8, 3.2, 1.4, PAL.books, 0.8, [0.18, 0.04]); k.col(1.6, 0.8, 0.9, u, 0.4, 3.2); poolFloor(k, u, 3.2, 0.9, 0.86); } } },
  glasses: { floor: () => F.tileFloor('#e8e6e2'), back: () => F.paint(0xf4f4f2), side: () => F.paint(0xf4f4f2), feature: () => F.tile('#1a2a4a'), counterFront: () => F.paint(0x1a2a4a), counterTop: () => F.marble(), slogan: null, cool: true,
    fit(k) { wallBay(k, 0, k.w - 1, PAL.glasses, { shelves: [0.9, 1.2, 1.5, 1.8, 2.1], depth: 0.18, size: [0.14, 0.04] }); sideBay(k, -k.fs, 1.2, k.D - 1.4, PAL.glasses, { shelves: [1.0, 1.3, 1.6, 1.9], depth: 0.18 });
      for (let i = 0; i < 2; i++) { const u = -1 + i * 2.2; k.box(F.paint(0xf4f4f2), 1.0, 0.75, 0.6, u, 0.375, 2.8, { cast: false }); k.box(F.mirror(), 0.3, 0.35, 0.02, u, 0.95, 2.6, { cast: false }); k.col(1.0, 0.75, 0.6, u, 0.375, 2.8); } } },
  music: { floor: () => F.epoxy('#1a1a22'), back: () => F.concrete(), side: () => F.paint(0x16141c), feature: () => F.brick(), counterFront: () => F.paint(0x2a0a3a), counterTop: () => F.paint(0x101010), slogan: 'play it loud', neon: '#ff4ad8',
    fit(k) { wallBay(k, 0, k.w - 1, [0xff4ad8, 0x1a1a1a, 0xffffff, 0x7ad8ff], { shelves: [0.8, 1.3, 1.8], depth: 0.25, size: [0.14, 0.14] });   // albums / merch
      for (let i = 0; i < Math.max(1, Math.floor((k.w - 3) / 3)); i++) { const u = -k.W2 + 2 + i * 3; k.box(F.black(), 1.2, 1.0, 0.6, u, 0.5, 3.2, { cast: false }); k.box(F.line(0xff4ad8, 1.2), 1.2, 0.02, 0.02, u, 1.0, 2.9, { cast: false }); productRow(k, u, 1.0, 3.2, 1.0, [0xff4ad8, 0xffffff, 0x1a1a1a], 0.5, [0.14, 0.14]); k.col(1.2, 1.0, 0.6, u, 0.5, 3.2); } } },
  salad: { floor: () => F.tileFloor('#e8ecdc'), back: () => F.tile('#5a8a3a'), side: () => F.paint(0xf4f6ee), feature: () => F.louver('#8a7a50'), counterFront: () => F.tile('#5a8a3a'), counterTop: () => F.marble(), slogan: 'eat green', neon: '#8aff6a', counterW: 4,
    fit(k) { k.box(F.glassI(), k.cw - 0.4, 0.4, 0.4, k.cu, 1.35, k.cd - 0.1, { cast: false }); productRow(k, k.cu, 1.16, k.cd + 0.05, k.cw - 0.6, [0x6aa83a, 0xd8261c, 0xf0d040, 0xf4f0e0, 0x8a5a2a], 0.5, [0.22, 0.06]);
      k.box(F.wood(0x9a7450), k.w - 2, 0.05, 0.45, 0, 1.05, 0.5, { cast: false }); for (let u = -k.W2 + 1.3; u < k.W2 - 1; u += 0.9) { k.box(F.wood(0x9a7450), 0.36, 0.05, 0.36, u, 0.72, 1.1, { cast: false }); k.box(k.metal, 0.04, 0.7, 0.04, u, 0.35, 1.1, { cast: false }); }
      for (let i = 0; i < Math.max(1, Math.floor((k.w - 3) / 2.4)); i++) table(k, -k.W2 + 1.8 + i * 2.4, 3.4, { top: F.wood(0xb08a60) }); } },
  store: { floor: () => F.tileFloor('#e0deda'), back: () => F.paint(0xf2f0ec), side: () => F.paint(0xf2f0ec), feature: () => F.stucco('#e0d8cc'), counterFront: () => F.tambour('#c8b090'), counterTop: () => F.marble(), slogan: null,
    fit(k) { wallBay(k, 0, k.w - 1, PAL.fashion); island(k, 0, 3.4, 2.2, 1.0, PAL.fashion); } },
};
export const INTERIOR_THEMES = Object.keys(THEMES);
// interiors get their own batch: they sit under the podium (no sun), so they are not shadowed by it
export function interiorBatch(ctx) { if (!ctx.interiorBatch) { ctx.interiorBatch = new Batch(ctx.scene); ctx.interiorBatch.owner = null; } return ctx.interiorBatch; }
export function buildInteriors(ctx) { const B = ctx.interiorBatch; if (!B) return; for (const m of B.build()) { m.receiveShadow = false; m.castShadow = false; m.userData.lodAlways = false; m.userData.lodNear = true; } }
