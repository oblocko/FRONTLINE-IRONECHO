// K21 infantry fighting vehicle — HULL ONLY (no turret), original procedural model.
// Built from published dimensions (6.9 m long, 3.4 m wide, hull roof ≈1.9 m) and the general layout of the
// vehicle (sloped glacis with trim vane, driver front-left, engine front-right, six road wheels, front drive
// sprocket, thick side skirts, rear ramp, turret ring mid-rear). Not wired into the game.
// Axes: +Z = front, +Y = up, metres, ground at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- materials ----------
function camoTexture() {
  // ROK vehicle 3-colour woodland: green base, black and brown blotches
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#48523a'; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (col, n, r0, r1) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const x = rnd() * 512, y = rnd() * 512, r = r0 + rnd() * (r1 - r0); g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr); } g.fill(); } };
  blob('#564734', 18, 30, 70); blob('#25271f', 15, 22, 52);
  // grime / panel wear
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '30,28,22' : '120,118,96'},${0.04 + rnd() * 0.06})`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function mats() {
  const camo = camoTexture();
  return {
    paint: new THREE.MeshStandardMaterial({ map: camo, roughness: 0.78, metalness: 0.15 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.85, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3b36, roughness: 0.55, metalness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }),
    track: new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.8, metalness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a30, roughness: 0.08, metalness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xe8e2c8, emissive: 0x30302a, roughness: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1c14, emissive: 0x200404, roughness: 0.3 }),
  };
}

// box-projected UVs so the camo texture reads at the same scale on every face (1 texture = 2.4 m)
function boxUV(geo, scale = 1 / 3.4) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) { uv[i * 2] = z * scale; uv[i * 2 + 1] = y * scale; }
    else if (ay >= az) { uv[i * 2] = x * scale; uv[i * 2 + 1] = z * scale; }
    else { uv[i * 2] = x * scale; uv[i * 2 + 1] = y * scale; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
// extrude a side profile given as [z, y] points across x ∈ [x0, x1]
function profileX(pts, x0, x1, bevel = 0.02) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);   // shape x → world z, extrusion → world -x
  g.computeVertexNormals(); return boxUV(g.toNonIndexed());
}
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return boxUV(g.toNonIndexed()); };
const cylX = (r, len, x, y, z, seg = 20) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g.toNonIndexed(); };
const cylY = (r0, r1, h, x, y, z, seg = 16) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return g.toNonIndexed(); };
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };

export function buildK21Hull() {
  const M = mats(); const parts = { paint: [], dark: [], steel: [], rubber: [], track: [], glass: [], lamp: [], red: [] };
  const P = (k, g) => parts[k].push(clean(g));

  // ---- main hull body (side profile extruded across the hull width) ----
  // rear: upper plate leans forward (top at -3.58), lower rear chamfer back down to the belly
  const HULL = [[-3.3, 0.62], [-3.72, 0.78], [-3.92, 1.0], [-3.58, 1.9], [1.95, 1.9], [3.55, 1.44], [3.68, 1.32], [3.15, 0.74], [2.8, 0.62]];
  P('paint', profileX(HULL, -1.24, 1.24, 0.03));
  // upper sponsons over the tracks (hull widens above the track line)
  // sponsons follow the same rear slope; ahead of the skirts they drop to 0.72 m and hide most of the sprocket
  const SPON = [[-3.88, 0.98], [-3.92, 1.0], [-3.58, 1.9], [1.95, 1.9], [3.5, 1.45], [3.5, 1.32], [3.3, 0.86], [3.05, 0.72], [2.15, 0.72], [2.15, 0.98]];
  for (const s of [-1, 1]) P('paint', s > 0 ? profileX(SPON, 1.22, 1.56, 0.02) : profileX(SPON, -1.56, -1.22, 0.02));

  // ---- side skirts: thick add-on armour panels with seams and bolts ----
  for (const s of [-1, 1]) {
    const x = s * 1.6;
    const panels = [[-2.2, -0.75], [-0.7, 0.75], [0.8, 2.2]];   // skirts stop before the glacis rake
    for (const [z0, z1] of panels) {
      P('paint', box(0.07, 1.28, z1 - z0 - 0.03, x, 1.22, (z0 + z1) / 2));
      P('paint', box(0.09, 0.05, z1 - z0 - 0.03, x + s * 0.01, 1.84, (z0 + z1) / 2));       // top lip
      for (const zz of [z0 + 0.12, z1 - 0.12]) for (const yy of [0.7, 1.22, 1.76]) P('steel', cylX(0.022, 0.03, x + s * 0.04, yy, zz, 8));   // bolts
      P('dark', box(0.075, 0.03, z1 - z0 - 0.03, x, 0.59, (z0 + z1) / 2));   // bottom edge
    }
    // rear skirt panel: its back edge follows the sloped rear plate
    const rp = [[-3.86, 0.58], [-2.25, 0.58], [-2.25, 1.86], [-3.6, 1.86]];
    P('paint', profileX(rp, x - 0.035, x + 0.035, 0.008)); P('dark', box(0.075, 0.03, 1.6, x, 0.59, -3.05));
    for (const [zz, yy] of [[-2.37, 0.7], [-2.37, 1.22], [-2.37, 1.76], [-3.5, 1.76], [-3.75, 1.22], [-3.75, 0.7]]) P('steel', cylX(0.022, 0.03, x + s * 0.04, yy, zz, 8));
    // rail of tie-down loops along the roof edge
    for (let z = -3.4; z < 1.9; z += 0.75) P('steel', box(0.05, 0.05, 0.12, s * 1.5, 1.93, z));
  }

  // ---- running gear: 6 road wheels (dual), front drive sprocket, rear idler, return rollers ----
  const WZ = [-2.72, -1.82, -0.92, -0.02, 0.9, 1.82], WY = 0.31, WR = 0.3;
  for (const s of [-1, 1]) {
    const xo = s * 1.38;
    for (const z of WZ) {
      for (const dx of [0.085, -0.085]) P('rubber', new THREE.TorusGeometry(WR - 0.045, 0.045, 16, 56).rotateY(Math.PI / 2).translate(xo + s * dx, WY, z).toNonIndexed());   // dual rubber tyres (rings)
      P('paint', cylX(WR - 0.065, 0.22, xo, WY, z, 48));                                                               // disc (painted)
      P('steel', cylX(0.09, 0.3, xo, WY, z, 24)); P('dark', cylX(0.045, 0.32, xo, WY, z, 16));                        // hub
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P('dark', cylX(0.022, 0.25, xo, WY + Math.sin(a) * 0.15, z + Math.cos(a) * 0.15, 12)); }   // lightening holes
      // torsion arm
      P('dark', box(0.08, 0.08, 0.4, s * 1.24, WY + 0.1, z + 0.17, 0.45, 0, 0));
    }
    // drive sprocket (front, high) with teeth
    const sz = 2.95, sy = 0.8;
    P('steel', cylX(0.25, 0.26, xo, sy, sz, 40)); P('dark', cylX(0.1, 0.3, xo, sy, sz, 20));
    for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2; P('steel', box(0.22, 0.06, 0.06, xo, sy + Math.sin(a) * 0.27, sz + Math.cos(a) * 0.27, a, 0, 0)); }
    // idler (rear)
    const iz = -3.38, iy = 0.78;
    P('steel', cylX(0.26, 0.26, xo, iy, iz, 40)); P('dark', cylX(0.09, 0.3, xo, iy, iz, 20));
    // return rollers
    for (const z of [-2.2, -0.5, 1.4]) P('steel', cylX(0.07, 0.2, xo, 0.72, z, 20));
    // track: links laid along the loop around idler → road wheels → sprocket → return line
    const loop = new THREE.CurvePath();
    const L = (a, b) => loop.add(new THREE.LineCurve3(new THREE.Vector3(0, a[1], a[0]), new THREE.Vector3(0, b[1], b[0])));
    const bottom = 0.03, topY = 0.82;
    const R = 0.3;   // sprocket / idler wrap radius incl. track
    L([iz, iy - R], [WZ[0], bottom]); L([WZ[0], bottom], [WZ[5], bottom]); L([WZ[5], bottom], [sz, sy - R]);
    for (let k = 0; k < 6; k++) { const a0 = -Math.PI / 2 + k * Math.PI / 6, a1 = a0 + Math.PI / 6; L([sz + Math.cos(a0) * R, sy + Math.sin(a0) * R], [sz + Math.cos(a1) * R, sy + Math.sin(a1) * R]); }
    L([sz, sy + R], [-3.0, topY]); L([-3.0, topY], [iz, iy + R]);
    for (let k = 0; k < 6; k++) { const a0 = Math.PI / 2 + k * Math.PI / 6, a1 = a0 + Math.PI / 6; L([iz + Math.cos(a0) * R, iy + Math.sin(a0) * R], [iz + Math.cos(a1) * R, iy + Math.sin(a1) * R]); }
    const total = loop.curves.reduce((a, c) => a + (c.getLength ? c.getLength() : 0), 0); const n = Math.round(total / 0.155);
    const linkGeos = [];
    for (let i = 0; i < n; i++) {
      const t = i / n; let d = t * total, cur = null;
      for (const c of loop.curves) { const l = c.getLength(); if (d <= l) { cur = c; break; } d -= l; }
      cur ||= loop.curves[loop.curves.length - 1]; const u = Math.min(1, d / cur.getLength());
      const p = cur.getPoint(u), q = cur.getPoint(Math.min(1, u + 0.02)); const ang = Math.atan2(q.y - p.y, q.z - p.z);
      const g = new THREE.BoxGeometry(0.48, 0.055, 0.15); g.rotateX(-ang); g.translate(xo, p.y, p.z); linkGeos.push(g.toNonIndexed());
      const pad = new THREE.BoxGeometry(0.2, 0.03, 0.1); pad.translate(0, -0.035, 0); pad.rotateX(-ang); for (const dx of [-0.12, 0.12]) linkGeos.push(pad.clone().translate(xo + dx, p.y, p.z).toNonIndexed());   // rubber pads
      const gc = new THREE.BoxGeometry(0.12, 0.05, 0.05); gc.rotateX(-ang); gc.translate(xo, p.y, p.z); linkGeos.push(gc.toNonIndexed());   // centre guide
    }
    for (const g of linkGeos) P('track', g);
  }

  // ---- glacis details ----
  // trim vane (folded flat on the upper glacis) — amphibious board
  const gl = Math.atan2(1.9 - 1.44, 3.55 - 1.95);     // glacis slope
  P('paint', box(2.3, 0.05, 1.1, 0, 1.72, 2.85, gl, 0, 0));
  for (const s of [-1, 1]) P('steel', box(0.06, 0.08, 0.18, s * 1.0, 1.66, 3.35, gl, 0, 0));     // vane hinges
  // driver's hatch + periscopes (front left)
  P('paint', cylY(0.33, 0.35, 0.06, -0.62, 1.93, 1.55, 18)); P('dark', box(0.08, 0.05, 0.2, -0.62, 1.98, 1.4));
  for (const dx of [-0.2, 0, 0.2]) { P('dark', box(0.12, 0.08, 0.06, -0.62 + dx, 1.97, 1.86)); P('glass', box(0.1, 0.05, 0.01, -0.62 + dx, 1.97, 1.895)); }
  // engine deck (front right): grilles with slats, exhaust on the right side
  P('dark', box(1.0, 0.03, 1.3, 0.58, 1.905, 1.25));
  for (let i = 0; i < 9; i++) P('steel', box(0.95, 0.03, 0.04, 0.58, 1.93, 0.69 + i * 0.14));
  P('dark', box(0.7, 0.03, 0.5, 0.65, 1.905, 2.25, -gl, 0, 0));
  P('steel', box(0.06, 0.32, 0.6, 1.6, 1.62, 0.6)); for (let i = 0; i < 5; i++) P('dark', box(0.07, 0.03, 0.55, 1.63, 1.5 + i * 0.06, 0.6));   // exhaust louvre
  // headlight clusters with brush guards, front corners
  for (const s of [-1, 1]) {
    const x = s * 1.18, z = 3.52;
    P('dark', box(0.3, 0.18, 0.12, x, 1.52, z)); P('lamp', cylX(0.055, 0.02, 0, 0, 0, 12).rotateY(Math.PI / 2).translate(x - 0.07, 1.53, z + 0.065)); P('lamp', cylX(0.04, 0.02, 0, 0, 0, 10).rotateY(Math.PI / 2).translate(x + 0.08, 1.53, z + 0.065));
    for (const dx of [-0.13, 0.13]) P('steel', box(0.025, 0.25, 0.025, x + dx, 1.54, z + 0.12));
    P('steel', box(0.3, 0.025, 0.025, x, 1.66, z + 0.12));
    // tow hooks
    P('steel', box(0.08, 0.14, 0.12, s * 0.75, 0.95, 3.38)); P('steel', cylX(0.05, 0.14, s * 0.75, 0.9, 3.46, 10));
  }
  // splash board seam & lifting eyes on the glacis
  P('dark', box(2.4, 0.025, 0.04, 0, 1.6, 3.3, gl, 0, 0));
  for (const s of [-1, 1]) P('steel', new THREE.TorusGeometry(0.06, 0.015, 6, 12).rotateY(Math.PI / 2).translate(s * 0.95, 1.92, 1.9).toNonIndexed());

  // ---- roof: turret ring (turret not modelled), troop compartment hatches, antenna bases ----
  const tz = -1.15;
  P('steel', new THREE.TorusGeometry(1.0, 0.05, 6, 40).rotateX(Math.PI / 2).translate(0, 1.93, tz).toNonIndexed());
  P('dark', cylY(0.98, 0.98, 0.03, 0, 1.915, tz, 40));
  for (const s of [-1, 1]) {
    P('paint', box(0.7, 0.05, 0.85, s * 0.62, 1.93, -3.2)); P('steel', box(0.05, 0.06, 0.8, s * 0.27, 1.94, -3.2));   // troop hatches
    P('dark', cylY(0.05, 0.05, 0.08, s * 1.25, 1.94, -2.6, 8)); P('steel', cylY(0.006, 0.006, 1.6, s * 1.25, 2.75, -2.6, 4));   // antennas
  }

  // ---- rear: ramp with door, hinges, lights — all lying on the forward-leaning rear plate ----
  const RA = Math.atan2(0.34, 0.9);                 // rear plate lean (top forward)
  const onRear = (y, out = 0.04) => -3.92 + (y - 1.0) * (0.34 / 0.9) - out;   // z of the plate surface at height y
  P('paint', box(1.6, 0.92, 0.07, 0, 1.45, onRear(1.45, 0.03), RA, 0, 0));          // ramp
  P('dark', box(0.55, 0.72, 0.02, 0.3, 1.45, onRear(1.45, 0.075), RA, 0, 0));        // door in the ramp
  P('steel', box(0.06, 0.12, 0.05, 0.05, 1.45, onRear(1.45, 0.09), RA, 0, 0));       // handle
  for (const dx of [-0.55, 0.55]) P('steel', cylX(0.05, 0.25, dx, 1.02, onRear(1.02, 0.03), 12));   // ramp hinges
  for (const s of [-1, 1]) {
    P('red', box(0.12, 0.08, 0.02, s * 1.22, 1.2, onRear(1.2, 0.02), RA, 0, 0)); P('lamp', box(0.08, 0.05, 0.02, s * 1.36, 1.2, onRear(1.2, 0.02), RA, 0, 0));
    P('steel', box(0.08, 0.14, 0.12, s * 0.8, 0.86, -3.82));      // rear tow points on the lower chamfer
    P('steel', new THREE.TorusGeometry(0.06, 0.015, 6, 12).translate(s * 0.95, 1.94, -3.4).toNonIndexed());   // lifting eyes
  }

  // ---- merge per material ----
  const g = new THREE.Group(); g.name = 'K21_hull';
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    const m = new THREE.Mesh(merged, M[k]); m.name = 'hull_' + k; m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  return g;
}
