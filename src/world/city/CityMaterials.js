// Canvas-made materials for the Korean city: wall claddings (tile, granite panel, red brick, painted
// render, exposed concrete, composite metal panel), ground (interlocking pavers, asphalt, parking
// asphalt, lawn, artificial-turf school field, rubber track), road paint. Each texture covers
// `meters` metres; the Batch maps UVs world-planar with the same scale, so nothing stretches.
import * as THREE from 'three';

const cache = new Map();
function tex(key, size, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); let r = 1;
  for (const ch of key) r = (r * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  draw(g, size, rnd);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  cache.set(key, t); return t;
}
const shade = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`; };
const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;
function noise(g, S, rnd, n, a, light = false) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,250,240' : '30,26,22'},${rnd() * a})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3); } }
function streaks(g, S, rnd, n, a = 0.07) { for (let i = 0; i < n; i++) { const x = rnd() * S, len = S * (0.1 + rnd() * 0.5), y = rnd() * S * 0.6; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, `rgba(40,34,28,${a})`); gr.addColorStop(1, 'rgba(40,34,28,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 5, len); } }

// texture metres per tile (kept with the material so Batch can map UVs)
export const WALLS = {
  // small exterior tiles (0.1 x 0.2), the classic 90s Korean commercial / villa finish
  tile: (color) => tex(`tile${color}`, 512, (g, S, rnd) => { g.fillStyle = css(color); g.fillRect(0, 0, S, S); const tw = S / 20, th = S / 40;
    for (let y = 0; y < S; y += th) for (let x = ((y / th) % 2) * tw / 2 - tw; x < S; x += tw) { g.fillStyle = shade(color, 0.9 + rnd() * 0.18); g.fillRect(x + 1, y + 1, tw - 2, th - 2); }
    streaks(g, S, rnd, 26); noise(g, S, rnd, 900, 0.05); }),
  // granite slabs 1.2 x 0.6
  stone: (color) => tex(`stone${color}`, 512, (g, S, rnd) => { g.fillStyle = shade(color, 0.7); g.fillRect(0, 0, S, S); const tw = S / 4, th = S / 8;
    for (let y = 0; y < S; y += th) for (let x = 0; x < S; x += tw) { g.fillStyle = shade(color, 0.92 + rnd() * 0.12); g.fillRect(x + 2, y + 2, tw - 4, th - 4); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '20,20,20' : '255,255,255'},${rnd() * 0.12})`; g.fillRect(x + rnd() * tw, y + rnd() * th, 2, 2); } }
    streaks(g, S, rnd, 10, 0.05); }),
  // red brick (villas, schools)
  brick: (color) => tex(`brick${color}`, 512, (g, S, rnd) => { g.fillStyle = '#b8ae9e'; g.fillRect(0, 0, S, S); const bw = S / 16, bh = S / 48;
    for (let y = 0; y < S; y += bh) for (let x = ((y / bh) % 2) * bw / 2 - bw; x < S; x += bw) { g.fillStyle = shade(color, 0.78 + rnd() * 0.34); g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); }
    streaks(g, S, rnd, 16, 0.06); noise(g, S, rnd, 600, 0.06); }),
  // painted render over concrete
  render: (color) => tex(`render${color}`, 512, (g, S, rnd) => { g.fillStyle = css(color); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 20; i++) { const rr = 30 + rnd() * 90, x = rnd() * S, y = rnd() * S, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(60,55,45,${0.03 + rnd() * 0.05})`); gr.addColorStop(1, 'rgba(60,55,45,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    streaks(g, S, rnd, 30); noise(g, S, rnd, 3000, 0.07); noise(g, S, rnd, 1200, 0.05, true); }),
  // exposed concrete with form-tie holes (1.8 x 0.9 forms)
  concrete: (color) => tex(`conc${color}`, 512, (g, S, rnd) => { g.fillStyle = css(color); g.fillRect(0, 0, S, S); const fw = S / 2.2, fh = S / 4.4;
    for (let y = 0; y < S; y += fh) for (let x = 0; x < S; x += fw) { g.fillStyle = shade(color, 0.94 + rnd() * 0.1); g.fillRect(x + 1, y + 1, fw - 2, fh - 2); g.fillStyle = 'rgba(40,40,40,0.4)'; for (const [a, b] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) { g.beginPath(); g.arc(x + fw * a, y + fh * b, 3, 0, 7); g.fill(); } }
    streaks(g, S, rnd, 30); noise(g, S, rnd, 3000, 0.08); }),
  // aluminium composite panel (newer commercial buildings)
  panel: (color) => tex(`panel${color}`, 512, (g, S, rnd) => { g.fillStyle = shade(color, 0.6); g.fillRect(0, 0, S, S); const pw = S / 4, ph = S / 4;
    for (let y = 0; y < S; y += ph) for (let x = 0; x < S; x += pw) { const gr = g.createLinearGradient(x, y, x + pw, y + ph); gr.addColorStop(0, shade(color, 1.02)); gr.addColorStop(1, shade(color, 0.92)); g.fillStyle = gr; g.fillRect(x + 3, y + 3, pw - 6, ph - 6); }
    streaks(g, S, rnd, 8, 0.04); }),
};
export const WALL_METERS = { tile: 2, stone: 4.8, brick: 3.2, render: 4, concrete: 4, panel: 4.8 };

const matCache = new Map();
export function wallMat(kind, color, { roughness } = {}) {
  const k = `${kind}|${color}`; if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ map: WALLS[kind](color), roughness: roughness ?? (kind === 'panel' ? 0.45 : kind === 'stone' ? 0.6 : 0.88), metalness: kind === 'panel' ? 0.35 : 0.02 });
  m.userData.texMeters = WALL_METERS[kind]; matCache.set(k, m); return m;
}
export function flatMat(color, { roughness = 0.8, metalness = 0, key = '' } = {}) {
  const k = `flat|${color}|${roughness}|${metalness}|${key}`; if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); matCache.set(k, m); return m;
}

// ground
export const GROUND = {
  // interlocking concrete pavers (grey with a rust-red band pattern), 4 m tile
  pavers: () => tex('pavers', 512, (g, S, rnd) => { g.fillStyle = '#6e6c66'; g.fillRect(0, 0, S, S); const u = S / 20;
    for (let y = 0; y < S; y += u) for (let x = 0; x < S; x += u * 2) { const o = ((y / u) % 2) * u; const red = Math.floor((x + o) / (u * 2)) % 5 === 0; g.fillStyle = red ? shade(0x8a5a4a, 0.85 + rnd() * 0.25) : shade(0x9a9890, 0.85 + rnd() * 0.2); g.fillRect(x + o + 1, y + 1, u * 2 - 2, u - 2); }
    noise(g, S, rnd, 2500, 0.1); for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(20,18,15,${0.05 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 40, 6 + rnd() * 20, rnd() * 3, 0, 7); g.fill(); } }),
  // tactile paving strip (yellow)
  tactile: () => tex('tactile', 128, (g, S) => { g.fillStyle = '#c8a420'; g.fillRect(0, 0, S, S); g.fillStyle = '#e0bc30'; for (let y = 8; y < S; y += 16) for (let x = 8; x < S; x += 16) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }),
  asphalt: () => tex('asphaltCity', 512, (g, S, rnd) => { g.fillStyle = '#3c3d3f'; g.fillRect(0, 0, S, S); noise(g, S, rnd, 9000, 0.25); noise(g, S, rnd, 3000, 0.12, true);
    for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(15,15,15,${0.3 + rnd() * 0.3})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); let x = rnd() * S, y = rnd() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(10,10,12,${0.05 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 70, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); } }),
  lawn: () => tex('lawn', 256, (g, S, rnd) => { g.fillStyle = '#56603a'; g.fillRect(0, 0, S, S); for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '120,130,70' : '50,60,30'},${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3); } }),
  dirtField: () => tex('field', 256, (g, S, rnd) => { g.fillStyle = '#9a8466'; g.fillRect(0, 0, S, S); noise(g, S, rnd, 5000, 0.15); noise(g, S, rnd, 2000, 0.1, true); }),
  track: () => tex('track', 128, (g, S, rnd) => { g.fillStyle = '#9a4a38'; g.fillRect(0, 0, S, S); noise(g, S, rnd, 2000, 0.15); }),
  plaza: () => tex('plaza', 512, (g, S, rnd) => { g.fillStyle = '#8a8680'; g.fillRect(0, 0, S, S); const u = S / 8;
    for (let y = 0; y < S; y += u) for (let x = 0; x < S; x += u) { g.fillStyle = shade((x / u + y / u) % 2 ? 0xa8a49c : 0x96928a, 0.92 + rnd() * 0.12); g.fillRect(x + 2, y + 2, u - 4, u - 4); }
    noise(g, S, rnd, 2000, 0.08); }),
};
export const GROUND_METERS = { pavers: 4, tactile: 0.6, asphalt: 8, lawn: 3, dirtField: 6, track: 2, plaza: 6 };
export function groundMat(kind, { roughness = 0.9, color = 0xffffff } = {}) {
  const k = `g|${kind}|${color}`; if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ map: GROUND[kind](), roughness, color }); m.userData.texMeters = GROUND_METERS[kind]; matCache.set(k, m); return m;
}
// road paint (decals laid flat with polygon offset)
export function paintMat(color) {
  const k = `paint|${color}`; if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); matCache.set(k, m); return m;
}
