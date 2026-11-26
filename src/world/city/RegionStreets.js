// Street level of the background city (the region beyond the hand-made districts): what makes a street a street.
//   · per block: sidewalks (pavers) with a granite curb, tactile paving at the corners, street lamps, street trees
//     with grates on the wider streets, bollards at the corners, bins, 한전 distribution boxes, bus shelters on the
//     secondary streets; in the 다세대 alleys (no sidewalks) concrete utility poles with transformers, lamp arms
//     and the tangle of wires between them
//   · per arterial junction: zebra crossings and stop lines on every arm, signal masts with horizontal Korean
//     signal heads and pedestrian signals that actually cycle (shared materials driven by the traffic phase),
//     CCTV, a subway entrance on one corner, a 중앙버스전용차로 median stop on the arterial
//   · arterial paint: the blue median bus lanes, the double yellow centre line, dashed lane lines
// Block furniture is stored as specs (streamed with its chunk); arterial paint and junctions go to the static batch.
import * as THREE from 'three';
import { CURB } from './Streets.js';
import { flatMat, groundMat, wallMat } from './CityMaterials.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r0, r1, h, x, y, z, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y + h / 2, z);
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function beam(a, b, t) { _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); const g = new THREE.BoxGeometry(t, L, t); g.translate(0, L / 2, 0); _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q); g.translate(a[0], a[1], a[2]); return g; }
// a sagging wire between two poles (a few straight pieces)
function wire(a, b, sag, t = 0.03) { const out = []; let prev = a; for (let i = 1; i <= 4; i++) { const k = i / 4, p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k]; out.push(beam(prev, p, t)); prev = p; } return out; }
export function mergeGeos(gs) { const pos = [], nor = []; for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return m; }

// sidewalk: light grey interlocking blocks with a few warm-tinted ones and worn joints (tile = 2 m)
let SWM = null;
export function sidewalkMat() {
  if (SWM) return SWM;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#8e8a84'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < 256; x += 32) { const v = 178 + r() * 26, warm = r() < 0.12 ? 18 : 0; g.fillStyle = `rgb(${v + warm},${v - 2},${v - 8 - warm})`; g.fillRect(x + 1, y + 1, 30, 14); }
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(60,56,50,${r() * 0.12})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); m.userData.texMeters = 2; SWM = m; return m;
}
// open ground / lots / courtyards: light concrete paving, expansion joints every 4 m, weathering (tile = 8 m)
let LOT = null;
export function lotMat() {
  if (LOT) return LOT;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#bdb9b0'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { const v = 150 + r() * 70; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.25)`; g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3); }
  for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(70,66,60,${0.05 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(80,76,70,0.55)'; for (const k of [0, 128]) { g.fillRect(k, 0, 2, 256); g.fillRect(0, k, 256, 2); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  LOT = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); LOT.userData.texMeters = 8; return LOT;
}
// shared materials (also the signal lamps, which the traffic phase switches)
const M = {};
const mats = () => M.metal ? M : Object.assign(M, {
  metal: flatMat(0x4a5056, { metalness: 0.5, roughness: 0.45, key: 'stmetal' }), galv: flatMat(0x9aa0a4, { metalness: 0.6, roughness: 0.4, key: 'stgalv' }),
  pole: flatMat(0xa8a49a, { roughness: 0.85, key: 'stpole' }), wire: flatMat(0x1e2022, { roughness: 0.8, key: 'stwire' }), head: flatMat(0xf2efe4, { key: 'stlamphead' }),
  pavers: sidewalkMat(), curb: flatMat(0xb8b6ae, { roughness: 0.8, key: 'stcurb' }), tactile: groundMat('tactile'), grate: flatMat(0x2e2a26, { metalness: 0.4, key: 'stgrate' }),
  green: flatMat(0x2a6a4a, { key: 'stgreen' }), box: flatMat(0x8c9a8e, { roughness: 0.6, key: 'stbox' }), glass: flatMat(0x8aa4b0, { roughness: 0.1, metalness: 0.4, key: 'stglass' }),
  white: flatMat(0xeeeee8, { roughness: 0.7, key: 'stwhite' }), yellow: flatMat(0xe0b420, { roughness: 0.7, key: 'styellow' }), blue: flatMat(0x2a5ab8, { roughness: 0.7, key: 'stblue' }), sig: flatMat(0x23272b, { roughness: 0.5, key: 'stsig' }),
  // signal lamps: [axis][colour]; emissive switched in tickSignals
  lamp: Object.fromEntries(['ns', 'ew'].map((ax) => [ax, Object.fromEntries([['r', 0xff3020], ['y', 0xffb020], ['g', 0x20e070], ['pr', 0xff3020], ['pg', 0x20e070]].map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: c, emissiveIntensity: 0.05, roughness: 0.4 })]))])),
});
// phase from Traffic ('ns' | 'ew' | 'red') + time in the cycle → lamp states
export function tickSignals(traffic) {
  if (!M.lamp || !traffic) return; const ph = traffic.phase(), T = traffic.t % 36;   // CYCLE: ns 16, red 3, ew 14, red 3
  for (const ax of ['ns', 'ew']) { const green = ph === ax, amber = ph === 'red' && ((ax === 'ns' && T >= 16 && T < 19) || (ax === 'ew' && T >= 33)), L = M.lamp[ax];
    L.g.emissiveIntensity = green ? 2.6 : 0.04; L.y.emissiveIntensity = amber ? 2.6 : 0.04; L.r.emissiveIntensity = !green && !amber ? 2.6 : 0.04;
    // pedestrians cross the other way: walk while the cross traffic has green
    const walk = ph !== 'red' && ph !== ax; L.pg.emissiveIntensity = walk ? 2.2 : 0.04; L.pr.emissiveIntensity = walk ? 0.04 : 2.2; }
}

// ------------------------------------------------------------------ per block
// r: the block as laid out (x0, z0, x1, z1); sw: sidewalk width per face { n, s, w, e } (0 = none: an alley),
// out: extra sidewalk outside r per face (the strip between an arterial's carriageway and the block)
// kind: the district type. tree(x, z, s) adds a street tree. Returns the buildable rect inside the sidewalks.
export function blockStreetscape(spec, rnd, r, sw, out, kind, tree) {
  const m = mats(), o = { x0: r.x0 - out.w, z0: r.z0 - out.n, x1: r.x1 + out.e, z1: r.z1 + out.s }, inner = { x0: r.x0 + sw.w, z0: r.z0 + sw.n, x1: r.x1 - sw.e, z1: r.z1 - sw.s };
  const S = { n: sw.n + out.n, s: sw.s + out.s, w: sw.w + out.w, e: sw.e + out.e };
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, put = (matKey, gs, h = 1) => { if (!gs.length) return; spec(cx, cz, { geo: () => mergeGeos(gs.map((f) => f())), mat: () => (typeof matKey === 'string' ? m[matKey] : matKey), box: [cx - 1, cz - 1, cx + 1, cz + 1, h], color: 0x8a8a84, np: true }); };
  const P = { pavers: [], curb: [], tactile: [], metal: [], galv: [], pole: [], wire: [], head: [], grate: [], green: [], box: [], glass: [], white: [] };
  // faces: outer edge line, inward normal, along-axis extent
  const faces = [
    { k: 'n', w: S.n, a0: o.x0, a1: o.x1, at: (t, d) => [t, o.z0 + d], along: 'x' }, { k: 's', w: S.s, a0: o.x0, a1: o.x1, at: (t, d) => [t, o.z1 - d], along: 'x' },
    { k: 'w', w: S.w, a0: o.z0 + S.n, a1: o.z1 - S.s, at: (t, d) => [o.x0 + d, t], along: 'z' }, { k: 'e', w: S.e, a0: o.z0 + S.n, a1: o.z1 - S.s, at: (t, d) => [o.x1 - d, t], along: 'z' }];
  const strip = (f, d0, d1, a0, a1, y, h) => { const [p0x, p0z] = f.at(a0, d0), [p1x, p1z] = f.at(a1, d1); const x0 = Math.min(p0x, p1x), x1 = Math.max(p0x, p1x), z0 = Math.min(p0z, p1z), z1 = Math.max(p0z, p1z); return () => box(Math.max(0.05, x1 - x0), h, Math.max(0.05, z1 - z0), (x0 + x1) / 2, y, (z0 + z1) / 2); };
  const busy = kind === 'cbd' || kind === 'business' || kind === 'downtown' || kind === 'mixed';
  for (const f of faces) {
    const L = f.a1 - f.a0; if (L < 4) continue;
    if (f.w > 0) {
      // the full-length strips of n / s cover the corners; w / e run between them
      P.pavers.push(strip(f, 0.25, f.w, f.along === 'x' ? f.a0 : f.a0, f.a1, CURB - 0.04, 0.1));
      P.curb.push(strip(f, 0, 0.25, f.a0, f.a1, CURB - 0.06, 0.16));
      // street lamps at the curb (double arms on the wide sidewalks), trees between them on the wider streets
      const sp = f.w >= 4 ? 27 : 31, n = Math.max(1, Math.round(L / sp)), step = L / n;
      for (let i = 0; i < n; i++) { const t = f.a0 + step * (i + 0.5), [x, z] = f.at(t, 0.65), [ix, iz] = f.at(t, 1.0), nx = ix - x, nz = iz - z, H = f.w >= 4 ? 9.5 : 7.5;
        P.metal.push(() => cyl(0.09, 0.13, H, x, CURB, z, 8));
        const ox = -nx / 0.35, oz = -nz / 0.35;   // towards the road
        for (const sg of (f.w >= 4 && busy ? [1, -1] : [1])) { const ex = x + ox * 2.1 * sg, ez = z + oz * 2.1 * sg; P.metal.push(() => beam([x, CURB + H - 0.25, z], [ex, CURB + H + 0.15, ez], 0.07)); P.head.push(() => box(0.7, 0.12, 0.35, ex, CURB + H + 0.02, ez)); }
        if (f.w >= 3.4 && kind !== 'industrial') for (const dt of [-step / 2]) { const tt = t + dt; if (tt - f.a0 < 7 || f.a1 - tt < 7) continue; const [tx, tz] = f.at(tt, 1.35); tree(tx, tz, 0.8 + rnd() * 0.35); P.grate.push(() => box(1.2, 0.02, 1.2, tx, CURB + 0.06, tz)); } }
      // furniture: a bin, a 한전 box, a bus shelter (secondary streets), a bike rack in busy districts
      if (L > 40 && rnd() < 0.6) { const [x, z] = f.at(f.a0 + L * (0.2 + rnd() * 0.6), 0.9); P.green.push(() => cyl(0.28, 0.28, 0.95, x, CURB, z, 8)); }
      if (L > 50 && rnd() < 0.4) { const [x, z] = f.at(f.a0 + L * (0.15 + rnd() * 0.7), f.w - 0.6); P.box.push(() => box(f.along === 'x' ? 1.4 : 0.6, 1.35, f.along === 'x' ? 0.6 : 1.4, x, CURB, z)); }
      if (f.w >= 3.4 && f.w < 4 && L > 70 && rnd() < 0.35) { const t = f.a0 + L * (0.35 + rnd() * 0.3), [x, z] = f.at(t, 1.6), [bx, bz] = f.at(t, 2.6), ax = f.along === 'x';
        P.metal.push(() => box(ax ? 5 : 0.12, 2.5, ax ? 0.12 : 5, bx, CURB, bz), () => box(ax ? 5.3 : 1.7, 0.12, ax ? 1.7 : 5.3, x, CURB + 2.5, z), () => box(ax ? 0.1 : 1.6, 2.5, ax ? 1.6 : 0.1, x + (ax ? -2.5 : 0), CURB, z + (ax ? 0 : -2.5)));
        P.glass.push(() => box(ax ? 4.6 : 0.04, 1.8, ax ? 0.04 : 4.6, (x + bx) / 2 + (ax ? 0 : (bx - x) * 0.45), CURB + 0.5, (z + bz) / 2 + (ax ? (bz - z) * 0.45 : 0)));
        P.white.push(() => box(ax ? 2.4 : 0.5, 0.45, ax ? 0.5 : 2.4, (x + bx) / 2, CURB, (z + bz) / 2));
        const [sx, sz] = f.at(t + 4, 0.5); P.metal.push(() => cyl(0.05, 0.05, 2.8, sx, CURB, sz, 6)); P.green.push(() => box(0.6, 0.8, 0.6, sx, CURB + 2.5, sz)); }
      if (busy && L > 40 && rnd() < 0.35) { const t = f.a0 + L * (0.2 + rnd() * 0.6); for (let k = 0; k < 5; k++) { const [x, z] = f.at(t + k * 0.8, f.w - 0.9); P.galv.push(() => beam([x, CURB, z], [x, CURB + 0.8, z], 0.06)); } }
    } else if (kind === 'villa' || kind === 'industrial' || kind === 'greenbelt') {
      // no sidewalk: concrete utility poles along the edge of the lots, wires between them, lamp arms, transformers
      const n = Math.max(1, Math.round(L / 26)), step = L / n; let prev = null;
      for (let i = 0; i <= n; i++) { const t = f.a0 + step * i; if (i === n && f.k !== 'n' && f.k !== 's') break; const [x, z] = f.at(t, 0.35), H = 10.5;
        P.pole.push(() => cyl(0.14, 0.2, H, x, CURB, z, 8)); const ax = f.along === 'x';
        P.metal.push(() => box(ax ? 0.12 : 1.6, 0.12, ax ? 1.6 : 0.12, x, CURB + H - 0.9, z));
        if (i % 3 === 1) P.box.push(() => cyl(0.32, 0.32, 1.1, x + (ax ? 0 : 0.45), CURB + H - 3.0, z + (ax ? 0.45 : 0), 8));   // transformer drum
        if (i % 2 === 0) { const [ix, iz] = f.at(t, -1.4); P.metal.push(() => beam([x, CURB + 6.5, z], [ix, CURB + 6.9, iz], 0.06)); P.head.push(() => box(0.4, 0.1, 0.3, ix, CURB + 6.75, iz)); }
        const cur = [x, z]; if (prev) for (const [dy, dl] of [[H - 0.9, -0.7], [H - 0.9, 0.7], [H - 2.0, 0], [H - 2.6, 0.25]]) { const p0 = prev, p1 = cur; P.wire.push(...wire([p0[0] + (ax ? 0 : dl), CURB + dy, p0[1] + (ax ? dl : 0)], [p1[0] + (ax ? 0 : dl), CURB + dy, p1[1] + (ax ? dl : 0)], 0.5 + rnd() * 0.4, 0.025).map((g) => () => g)); }
        prev = cur; }
    }
  }
  // tactile paving at the corners where two sidewalks meet (the crossings start there)
  for (const [kx, kz] of [['w', 'n'], ['e', 'n'], ['w', 's'], ['e', 's']]) { if (S[kx] <= 0 || S[kz] <= 0) continue; const x = kx === 'w' ? o.x0 : o.x1, z = kz === 'n' ? o.z0 : o.z1, sx = kx === 'w' ? 1 : -1, sz = kz === 'n' ? 1 : -1;
    P.tactile.push(() => box(0.6, 0.03, 2.4, x + sx * (S[kx] + 2.5), CURB + 0.06, z + sz * 0.7), () => box(2.4, 0.03, 0.6, x + sx * 0.7, CURB + 0.06, z + sz * (S[kz] + 2.5)));
    for (let k = 0; k < 3; k++) P.galv.push(() => cyl(0.09, 0.11, 0.85, x + sx * (S[kx] + 1.2 + k * 1.2), CURB, z + sz * 0.5, 8)); }
  for (const [k, gs] of Object.entries(P)) put(k, gs, k === 'pavers' || k === 'curb' || k === 'tactile' || k === 'grate' ? 0.1 : 8);
  return inner;
}

// ------------------------------------------------------------------ arterial paint and junctions (static batch)
// lines: [{ axis: 'x' | 'z', at, a0, a1 }] arterial centre lines with their extents; ok(x, z) false where nothing
// goes (river corridor, the hand-made districts); W = 30 m carriageway
export function arterialScape(B, lines, junctions, ok, world = null) {
  const m = mats(), W = 30, half = 15;
  const seg = (L, off, w, a0, a1, mat, dash = 0) => { const n = dash ? Math.floor((a1 - a0) / dash) : 1;
    for (let i = 0; i < n; i++) { const s0 = a0 + (dash ? i * dash : 0), s1 = dash ? s0 + dash * 0.5 : a1, c = (s0 + s1) / 2; if (!ok(L.axis === 'z' ? L.at + off : c, L.axis === 'z' ? c : L.at + off)) continue;
      const g = L.axis === 'z' ? box(w, 0.02, s1 - s0, L.at + off, CURB + 0.03, c) : box(s1 - s0, 0.02, w, c, CURB + 0.03, L.at + off); B.add(g, mat, { cast: false }); } };
  const near = (L, s) => junctions.some((j) => Math.abs((L.axis === 'z' ? j.z : j.x) - s) < half + 2 && Math.abs((L.axis === 'z' ? j.x : j.z) - L.at) < 1);
  for (const L of lines) {
    // pieces between junctions
    const cuts = [L.a0, ...junctions.filter((j) => Math.abs((L.axis === 'z' ? j.x : j.z) - L.at) < 1).map((j) => L.axis === 'z' ? j.z : j.x).sort((a, b) => a - b).flatMap((s) => [s - half - 6, s + half + 6]), L.a1].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i += 2) { const a0 = cuts[i], a1 = cuts[i + 1]; if (a1 - a0 < 6) continue;
      for (const o of [-0.2, 0.2]) seg(L, o, 0.15, a0, a1, m.yellow);                    // double yellow centre line
      for (const o of [-3.4, 3.4]) seg(L, o, 0.2, a0, a1, m.blue);                       // 중앙버스전용차로 (blue)
      for (const o of [-6.9, -10.4, 6.9, 10.4]) seg(L, o, 0.15, a0, a1, m.white, 9);     // lane lines
    }
  }
  // junctions: crossings, stop lines, signal masts, ped signals, CCTV, a subway entrance, a median bus stop
  const sig = (x, z, dx, dz, ax) => {   // a mast at (x, z) reaching over the approach coming towards -(dx, dz)
    const L2 = m.lamp[ax], H = 6.2; B.add(cyl(0.13, 0.17, H, x, CURB, z, 10), m.metal);
    const ex = x + dx * 9, ez = z + dz * 9; B.add(beam([x, CURB + H - 0.3, z], [ex, CURB + H - 0.3, ez], 0.13), m.metal);
    const along = Math.abs(dx) > 0.5; const hx = x + dx * 7, hz = z + dz * 7, nx = -dz, nz = dx;   // the head faces the oncoming traffic
    B.add(box(along ? 2.4 : 0.45, 0.55, along ? 0.45 : 2.4, hx, CURB + H - 0.95, hz), m.sig);
    ['r', 'y', 'g', 'g'].forEach((k, i) => { const o = -0.9 + i * 0.6; B.add(new THREE.CircleGeometry(0.2, 10).rotateY(Math.atan2(nx, nz) + Math.PI).translate(hx + (along ? o : 0) - nx * 0.24, CURB + H - 0.68, hz + (along ? 0 : o) - nz * 0.24), L2[k], { cast: false }); });
  };
  const ped = (x, z, fx, fz, ax) => { B.add(cyl(0.07, 0.07, 3.2, x, CURB, z, 6), m.metal); B.add(box(0.45, 0.9, 0.45, x, CURB + 2.4, z), m.sig);
    for (const [k, y] of [['pr', 3.0], ['pg', 2.55]]) B.add(new THREE.PlaneGeometry(0.34, 0.34).rotateY(Math.atan2(fx, fz)).translate(x + fx * 0.235, CURB + y, z + fz * 0.235), m.lamp[ax][k], { cast: false }); };
  let n = 0;
  for (const j of junctions) {
    if (!ok(j.x, j.z)) continue; n++;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // the crossing on this arm: stripes across the arterial, 4 m long, 1 m pitch; stop line behind it
      const d = half + 3.5, cxx = j.x + dx * d, czz = j.z + dz * d, ax = dx !== 0;   // ax: the arm runs along x (an E-W arterial)
      if (!ok(cxx, czz)) continue;
      for (let s = -half + 0.8; s < half - 0.4; s += 1.1) B.add(ax ? box(4, 0.02, 0.55, cxx, CURB + 0.03, j.z + s) : box(0.55, 0.02, 4, j.x + s, CURB + 0.03, czz), m.white, { cast: false });
      const sl = half + 6.5; B.add(ax ? box(0.45, 0.02, half, j.x + dx * sl, CURB + 0.03, j.z + (dx > 0 ? -half / 2 : half / 2)) : box(half, 0.02, 0.45, j.x + (dz > 0 ? half / 2 : -half / 2), CURB + 0.03, j.z + dz * sl), m.white, { cast: false });
      // signal mast on the corner to the right of the approach, its arm over the approach lanes
      const rx = ax ? j.x + dx * (half + 2) : j.x + (dz > 0 ? half + 2 : -half - 2), rz = ax ? j.z + (dx > 0 ? -half - 2 : half + 2) : j.z + dz * (half + 2);
      sig(rx, rz, ax ? 0 : (dz > 0 ? -1 : 1), ax ? (dx > 0 ? 1 : -1) : 0, ax ? 'ew' : 'ns');
      ped(rx + (ax ? -dx * 1.5 : 0), rz + (ax ? 0 : -dz * 1.5), ax ? -dx : 0, ax ? 0 : -dz, ax ? 'ns' : 'ew');
    }
    // CCTV mast on the north-east corner
    { const x = j.x + half + 3, z = j.z - half - 3; B.add(cyl(0.1, 0.12, 7, x, CURB, z), m.galv); B.add(box(0.25, 0.25, 0.5, x - 0.3, CURB + 6.6, z + 0.3), m.white); B.add(box(0.25, 0.25, 0.5, x + 0.3, CURB + 6.6, z + 0.3), m.white); B.add(box(0.5, 0.35, 0.12, x, CURB + 4.5, z - 0.12), m.yellow); }
    // subway entrance on the south-east corner (on the sidewalk strip along the N-S arterial), every other junction
    if (n % 2 === 0 && ok(j.x + 17, j.z + 30)) { const x = j.x + 17.6, z = j.z + half + 10;
      B.add(box(3.0, 1.1, 0.12, x, CURB, z - 4), wallMat('stone', 0x9a968c)); for (const o of [-1.5, 1.5]) B.add(box(0.12, 1.1, 8, x + o, CURB, z), wallMat('stone', 0x9a968c));
      B.add(box(3.4, 0.15, 8.6, x, CURB + 2.6, z), m.glass); for (const [o, oz] of [[-1.6, -4.1], [1.6, -4.1], [-1.6, 3.9], [1.6, 3.9]]) B.add(cyl(0.06, 0.06, 2.6, x + o, CURB, z + oz, 6), m.metal);
      B.add(box(2.8, 0.06, 7.6, x, CURB - 0.02, z), flatMat(0x16181a, { key: 'stairwell' }), { cast: false });
      for (let k = 0; k < 8; k++) B.add(box(2.8, 0.02, 0.06, x, CURB + 0.03, z - 3.4 + k * 0.95), m.galv, { cast: false });
      B.add(cyl(0.06, 0.06, 3.2, x - 1.9, CURB, z + 4.6, 6), m.metal); B.add(box(0.7, 0.7, 0.12, x - 1.9, CURB + 3.2, z + 4.6), m.yellow); B.add(box(0.5, 0.5, 0.14, x - 1.9, CURB + 3.2, z + 4.6), m.green);
      j.entrance = [x - 1.6, z - 4.1, x + 1.6, z + 4.1]; world?.addBox(new THREE.Vector3(x - 1.6, CURB, z - 4.1), new THREE.Vector3(x + 1.6, CURB + 1.1, z + 4.1), { walkable: false }); }
    // median bus stop on the N-S arterial, south arm: a raised island between the bus lanes with a shelter
    if (ok(j.x, j.z + 60)) { const z0 = j.z + half + 12, z1 = z0 + 34, x = j.x;
      B.add(box(3.0, 0.15, z1 - z0, x, CURB, (z0 + z1) / 2), wallMat('concrete', 0xb0aea6)); B.add(box(3.0, 0.02, z1 - z0, x, CURB + 0.15, (z0 + z1) / 2), m.pavers, { cast: false });
      B.add(box(2.0, 0.12, 22, x, CURB + 2.8, (z0 + z1) / 2), m.glass); for (let z = z0 + 6; z <= z1 - 6; z += 5.5) B.add(cyl(0.07, 0.07, 2.65, x, CURB + 0.15, z, 6), m.metal);
      B.add(box(0.06, 1.6, 20, x, CURB + 0.7, (z0 + z1) / 2), m.glass); B.add(box(0.6, 0.45, 8, x + 0.6, CURB + 0.15, (z0 + z1) / 2), m.white);
      B.add(box(0.12, 0.8, 3.2, x, CURB + 2.0, z0 + 3), m.blue);
      j.island = [x - 1.5, z0, x + 1.5, z1]; }
  }
}
