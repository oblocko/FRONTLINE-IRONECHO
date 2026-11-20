// Procedural PBR texture generator. All surface textures in the game are
// generated at load time (albedo + normal + roughness), so the project ships
// with zero third-party texture assets. Resolution follows the texture-quality
// setting. Generated textures are cached per (name, size).
import * as THREE from 'three';
import { settings } from '../core/Settings.js';

// ---------- seeded noise ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class TileNoise {
  // Tileable value noise on a period grid
  constructor(seed, period) {
    this.p = period; const r = mulberry32(seed);
    this.v = new Float32Array(period * period).map(() => r());
  }
  at(x, y) {
    const p = this.p; const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const g = (i, j) => this.v[((j % p + p) % p) * p + ((i % p + p) % p)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    const u = s(xf), w = s(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
}
function fbm(noises, u, v, octaves = 5, base = 4) {
  let sum = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const f = base * (1 << o);
    sum += noises[o].at(u * f, v * f) * amp; tot += amp; amp *= 0.5;
  }
  return sum / tot;
}
function makeNoiseSet(seed, base = 4, octaves = 6) {
  return Array.from({ length: octaves }, (_, o) => new TileNoise(seed + o * 101, base * (1 << o)));
}

const cache = new Map();

// ---------- photographic CC0 textures (Poly Haven) ----------
// Recipe name -> Poly Haven texture id in assets/textures/<id>/<id>_{diff,nor_gl,arm}_1k.jpg.
// `arm` packs AO/roughness/metalness (glTF layout), matching how pbr() reads G=rough, B=metal.
export const PHOTO = {
  snowground: 'snow_02', asphalt: 'asphalt_snow', dirt: 'stony_dirt_path', concrete: 'concrete',
  plaster: 'grey_plaster', brick: 'brick_wall_001', roofTiles: 'grey_roof_tiles', corrugated: 'corrugated_iron', wood: 'brown_planks_03', metal: 'metal_plate',
};
const photo = new Map();      // recipe -> {map, normalMap, roughnessMap}
const photoFailed = new Set();
function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
// Load all photo textures; resolves when done (failures fall back to procedural recipes).
export async function preloadPhotoTextures(onProgress = () => {}) {
  const names = Object.keys(PHOTO).filter((n) => !photo.has(n) && !photoFailed.has(n));
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const id = PHOTO[n]; const base = new URL(`assets/textures/${id}/${id}`, document.baseURI).href;
    try {
      const [d, nm, arm] = await Promise.all([loadImage(`${base}_diff_1k.jpg`), loadImage(`${base}_nor_gl_1k.jpg`), loadImage(`${base}_arm_1k.jpg`)]);
      const mk = (img, srgb) => { const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
      photo.set(n, { map: mk(d, true), normalMap: mk(nm, false), roughnessMap: mk(arm, false), photo: true });
    } catch (e) { photoFailed.add(n); console.warn(`photo texture ${id} unavailable, using procedural ${n}`); }
    onProgress(++done / names.length);
  }));
}
export function texSize() {
  const q = settings.data.graphics.textures;
  return q === 'low' ? 256 : q === 'medium' ? 512 : 1024;
}

function buildTextures(size, fn, opts = {}) {
  // fn(u, v) -> { r, g, b (0..1), h (height 0..1), rough (0..1), metal? }
  const n = size * size;
  const col = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const rough = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const s = fn(x / size, y / size, x, y);
    col[i * 4] = s.r * 255; col[i * 4 + 1] = s.g * 255; col[i * 4 + 2] = s.b * 255; col[i * 4 + 3] = 255;
    height[i] = s.h ?? 0.5;
    const ro = (s.rough ?? 0.8) * 255; const me = (s.metal ?? 0) * 255;
    rough[i * 4] = 0; rough[i * 4 + 1] = ro; rough[i * 4 + 2] = me; rough[i * 4 + 3] = 255; // glTF style: G=roughness B=metalness
  }
  // normal map via sobel on tileable height
  const nrm = new Uint8ClampedArray(n * 4);
  const strength = opts.normalStrength ?? 2.0;
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength * (size / 256);
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength * (size / 256);
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (-ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(rough, false), metalnessMap: null };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// ---------- material recipes ----------
const RECIPES = {
  concrete(size) {
    const N = makeNoiseSet(11, 4), C = makeNoiseSet(77, 2, 4), S = makeNoiseSet(5, 16, 3);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4), stain = fbm(C, u, v, 4, 2), speck = fbm(S, u, v, 3, 32);
      let g = 0.52 + (n - 0.5) * 0.25 - Math.max(0, stain - 0.55) * 0.5 + (speck > 0.72 ? -0.12 : 0);
      const crack = Math.abs(fbm(N, u * 0.5 + 0.3, v * 0.5, 4, 3) - 0.5) < 0.008 ? -0.18 : 0;
      g += crack;
      return { r: g * 0.98, g: g * 0.97, b: g * 0.93, h: n * 0.7 + speck * 0.3 + crack, rough: 0.88 + (n - 0.5) * 0.1 };
    }, { normalStrength: 1.5 });
  },
  asphalt(size) {
    const N = makeNoiseSet(21, 8), P = makeNoiseSet(9, 64, 2), W = makeNoiseSet(3, 2, 4);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 5, 8), p = fbm(P, u, v, 2, 128), wear = fbm(W, u, v, 4, 2);
      let g = 0.17 + (n - 0.5) * 0.08 + (p > 0.66 ? 0.09 : 0) + wear * 0.06;
      return { r: g, g: g, b: g * 1.04, h: p * 0.8 + n * 0.2, rough: 0.82 - wear * 0.15 };
    }, { normalStrength: 2.4 });
  },
  dirt(size) {
    const N = makeNoiseSet(31, 4), P = makeNoiseSet(41, 32, 3), M = makeNoiseSet(51, 2, 4);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4), p = fbm(P, u, v, 3, 64), m = fbm(M, u, v, 4, 2);
      const pebble = p > 0.68 ? (p - 0.68) * 3 : 0;
      const [r, g, b] = [mix(0.27, 0.36, n), mix(0.22, 0.29, n), mix(0.16, 0.2, n)];
      const wet = clamp01((m - 0.55) * 4);
      return { r: r * (1 - wet * 0.35) + pebble * 0.2, g: g * (1 - wet * 0.35) + pebble * 0.18, b: b * (1 - wet * 0.3) + pebble * 0.16,
        h: n * 0.6 + pebble, rough: 0.95 - wet * 0.45 };
    }, { normalStrength: 2.6 });
  },
  snowground(size) {
    const N = makeNoiseSet(61, 4), D = makeNoiseSet(71, 2, 5), G = makeNoiseSet(81, 32, 3);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4), d = fbm(D, u, v, 5, 2), gr = fbm(G, u, v, 3, 48);
      const snow = clamp01((d - 0.42) * 5 + (n - 0.5));
      const dr = [mix(0.25, 0.33, n), mix(0.24, 0.28, n), mix(0.18, 0.2, n)];
      const grass = gr > 0.6 ? 0.08 : 0;
      const s = 0.82 + (n - 0.5) * 0.12;
      return { r: mix(dr[0] + grass * 0.3, s * 0.95, snow), g: mix(dr[1] + grass * 0.5, s * 0.97, snow), b: mix(dr[2], s * 1.02, snow),
        h: n * 0.5 + snow * 0.3 + gr * 0.2, rough: mix(0.95, 0.6, snow) };
    }, { normalStrength: 2.0 });
  },
  grassdead(size) {
    const N = makeNoiseSet(91, 4), B = makeNoiseSet(17, 64, 2);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4), b = fbm(B, u * 1.0, v * 0.25, 2, 128);
      const blade = b > 0.55 ? (b - 0.55) * 2.2 : 0;
      return { r: mix(0.3, 0.45, n) + blade * 0.25, g: mix(0.27, 0.38, n) + blade * 0.2, b: mix(0.14, 0.2, n) + blade * 0.08, h: blade + n * 0.3, rough: 0.92 };
    });
  },
  metal(size) {
    const N = makeNoiseSet(101, 4), R = makeNoiseSet(111, 2, 4), S = makeNoiseSet(7, 64, 1);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 5, 4), rust = clamp01((fbm(R, u, v, 4, 2) - 0.58) * 4), scratch = S[0].at(u * 4, v * 256) > 0.8 ? 0.1 : 0;
      const base = 0.45 + (n - 0.5) * 0.1 + scratch;
      return { r: mix(base, 0.42, rust), g: mix(base, 0.24, rust), b: mix(base * 1.02, 0.14, rust), h: n * 0.3 + rust * 0.4,
        rough: mix(0.42 - scratch, 0.9, rust), metal: mix(0.9, 0.2, rust) };
    }, { normalStrength: 1.0 });
  },
  corrugated(size) {
    const N = makeNoiseSet(121, 4), R = makeNoiseSet(131, 2, 4);
    return buildTextures(size, (u, v) => {
      const wave = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5, n = fbm(N, u, v, 5, 4), rust = clamp01((fbm(R, u, v, 4, 2) - 0.5) * 3 + (1 - v) * 0.2);
      const base = 0.5 + (wave - 0.5) * 0.08 + (n - 0.5) * 0.08;
      return { r: mix(base * 0.85, 0.45, rust), g: mix(base * 0.9, 0.27, rust), b: mix(base * 0.88, 0.15, rust), h: wave, rough: mix(0.5, 0.92, rust), metal: mix(0.7, 0.15, rust) };
    }, { normalStrength: 3.0 });
  },
  wood(size) {
    const N = makeNoiseSet(141, 4), G = makeNoiseSet(151, 4, 3);
    return buildTextures(size, (u, v) => {
      const g = fbm(G, u * 0.2, v * 4, 3, 4); const ring = Math.sin((u * 30 + g * 8) * Math.PI) * 0.5 + 0.5; const n = fbm(N, u, v, 5, 4);
      const plank = (Math.floor(u * 4) % 2) * 0.04; const seam = (u * 4) % 1 < 0.015 ? -0.15 : 0;
      return { r: mix(0.32, 0.45, ring) + plank + seam, g: mix(0.22, 0.32, ring) + plank + seam, b: mix(0.13, 0.19, ring) + seam,
        h: ring * 0.3 + n * 0.3 + seam * 2, rough: 0.78 };
    }, { normalStrength: 1.4 });
  },
  sandbag(size) {
    const N = makeNoiseSet(161, 4), W = makeNoiseSet(171, 128, 1);
    return buildTextures(size, (u, v, x, y) => {
      const n = fbm(N, u, v, 5, 4); const weave = ((x + y) % 4 < 2 ? 0.04 : -0.02) + (x % 3 === 0 ? -0.02 : 0);
      const dirt = fbm(N, u * 0.5 + 0.2, v * 0.5, 4, 2);
      const r = mix(0.46, 0.55, n) + weave - dirt * 0.12, g = mix(0.42, 0.5, n) + weave - dirt * 0.12, b = mix(0.3, 0.36, n) + weave - dirt * 0.1;
      return { r, g, b, h: n * 0.6 + weave * 3, rough: 0.97 };
    }, { normalStrength: 2.0 });
  },
  plaster(size) {
    const N = makeNoiseSet(181, 4), S = makeNoiseSet(191, 2, 4);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4), stain = clamp01((fbm(S, u, v, 4, 2) - 0.5) * 2.5) * (0.5 + v * 0.5);
      const g = 0.72 + (n - 0.5) * 0.1;
      return { r: g - stain * 0.25, g: g * 0.98 - stain * 0.26, b: g * 0.93 - stain * 0.24, h: n, rough: 0.92 };
    }, { normalStrength: 1.0 });
  },
  brick(size) {
    const N = makeNoiseSet(201, 4), B = makeNoiseSet(211, 8, 1);
    return buildTextures(size, (u, v) => {
      const rows = 16, cols = 8; const ry = v * rows; const row = Math.floor(ry); const rx = u * cols + (row % 2) * 0.5; const col = Math.floor(rx);
      const fx = rx - col, fy = ry - row; const mortar = fx < 0.05 || fy < 0.09;
      const tint = B[0].at(col * 1.7, row * 2.3); const n = fbm(N, u, v, 5, 4);
      if (mortar) return { r: 0.55, g: 0.53, b: 0.49, h: 0.1 + n * 0.1, rough: 0.95 };
      const base = 0.36 + tint * 0.14 + (n - 0.5) * 0.08;
      return { r: base * 1.25, g: base * 0.62, b: base * 0.5, h: 0.6 + n * 0.3, rough: 0.88 };
    }, { normalStrength: 3.0 });
  },
  camoROK(size) {
    // Original digital-style woodland camouflage (stylised, not an official pattern copy)
    const A = makeNoiseSet(221, 4, 4), B = makeNoiseSet(231, 4, 4), C = makeNoiseSet(241, 64, 1);
    const pal = [hex(0x4a5236), hex(0x2f3524), hex(0x6b6447), hex(0x1d1f17)];
    return buildTextures(size, (u, v, x, y) => {
      const px = Math.floor(x / (size / 128)), py = Math.floor(y / (size / 128));
      const a = fbm(A, px / 128, py / 128, 4, 4), b = fbm(B, px / 128, py / 128, 4, 4);
      let c = pal[0]; if (a > 0.56) c = pal[1]; if (b > 0.6) c = pal[2]; if (a > 0.66 && b < 0.4) c = pal[3];
      const fab = C[0].at(x * 0.5, y * 0.5) * 0.06;
      return { r: c[0] + fab, g: c[1] + fab, b: c[2] + fab, h: fab * 8, rough: 0.95 };
    }, { normalStrength: 0.8 });
  },
  camoUS(size) {
    // Original arid multi-tone pattern for allied US troops (stylised, not an official pattern copy)
    const A = makeNoiseSet(291, 3, 4), B = makeNoiseSet(301, 6, 4), C = makeNoiseSet(311, 64, 1);
    const pal = [hex(0x8a7a5c), hex(0x6e6347), hex(0xa2916c), hex(0x585a3e)];
    return buildTextures(size, (u, v, x, y) => {
      const a = fbm(A, u, v, 4, 3), b = fbm(B, u, v, 4, 6); let c = pal[0]; if (a > 0.58) c = pal[1]; if (b > 0.62) c = pal[2]; if (a < 0.36 && b < 0.45) c = pal[3];
      const fab = C[0].at(x * 0.5, y * 0.5) * 0.05;
      return { r: c[0] + fab, g: c[1] + fab, b: c[2] + fab, h: fab * 8, rough: 0.95 };
    }, { normalStrength: 0.8 });
  },
  camoEnemy(size) {
    const A = makeNoiseSet(251, 3, 4), C = makeNoiseSet(261, 64, 1);
    const pal = [hex(0x5a5a3c), hex(0x3d3f2a), hex(0x6f6a4c)];
    return buildTextures(size, (u, v, x, y) => {
      const a = fbm(A, u, v, 4, 3); let c = pal[0]; if (a > 0.57) c = pal[1]; if (a < 0.4) c = pal[2];
      const fab = C[0].at(x * 0.5, y * 0.5) * 0.05;
      return { r: c[0] + fab, g: c[1] + fab, b: c[2] + fab, h: fab * 8, rough: 0.96 };
    }, { normalStrength: 0.8 });
  },
  rock(size) {
    const N = makeNoiseSet(271, 4), R = makeNoiseSet(281, 8, 4);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 6, 4); const r = Math.abs(fbm(R, u, v, 4, 8) - 0.5) * 2;
      const g = 0.35 + n * 0.2 - (1 - r) * 0.05;
      return { r: g * 1.0, g: g * 0.98, b: g * 0.92, h: n * 0.6 + r * 0.4, rough: 0.9 };
    }, { normalStrength: 3.5 });
  },
  paintedMetal(size) {
    const N = makeNoiseSet(291, 4), R = makeNoiseSet(301, 2, 4), S = makeNoiseSet(311, 16, 2);
    return buildTextures(size, (u, v) => {
      const n = fbm(N, u, v, 5, 4), chip = clamp01((fbm(S, u, v, 2, 16) - 0.66) * 6), dust = clamp01(fbm(R, u, v, 4, 2) - 0.45) * (0.3 + v * 0.7);
      const base = [0.3, 0.34, 0.24];
      return { r: mix(base[0] + (n - .5) * .05, 0.35, chip) + dust * 0.25, g: mix(base[1] + (n - .5) * .05, 0.34, chip) + dust * 0.22, b: mix(base[2], 0.33, chip) + dust * 0.16,
        h: n * 0.2 - chip * 0.2, rough: mix(0.6, 0.5, chip) + dust * 0.3, metal: mix(0.25, 0.85, chip) };
    }, { normalStrength: 1.2 });
  },
  fabric(size) {
    const C = makeNoiseSet(321, 64, 1), N = makeNoiseSet(331, 4);
    return buildTextures(size, (u, v, x, y) => {
      const n = fbm(N, u, v, 4, 4); const w = ((x % 4) < 2 ? 0.03 : -0.03) + ((y % 4) < 2 ? 0.02 : -0.02) + C[0].at(x * .5, y * .5) * 0.03;
      const g = 0.5 + w + (n - 0.5) * 0.1; return { r: g, g, b: g, h: w * 6, rough: 0.97 };
    });
  },
};

RECIPES.roofTiles = (size) => RECIPES.corrugated(size); // procedural fallback

export function getTextures(name) {
  if (photo.has(name)) return photo.get(name);
  const size = texSize();
  const key = `${name}@${size}`;
  if (!cache.has(key)) {
    const t0 = performance.now();
    cache.set(key, RECIPES[name](size));
    if (performance.now() - t0 > 200) console.debug(`[tex] ${key} ${Math.round(performance.now() - t0)}ms`);
  }
  return cache.get(key);
}

// Material helper with optional tint & UV repeat. Materials cloned so repeats are per-material.
const matCache = new Map();
export function pbr(name, { repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = null, normalScale = 1, key = '' } = {}) {
  const mk = `${name}|${repeat}|${color}|${roughness}|${metalness}|${normalScale}|${key}`;
  if (matCache.has(mk)) return matCache.get(mk);
  const t = getTextures(name);
  const clone = (tx) => { if (!tx) return null; const c = tx.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
  const hasMetal = ['metal', 'corrugated', 'paintedMetal'].includes(name);
  const m = new THREE.MeshStandardMaterial({
    map: clone(t.map), normalMap: clone(t.normalMap), roughnessMap: clone(t.roughnessMap),
    metalnessMap: hasMetal ? clone(t.roughnessMap) : null,
    color, roughness, metalness: metalness ?? (hasMetal ? 1 : 0),
  });
  m.normalScale.set(normalScale, normalScale);
  matCache.set(mk, m);
  return m;
}

export function clearTextureCache() {
  for (const t of cache.values()) for (const k of ['map', 'normalMap', 'roughnessMap']) t[k]?.dispose();
  cache.clear();
  for (const m of matCache.values()) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) m[k]?.dispose(); m.dispose(); }
  matCache.clear();
}

// Radial soft sprite for smoke/dust/glow particles
const spriteCache = new Map();
export function softSprite(kind = 'smoke') {
  if (spriteCache.has(kind)) return spriteCache.get(kind);
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  if (kind === 'smoke') {
    const N = makeNoiseSet(kind.length * 13, 4, 4);
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5; const d = Math.hypot(dx, dy) * 2;
      const n = fbm(N, x / s, y / s, 4, 4);
      const a = clamp01((1 - d) * 1.4) * clamp01(n * 1.6 - 0.25);
      const i = (y * s + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  } else if (kind === 'spark') {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  } else if (kind === 'flash') {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3 + (i % 2) * 0.2);
      const gr = g.createLinearGradient(0, 0, s / 2, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -6); g.lineTo(s / 2, 0); g.lineTo(0, 6); g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, s / 3); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = gr; g.fillRect(-s / 2, -s / 2, s, s);
  } else if (kind === 'flake') {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(kind, t); return t;
}
