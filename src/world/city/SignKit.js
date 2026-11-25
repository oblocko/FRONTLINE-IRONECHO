// Shop signage kit for the hand-made Seoul streets (names fictional). Every builder returns a Group whose
// local +Z points out of the wall (or, for free-standing signs, toward the viewer) and whose origin is the
// sign centre on the wall plane (free-standing: on the ground).
//
// By where it hangs                         By material / light
//   fascia  가로형 전면 (on a sign band)       channel  LED 채널: 'front' 전광 / 'halo' 후광 / 'side' 측광
//   blade   돌출 세로형 (long, on an arm)      flex     플렉스: printed lit box, optional marquee bulbs
//   point   돌출 포인트형 (small: square /     scashi   스카시: cut letters on a panel or wall, unlit, gooseneck
//           round / cube, lit)                         spot lamps above
//   aFrame / stand / xBanner  입간판           metal    갈바·금속: brass / corten / steel panel, letters cut
//   pylon   지주 간판 (tenant column)                   out and back-lit
//   awning  어닝 (fabric, printed)             neon     네온·LED 네온플렉스: glowing tube script on clear acrylic
//   roofBoard 옥상 간판 (truss frame)          wood     우드: planks, carved letters
//                                              hologram 3D 홀로그램 (spinning fan disc)
import * as THREE from 'three';

const SANS = '"Pretendard", "Noto Sans KR", "WenQuanYi Zen Hei", "Malgun Gothic", sans-serif';
const SERIF = '"Noto Serif KR", "Nanum Myeongjo", Georgia, serif';
const SCRIPT = '"Segoe Script", "Brush Script MT", "Nanum Pen Script", cursive';
const PX = 140;
const texCache = new Map(), matCache = new Map();
const mat = (k, f) => { if (!matCache.has(k)) matCache.set(k, f()); return matCache.get(k); };
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = Math.max(16, Math.round(w)); c.height = Math.max(16, Math.round(h));
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texCache.set(key, t); return t;
}
function fit(g, text, maxW, maxH, weight, family) { let s = maxH; g.font = `${weight} ${s}px ${family}`; const w = g.measureText(text).width; if (w > maxW) s = Math.floor(s * maxW / w); g.font = `${weight} ${s}px ${family}`; return s; }
const fam = (f) => (f === 'serif' ? SERIF : f === 'script' ? SCRIPT : SANS);
const housing = () => mat('housing', () => new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.45, metalness: 0.6 }));
const steel = () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x7a7e82, roughness: 0.4, metalness: 0.7 }));
const lampMat = () => mat('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe8c0, emissiveIntensity: 1.4 }));
const lit = (map, k = 0.55) => new THREE.MeshStandardMaterial({ map, roughness: 0.4, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k });
const unlit = (map, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal });
const glow = (map, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const plane = (w, h, m, z = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.z = z; return p; };
const boxMesh = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };

// ------------------------------------------------------------------ textures
// letters on transparent (or on a background), sized to the text; returns { tex, aspect }
function letters(text, { fg = '#ffffff', bg = null, font = 'sans', weight = 'bold', h = 1, outline = null, glowC = null, sub = null, pad = 0.25 } = {}) {
  const key = `L|${text}|${fg}|${bg}|${font}|${weight}|${outline}|${glowC}|${sub}`;
  if (texCache.has(key + '|r')) return texCache.get(key + '|r');
  const H = Math.round(h * PX), g0 = document.createElement('canvas').getContext('2d'); g0.font = `${weight} ${H * 0.7}px ${fam(font)}`;
  const W = Math.ceil(g0.measureText(text).width + H * pad * 2);
  const tex = canvasTex(key, W, H, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${weight} ${H * 0.7}px ${fam(font)}`;
    const y = sub ? H * 0.42 : H * 0.53;
    if (glowC) { g.shadowColor = glowC; g.shadowBlur = H * 0.18; g.fillStyle = glowC; for (let i = 0; i < 3; i++) g.fillText(text, W / 2, y); g.shadowBlur = 0; }
    if (outline) { g.lineWidth = H * 0.05; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(text, W / 2, y); }
    g.fillStyle = fg; g.fillText(text, W / 2, y);
    if (sub) { g.font = `normal ${H * 0.14}px ${SANS}`; g.fillStyle = fg; g.fillText(sub, W / 2, H * 0.86); }
  });
  const r = { tex, aspect: W / H }; texCache.set(key + '|r', r); return r;
}
const lettersR = letters;
// a printed face (flex, awning valance, A-frame, pylon panels): background, name, optional sub line, optional logo disc
function face(key, w, h, { bg, fg, sub = null, accent = null, font = 'sans', logo = null, border = null, stripes = null }, draw) {
  return canvasTex(`F|${key}|${w}|${h}`, w * PX, h * PX, (g, W, H) => {
    if (stripes) { const n = Math.round(w / 0.25); for (let i = 0; i < n; i++) { g.fillStyle = stripes[i % 2]; g.fillRect(i * W / n, 0, W / n + 1, H); } } else { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    if (border) { g.strokeStyle = border; g.lineWidth = H * 0.05; g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12); }
    let x0 = W * 0.06; if (logo) { g.fillStyle = accent ?? fg; g.beginPath(); g.arc(H * 0.55, H / 2, H * 0.34, 0, 7); g.fill(); g.fillStyle = bg; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, logo, H * 0.5, H * 0.4, 'bold', SANS); g.fillText(logo, H * 0.55, H / 2); x0 = H * 1.0; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = (x0 + W * 0.94) / 2, tw = W * 0.94 - x0;
    if (draw) draw(g, W, H);
    else if (sub) { fit(g, key.split('|')[0], tw, H * 0.5, 'bold', fam(font)); g.fillText(key.split('|')[0], cx, H * 0.4); g.fillStyle = accent ?? fg; fit(g, sub, tw * 0.9, H * 0.2, 'normal', SANS); g.fillText(sub, cx, H * 0.78); }
    else { fit(g, key.split('|')[0], tw, H * 0.62, 'bold', fam(font)); g.fillText(key.split('|')[0], cx, H * 0.53); }
  });
}

// ------------------------------------------------------------------ material / light kinds (wall signs)
// LED channel letters. light: 'front' face-lit, 'halo' dark faces with a glow on the wall behind, 'side' lit returns
export function channel(text, { color = '#ffffff', h = 0.8, light = 'front', font = 'sans', returns = '#3a3a3a', raceway = null } = {}) {
  const g = new THREE.Group(); const L = lettersR(text, { fg: color, font, h: 1 }); const w = h * L.aspect;
  if (raceway) g.add(boxMesh(w * 0.9, h * 0.2, 0.1, mat(`rw${raceway}`, () => new THREE.MeshStandardMaterial({ color: raceway, roughness: 0.5, metalness: 0.4 })), 0, 0, 0.05));
  if (light === 'halo') {
    const H = lettersR(text, { fg: color, font, h: 1, glowC: color }); const halo = plane(w * 1.08, h * 1.25, glow(H.tex, 0.85), 0.02); g.add(halo);
    const dark = lettersR(text, { fg: returns, font, h: 1 });
    for (const z of [0.06, 0.1, 0.14]) g.add(plane(w, h, new THREE.MeshStandardMaterial({ map: dark.tex, transparent: true, alphaTest: 0.4, roughness: 0.35, metalness: 0.5 }), z));
  } else {
    const sideC = light === 'side' ? color : returns; const S = lettersR(text, { fg: sideC, font, h: 1 });
    const sideM = light === 'side' ? new THREE.MeshBasicMaterial({ map: S.tex, transparent: true, alphaTest: 0.4, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: S.tex, transparent: true, alphaTest: 0.4, roughness: 0.5 });
    for (const z of [0.05, 0.09, 0.13]) g.add(plane(w, h, sideM, z));
    const F = light === 'side' ? lettersR(text, { fg: '#f4f4f0', font, h: 1 }) : L;
    const fm = new THREE.MeshStandardMaterial({ map: F.tex, transparent: true, alphaTest: 0.4, roughness: 0.35, emissiveMap: light === 'front' ? F.tex : null, emissive: light === 'front' ? 0xffffff : 0, emissiveIntensity: 0.7 });
    g.add(plane(w, h, fm, 0.16));
  }
  g.userData.width = w; g.userData.kit = true; return g;
}
// flex: printed face in a lit box; bulbs: a row of marquee bulbs around the frame
export function flex(name, { sub = null, bg = '#ffffff', fg = '#1a1a1a', accent = null, w = 6, h = 1.1, font = 'sans', logo = null, border = null, bulbs = false, frame = '#2a2c2e' } = {}) {
  const g = new THREE.Group(); const t = face(`${name}|flex|${bg}|${fg}|${sub}`, w, h, { bg, fg, sub, accent, font, logo, border });
  const fr = mat(`fr${frame}`, () => new THREE.MeshStandardMaterial({ color: frame, roughness: 0.4, metalness: 0.6 }));
  g.add(boxMesh(w + 0.12, h + 0.12, 0.24, fr, 0, 0, 0.12)); g.add(plane(w, h, lit(t, 0.5), 0.245));
  if (bulbs) { const bg2 = new THREE.SphereGeometry(0.045, 8, 6); for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.3) for (const y of [h / 2 + 0.03, -h / 2 - 0.03]) { const b = new THREE.Mesh(bg2, lampMat()); b.position.set(x, y, 0.26); g.add(b); } }
  g.userData.width = w; return g;
}
// scashi: cut letters standing off a panel (or straight on the wall when panel is null), unlit; gooseneck lamps above
export function scashi(text, { color = '#1a1a1a', panel = '#f0eeea', w = null, h = 0.7, font = 'sans', sub = null, lamps = 3, metal = 0 } = {}) {
  const g = new THREE.Group(); const L = lettersR(text, { fg: color, font, h: 1, sub }); const lw = h * L.aspect, pw = w ?? lw + 0.8, ph = h + 0.5;
  if (panel) g.add(boxMesh(pw, ph, 0.1, mat(`pn${panel}`, () => new THREE.MeshStandardMaterial({ color: panel, roughness: 0.55 })), 0, 0, 0.05));
  const lm = new THREE.MeshStandardMaterial({ map: L.tex, transparent: true, alphaTest: 0.4, roughness: metal ? 0.3 : 0.6, metalness: metal });
  for (const z of [0.13, 0.15, 0.17]) g.add(plane(lw, h, lm, z));
  for (let i = 0; i < lamps; i++) { const x = lamps === 1 ? 0 : -pw / 2 + 0.4 + i * (pw - 0.8) / (lamps - 1);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 12, Math.PI / 2), housing()); arm.rotation.y = -Math.PI / 2; arm.position.set(x, ph / 2 + 0.02, 0.02); g.add(arm);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 12, 1, true), housing()); head.position.set(x, ph / 2 + 0.2, 0.32); head.rotation.x = Math.PI * 0.85; g.add(head);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), lampMat()); bulb.position.set(x, ph / 2 + 0.14, 0.35); bulb.rotation.x = Math.PI / 2 + 0.5; g.add(bulb);
    const pool = plane(0.9, ph * 0.9, glow(poolTex(), 0.28), 0.115); pool.position.set(x, 0.05, 0.115); g.add(pool); }
  g.userData.width = pw; return g;
}
const poolTex = () => canvasTex('pool', 64, 128, (g, W, H) => { const gr = g.createRadialGradient(W / 2, 0, 2, W / 2, H * 0.1, H); gr.addColorStop(0, 'rgba(255,236,200,0.9)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
// metal panel (brass / corten / steel / black) with the letters cut out and lit from behind
export function metal(text, { kind = 'brass', w = null, h = 0.9, font = 'serif', light = '#ffd890', sub = null, vertical = false } = {}) {
  const base = { brass: '#a8844a', corten: '#7a4a2a', steel: '#8a9096', black: '#1c1c1e' }[kind];
  const L = lettersR(text, { fg: light, font, h: 1, sub }); const lw = h * L.aspect * 0.8, pw = w ?? lw + 0.6, ph = h;
  const t = canvasTex(`metal|${kind}`, 256, 128, (g, W, H) => { g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = kind === 'corten' ? `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${Math.random() * 0.25})` : `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, kind === 'corten' ? 3 : 40, kind === 'corten' ? 3 : 1); } });
  const g = new THREE.Group(); const pm = new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'corten' ? 0.8 : 0.3, metalness: kind === 'corten' ? 0.2 : 0.85 });
  const pnl = vertical ? boxMesh(ph, pw, 0.08, pm, 0, 0, 0.06) : boxMesh(pw, ph, 0.08, pm, 0, 0, 0.06); g.add(pnl);
  const lp = plane(lw, h * 0.8, new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, alphaTest: 0.3, toneMapped: false }), 0.105); if (vertical) lp.rotation.z = -Math.PI / 2; g.add(lp);
  const halo = plane((vertical ? ph : pw) + 0.5, (vertical ? pw : ph) + 0.4, glow(poolTex(), 0.25), 0.01); halo.rotation.z = Math.PI; g.add(halo);
  g.userData.width = vertical ? ph : pw; return g;
}
// neon / LED neon-flex: glowing script on a clear acrylic backboard held off the wall
export function neon(text, { color = '#ff4aa0', h = 0.9, font = 'script', board = true } = {}) {
  const L = lettersR(text, { fg: '#ffffff', font, weight: 'normal', h: 1, glowC: color }); const w = h * L.aspect;
  const g = new THREE.Group(); g.add(plane(w, h, glow(L.tex), 0.09));
  const halo = lettersR(text, { fg: color, font, weight: 'normal', h: 1, glowC: color }); const hp = plane(w * 1.15, h * 1.4, glow(halo.tex, 0.5), 0.02); g.add(hp);
  if (board) { g.add(boxMesh(w + 0.2, h + 0.15, 0.02, mat('acryl', () => new THREE.MeshStandardMaterial({ color: 0xdfe8ec, transparent: true, opacity: 0.12, roughness: 0.05 })), 0, 0, 0.07));
    for (const [x, y] of [[-w / 2, h / 2], [w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]]) g.add(boxMesh(0.03, 0.03, 0.07, steel(), x, y, 0.035)); }
  g.userData.width = w; return g;
}
// wood: horizontal planks, carved / painted letters
export function wood(text, { w = null, h = 0.8, font = 'serif', ink = '#f4ecd8', tone = '#7a5434', sub = null } = {}) {
  const L = lettersR(text, { fg: ink, font, h: 1, sub }); const lw = h * L.aspect * 0.85, pw = w ?? lw + 0.6;
  const t = canvasTex(`wood|${tone}`, 256, 128, (g, W, H) => { g.fillStyle = tone; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, W, 2); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,220,170'},${Math.random() * 0.12})`; g.fillRect(Math.random() * W, y + Math.random() * 30, 20 + Math.random() * 80, 1); } } });
  const g = new THREE.Group(); g.add(boxMesh(pw, h + 0.2, 0.08, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), 0, 0, 0.04));
  g.add(plane(lw, h * 0.85, new THREE.MeshStandardMaterial({ map: L.tex, transparent: true, alphaTest: 0.35, roughness: 0.7 }), 0.085));
  g.userData.width = pw; return g;
}

// ------------------------------------------------------------------ where it hangs
// projecting long vertical blade on two arms (double-sided), text one syllable / letter per line
export function blade(text, { bg = '#1a1a1a', fg = '#ffffff', w = 0.7, h = null, litK = 0.45 } = {}) {
  const chars = [...text.replace(/ /g, '')], H = h ?? Math.max(2, chars.length * w * 0.9 + 0.5);
  const t = canvasTex(`blade|${text}|${bg}|${fg}|${w}|${H}`, w * PX, H * PX, (g, W, Hh) => { g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    const step = Math.min(W * 0.92, Hh * 0.92 / chars.length); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.floor(step * 0.78)}px ${SANS}`;
    chars.forEach((ch, i) => g.fillText(ch, W / 2, Hh / 2 + (i - (chars.length - 1) / 2) * step)); });
  const f = lit(t, litK); const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, w), [f, f, housing(), housing(), housing(), housing()]); m.position.z = 0.35 + w / 2; g.add(m);
  for (const y of [H * 0.42, -H * 0.42]) g.add(boxMesh(0.06, 0.06, 0.36, housing(), 0, y, 0.18));
  g.userData.height = H; return g;
}
// small projecting point sign: 'square' / 'round' lit box on a bracket, 'cube' lit cube
export function point(text, { shape = 'square', bg = '#ffffff', fg = '#1a1a1a', size = 0.75, font = 'sans' } = {}) {
  const t = canvasTex(`pt|${text}|${shape}|${bg}|${fg}`, 160, 160, (g, W, H) => { if (shape === 'round') { g.fillStyle = bg; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, 7); g.fill(); } else { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; const lines = text.split('\n'); lines.forEach((ln, i) => { fit(g, ln, W * 0.74, H * 0.5 / lines.length, 'bold', fam(font)); g.fillText(ln, W / 2, H / 2 + (i - (lines.length - 1) / 2) * H * 0.3); }); });
  const g = new THREE.Group(); const f = lit(t, 0.6);
  if (shape === 'round') { const c = new THREE.Mesh(new THREE.CylinderGeometry(size / 2, size / 2, 0.14, 28), [housing(), new THREE.MeshStandardMaterial({ color: bg, emissive: bg, emissiveIntensity: 0.3 }), new THREE.MeshStandardMaterial({ color: bg })]); c.rotation.z = Math.PI / 2; c.position.z = 0.3 + size / 2; g.add(c);
    for (const s of [-1, 1]) { const p = plane(size * 0.98, size * 0.98, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.2, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6 })); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.075, 0, 0.3 + size / 2); g.add(p); } }
  else { const d = shape === 'cube' ? size : 0.16; const m = new THREE.Mesh(new THREE.BoxGeometry(d, size, size), shape === 'cube' ? f : [f, f, housing(), housing(), housing(), housing()]); m.position.z = 0.3 + size / 2; g.add(m); }
  g.add(boxMesh(0.05, 0.05, 0.32, housing(), 0, size / 2 - 0.05, 0.16));
  return g;
}
// awning (어닝): sloped fabric over the door with a valance; the brand printed on the slope and the valance
export function awning(name, { w = 4, depth = 1.3, drop = 0.6, color = '#1e4a3a', ink = '#ffffff', stripes = null, sub = null, font = 'serif', shape = 'slope' } = {}) {
  const g = new THREE.Group();
  const slopeT = face(`${name}|awn|${color}|${stripes}|${shape}`, w, Math.hypot(depth, drop), { bg: color, fg: ink, font, stripes }, (gg, W, H) => { if (!stripes) { gg.fillStyle = ink; gg.textAlign = 'center'; gg.textBaseline = 'middle'; fit(gg, name, W * 0.6, H * 0.36, 'bold', fam(font)); gg.fillText(name, W / 2, H * 0.55); } });
  const valT = face(`${name}|val|${color}|${sub}`, w, 0.25, { bg: stripes ? stripes[1] : color, fg: ink, font: 'sans' }, (gg, W, H) => { gg.fillStyle = ink; gg.textAlign = 'center'; gg.textBaseline = 'middle'; fit(gg, sub ?? name, W * 0.5, H * 0.7, 'normal', SANS); gg.fillText(sub ?? name, W / 2, H * 0.55); });
  const fab = new THREE.MeshStandardMaterial({ map: slopeT, roughness: 0.85, side: THREE.DoubleSide });
  if (shape === 'dome') { const n = 6; for (let k = 0; k < n; k++) { const a0 = (k / n) * Math.PI / 2, a1 = ((k + 1) / n) * Math.PI / 2;
      const p0 = [Math.sin(a0) * depth, -(1 - Math.cos(a0)) * drop * 1.6], p1 = [Math.sin(a1) * depth, -(1 - Math.cos(a1)) * drop * 1.6];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), f = new THREE.Mesh(new THREE.PlaneGeometry(w, len), fab);
      f.rotation.x = -(Math.PI / 2 - Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]));
      f.position.set(0, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2); g.add(f); } drop = drop * 1.6; }
  else { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.hypot(depth, drop)), fab); s.rotation.x = -(Math.PI / 2 - Math.atan2(drop, depth)); s.position.set(0, -drop / 2, depth / 2); g.add(s); }
  const v = plane(w, 0.25, new THREE.MeshStandardMaterial({ map: valT, roughness: 0.85, side: THREE.DoubleSide }), depth); v.position.y = -drop - 0.125; g.add(v);
  for (const sx of [-1, 1]) { const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(depth, -drop), new THREE.Vector2(depth, -drop - 0.25), new THREE.Vector2(0, -drop - 0.25)].map((p) => p)); const sg = new THREE.ShapeGeometry(tri); sg.rotateY(-Math.PI / 2); const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: stripes ? stripes[1] : color, roughness: 0.85, side: THREE.DoubleSide })); sm.position.x = sx * w / 2; g.add(sm); }
  g.add(boxMesh(w, 0.05, 0.05, steel(), 0, -drop - 0.02, depth));
  return g;
}
// A-frame board (입간판 A형): two printed panels leaning together
export function aFrame(name, { sub = '', bg = '#1a1a1a', fg = '#f4ecd8', w = 0.6, h = 1.0, chalk = false } = {}) {
  const g = new THREE.Group(); const t = face(`${name}|af|${bg}|${sub}|${chalk}`, w, h, { bg, fg, sub, font: chalk ? 'script' : 'sans' });
  const pm = [housing(), housing(), housing(), housing(), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), housing()];
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), pm); p.rotation.x = s * 0.17; p.position.set(0, h / 2 * Math.cos(0.17), s * h / 2 * Math.sin(0.17)); if (s < 0) p.rotation.y = Math.PI; g.add(p); }
  return g;
}
// stand sign (스탠드형): a lit panel on a weighted base
export function stand(name, { sub = '', bg = '#ffffff', fg = '#1a1a1a', w = 0.55, h = 1.3 } = {}) {
  const g = new THREE.Group(); const t = face(`${name}|st|${bg}|${sub}`, w, h * 0.75, { bg, fg, sub });
  g.add(boxMesh(w + 0.1, 0.08, 0.4, housing(), 0, 0.04, 0)); g.add(boxMesh(0.05, h * 0.25, 0.05, steel(), 0, 0.08 + h * 0.125, 0));
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.75, 0.1), [housing(), housing(), housing(), housing(), lit(t, 0.4), lit(t, 0.4)]); p.position.y = h * 0.25 + h * 0.375; g.add(p);
  return g;
}
// X-banner (배너형): tall printed fabric on a crossed frame
export function xBanner(name, { sub = '', bg = '#ffffff', fg = '#1a1a1a', accent = '#d8261c', h = 1.8 } = {}) {
  const w = 0.6, g = new THREE.Group();
  const t = face(`${name}|xb|${bg}|${sub}`, w, h, { bg, fg, sub, accent }, (gg, W, H) => { gg.fillStyle = accent; gg.fillRect(0, 0, W, H * 0.16); gg.fillRect(0, H * 0.9, W, H * 0.1); gg.fillStyle = fg; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    const lines = name.split(' '); lines.forEach((ln, i) => { fit(gg, ln, W * 0.85, H * 0.09, 'bold', SANS); gg.fillText(ln, W / 2, H * (0.28 + i * 0.11)); }); gg.fillStyle = accent; fit(gg, sub, W * 0.85, H * 0.06, 'bold', SANS); gg.fillText(sub, W / 2, H * 0.78); });
  g.add(plane(w, h, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide }), 0)); g.children[0].position.y = h / 2 + 0.1;
  for (const s of [-1, 1]) { const r = boxMesh(0.02, Math.hypot(w, h), 0.02, steel(), 0, h / 2 + 0.1, -0.03); r.rotation.z = s * Math.atan2(w, h); g.add(r); }
  g.add(boxMesh(0.5, 0.05, 0.3, housing(), 0, 0.025, -0.05));
  return g;
}
// pylon (지주 간판): a free-standing column listing the building's tenants, lit panels both faces
export function pylon(title, tenants, { h = 6, w = 1.4, bg = '#2a2c30', titleBg = '#1a4a7a' } = {}) {
  const g = new THREE.Group(); const n = tenants.length, th = 0.9, ph = (h - th - 0.8) / n;
  g.add(boxMesh(w + 0.2, h, 0.5, housing(), 0, h / 2, 0)); g.add(boxMesh(w + 0.5, 0.4, 0.8, mat('pyb', () => new THREE.MeshStandardMaterial({ color: 0x8e8c88, roughness: 0.6 })), 0, 0.2, 0));
  const head = face(`${title}|py|${titleBg}`, w, th, { bg: titleBg, fg: '#ffffff' });
  for (const s of [-1, 1]) { const hp = plane(w, th, lit(head, 0.6), s * 0.252); hp.position.y = h - th / 2 - 0.15; if (s < 0) hp.rotation.y = Math.PI; g.add(hp);
    tenants.forEach(([name, cbg, cfg], i) => { const t = face(`${name}|pyt|${cbg}|${cfg}`, w, ph - 0.06, { bg: cbg, fg: cfg }); const p = plane(w, ph - 0.06, lit(t, 0.5), s * 0.252); p.position.y = h - th - 0.2 - ph * (i + 0.5); if (s < 0) p.rotation.y = Math.PI; g.add(p); }); }
  return g;
}
// rooftop board (옥상 간판): a lit panel on a steel truss frame
export function roofBoard(name, { sub = null, bg = '#ffffff', fg = '#1a1a1a', accent = null, w = 12, h = 3, logo = null } = {}) {
  const g = new THREE.Group(); const t = face(`${name}|roof|${bg}|${sub}`, w, h, { bg, fg, sub, accent, logo });
  const st = steel(); const leg = 2.2;
  for (let x = -w / 2 + 0.4; x <= w / 2 - 0.3; x += (w - 0.8) / Math.max(1, Math.round(w / 3))) { g.add(boxMesh(0.14, leg + h, 0.14, st, x, (leg + h) / 2, -0.6)); const br = boxMesh(0.08, Math.hypot(leg, 1.2), 0.08, st, x, leg / 2, -0.3); br.rotation.x = Math.atan2(1.2, leg); g.add(br); }
  for (const y of [leg + 0.1, leg + h / 2, leg + h - 0.1]) g.add(boxMesh(w, 0.1, 0.1, st, 0, y, -0.6));
  g.add(boxMesh(w + 0.2, h + 0.2, 0.3, housing(), 0, leg + h / 2, -0.3)); g.add(plane(w, h, lit(t, 0.6), -0.14)); g.children[g.children.length - 1].position.y = leg + h / 2;
  return g;
}
// LED screen (DID) with a frame; the texture is passed in
export function screen(map, w, h) { const g = new THREE.Group(); g.add(boxMesh(w + 0.3, h + 0.3, 0.3, housing(), 0, 0, 0.15)); g.add(plane(w, h, new THREE.MeshBasicMaterial({ map, toneMapped: false }), 0.31)); return g; }
// 3D hologram fan: a glowing logo floating inside a clear sphere on a slim stand (spins via userData.spin)
export function hologram(text, { color = '#7ad8ff', r = 0.6, h = 1.2 } = {}) {
  const g = new THREE.Group(); g.add(boxMesh(0.06, h, 0.06, steel(), 0, h / 2, 0)); g.add(boxMesh(0.5, 0.05, 0.5, housing(), 0, 0.025, 0));
  const sph = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat('holo', () => new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.08, roughness: 0.02, depthWrite: false }))); sph.position.y = h + r; g.add(sph);
  const L = lettersR(text, { fg: '#ffffff', h: 1, glowC: color }); const fan = plane(r * 1.6, r * 1.6 / L.aspect * 1.4, glow(L.tex)); fan.position.y = h + r; g.add(fan); g.userData.spin = fan;
  return g;
}

// Bake a placed sign into the city batch (merged per material, world-space, UVs kept): hundreds of signs
// cost a handful of draw calls. Multi-material boxes are split per face group. Spinning parts stay live.
export function bake(ctx, g, B = ctx.batch) {
  g.updateMatrixWorld(true);
  const live = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (o === g.userData.spin) { live.push(o); return; }
    const src = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
    const parts = Array.isArray(o.material) && src.groups.length ? src.groups.map((gr) => { const ge = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (src.attributes[k]) ge.setAttribute(k, src.attributes[k]); ge.setIndex(new THREE.BufferAttribute(src.index.array.slice(gr.start, gr.start + gr.count), 1)); return [ge, mats[gr.materialIndex]]; }) : [[src.clone(), mats[0]]];
    for (const [ge, m] of parts) { if (!m) continue; const w = ge.clone().applyMatrix4(o.matrixWorld); if (!w.attributes.uv) continue; w.userData.keepUV = true; B.add(w, m, { cast: false, near: true }); }
  });
  if (live.length) { for (const o of live) { o.getWorldPosition(o.position); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); ctx.scene.add(o); } }
  return g;
}
