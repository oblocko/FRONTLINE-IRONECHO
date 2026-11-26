// Water that reads as water from the street and from the air: deep blue-green, a moving ripple normal map
// (two layers scrolling against each other), sharp sky / sun reflections. tickWater(dt) scrolls the ripples.
import * as THREE from 'three';

let tex = null; const mats = [];
function rippleNormal() {
  if (tex) return tex;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), img = g.createImageData(N, N);
  // height field: a few tiling sine waves + small noise, then its gradient as a normal
  const H = new Float32Array(N * N); let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = Array.from({ length: 9 }, () => ({ kx: Math.round(1 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1), kz: Math.round(1 + rnd() * 6), p: rnd() * 6.28, a: 0.4 + rnd() }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let h = 0; for (const w of waves) h += w.a * Math.sin(((w.kx * x + w.kz * y) / N) * Math.PI * 2 + w.p); H[y * N + x] = h; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)], dy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
    const nx = -dx * 0.35, ny = -dy * 0.35, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // one tile = 9 m: batch with { texMeters: 9 } or worldUV()
  return tex;
}
// color: the body colour (a river is greener / browner than a park lake)
export function waterMat(color = 0x1e4452) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4, normalMap: rippleNormal(), normalScale: new THREE.Vector2(0.55, 0.55) });
  mats.push(m); return m;
}
let t = 0;
export function tickWater(dt) { if (!tex) return; t += dt; tex.offset.set((t * 0.012) % 1, (t * 0.02) % 1); }
// world-space UVs (9 m per ripple tile) on a flat geometry, so the ripple size is the same everywhere
export function worldUV(g) { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 9; uv[i * 2 + 1] = p.getZ(i) / 9; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
