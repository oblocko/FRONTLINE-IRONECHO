// Industrial buildings for port / harbour levels, modelled rather than plain boxes:
//   warehouse(): steel portal-frame shed — concrete plinth, vertically ribbed cladding, low-pitch gable roof
//   with ridge cap, overhang, gutters and downpipes, translucent skylight strips and a clerestory band,
//   roller-shutter doors (drum box, guides, slatted curtain, partly raised onto a dark interior),
//   personnel doors with canopies, wall lights, a painted bay number and owner name (Korean).
// Solid collider (these are not entered); static parts are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { corrugated } from './Containers.js';

const FONT_KO = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Nanum Gothic",sans-serif';
let mats = null;
function materials() {
  if (mats) return mats;
  const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep); t.anisotropy = 8; return t; };
  const noise = (x, w, h, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * a})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  const streaks = (x, w, h, n) => { for (let i = 0; i < n; i++) { const sx = Math.random() * w, len = h * (0.2 + Math.random() * 0.7); const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(50,44,36,0.12)'); g.addColorStop(1, 'rgba(50,44,36,0)'); x.fillStyle = g; x.fillRect(sx, 0, 2 + Math.random() * 5, len); } };
  const clad = tex(512, 256, (x, w, h) => { x.fillStyle = '#a9b0b4'; x.fillRect(0, 0, w, h); streaks(x, w, h, 40); noise(x, w, h, 600, 0.06); const g = x.createLinearGradient(0, h * 0.8, 0, h); g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, 'rgba(60,50,40,0.25)'); x.fillStyle = g; x.fillRect(0, h * 0.8, w, h * 0.2); });
  const conc = tex(256, 256, (x, w, h) => { x.fillStyle = '#9a968e'; x.fillRect(0, 0, w, h); noise(x, w, h, 2500, 0.12); for (let i = 0; i < 3; i++) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.moveTo(i * 85 + 40, 0); x.lineTo(i * 85 + 40, h); x.stroke(); } }, [1, 1]);
  const roof = tex(256, 256, (x, w, h) => { x.fillStyle = '#7c858c'; x.fillRect(0, 0, w, h); noise(x, w, h, 900, 0.08); streaks(x, w, h, 20); });
  const shutter = tex(128, 256, (x, w, h) => { x.fillStyle = '#8a9096'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, y, w, 2); x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, y + 6, w, 2); } noise(x, w, h, 300, 0.1); });
  const stripes = tex(64, 64, (x, w, h) => { x.fillStyle = '#e8c020'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); } });
  mats = {
    clad: new THREE.MeshStandardMaterial({ map: clad, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2d4a6a, roughness: 0.5, metalness: 0.5 }),
    conc: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.92 }),
    roof: new THREE.MeshStandardMaterial({ map: roof, roughness: 0.55, metalness: 0.5 }),
    sky: new THREE.MeshStandardMaterial({ color: 0xd8e0d0, roughness: 0.35, transparent: true, opacity: 0.75, emissive: 0x404840, emissiveIntensity: 0.3 }),
    shutter: new THREE.MeshStandardMaterial({ map: shutter, roughness: 0.5, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5a6066, roughness: 0.45, metalness: 0.7 }),
    door: new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.55, metalness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe8c0, emissiveIntensity: 1.8 }),
    stripes: new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }),
  };
  return mats;
}
function signTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 256); x.fillStyle = '#f0efe8'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 120px ${FONT_KO}`; x.fillText(text, 256, 100); if (sub) { x.font = `700 40px ${FONT_KO}`; x.fillText(sub, 256, 200); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// spec: { x, z, y = ground, w (x size), d (z size), h (eave height), rotQ (quarter turns), doors: [{ side 'n'|'s'|'e'|'w', at, width, height, kind 'shutter'|'person', open (0..1) }], sign: '3', owner: '한바다해운' }
export function warehouse(game, spec) {
  const M = materials(), scene = game.renderer.scene;
  const { x, z, w, d, h = 8, rotQ = 0 } = spec; const y0 = spec.y ?? 0;
  const parts = new Map(); const put = (geo, m) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push(geo.index ? geo.toNonIndexed() : geo); };
  const grp = new THREE.Group(); grp.position.set(x, y0, z); grp.rotation.y = -rotQ * Math.PI / 2; scene.add(grp);
  const box = (sx, sy, sz, px, py, pz, m) => put(new THREE.BoxGeometry(sx, sy, sz).translate(px, py, pz), m);
  const plinth = 1.2, rise = Math.min(w, d) * 0.08;   // ~5° roof pitch, ridge along the longer side
  const ridgeAlongZ = d >= w; const span = ridgeAlongZ ? w : d, length = ridgeAlongZ ? d : w;
  // walls: per side, a list of openings; cladding is cut around them (panels between openings + above)
  const sides = {
    s: { len: w, at: (a) => [a, d / 2], rot: 0 }, n: { len: w, at: (a) => [-a, -d / 2], rot: Math.PI },
    e: { len: d, at: (a) => [w / 2, -a], rot: Math.PI / 2 }, w: { len: d, at: (a) => [-w / 2, a], rot: -Math.PI / 2 },
  };
  const gableSide = (k) => (ridgeAlongZ ? k === 'n' || k === 's' : k === 'e' || k === 'w');
  for (const [k, sd] of Object.entries(sides)) {
    const ops = (spec.doors || []).filter((o) => o.side === k).map((o) => ({ ...o, height: o.height ?? (o.kind === 'person' ? 2.2 : Math.min(h - 1.5, 5.5)) })).sort((a, b) => a.at - b.at);
    // a wall panel piece in wall-local coords: a = along the wall (−len/2..len/2), y up, facing outward (+Z local)
    const panel = (a0, a1, yA, yB) => {
      if (a1 - a0 < 0.05 || yB - yA < 0.05) return;
      const lo = Math.max(yA, plinth), hi = yB;
      const tr = (geo) => { geo.translate((a0 + a1) / 2, 0, 0); geo.rotateY(sd.rot); const [px, pz] = sd.at(0); geo.translate(px, 0, pz); return geo; };
      if (yA < plinth) put(tr(new THREE.BoxGeometry(a1 - a0, Math.min(plinth, yB) - yA, 0.3).translate(0, (yA + Math.min(plinth, yB)) / 2, -0.15)), M.conc);
      if (hi > lo) { const g = corrugated(a1 - a0, hi - lo, 0.25, 0.035); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (a1 - a0) / 6, uv.getY(i) * (hi - lo) / 6); put(tr(g.translate(0, (lo + hi) / 2, -0.06)), M.clad); }
    };
    let cur = -sd.len / 2;
    for (const o of ops) { const a0 = o.at - o.width / 2, a1 = o.at + o.width / 2; panel(cur, a0, 0, h); panel(a0, a1, o.height, h); cur = a1; }
    panel(cur, sd.len / 2, 0, h);
    // gable triangle above the eave on the end walls
    if (gableSide(k)) { const tri = new THREE.BufferGeometry(); const L2 = sd.len / 2; tri.setAttribute('position', new THREE.Float32BufferAttribute([-L2, h, 0, L2, h, 0, 0, h + rise, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, sd.len / 6, 0, sd.len / 12, rise / 6], 2)); tri.computeVertexNormals(); tri.rotateY(sd.rot); const [px, pz] = sd.at(0); tri.translate(px, 0, pz); put(tri, M.clad); }
    // corner / eave trim along the wall
    { const g = new THREE.BoxGeometry(sd.len + 0.3, 0.25, 0.12).translate(0, h - 0.1, 0.03); g.rotateY(sd.rot); const [px, pz] = sd.at(0); g.translate(px, 0, pz); put(g, M.trim); }
    // openings
    for (const o of ops) {
      const [ox, oz] = sd.at(o.at); const local = (geo) => { geo.rotateY(sd.rot); geo.translate(ox, 0, oz); return geo; };
      // the dark interior seen through the opening
      put(local(new THREE.BoxGeometry(o.width, o.height, 0.05).translate(0, o.height / 2, -1.2)), M.dark);
      for (const s of [-1, 1]) put(local(new THREE.BoxGeometry(0.05, o.height, 1.2).translate(s * o.width / 2, o.height / 2, -0.6)), M.dark);
      if (o.kind === 'person') {
        put(local(new THREE.BoxGeometry(o.width, o.height, 0.06).translate(0, o.height / 2, -0.08)), M.door);
        put(local(new THREE.BoxGeometry(o.width + 0.6, 0.12, 1.0).translate(0, o.height + 0.35, 0.45)), M.trim);   // canopy
        put(local(new THREE.BoxGeometry(0.3, 0.18, 0.2).translate(0, o.height + 0.75, 0.12)), M.lamp);
      } else {
        const open = o.open ?? 0.6, curtain = o.height * (1 - open);
        put(local(new THREE.BoxGeometry(o.width + 0.4, 0.7, 0.7).translate(0, o.height + 0.35, 0.3)), M.trim);       // drum box
        for (const s of [-1, 1]) { put(local(new THREE.BoxGeometry(0.16, o.height, 0.2).translate(s * (o.width / 2 + 0.08), o.height / 2, 0.1)), M.steel); put(local(new THREE.BoxGeometry(0.3, 1.0, 0.3).translate(s * (o.width / 2 + 0.35), 0.5, 0.25)), M.stripes); }   // guides, bollards
        if (curtain > 0.05) { const g = new THREE.PlaneGeometry(o.width, curtain); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.width / 3, uv.getY(i) * curtain / 3 + 1 - curtain / 3); put(local(g.translate(0, o.height - curtain / 2, 0.05)), M.shutter); put(local(new THREE.BoxGeometry(o.width, 0.08, 0.1).translate(0, o.height - curtain, 0.06)), M.steel); }
        put(local(new THREE.BoxGeometry(0.4, 0.22, 0.25).translate(o.width / 2 + 0.6, o.height + 1.0, 0.15)), M.lamp);
      }
    }
    // downpipes at the corners of the eave sides
    if (!gableSide(k)) for (const a of [-sd.len / 2 + 0.4, sd.len / 2 - 0.4]) { const [px, pz] = sd.at(a); const g = new THREE.CylinderGeometry(0.07, 0.07, h, 8).translate(0, h / 2, 0.18); g.rotateY(sd.rot); g.translate(px - sd.at(0)[0] + sd.at(0)[0], 0, 0); put(new THREE.CylinderGeometry(0.07, 0.07, h, 8).translate(px + Math.sin(sd.rot) * 0.18, h / 2, pz + Math.cos(sd.rot) * 0.18), M.trim); }
  }
  // roof: two slopes with ribs across, overhang 0.4, ridge cap, gutters, skylight strips
  const ov = 0.4, slopeLen = Math.hypot(span / 2 + ov, rise + ov * rise / (span / 2));
  for (const s of [-1, 1]) {
    const g = corrugated(length + ov * 2, slopeLen, 0.33, 0.04); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length / 6, uv.getY(i) * slopeLen / 6);
    g.rotateX(-Math.PI / 2);                                // lies flat, ribs run across the length (along local x), facing up
    const ang = Math.atan2(rise, span / 2);
    g.rotateX(s * ang).translate(0, h + rise / 2 - ov * Math.sin(ang) / 2, s * (span / 4 + ov / 2));
    // two skylight strips per slope
    const strips = [];
    for (const f of [-0.28, 0.22]) strips.push(new THREE.BoxGeometry(2.2, 0.06, slopeLen * 0.7).translate(f * length, 0.07, 0).rotateX(s * ang).translate(0, h + rise / 2 + 0.02, s * span / 4));
    if (ridgeAlongZ) { g.rotateY(Math.PI / 2); strips.forEach((q) => q.rotateY(Math.PI / 2)); }
    put(g, M.roof); strips.forEach((q) => put(q, M.sky));
    // gutter along the eave
    const gut = new THREE.BoxGeometry(length + ov * 2, 0.22, 0.25).translate(0, h - 0.05, s * (span / 2 + ov)); if (ridgeAlongZ) gut.rotateY(Math.PI / 2); put(gut, M.trim);
  }
  { const r = new THREE.BoxGeometry(length + ov * 2, 0.2, 0.7).translate(0, h + rise + 0.08, 0); if (ridgeAlongZ) r.rotateY(Math.PI / 2); put(r, M.trim); }
  // roof ventilators along the ridge
  for (let i = -2; i <= 2; i++) { const v = new THREE.CylinderGeometry(0.35, 0.45, 0.8, 10).translate(i * length / 6, h + rise + 0.5, 0); if (ridgeAlongZ) v.rotateY(Math.PI / 2); put(v, M.steel); }
  // clerestory band of translucent panels just under the eave on the long walls
  for (const k of Object.keys(sides)) if (!gableSide(k)) { const sd = sides[k]; const g = new THREE.BoxGeometry(sd.len - 1.2, 0.8, 0.06).translate(0, h - 0.8, 0.04); g.rotateY(sd.rot); const [px, pz] = sd.at(0); g.translate(px, 0, pz); put(g, M.sky); }
  for (const [m, list] of parts) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = !m.transparent; mesh.receiveShadow = true; grp.add(mesh); }
  // bay number + owner painted high on the first gable end
  if (spec.sign) {
    const gk = ['s', 'n', 'e', 'w'].find(gableSide); const sd = sides[gk]; const [px, pz] = sd.at(0);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.25), new THREE.MeshStandardMaterial({ map: signTexture(spec.sign, spec.owner), transparent: true, roughness: 0.8 }));
    pl.position.set(px + Math.sin(sd.rot) * 0.1, h - 1.6, pz + Math.cos(sd.rot) * 0.1); pl.rotation.y = sd.rot; grp.add(pl);
  }
  // collider: the whole shed (not entered)
  const sw = rotQ % 2 ? d : w, sdp = rotQ % 2 ? w : d;
  game.world.addBoxCentered(new THREE.Vector3(x, y0 + h / 2, z), new THREE.Vector3(sw, h, sdp), { surface: 'metal', cover: true, walkable: false });
  return grp;
}
