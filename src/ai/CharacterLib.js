// Character assets: Quaternius "Universal Base Characters" bodies + "Universal
// Animation Library" clips (CC0, see assets/CREDITS.md). Loaded once per session.
//
// The bodies ship undressed, so clothing is painted on in the shader: every vertex
// gets zone weights from its skin weights (head → skin, torso/arms → top, hips/legs
// → trousers, feet → boots, hands → gloves); cloth zones are slightly inflated,
// lose the muscle normal map and take a camo/fabric texture. Rigid gear (helmet,
// plate carrier, pouches, belt, knee pads, soles) is attached to bones.
import { cloneGun, armorPart } from '../gear/GearLib.js';
// vertical / forward offset of the armour centre from the spine_03 rest position, per look
const ARMOR_FIT = { def: [-0.01, -0.015], kpa: [0.0, 0.005] };
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGLTF } from '../core/Assets.js';
import { pbr } from '../render/TextureFactory.js';
import { roundedBox, sphere, cyl, T } from './HumanModel.js';

let LIB = null, loading = null;
export const characterLib = () => LIB;

const ZONE = (name) => {
  if (/^(Head|neck_01)$/.test(name)) return 'skin';
  if (/^lowerarm/.test(name)) return 'forearm';
  if (/^upperarm/.test(name)) return 'arm';
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(name)) return 'glove';
  if (/^(foot|ball)/.test(name)) return 'boot';
  if (/^(pelvis|thigh|calf|root)/.test(name)) return 'pants';
  return 'top';
};


// Garment shell: the body triangles selected by `include`, welded, Laplacian-smoothed
// (muscle relief disappears, cloth hangs) and pushed out along the smoothed normal.
function buildShell(src, include, offset, iters = 8) {
  const pos = src.attributes.position, idx = src.index ? src.index.array : null, n = pos.count;
  const keep = new Uint8Array(n); for (let i = 0; i < n; i++) keep[i] = include(i) ? 1 : 0;
  // weld vertices that share a position (UV seams)
  const weld = new Int32Array(n), map = new Map(); let nw = 0; const wp = [];
  for (let i = 0; i < n; i++) { const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`; let id = map.get(k); if (id === undefined) { id = nw++; map.set(k, id); wp.push(pos.getX(i), pos.getY(i), pos.getZ(i)); } weld[i] = id; }
  const tris = []; const T = idx ? idx.length : n;
  for (let t = 0; t < T; t += 3) { const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2; if (keep[a] && keep[b] && keep[c]) tris.push(a, b, c); }
  // neighbours + boundary edges on the welded mesh
  const nb = Array.from({ length: nw }, () => new Set()); const edge = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) { const a = weld[tris[t + e]], b = weld[tris[t + (e + 1) % 3]]; nb[a].add(b); nb[b].add(a); const k = a < b ? a + '_' + b : b + '_' + a; edge.set(k, (edge.get(k) || 0) + 1); }
  const border = new Uint8Array(nw); for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split('_').map(Number); border[a] = border[b] = 1; }
  let P = Float32Array.from(wp); const Q = new Float32Array(P.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < nw; i++) {
      const s = nb[i]; if (!s.size) { Q.set(P.subarray(i * 3, i * 3 + 3), i * 3); continue; }
      let x = 0, y = 0, z = 0; for (const j of s) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
      const l = border[i] ? 0.15 : 0.55, c = s.size;
      Q[i * 3] = P[i * 3] + (x / c - P[i * 3]) * l; Q[i * 3 + 1] = P[i * 3 + 1] + (y / c - P[i * 3 + 1]) * l; Q[i * 3 + 2] = P[i * 3 + 2] + (z / c - P[i * 3 + 2]) * l;
    }
    P.set(Q);
  }
  // smoothed normals (welded), then push out
  const N = new Float32Array(P.length); const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    const a = weld[tris[t]], b = weld[tris[t + 1]], c = weld[tris[t + 2]];
    va.fromArray(P, a * 3); vb.fromArray(P, b * 3); vc.fromArray(P, c * 3); const f = vb.sub(va).cross(vc.sub(va));
    for (const k of [a, b, c]) { N[k * 3] += f.x; N[k * 3 + 1] += f.y; N[k * 3 + 2] += f.z; }
  }
  const off = new Float32Array(nw), cnt = new Float32Array(nw); for (let i = 0; i < n; i++) if (keep[i]) { off[weld[i]] += offset(i); cnt[weld[i]]++; }
  // build the shell geometry (only used vertices)
  const used = new Int32Array(n).fill(-1); let m = 0; const order = [];
  for (const v of tris) if (used[v] < 0) { used[v] = m++; order.push(v); }
  const out = new THREE.BufferGeometry();
  const copy = (name) => { const a = src.attributes[name]; if (!a) return; const Arr = a.isInterleavedBufferAttribute ? a.data.array.constructor : a.array.constructor; const arr = new Arr(m * a.itemSize); order.forEach((v, i) => { for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(v, k); }); out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized)); };
  for (const name of ['uv', 'skinIndex', 'skinWeight', 'zoneA', 'zoneB']) copy(name);
  const op = new Float32Array(m * 3);
  order.forEach((v, i) => { const w = weld[v]; const nx = N[w * 3], ny = N[w * 3 + 1], nz = N[w * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; const o = off[w] / Math.max(1, cnt[w]);
    op[i * 3] = P[w * 3] + nx / l * o; op[i * 3 + 1] = P[w * 3 + 1] + ny / l * o; op[i * 3 + 2] = P[w * 3 + 2] + nz / l * o; });
  out.setAttribute('position', new THREE.BufferAttribute(op, 3));
  out.setIndex(tris.map((v) => used[v]));
  out.computeVertexNormals();
  // weld normals across UV seams so shading stays smooth
  const nrm = out.attributes.normal, acc = new Map();
  order.forEach((v, i) => { const w = weld[v]; const e = acc.get(w) || [0, 0, 0]; e[0] += nrm.getX(i); e[1] += nrm.getY(i); e[2] += nrm.getZ(i); acc.set(w, e); });
  order.forEach((v, i) => { const e = acc.get(weld[v]); const l = Math.hypot(...e) || 1; nrm.setXYZ(i, e[0] / l, e[1] / l, e[2] / l); });
  out.computeBoundingSphere();
  return out;
}

function prepBody(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  let body = null; const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) { meshes.push(o); if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o; } });
  // zone weights per vertex (soft, from skin weights)
  const g = body.geometry, bones = body.skeleton.bones, n = g.attributes.position.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const za = new Float32Array(n * 4), zb = new Float32Array(n * 3);
  const slot = { skin: [za, 0, 4], top: [za, 1, 4], pants: [za, 2, 4], boot: [za, 3, 4], forearm: [zb, 0, 3], glove: [zb, 1, 3], arm: [zb, 2, 3] };
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k); if (w <= 0) continue;
    const [arr, c, stride] = slot[ZONE(bones[si.getComponent(i, k)].name)]; arr[i * stride + c] += w;
  }
  // shirt/jacket worn outside the trousers: hip vertices above the hem line count as top
  const pelY = (() => { const b = bones.find((x) => x.name === 'pelvis'); return b.getWorldPosition(new THREE.Vector3()).y; })(); const pos = g.attributes.position;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); if (za[i * 4 + 2] > 0 && y > pelY - 0.13) { const k = Math.min(1, (y - (pelY - 0.13)) / 0.04); const mv = za[i * 4 + 2] * k; za[i * 4 + 2] -= mv; za[i * 4 + 1] += mv; } }
  g.setAttribute('zoneA', new THREE.BufferAttribute(za, 4)); g.setAttribute('zoneB', new THREE.BufferAttribute(zb, 3));
  const rest = {}; const v = new THREE.Vector3();
  for (const b of bones) rest[b.name] = b.getWorldPosition(v.clone());
  for (const m of meshes) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
  // ---- garment shells: real cloth geometry over the body ----
  let eyes = null; for (const m of meshes) if (m !== body && /eye/i.test(m.material.name || '')) eyes = m;
  // eye line: from the eye mesh's skinned rest position when available, else from the head bone
  let eyeY = rest.Head.y + 0.095;
  if (eyes) { const bb = new THREE.Box3().setFromObject(eyes); if (bb.max.y > rest.Head.y && bb.min.y < rest.Head.y + 0.2) eyeY = (bb.min.y + bb.max.y) / 2; }
  console.debug?.('eye line', eyeY.toFixed(3), 'head', rest.Head.y.toFixed(3));
  const headZ = rest.Head.z;
  const W = (i) => ({ skin: za[i * 4], top: za[i * 4 + 1], pants: za[i * 4 + 2], boot: za[i * 4 + 3], fore: zb[i * 3], glove: zb[i * 3 + 1], arm: zb[i * 3 + 2] });
  const shells = {
    long: buildShell(g, (i) => { const w = W(i); return w.top + w.pants + w.arm + w.fore + w.boot > 0.55 && w.glove < 0.5; }, (i) => { const w = W(i); return 0.022 * w.top + 0.03 * w.pants + 0.02 * w.arm + 0.016 * w.fore + 0.012 * w.boot; }, 10),
    short: buildShell(g, (i) => { const w = W(i); return w.top + w.pants + w.arm + w.boot > 0.55 && w.fore < 0.4 && w.glove < 0.5; }, (i) => { const w = W(i); return 0.02 * w.top + 0.028 * w.pants + 0.016 * w.arm + 0.012 * w.boot; }, 10),
    // knit balaclava: the whole head and neck except an eye slot
    mask: buildShell(g, (i) => { const w = W(i); if (w.skin < 0.5) return false; const y = pos.getY(i), z = pos.getZ(i); return !(y > eyeY - 0.019 && y < eyeY + 0.016 && z > headZ + 0.03); }, () => 0.007, 6),
    // neck gaiter pulled up over nose and mouth
    gaiter: buildShell(g, (i) => { const w = W(i); return w.skin > 0.5 && pos.getY(i) < eyeY - 0.03; }, () => 0.008, 6),
  };
  for (const [name, geo] of Object.entries(shells)) {
    const sm = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); sm.name = 'shell_' + name; sm.visible = false;
    sm.bind(body.skeleton, body.bindMatrix); sm.frustumCulled = false; sm.castShadow = true; sm.receiveShadow = true;
    body.parent.add(sm); sm.position.copy(body.position); sm.quaternion.copy(body.quaternion); sm.scale.copy(body.scale);
  }
  // face front at eye level (for eyewear placement)
  let faceZ = -1; for (let i = 0; i < n; i++) if (za[i * 4] > 0.5 && Math.abs(pos.getY(i) - eyeY) < 0.02 && Math.abs(pos.getX(i)) < 0.05) faceZ = Math.max(faceZ, pos.getZ(i));
  // eye geometry (for the procedural eyelids) and the average skin colour of the body texture
  let eye = null; if (eyes) { const bb = new THREE.Box3().setFromObject(eyes); const r = Math.max(0.008, (bb.max.y - bb.min.y) / 2); eye = { x: Math.max(0.02, bb.max.x - r), y: (bb.min.y + bb.max.y) / 2, z: bb.max.z, r }; }
  let skinAvg = new THREE.Color(0xc8967c);
  try { const img = body.material.map?.image; if (img) { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let rr = 0, gg = 0, b2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; rr += d[i]; gg += d[i + 1]; b2 += d[i + 2]; n++; } if (n) skinAvg = new THREE.Color().setRGB(rr / n / 255, gg / n / 255, b2 / n / 255, THREE.SRGBColorSpace); } } catch {}
  return { scene, body, rest, eyeY, faceZ, eye, skinAvg };
}

export function loadCharacters() {
  if (LIB) return Promise.resolve(LIB);
  if (loading) return loading;
  const f = (n) => loadGLTF('characters/' + n).catch(() => null);
  const hairNames = ['hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_buns', 'hair_beard', 'hair_buzzedfemale', 'eyebrows_regular', 'eyebrows_female'];
  loading = Promise.all([f('body_m.glb'), f('body_f.glb'), f('anims.glb'), ...hairNames.map((h) => f(h + '.glb'))]).then(([m, fm, an, ...hair]) => {
    if (!m || !an) { loading = null; console.warn('character assets unavailable — using procedural characters'); return null; }
    const clips = {}; const boneNames = new Set(); m.scene.traverse((o) => { if (o.isBone) boneNames.add(o.name); });
    for (const c of an.animations) {
      // clips merged from the second library target uniquified node names ("pelvis_1"): map them back
      for (const t of c.tracks) { const dot = t.name.indexOf('.'); const node = t.name.slice(0, dot); if (!boneNames.has(node)) { const base = node.replace(/_\d+$/, ''); if (boneNames.has(base)) t.name = base + t.name.slice(dot); } }
      // drop root-bone translation so clips stay in place; the AI moves the actor
      c.tracks = c.tracks.filter((t) => !/^root\.position/.test(t.name));
      clips[c.name] = c;
    }
    const hairs = {}; hairNames.forEach((h, i) => { if (hair[i]) { let mesh = null; hair[i].scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; }); if (mesh) { mesh.updateMatrixWorld(true); hairs[h] = mesh; } } });
    LIB = { m: prepBody(m), f: fm ? prepBody(fm) : null, clips, hairs, mats: new Map(), gear: new Map() };
    return LIB;
  });
  return loading;
}

// ---------------- looks (uniform per unit type) ----------------
// cloth: uniform texture; top/pants: tint; boot/glove colours; mask: balaclava;
// paint: face camouflage cream; coat: officer's greatcoat (+ skirt geometry)
export const LOOKS = {
  // ROK army (granite digital), worn with a camo neck gaiter by some
  rok: { cloth: 'camoROK', top: 0xffffff, pants: 0xffffff, boot: 0x16161a, glove: 0x1c1d1e, rep: 7, gaiter: 0.35 },
  // ROK special warfare: combat shirt (plain torso, pixel camo arms), camo face mask
  rok_sf: { cloth: 'camoROKSF', top: 0xffffff, pants: 0xffffff, shirt: 0x55583f, boot: 0x6a6656, glove: 0x2a2b26, rep: 7, mask: 'camo' },
  // ROK 707: all black
  rok_707: { cloth: 'fabric', top: 0x2a2b2e, pants: 0x2a2b2e, boot: 0x141416, glove: 0x18191b, rep: 10, mask: 'black' },
  kpa: { cloth: 'camoKPA', top: 0xffffff, pants: 0xffffff, boot: 0x5e4834, glove: 0x4a4636, rep: 4 },
  kpa_sf: { cloth: 'camoKPASF', top: 0xffffff, pants: 0xffffff, boot: 0x1a1a1c, glove: 0x1c1d1f, rep: 4, mask: 'black' },
  kpa_sfb: { cloth: 'camoKPABrown', top: 0xffffff, pants: 0xffffff, boot: 0x5a4430, glove: 0x3a3428, rep: 7, gaiter: 0.6 },
  kpa_officer: { cloth: 'fabric', top: 0x5e573c, pants: 0x4e4a36, boot: 0x141414, glove: -1, rep: 14 },
  us: { cloth: 'camoUS', top: 0xffffff, pants: 0xffffff, boot: 0x8a7354, glove: 0x6e6248, rep: 4.5 },
  // private security contractors (Voss's former outfit): dark softshells, plain plate carriers, headsets
  pmc: { cloth: 'fabric', top: 0x2a2d31, pants: 0x3b3a36, boot: 0x2a2620, glove: 0x1a1a1a, rep: 10 },
  // M06: Nadia Rahman (olive field jacket, dark trousers) and the harbour gang's hired guns (street clothes, light vests)
  nadia: { cloth: 'fabric', top: 0x343a2a, pants: 0x1c1c1f, boot: 0x1d1a16, glove: 0x1c1c1c, rep: 10 },
  // M07: Maya Chen (burgundy wool coat, dark jeans)
  maya: { cloth: 'fabric', top: 0x5a2630, pants: 0x23252b, boot: 0x2a2220, glove: -1, rep: 10 },
  merc: { cloth: 'fabric', top: 0x4a4d55, pants: 0x2a2e36, boot: 0x2a2620, glove: -1, rep: 10 },
  police: { cloth: 'fabric', top: 0x1f2a44, pants: 0x1c2232, boot: 0x141414, glove: -1, rep: 10 },
};
const CIV_TOPS = [0x3b4a6b, 0x6b3b3b, 0x5a5a5a, 0x2f4f3f, 0x7a6a4a, 0x2a2a35, 0x8a8478, 0x4a3a5a, 0xa05a2a, 0x2a5a6a, 0xc8c2b4];
const CIV_PANTS = [0x24262c, 0x3a4458, 0x4a4036, 0x2e3a52, 0x5a5650];
const SHOES = [0xd8d8d4, 0x2a2a2a, 0x5a4636, 0x8a2a2a];
// enemy unit mix for the current mission (weights): regular army, SF (blue / brown), officers
let ENEMY_MIX = { kpa: 1 };
// how often generated people (civilians, US marines) use the female body: 'classic' is the original mix
// (kept for M06), 'few' is the default everywhere else. Named characters pass `sex` explicitly.
let FEMALE_MIX = 'few';
export function setFemaleMix(mode) { FEMALE_MIX = mode || 'few'; }
export function isFemale(civ, look, variant) {
  if (FEMALE_MIX === 'classic') return (civ && variant % 3 === 1) || (look === 'us' && variant % 4 === 3);
  return civ && hash(variant * 13 + 5) < 0.12;
}
export function setEnemyMix(mix) { ENEMY_MIX = mix || { kpa: 1 }; }
const hash = (n) => { let h = (n + 1) * 2654435761; h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const vhash = hash;
export function lookKey(faction, variant, weapon, hat) {
  if (faction === 'civ') return 'civ';
  if (!weapon && hat === 'cap' && faction === 'rok') return 'police';
  if (faction === 'kpa') {
    const r = hash(variant * 7 + 3); let acc = 0; const tot = Object.values(ENEMY_MIX).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(ENEMY_MIX)) { acc += w / tot; if (r < acc) return k; }
    return 'kpa';
  }
  return LOOKS[faction] ? faction : 'rok';
}
export function lookFor(key, variant) {
  if (LOOKS[key]) return LOOKS[key];
  return { cloth: 'fabric', top: CIV_TOPS[variant % CIV_TOPS.length], pants: CIV_PANTS[(variant >> 1) % CIV_PANTS.length], boot: SHOES[(variant >> 2) % SHOES.length], glove: -1, rep: 12, sleeve: variant % 3 === 0 ? 0 : 1 };
}
export function skinTone(key, variant) { const t = SKIN_TINTS[key === 'civ' || key === 'us' ? variant % SKIN_TINTS.length : variant % 5]; return t; }
const SKIN_TINTS = [[1, 1, 1], [0.93, 0.9, 0.86], [0.84, 0.78, 0.72], [1.05, 1.02, 0.98], [0.97, 0.92, 0.85], [0.76, 0.68, 0.6]];

// skin (head, hands, and short-sleeved forearms); everything under the garments is discarded
export function bodyMaterial(base, key, variant) {
  const lk = lookFor(key, variant); const tintIdx = key === 'civ' || key === 'us' ? variant % SKIN_TINTS.length : variant % 5;
  const sleeve = lk.sleeve ?? 1;
  const mkey = `${base.uuid}|skin|${tintIdx}|${sleeve}|${lk.glove}`;
  if (LIB.mats.has(mkey)) return LIB.mats.get(mkey);
  const m = base.clone();
  const U = { uSkin: { value: new THREE.Vector3(...SKIN_TINTS[tintIdx]) }, uSleeve: { value: sleeve }, uGlove: { value: new THREE.Color(lk.glove < 0 ? 0xffffff : lk.glove) }, uGloveOn: { value: lk.glove < 0 ? 0 : 1 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 zoneA; attribute vec3 zoneB; varying vec4 vZA; varying vec3 vZB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZA = zoneA; vZB = zoneB;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vZA; varying vec3 vZB; uniform vec3 uSkin, uGlove; uniform float uSleeve, uGloveOn;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vZA.y + vZA.z + vZA.w + vZB.z + vZB.x * uSleeve > 0.62 && vZB.y < 0.5) discard;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uSkin;\nfloat wG = smoothstep(0.35, 0.65, vZB.y) * uGloveOn; diffuseColor.rgb = mix(diffuseColor.rgb, uGlove, wG);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, smoothstep(0.35, 0.65, vZB.y) * uGloveOn);');
  };
  m.customProgramCacheKey = () => 'skin2';
  LIB.mats.set(mkey, m);
  return m;
}

// uniform fabric on the garment shell: camo / colour per zone, ripstop weave normal, boots
// Cloth normal map: fine weave plus folds — compression creases (soft ridges at random angles, mostly
// across the limb), a few long drape folds and seams. Height field → normals on a canvas, made once.
let FOLD = null;
function clothFoldNormal() {
  if (FOLD) return FOLD;
  const N = 512, h = new Float32Array(N * N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // weave
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = 0.06 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + 0.03 * (rnd() - 0.5);
  // folds: gaussian ridges along short segments, wrapped (tileable)
  const ridge = (cx, cy, ang, len, w, amp) => { const dx = Math.cos(ang), dy = Math.sin(ang); const R = Math.ceil(len / 2 + w * 3);
    for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) { const along = ox * dx + oy * dy, across = -ox * dy + oy * dx; if (Math.abs(along) > len / 2) continue;
      const fall = Math.cos(along / (len / 2) * Math.PI / 2); const v = amp * fall * fall * Math.exp(-(across * across) / (2 * w * w));
      const x = ((Math.round(cx + ox) % N) + N) % N, y = ((Math.round(cy + oy) % N) + N) % N; h[y * N + x] += v; } };
  for (let i = 0; i < 70; i++) ridge(rnd() * N, rnd() * N, (rnd() - 0.5) * 0.9, 40 + rnd() * 110, 3 + rnd() * 6, (rnd() < 0.5 ? 1 : -0.7) * (0.6 + rnd() * 0.8));   // creases
  for (let i = 0; i < 10; i++) ridge(rnd() * N, rnd() * N, Math.PI / 2 + (rnd() - 0.5) * 0.5, 160 + rnd() * 200, 10 + rnd() * 8, 0.9);                              // drape folds
  for (let i = 0; i < 3; i++) { const y0 = Math.floor(rnd() * N); for (let x = 0; x < N; x++) { h[y0 * N + x] -= 0.5; h[((y0 + 1) % N) * N + x] -= 0.25; } }            // seams
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N);
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const nx = (H(x - 1, y) - H(x + 1, y)) * 2.2, ny = (H(x, y - 1) - H(x, y + 1)) * 2.2; const l = Math.hypot(nx, ny, 1); const i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  FOLD = new THREE.CanvasTexture(c); FOLD.wrapS = FOLD.wrapT = THREE.RepeatWrapping; FOLD.anisotropy = 4; FOLD.colorSpace = THREE.NoColorSpace;
  return FOLD;
}
export function garmentMaterial(key, variant) {
  const lk = lookFor(key, variant);
  const mkey = `garment|${key}|${key === 'civ' ? variant % 60 : 0}`;
  if (LIB.mats.has(mkey)) return LIB.mats.get(mkey);
  const tex = pbr(lk.cloth, { repeat: [1, 1], key: `cloth_${lk.cloth}` });
  const weave = clothFoldNormal().clone(); weave.repeat.set(lk.rep * 0.9, lk.rep * 0.9); weave.needsUpdate = true;   // fabric weave + creases and folds
  // plain cloth (civilian clothes, police, greatcoat): colour only, the weave normal gives the texture
  let map = null; if (lk.cloth !== 'fabric') { map = tex.map.clone(); map.repeat.set(lk.rep, lk.rep); map.needsUpdate = true; }
  const m = new THREE.MeshStandardMaterial({ map, normalMap: weave, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
  const U = { uTop: { value: new THREE.Color(lk.top) }, uPants: { value: new THREE.Color(lk.pants) }, uBoot: { value: new THREE.Color(lk.boot) }, uShirt: { value: new THREE.Color(lk.shirt ?? 0xffffff) }, uShirtOn: { value: lk.shirt ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 zoneA; attribute vec3 zoneB; varying vec4 vZA; varying vec3 vZB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZA = zoneA; vZB = zoneB;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vZA; varying vec3 vZB; uniform vec3 uTop, uPants, uBoot, uShirt; uniform float uShirtOn;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float wPants = smoothstep(0.35, 0.65, vZA.z);
        float wBoot = smoothstep(0.35, 0.65, vZA.w);
        float wTorso = smoothstep(0.35, 0.65, vZA.y) * uShirtOn;
        vec3 c = diffuseColor.rgb * mix(uTop, uPants, wPants);
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        c = mix(c, uShirt * (0.85 + lum * 0.3), wTorso);
        c = mix(c, uBoot * (0.9 + lum * 0.2), wBoot);
        diffuseColor.rgb = c;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, smoothstep(0.35, 0.65, vZA.w));');
  };
  m.customProgramCacheKey = () => 'garment';
  LIB.mats.set(mkey, m);
  return m;
}
export function maskMaterial(kind, key) {
  const mkey = `mask|${kind}|${key}`;
  if (LIB.mats.has(mkey)) return LIB.mats.get(mkey);
  const knit = pbr('fabric', { repeat: [1, 1], key: 'knit' }).normalMap.clone(); knit.repeat.set(30, 30); knit.needsUpdate = true;
  let map = null, color = 0x121315;
  if (kind === 'camo') { const lk = lookFor(key, 0); map = pbr(lk.cloth, { repeat: [1, 1], key: `cloth_${lk.cloth}` }).map.clone(); map.repeat.set(5, 5); map.needsUpdate = true; color = 0xffffff; }
  const m = new THREE.MeshStandardMaterial({ color, map, normalMap: knit, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.97, side: THREE.DoubleSide });
  LIB.mats.set(mkey, m);
  return m;
}

// ---------------- rigid gear, built once per look in rest space ----------------
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const GM = {};
const VEST = { rok: 0x4a4e36, rok_sf: 0x4c5038, rok_707: 0x1a1b1d, kpa: 0x5b5a3e, kpa_sf: 0x464b36, kpa_sfb: 0x8a7552, us: 0x7a6a4e, kpa_officer: 0x5a3a22, police: 0x15161a };
const gearMats = (key) => GM[key] ||= {
  shell: { rok_707: std(0x1c1d1f, 0.6, 0.1), rok_sf: pbr('camoROKSF', { repeat: [1.2, 1.2], key: 'helm_rsf3' }), rok: pbr('camoROK', { repeat: [1.2, 1.2], key: 'helm_rok3' }), kpa: pbr('camoKPA', { repeat: [1.2, 1.2], key: 'helm_kpa3' }), kpa_sf: pbr('camoKPASF', { repeat: [1.2, 1.2], key: 'helm_sf3' }), kpa_sfb: pbr('camoKPABrown', { repeat: [1.2, 1.2], key: 'helm_sfb3' }), us: pbr('camoUS', { repeat: [1.2, 1.2], key: 'helm_us3' }) }[key] || std(0x3a3d32, 0.8),
  vest: pbr('fabric', { color: VEST[key] ?? 0x3c4130, repeat: [4, 4], key: `vest_${key}` }),
  pouch: pbr('fabric', { color: new THREE.Color(VEST[key] ?? 0x4b5036).multiplyScalar(1.12).getHex(), repeat: [4, 4], key: `pouch_${key}` }),
  camo: pbr({ rok_sf: 'camoROKSF', rok_707: 'fabric', rok: 'camoROK', kpa: 'camoKPA', kpa_sf: 'camoKPASF', kpa_sfb: 'camoKPABrown', us: 'camoUS' }[key] || 'fabric', { repeat: [1.5, 1.5], color: key === 'kpa_officer' ? 0x6a6246 : key === 'rok_707' ? 0x2a2b2e : key === 'police' ? 0x1f2a44 : 0xffffff, key: `gcamo_${key}` }),
  dark: std(0x1c1d1e, 0.55, 0.3), sole: std(0x111111, 0.9), boot: std(LOOKS[key]?.boot ?? 0x1c1a17, 0.7),
  leather: std(0x5a3418, 0.55, 0.05), red: std(0x8a1c1c, 0.6), gold: std(0xc8a040, 0.35, 0.8), fur: pbr('fabric', { color: 0x5a5236, repeat: [8, 8], key: 'fur' }),
  cap: std(key === 'police' ? 0x1c2436 : 0x3a3d32, 0.8), lens: std(0x101418, 0.2, 0.6), tint: new THREE.MeshStandardMaterial({ color: 0xd8701e, metalness: 1, roughness: 0.08, transparent: true, opacity: 0.92, side: THREE.DoubleSide }), smoke: new THREE.MeshStandardMaterial({ color: 0x3a4a52, metalness: 0.85, roughness: 0.04, transparent: true, opacity: 0.6, envMapIntensity: 1.5, side: THREE.DoubleSide }), clear: new THREE.MeshStandardMaterial({ color: 0x9ab0b8, metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.45, side: THREE.DoubleSide }), frame: std(0x141516, 0.6, 0.1), subdued: std(0x3a3b34, 0.85), subdued2: std(0x2a2b26, 0.85),
  coat: (() => { const m = pbr('fabric', { color: 0x7e7652, repeat: [3, 3], key: 'greatcoat' }).clone(); m.side = THREE.DoubleSide; return m; })(),
};


// ---- sleeve patches (canvas): Taegukgi in official proportions, subdued / IR-style colours ----
const PATCH_TEX = {};
export function patchTexture(kind) {
  if (PATCH_TEX[kind]) return PATCH_TEX[kind];
  const W = 300, H = 200, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const pal = kind === 'flag_ir' ? { bg: '#6e6c5e', red: '#2b2a25', blue: '#45443c', bar: '#1f1e1a', edge: '#4a493f' }
    : kind === 'flag_color' ? { bg: '#f4f4f0', red: '#cd2e3a', blue: '#0047a0', bar: '#111', edge: '#9a9a90' }
    : { bg: '#5b5e45', red: '#3b3326', blue: '#2c3528', bar: '#22241b', edge: '#3c3f2e' };
  if (kind === 'unit') {   // left sleeve: subdued division mark (shield + star)
    g.fillStyle = '#4d5039'; g.fillRect(0, 0, W, H); g.fillStyle = '#25271d';
    g.beginPath(); g.moveTo(W * 0.3, H * 0.15); g.lineTo(W * 0.7, H * 0.15); g.lineTo(W * 0.7, H * 0.55); g.quadraticCurveTo(W * 0.7, H * 0.8, W * 0.5, H * 0.88); g.quadraticCurveTo(W * 0.3, H * 0.8, W * 0.3, H * 0.55); g.closePath(); g.fill();
    g.fillStyle = '#5d6045'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.07 * H : 0.17 * H; g.lineTo(W * 0.5 + Math.cos(a) * r, H * 0.47 + Math.sin(a) * r); } g.fill();
  } else {
    // flag: width 3 : height 2; taeguk diameter = H/2; trigrams 1/4 diameter from the circle
    g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
    const D = H / 2, r = D / 2, a = Math.atan2(2, 3);
    g.save(); g.translate(W / 2, H / 2); g.rotate(a);
    g.fillStyle = pal.blue; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.red; g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(-r / 2, 0, r / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.blue; g.beginPath(); g.arc(r / 2, 0, r / 2, 0, Math.PI * 2); g.fill();
    g.restore();
    // trigrams: bar length D/2, thickness D/12, gaps D/24; 1 = solid, 0 = broken (inner bar first)
    const T3 = { geon: [1, 1, 1], gon: [0, 0, 0], gam: [0, 1, 0], ri: [1, 0, 1] };
    const bl = D / 2, bt = D / 12, gap = D / 24, dist = r + D / 4;
    for (const [name, ang] of [['geon', Math.PI + a], ['gon', a], ['gam', -a], ['ri', Math.PI - a]]) {
      g.save(); g.translate(W / 2, H / 2); g.rotate(ang); g.fillStyle = pal.bar;
      T3[name].forEach((solid, k) => { const x = dist + k * (bt + gap); if (solid) g.fillRect(x, -bl / 2, bt, bl); else { g.fillRect(x, -bl / 2, bt, bl / 2 - gap / 2); g.fillRect(x, gap / 2, bt, bl / 2 - gap / 2); } });
      g.restore();
    }
  }
  g.strokeStyle = pal.edge || '#3c3f2e'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);   // merrowed edge
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (PATCH_TEX[kind] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
}
// eyewear built around the face: curved lens band with rims and a strap
function goggles(P, M, lensMat, x, y, cz, R, strapBack) {
  P('Head', lensMat, new THREE.CylinderGeometry(R, R, 0.046, 24, 1, true, -0.78, 1.56).translate(x, y, cz));
  for (const dy of [-0.025, 0.025]) P('Head', M.frame, new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.008, 24, 1, true, -0.8, 1.6).translate(x, y + dy, cz));
  for (const sx of [-1, 1]) P('Head', M.frame, T(roundedBox(0.012, 0.054, 0.022, 0.004), x + sx * Math.sin(0.8) * R, y, cz + Math.cos(0.8) * R, 0, sx * 0.8, 0));
  P('Head', M.frame, new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.02, 28, 1, true, strapBack ? 0.8 : 0.85, Math.PI * 2 - (strapBack ? 1.6 : 1.7)).translate(x, y, cz));
}
// shooting glasses: two rounded lenses bent onto the face curve, thin brow bar, bridge, temples
function bentShape(shape, R, cz, y, wrapStart, mir = 1) {
  const g = new THREE.ShapeGeometry(shape, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = wrapStart + mir * p.getX(i) / R, yy = p.getY(i); p.setXYZ(i, Math.sin(a) * R, y + yy, cz + Math.cos(a) * R); }
  g.computeVertexNormals(); return g;
}
function lensOutline(w, h, sx) {
  // eye-shaped lens: flat top, rounded outer-bottom, nose cut on the inner side
  const s = new THREE.Shape(), x0 = 0, x1 = w * sx;
  s.moveTo(x0 + 0.004 * sx, h * 0.5);
  s.lineTo(x1 - 0.004 * sx, h * 0.5);
  s.quadraticCurveTo(x1, h * 0.5, x1, h * 0.2);
  s.quadraticCurveTo(x1, -h * 0.5, x1 - w * 0.45 * sx, -h * 0.5);
  s.quadraticCurveTo(x0 + w * 0.12 * sx, -h * 0.5, x0, -h * 0.05);
  s.lineTo(x0, h * 0.3);
  s.quadraticCurveTo(x0, h * 0.5, x0 + 0.004 * sx, h * 0.5);
  return s;
}
function glasses(P, M, lensMat, y, faceZ) {
  const R = 0.1, cz = faceZ + 0.014 - R, w = 0.052, h = 0.034;
  for (const sx of [-1, 1]) {
    const g = bentShape(lensOutline(w, h, 1), R, cz, y, sx * 0.07, sx);
    P('Head', lensMat, g);
    P('Head', M.frame, new THREE.CylinderGeometry(R + 0.002, R + 0.002, 0.005, 10, 1, true, sx > 0 ? 0.06 : -0.07 - w / R, w / R + 0.01).translate(0, y + h * 0.5, cz));
    P('Head', M.frame, T(roundedBox(0.004, 0.005, 0.11, 0.002), sx * Math.sin(0.07 + w / R) * (R + 0.002), y + h * 0.42, cz + Math.cos(0.07 + w / R) * R - 0.054, 0, sx * 0.22, 0));
  }
  P('Head', M.frame, T(roundedBox(0.016, 0.006, 0.006, 0.002), 0, y + h * 0.42, faceZ + 0.015));
}

// returns [{ bone, geometry, material }] (geometry in the bone's local space)
export function gearFor(kind, key, hat, variant, sex = 'm') {
  const gkey = `${kind}|${key}|${hat}|${variant % 6}|${sex}`;
  if (LIB.gear.has(gkey)) return LIB.gear.get(gkey);
  const R = LIB[sex].rest, M = gearMats(key);
  const parts = []; const P = (bone, mat, geo) => parts.push({ bone, mat, geo });
  const head = R.Head, chest = R.spine_03, pel = R.pelvis, cz = chest.z;
  const hc = new THREE.Vector3(head.x, head.y + 0.105, head.z + 0.01);          // skull centre
  const soldier = kind === 'soldier';
  // ---- headgear ----
  const HELMET = { kpa: 'ssh60', kpa_officer: 'ushanka', rok: 'fast_cam', rok_sf: 'fast_cam', rok_707: 'fast_blk', us: 'helmet' };
  const realHat = (hat === 'helmet' || key === 'kpa_officer') && armorPart(HELMET[key]);
  if (realHat) {
    // real helmet / hat model: shell top above the skull, centred on the head (offsets: top, forward)
    const fit = { ssh60: [0.168, -0.008], ushanka: [0.178, -0.005], fast_cam: [0.142, -0.004], fast_blk: [0.142, -0.004], helmet: [0.162, -0.01] }[HELMET[key]];
    P('Head', realHat.material, realHat.geometry.clone().translate(hc.x, hc.y + fit[0], hc.z + fit[1]));
    const ey = LIB[sex].eyeY, fz = LIB[sex].faceZ;
    if (key === 'rok_707') goggles(P, M, M.tint, 0, ey + 0.004, fz + 0.016 - 0.105, 0.105, false);
    else if (key === 'rok_sf') glasses(P, M, M.smoke, ey + 0.002, fz + 0.012);
    if (key === 'kpa_officer') P('Head', M.gold, T(cyl(0.017, 0.017, 0.006, 12), hc.x, hc.y + 0.075, hc.z + 0.155, Math.PI / 2));   // cap badge
  } else if (key === 'kpa_officer') {
    // fur winter hat with ear flaps tied up, small badge
    P('Head', M.fur, T(cyl(0.128, 0.122, 0.12, 20), hc.x, hc.y + 0.06, hc.z - 0.005));
    P('Head', M.fur, T(sphere(0.124, 1, 0.45, 1, 18, 6, Math.PI / 2), hc.x, hc.y + 0.12, hc.z - 0.005));
    P('Head', M.fur, T(roundedBox(0.2, 0.05, 0.05, 0.02), hc.x, hc.y + 0.05, hc.z + 0.12));
    for (const sx of [-1, 1]) P('Head', M.fur, T(roundedBox(0.05, 0.08, 0.13, 0.02), hc.x + sx * 0.125, hc.y + 0.07, hc.z - 0.01));
    P('Head', M.gold, T(cyl(0.017, 0.017, 0.006, 12), hc.x, hc.y + 0.065, hc.z + 0.148, Math.PI / 2));
  } else if (hat === 'helmet' && key === 'rok') {
    // ROK army issue helmet: full cut over the ears, granite cover, chin strap, goggles on some
    P('Head', M.shell, T(sphere(0.142, 1, 0.92, 1.1, 24, 12, Math.PI * 0.6), hc.x, hc.y + 0.015, hc.z - 0.01));
    P('Head', M.shell, T(new THREE.TorusGeometry(0.142, 0.008, 4, 28).scale(1, 1.1, 1), hc.x, hc.y + 0.015 - 0.04, hc.z - 0.01, Math.PI / 2));
    for (const sx of [-1, 1]) P('Head', M.dark, T(roundedBox(0.008, 0.09, 0.012, 0.003), hc.x + sx * 0.1, hc.y - 0.085, hc.z + 0.03, 0.25));
    if (variant % 3 === 2) goggles(P, M, M.clear, 0, hc.y + 0.07, hc.z - 0.01, 0.146, true);   // goggles pushed up on the helmet
  } else if (hat === 'helmet') {
    // modern ballistic helmet (high cut) with cover, rails, shroud
    P('Head', M.shell, T(sphere(0.134, 1, 0.94, 1.1, 22, 10, Math.PI * 0.5), hc.x, hc.y + 0.02, hc.z - 0.008));
    for (const sx of [-1, 1]) P('Head', M.dark, T(roundedBox(0.012, 0.028, 0.13, 0.004), hc.x + sx * 0.13, hc.y + 0.01, hc.z - 0.005));
    P('Head', M.dark, T(roundedBox(0.05, 0.034, 0.022, 0.006), hc.x, hc.y + 0.1, hc.z + 0.135, -0.4));
    const headset = key === 'kpa' || key === 'kpa_sfb' || key === 'rok_sf' || key === 'rok_707' || key === 'us' || key === 'pmc';
    // eye protection: shooting glasses / goggles (707: tinted lenses)
    const ey = LIB[sex].eyeY, fz = LIB[sex].faceZ;
    if (key === 'rok_707') goggles(P, M, M.tint, 0, ey + 0.004, fz + 0.016 - 0.105, 0.105, false);
    else if (key === 'rok_sf') glasses(P, M, M.smoke, ey + 0.002, fz + 0.012);
    if (headset) for (const sx of [-1, 1]) { P('Head', M.dark, T(cyl(0.045, 0.045, 0.04, 14), hc.x + sx * 0.125, hc.y - 0.035, hc.z, 0, 0, Math.PI / 2)); }
    const nvg = key === 'kpa_sf' || key === 'kpa_sfb' || (key === 'us' && variant % 3 === 1);
    if (nvg) { for (const sx of [-1, 1]) P('Head', M.lens, T(cyl(0.017, 0.02, 0.07, 10), hc.x + sx * 0.032, hc.y + 0.085, hc.z + 0.17, Math.PI / 2)); P('Head', M.dark, T(roundedBox(0.09, 0.03, 0.04, 0.008), hc.x, hc.y + 0.1, hc.z + 0.15)); }
    else if (variant % 2 === 0) P('Head', M.dark, T(new THREE.TorusGeometry(0.135, 0.009, 4, 24), hc.x, hc.y + 0.05, hc.z, Math.PI / 2));
  } else if (hat === 'cap') {
    P('Head', M.cap, T(cyl(0.118, 0.124, 0.08, 18), hc.x, hc.y + 0.06, hc.z - 0.005));
    P('Head', M.cap, T(roundedBox(0.16, 0.012, 0.1, 0.004), hc.x, hc.y + 0.03, hc.z + 0.11));
  } else if (hat === 'headset') {
    P('Head', M.dark, T(new THREE.TorusGeometry(0.12, 0.01, 4, 18, Math.PI), hc.x, hc.y + 0.01, hc.z));
    for (const sx of [-1, 1]) P('Head', M.dark, T(cyl(0.038, 0.038, 0.032, 12), hc.x + sx * 0.112, hc.y - 0.02, hc.z, 0, 0, Math.PI / 2));
  }
  // glasses (a few civilians / marines)
  if ((kind === 'civ' && variant % 5 === 1) || (key === 'us' && variant % 4 === 2)) for (const sx of [-1, 1]) P('Head', M.dark, T(new THREE.TorusGeometry(0.02, 0.003, 4, 14), hc.x + sx * 0.034, hc.y - 0.02, hc.z + 0.115));
  // ---- body ----
  if (key === 'kpa_officer') {
    // greatcoat skirt to the knee, double-breasted buttons, red shoulder boards, leather belt + cross strap + holster
    P('pelvis', M.coat, new THREE.LatheGeometry([[0.28, -0.52], [0.25, -0.32], [0.22, -0.15], [0.2, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 20).scale(1, 1, 0.82).translate(pel.x, pel.y + 0.02, pel.z));
    for (const yy of [0.02, -0.08, -0.18]) for (const sx of [-1, 1]) P('spine_03', M.gold, T(sphere(0.009), sx * 0.06, chest.y + yy, cz + 0.135));
    for (const sx of [-1, 1]) { P('spine_03', M.red, T(roundedBox(0.12, 0.012, 0.055, 0.004), sx * 0.17, chest.y + 0.2, cz - 0.01)); P('spine_03', M.camo, T(roundedBox(0.2, 0.06, 0.012, 0.004), sx * 0.06, chest.y + 0.22, cz + 0.06, -0.3, sx * 0.4, 0)); }
    P('pelvis', M.leather, T(new THREE.TorusGeometry(0.175, 0.024, 4, 24).scale(1.04, 1, 0.84), pel.x, pel.y + 0.1, pel.z + 0.01, Math.PI / 2));
    P('pelvis', M.gold, T(roundedBox(0.06, 0.045, 0.012, 0.004), pel.x, pel.y + 0.1, pel.z + 0.165));
    P('spine_03', M.leather, T(roundedBox(0.03, 0.62, 0.012, 0.004), 0.02, chest.y - 0.02, cz + 0.13, 0, 0, -0.5));
    P('pelvis', M.leather, T(roundedBox(0.07, 0.15, 0.05, 0.015), pel.x - 0.17, pel.y + 0.0, pel.z + 0.06));
  } else if (soldier) {
    const real = armorPart({ kpa: 'rig', us: 'heavy', pmc: 'heavy', merc: 'rig', nadia: 'heavy' }[key] || 'olive');
    if (real) {
      const fit = ARMOR_FIT[key] || ARMOR_FIT.def;
      P('spine_03', real.material, real.geometry.clone().translate(0, chest.y + fit[0], cz + fit[1]));
      if (key !== 'kpa') { P('spine_03', M.pouch, T(roundedBox(0.08, 0.16, 0.06, 0.015), -0.09, chest.y - 0.02, cz - 0.21)); P('spine_03', M.dark, T(cyl(0.005, 0.004, 0.42, 5), -0.11, chest.y + 0.25, cz - 0.22)); }
      if (variant % 3 === 1 && key !== 'kpa_sf') P('spine_03', M.pouch, T(roundedBox(0.28, 0.34, 0.13, 0.03), 0, chest.y - 0.03, cz - 0.26)); // assault pack
    } else {
      P('spine_03', M.vest, T(roundedBox(0.31, 0.34, 0.06, 0.02), 0, chest.y - 0.02, cz + 0.125));
      P('spine_03', M.vest, T(roundedBox(0.31, 0.36, 0.06, 0.02), 0, chest.y - 0.01, cz - 0.155));
      for (const sx of [-1, 1]) { P('spine_03', M.vest, T(roundedBox(0.05, 0.16, 0.27, 0.015), sx * 0.175, chest.y - 0.1, cz - 0.015)); P('spine_03', M.vest, T(roundedBox(0.07, 0.03, 0.3, 0.01), sx * 0.11, chest.y + 0.17, cz - 0.015)); }
      for (const x of [-0.085, 0, 0.085]) P('spine_03', M.pouch, T(roundedBox(0.075, 0.13, 0.045, 0.012), x, chest.y - 0.09, cz + 0.172));
      P('spine_03', M.pouch, T(roundedBox(0.1, 0.07, 0.04, 0.012), 0.07, chest.y + 0.07, cz + 0.17));
      if (key === 'kpa_sfb' || key === 'kpa') P('pelvis', M.vest, T(roundedBox(0.2, 0.2, 0.03, 0.03, { taperBottom: 0.6 }), pel.x, pel.y - 0.02, pel.z + 0.15));  // groin protector
      if (key !== 'kpa') { P('spine_03', M.pouch, T(roundedBox(0.08, 0.16, 0.06, 0.015), -0.09, chest.y - 0.02, cz - 0.21)); P('spine_03', M.dark, T(cyl(0.005, 0.004, 0.42, 5), -0.11, chest.y + 0.25, cz - 0.22)); }
      if (variant % 3 === 1 && key !== 'kpa_sf') P('spine_03', M.pouch, T(roundedBox(0.28, 0.34, 0.13, 0.03), 0, chest.y - 0.03, cz - 0.26)); // assault pack
    }
    if (key === 'rok' || key === 'rok_sf') {
      // low-visibility patches on the upper arms: subdued flag (right), unit mark (left)
      for (const [sd, kind] of [['r', key === 'rok_sf' ? 'flag_ir' : 'flag'], ['l', 'unit']]) {
        const u = R[`upperarm_${sd}`]; const sx = u.x > 0 ? 1 : -1;
        P(`upperarm_${sd}`, M.subdued2, T(roundedBox(0.056, 0.004, 0.078, 0.003), u.x + sx * 0.09, u.y + 0.076, u.z - 0.005));          // backing
        const pl = new THREE.PlaneGeometry(0.075, 0.05).rotateX(-Math.PI / 2).rotateY(sx < 0 ? Math.PI / 2 : -Math.PI / 2);   // faces out; width runs front-back so the flag reads landscape with the arm down
        P(`upperarm_${sd}`, patchTexture(kind), pl.translate(u.x + sx * 0.09, u.y + 0.0785, u.z - 0.005));
      }
    }
    // collar of the field jacket
    P('spine_03', M.camo, T(new THREE.TorusGeometry(0.075, 0.018, 5, 18).scale(1.1, 1, 1), 0, R.neck_01.y - 0.03, R.neck_01.z + 0.01, Math.PI / 2 - 0.25));
    // thigh cargo pockets, boot shafts, knee pads, elbow pads (SF)
    for (const sd of ['l', 'r']) {
      const th = R[`thigh_${sd}`], ca = R[`calf_${sd}`], sx = th.x > 0 ? 1 : -1;
      P(`thigh_${sd}`, M.camo, T(roundedBox(0.04, 0.16, 0.13, 0.015), th.x + sx * 0.09, (th.y + ca.y) / 2 - 0.02, th.z + 0.01));
      P(`calf_${sd}`, M.boot, T(cyl(0.062, 0.058, 0.2, 14), ca.x, 0.17, ca.z - 0.02));
      P(`calf_${sd}`, M.dark, T(roundedBox(0.11, 0.12, 0.05, 0.02), ca.x, ca.y + 0.01, ca.z + 0.085));
      if (key === 'kpa_sf' || key === 'kpa_sfb') { const ua = R[`lowerarm_${sd}`]; P(`lowerarm_${sd}`, M.dark, T(roundedBox(0.06, 0.07, 0.08, 0.02), ua.x, ua.y + 0.01, ua.z - 0.05)); }
    }
    P('pelvis', M.pouch, T(new THREE.TorusGeometry(0.165, 0.028, 5, 24).scale(1.04, 1, 0.82), pel.x, pel.y + 0.05, pel.z + 0.02, Math.PI / 2));
    for (const sx of [-1, 1]) P('pelvis', M.pouch, T(roundedBox(0.06, 0.1, 0.09, 0.015), pel.x + sx * 0.17, pel.y + 0.02, pel.z - 0.01));
    P('pelvis', M.pouch, T(roundedBox(0.13, 0.09, 0.05, 0.015), pel.x, pel.y + 0.04, pel.z - 0.15));
  } else if (kind === 'civ' && variant % 4 === 2) {
    P('spine_03', M.pouch, T(roundedBox(0.26, 0.32, 0.12, 0.04), 0, chest.y - 0.03, chest.z - 0.2));
  }
  for (const sd of ['l', 'r']) P(`foot_${sd}`, M.sole, T(roundedBox(0.1, 0.035, 0.27, 0.012), R[`foot_${sd}`].x, 0.018, (R[`foot_${sd}`].z + R[`ball_${sd}`].z) / 2 + 0.02));
  // bake to bone-local space, merged per bone × material
  const groups = new Map();
  for (const p of parts) { const k = p.bone + '|' + p.mat.uuid; if (!groups.has(k)) groups.set(k, { bone: p.bone, mat: p.mat, list: [] }); groups.get(k).list.push(p.geo); }
  const restMats = LIB[sex].restMatrix ||= (() => { const out = {}; LIB[sex].scene.updateMatrixWorld(true); LIB[sex].scene.traverse((o) => { if (o.isBone) out[o.name] = o.matrixWorld.clone(); }); return out; })();
  const out = [];
  for (const g of groups.values()) {
    const geo = mergeGeometries(g.list.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(k)) y.deleteAttribute(k); if (!y.attributes.uv) y.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(y.attributes.position.count * 2), 2)); return y; }), false);
    geo.applyMatrix4(restMats[g.bone].clone().invert());
    out.push({ bone: g.bone, geometry: geo, material: g.mat });
  }
  LIB.gear.set(gkey, out);
  return out;
}

// ---------------- NPC weapons per unit (grip layout matches the actor IK: pistol grip at
// (0,-0.055,-0.035), support hand at (0,-0.03,0.25), muzzle on +Z) ----------------
const WEAPONS = {};
function weaponParts(type) {
  if (WEAPONS[type]) return WEAPONS[type];
  const M = { blk: std(0x1b1c1d, 0.5, 0.45), poly: std(0x232425, 0.75, 0.05), wood: std(0x6a3a1c, 0.55, 0.05), orange: std(0xb4561c, 0.6, 0.05), tan: std(0x8a7656, 0.7, 0.05), steel: std(0x2a2b2c, 0.4, 0.7), lens: std(0x2a3a44, 0.1, 0.8) };
  const parts = {}; const add = (m, g) => (parts[m] ||= []).push(g.index ? g.toNonIndexed() : g);
  const ar15 = (barrel, stockLen) => {
    add('blk', T(roundedBox(0.05, 0.075, 0.3, 0.008), 0, 0, 0.04));                     // receiver
    add('blk', T(roundedBox(0.026, 0.012, 0.4, 0.003), 0, 0.044, 0.12));               // top rail
    add('poly', T(roundedBox(0.05, 0.05, 0.24, 0.01), 0, 0.0, 0.31));                  // handguard
    add('steel', T(cyl(0.01, 0.01, barrel, 10), 0, 0.005, 0.31 + barrel / 2, Math.PI / 2));
    add('poly', T(roundedBox(0.032, 0.11, 0.06, 0.008), 0, -0.1, 0.12, -0.2));         // magazine
    add('poly', T(roundedBox(0.032, 0.1, 0.04, 0.008), 0, -0.075, -0.05, 0.35));       // grip
    add('poly', T(roundedBox(0.03, 0.07, stockLen, 0.01), 0, -0.02, -0.13 - stockLen / 2)); // stock
    add('poly', T(cyl(0.012, 0.012, 0.16, 8), 0, 0.0, -0.18, Math.PI / 2));            // buffer tube
  };
  const ak = (barrel, furn, mag, folding) => {
    add('blk', T(roundedBox(0.05, 0.075, 0.34, 0.008), 0, 0, 0.05));
    add('steel', T(cyl(0.011, 0.011, barrel, 10), 0, 0.01, 0.3 + barrel / 2, Math.PI / 2));
    add('steel', T(cyl(0.009, 0.009, 0.22, 8), 0, 0.04, 0.32, Math.PI / 2));
    add(furn, T(roundedBox(0.055, 0.05, 0.2, 0.012), 0, 0.0, 0.33));
    add(furn, T(roundedBox(0.04, 0.11, 0.04, 0.01), 0, -0.07, -0.05, 0.3));
    if (mag === 'helical') add('blk', T(cyl(0.03, 0.03, 0.3, 14), 0, -0.05, 0.32, Math.PI / 2));
    else { add(mag, T(roundedBox(0.03, 0.12, 0.07, 0.008), 0, -0.09, 0.13, -0.15)); add(mag, T(roundedBox(0.03, 0.1, 0.07, 0.008), 0, -0.19, 0.16, -0.45)); }
    if (folding) add('steel', T(roundedBox(0.012, 0.05, 0.24, 0.004), 0, -0.02, -0.2));
    else add(furn, T(roundedBox(0.045, 0.09, 0.26, 0.012, { taperTop: 0.85 }), 0, -0.04, -0.24, 0.12));
    add('steel', T(cyl(0.015, 0.013, 0.05, 10), 0, 0.01, 0.3 + barrel + 0.02, Math.PI / 2)); // muzzle brake
  };
  let muzzle = 0.77;
  if (type === 'k2c1') { ar15(0.34, 0.2); add('blk', T(roundedBox(0.035, 0.05, 0.07, 0.008), 0, 0.075, 0.06)); add('lens', T(roundedBox(0.03, 0.03, 0.005, 0.004), 0, 0.078, 0.025)); add('steel', T(cyl(0.013, 0.012, 0.05, 8), 0, 0.005, 0.68, Math.PI / 2)); muzzle = 0.71; }
  else if (type === 'k13') { ar15(0.16, 0.16); add('blk', T(roundedBox(0.04, 0.055, 0.12, 0.01), 0, 0.08, 0.06)); add('lens', T(cyl(0.017, 0.017, 0.004, 12), 0, 0.083, 0.0, Math.PI / 2)); add('tan', T(cyl(0.02, 0.02, 0.17, 14), 0, 0.005, 0.56, Math.PI / 2)); add('poly', T(roundedBox(0.025, 0.07, 0.025, 0.006), 0, -0.06, 0.34)); muzzle = 0.66; }
  else if (type === 'ak88') { ak(0.38, 'wood', 'orange', false); muzzle = 0.72; }
  else if (type === 'ak88s') { ak(0.2, 'poly', 'helical', true); muzzle = 0.54; }
  else if (type === 'aknew') { ak(0.3, 'poly', 'blk', false); add('blk', T(roundedBox(0.03, 0.012, 0.42, 0.003), 0, 0.048, 0.18)); add('blk', T(roundedBox(0.035, 0.05, 0.07, 0.008), 0, 0.08, 0.05)); add('lens', T(roundedBox(0.03, 0.03, 0.005, 0.004), 0, 0.083, 0.014)); muzzle = 0.64; }
  const geos = {};
  for (const [k, list] of Object.entries(parts)) geos[k] = mergeGeometries(list.map((g) => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false);
  return (WEAPONS[type] = { geos, mats: M, muzzle });
}
export function weaponTypeFor(look) {
  return { rok: 'k2c1', rok_sf: 'k13', rok_707: 'k13', us: 'k13', pmc: 'k13', nadia: 'k13', merc: 'ak88s', kpa: 'ak88', kpa_officer: 'ak88', kpa_sf: 'ak88s', kpa_sfb: 'aknew' }[look] || 'k2c1';
}
// real models (src/gear) per procedural type; the procedural rifle stays as the fallback
const GEAR_FOR = { k2c1: 'k2c1', k13: 'm4a1', ak88: 'ak74', ak88s: 'ak74m', aknew: 'ak74m' };
export function buildNpcWeapon(type) {
  const real = cloneGun(GEAR_FOR[type]); if (real) return real;
  const w = weaponParts(type); const g = new THREE.Group();
  for (const [k, geo] of Object.entries(w.geos)) { const m = new THREE.Mesh(geo, w.mats[k]); m.castShadow = true; g.add(m); }
  g.userData.muzzleZ = w.muzzle; g.userData.muzzleY = 0.005;
  return g;
}
export const buildNpcAK = () => buildNpcWeapon('ak88');

export function cloneBody(sex) { return SkeletonUtils.clone(LIB[sex].scene); }
