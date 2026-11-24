// Korean street signage (all names fictional). Text is laid out at the sign's real aspect ratio and
// shrunk to fit — never stretched. Kinds:
//   box       lit panel sign over a shopfront (plain / two-tone / logo disc / border, several fonts)
//   channel   individual letters on a raceway bar (no panel), letters face-lit or reverse
//   vertical  projecting double-sided sign on an arm, one syllable per line (upper-floor tenants)
//   window    vinyl lettering on an upper-floor window (academy, clinic, PC bang …)
//   banner    cloth banner across a facade (for rent, sale)
import * as THREE from 'three';

const FONT = '"WenQuanYi Zen Hei", "Noto Sans KR", "Malgun Gothic", sans-serif';
const PX = 160;                          // canvas pixels per metre
const texCache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h)); return c; }
function finish(c, key) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (key) texCache.set(key, t); return t; }
// font size that fits `text` into maxW x maxH (px) at weight
function fit(g, text, maxW, maxH, weight = 'bold', family = FONT) {
  let s = maxH; g.font = `${weight} ${s}px ${family}`;
  const w = g.measureText(text).width; if (w > maxW) s = Math.floor(s * maxW / w);
  g.font = `${weight} ${s}px ${family}`; return s;
}
function grime(g, W, H, n = 200, a = 0.1) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(40,34,26,${Math.random() * a})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 4); } }

// ------------------------------------------------------------------ catalogue
// [name, sub, category, colours [bg, fg, accent]] — categories pick the shop interior type too
// interior types: 0 store, 1 cafe, 2 restaurant, 3 pharmacy / clinic, 4 office / realty, 5 phone / optician, 6 salon, 7 closed
export const SHOPS = [
  ['하루마트', '24시 편의점', 'store', ['#1f6e4c', '#ffffff', '#f2b705']], ['오늘편의점', '24H', 'store', ['#ffffff', '#1d3f8a', '#e2231a']],
  ['새봄약국', '', 'pharmacy', ['#1f8a4c', '#ffffff', '#ffffff']], ['온누리약국', 'PHARMACY', 'pharmacy', ['#e8f1ea', '#1d6a3a', '#1d6a3a']],
  ['카페 모래시계', 'COFFEE & BAKERY', 'cafe', ['#2b2420', '#e8d7b8', '#c8a46a']], ['커피나무', '', 'cafe', ['#f2ede2', '#3a2a1e', '#5e8a3a']], ['달빛다방', '', 'cafe', ['#1c2a3a', '#f0d68a', '#f0d68a']],
  ['한솥국밥', '24시 해장국', 'restaurant', ['#8a1c14', '#fff4d8', '#f5c242']], ['고향칼국수', '', 'restaurant', ['#f5ecd8', '#5a2a14', '#b83a1a']], ['연서닭갈비', '', 'restaurant', ['#e85d0c', '#ffffff', '#2a2a2a']],
  ['바삭치킨', '배달 · 포장', 'restaurant', ['#f5c400', '#3a1a0a', '#d8261c']], ['김밥나라', '김밥 · 라면 · 떡볶이', 'restaurant', ['#ffffff', '#d8261c', '#1f5aa8']], ['명동돈가스', '', 'restaurant', ['#3a2a1c', '#ffd27a', '#ffd27a']],
  ['연서부동산', '아파트 · 상가 · 매매 · 전세', 'office', ['#ffffff', '#1d3f8a', '#1d3f8a']], ['미래공인중개사', '', 'office', ['#1d3f8a', '#ffffff', '#f2b705']],
  ['스타폰', '휴대폰 · 인터넷', 'phone', ['#e2231a', '#ffffff', '#ffffff']], ['맑은안경', '안경 · 콘택트렌즈', 'optician', ['#0f2a4a', '#ffffff', '#5ab0e0']],
  ['헤어 라온', 'HAIR SALON', 'salon', ['#111111', '#ffffff', '#c8a46a']], ['미소세탁', '세탁 · 수선', 'store', ['#3a8ac8', '#ffffff', '#ffffff']],
  ['꽃담 플라워', '', 'store', ['#f5e6ea', '#8a2a4a', '#3a6a2a']], ['우리정육점', '한우 · 한돈', 'store', ['#b8141a', '#ffffff', '#ffffff']], ['빵굽는마을', 'BAKERY', 'cafe', ['#f2e2c4', '#6a3a14', '#6a3a14']],
  ['연서신협', '', 'office', ['#00508a', '#ffffff', '#f2b705']], ['다온문구', '문구 · 팬시', 'store', ['#ffd400', '#1a1a1a', '#e2231a']], ['밝은치과', '', 'clinic', ['#ffffff', '#00708a', '#00708a']],
];
const INTERIOR = { store: 0, cafe: 1, restaurant: 2, pharmacy: 3, clinic: 3, office: 4, phone: 5, optician: 5, salon: 6, closed: 7 };
export const interiorType = (cat) => INTERIOR[cat] ?? 0;
// upper-floor tenants (window lettering / vertical signs)
export const TENANTS = [['수학의 정석 학원', '#1d3f8a'], ['영어 전문 학원', '#c8141a'], ['밝은치과', '#00708a'], ['연세 내과', '#1d6a3a'], ['PC방', '#3a1a8a'], ['스터디카페', '#2a2a2a'],
  ['태권도장', '#c8141a'], ['필라테스', '#8a2a5a'], ['헬스클럽', '#1a1a1a'], ['노래연습장', '#8a1a6a'], ['당구장', '#1a6a3a'], ['세무회계', '#1d3f8a'], ['법무사 사무소', '#3a3a3a'], ['한의원', '#5a3a1a'], ['피부과', '#c86a8a'], ['교회', '#5a1a1a']];

// ------------------------------------------------------------------ textures
// panel face texture, w x h metres. style: 'plain' | 'split' | 'logo' | 'border'
export function boxTexture(name, sub, [bg, fg, ac], w, h, style = 'plain') {
  const key = `box|${name}|${sub}|${bg}|${w.toFixed(1)}|${h.toFixed(1)}|${style}`; if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w * PX, h * PX), g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let x0 = H * 0.25, x1 = W - H * 0.25;
  if (style === 'split') { g.fillStyle = ac; g.fillRect(0, 0, H * 1.1, H); x0 = H * 1.35; g.fillStyle = bg; g.font = `bold ${H * 0.5}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name[0], H * 0.55, H * 0.54); }
  if (style === 'logo') { g.fillStyle = ac; g.beginPath(); g.arc(H * 0.6, H / 2, H * 0.34, 0, Math.PI * 2); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(H * 0.6, H / 2, H * 0.2, 0, Math.PI * 2); g.fill(); x0 = H * 1.15; }
  if (style === 'border') { g.strokeStyle = ac; g.lineWidth = H * 0.06; g.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16); }
  g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'center';
  const cx = (x0 + x1) / 2, tw = x1 - x0;
  if (sub) {
    fit(g, name, tw, H * 0.5); g.fillText(name, cx, H * 0.4);
    g.globalAlpha = 0.9; fit(g, sub, tw * 0.9, H * 0.17, 'normal'); g.fillStyle = style === 'border' || style === 'split' ? ac : fg; g.fillText(sub, cx, H * 0.78); g.globalAlpha = 1;
  } else { fit(g, name, tw, H * 0.62); g.fillText(name, cx, H * 0.53); }
  // light sheen + edge vignette, dust
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  grime(g, W, H, Math.round(W * H / 2500), 0.08);
  return finish(c, key);
}
// letters only, transparent background (channel letters). Returns { tex, aspect }
export function lettersTexture(text, fg, outline = null, h = 0.9) {
  const key = `ch|${text}|${fg}|${outline}|${h}`; if (texCache.has(key)) return texCache.get(key);
  const H = Math.round(h * PX), g0 = canvas(10, 10).getContext('2d'); g0.font = `bold ${H * 0.82}px ${FONT}`;
  const W = Math.ceil(g0.measureText(text).width + H * 0.3);
  const c = canvas(W, H), g = c.getContext('2d'); g.font = `bold ${H * 0.82}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (outline) { g.lineWidth = H * 0.08; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(text, W / 2, H * 0.54); }
  g.fillStyle = fg; g.fillText(text, W / 2, H * 0.54);
  const t = finish(c); const r = { tex: t, aspect: W / H }; texCache.set(key, r); return r;
}
// one syllable per line, for vertical projecting signs
export function verticalTexture(text, bg, fg, w, h) {
  const key = `v|${text}|${bg}|${w}|${h}`; if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w * PX, h * PX), g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(W * 0.08, 0, W * 0.04, H);
  const chars = [...text.replace(/ /g, '')], step = Math.min(W * 0.9, (H * 0.92) / chars.length);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.floor(step * 0.82)}px ${FONT}`;
  chars.forEach((ch, i) => g.fillText(ch, W / 2, H / 2 + (i - (chars.length - 1) / 2) * step));
  grime(g, W, H, 60, 0.1);
  return finish(c, key);
}
// vinyl lettering for a window (transparent), wraps into up to 2 lines
export function windowTexture(text, color, w, h) {
  const key = `w|${text}|${color}|${w}|${h}`; if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w * PX, h * PX), g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = text.split(' '); const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
  lines.forEach((ln, i) => { fit(g, ln, W * 0.9, H * 0.36); g.fillText(ln, W / 2, H * (lines.length === 1 ? 0.5 : 0.3 + i * 0.4)); });
  return finish(c, key);
}
export function bannerTexture(text, sub, w, h) {
  const key = `b|${text}|${sub}|${w}|${h}`; if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w * PX, h * PX), g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, W, H); g.fillStyle = '#d8261c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, text, W * 0.9, H * 0.5); g.fillText(text, W / 2, H * 0.38); g.fillStyle = '#1a1a1a'; fit(g, sub, W * 0.85, H * 0.26, 'normal'); g.fillText(sub, W / 2, H * 0.78);
  for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, W, 2); }
  grime(g, W, H, 120, 0.1); return finish(c, key);
}

// ------------------------------------------------------------------ meshes
const matCache = new Map();
const mat = (k, f) => { if (!matCache.has(k)) matCache.set(k, f()); return matCache.get(k); };
const housing = () => mat('housing', () => new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.6 }));
const faceMat = (tex, lit) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, emissiveMap: lit ? tex : null, emissive: lit ? 0xffffff : 0x000000, emissiveIntensity: lit ? 0.35 : 0 });

// All builders return a Group whose local +Z faces out of the wall and whose origin is the sign centre
// on the wall plane.
export function boxSign(name, sub, cols, w, h, { style = 'plain', lit = false, depth = 0.22 } = {}) {
  const g = new THREE.Group(); const face = faceMat(boxTexture(name, sub, cols, w, h, style), lit);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [housing(), housing(), housing(), housing(), face, housing()]);
  m.position.z = depth / 2; g.add(m); return g;
}
export function channelSign(text, fg, h, { outline = null, raceway = '#3a3a3a', lit = false } = {}) {
  const g = new THREE.Group(); const { tex, aspect } = lettersTexture(text, fg, outline);
  const w = h * aspect;
  if (raceway) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.22, 0.12), new THREE.MeshStandardMaterial({ color: raceway, roughness: 0.6, metalness: 0.4 })); bar.position.z = 0.06; g.add(bar); }
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.4, emissiveMap: lit ? tex : null, emissive: lit ? 0xffffff : 0, emissiveIntensity: lit ? 0.5 : 0, side: THREE.DoubleSide });
  // three stacked planes give the letters a little thickness
  for (const z of [0.14, 0.19]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), z < 0.19 ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, color: 0x555555, roughness: 0.6 }) : m); p.position.z = z; g.add(p); }
  g.userData.width = w; return g;
}
export function verticalSign(text, bg, fg, w = 0.6, h = 2.6) {
  const g = new THREE.Group(); const t = verticalTexture(text, bg, fg, w, h); const f = faceMat(t, false);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, w), [f, f, housing(), housing(), housing(), housing()]);
  m.position.z = 0.25 + w / 2; g.add(m);
  for (const y of [h * 0.4, -h * 0.4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), housing()); arm.position.set(0, y, 0.14); g.add(arm); }
  return g;
}
export function windowLettering(text, color, w, h) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: windowTexture(text, color, w, h), transparent: true, alphaTest: 0.3, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  p.position.z = 0.045; return p;
}
export function banner(text, sub, w, h) {
  const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 1), new THREE.MeshStandardMaterial({ map: bannerTexture(text, sub, w, h), roughness: 0.9, side: THREE.DoubleSide }));
  const pos = p.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.05 + Math.sin((pos.getX(i) / w + 0.5) * Math.PI) * 0.06);
  p.geometry.computeVertexNormals(); g.add(p); return g;
}
