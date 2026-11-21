// Character assets: Quaternius "Universal Base Characters" bodies + "Universal
// Animation Library" clips (CC0, see assets/CREDITS.md). Loaded once per session.
//
// The bodies ship undressed, so clothing is painted on in the shader: every vertex
// gets zone weights from its skin weights (head → skin, torso/arms → top, hips/legs
// → trousers, feet → boots, hands → gloves); cloth zones are slightly inflated,
// lose the muscle normal map and take a camo/fabric texture. Rigid gear (helmet,
// plate carrier, pouches, belt, knee pads, soles) is attached to bones.
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
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(name)) return 'glove';
  if (/^(foot|ball)/.test(name)) return 'boot';
  if (/^(pelvis|thigh|calf|root)/.test(name)) return 'pants';
  return 'top';
};

function prepBody(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  let body = null; const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) { meshes.push(o); if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o; } });
  // zone weights per vertex (soft, from skin weights)
  const g = body.geometry, bones = body.skeleton.bones, n = g.attributes.position.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const za = new Float32Array(n * 4), zb = new Float32Array(n * 2);
  const slot = { skin: [za, 0, 4], top: [za, 1, 4], pants: [za, 2, 4], boot: [za, 3, 4], forearm: [zb, 0, 2], glove: [zb, 1, 2] };
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k); if (w <= 0) continue;
    const [arr, c, stride] = slot[ZONE(bones[si.getComponent(i, k)].name)]; arr[i * stride + c] += w;
  }
  g.setAttribute('zoneA', new THREE.BufferAttribute(za, 4)); g.setAttribute('zoneB', new THREE.BufferAttribute(zb, 2));
  const rest = {}; const v = new THREE.Vector3();
  for (const b of bones) rest[b.name] = b.getWorldPosition(v.clone());
  for (const m of meshes) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
  return { scene, body, rest };
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

// ---------------- clothing material ----------------
const LOOK = {
  rok: { cloth: 'camoROK', top: 0xffffff, pants: 0xffffff, boot: 0x1c1a17, glove: 0x23231e, rep: 7, camo: 1, inflate: 0.012 },
  kpa: { cloth: 'camoEnemy', top: 0xffffff, pants: 0xffffff, boot: 0x211c16, glove: 0x3a3426, rep: 6, camo: 1, inflate: 0.014 },
  us: { cloth: 'camoUS', top: 0xffffff, pants: 0xffffff, boot: 0x5a4a36, glove: 0x4e4434, rep: 7, camo: 1, inflate: 0.012 },
  police: { cloth: 'fabric', top: 0x1f2a44, pants: 0x1c2232, boot: 0x141414, glove: -1, rep: 10, camo: 0, inflate: 0.01 },
};
const CIV_TOPS = [0x3b4a6b, 0x6b3b3b, 0x5a5a5a, 0x2f4f3f, 0x7a6a4a, 0x2a2a35, 0x8a8478, 0x4a3a5a, 0xa05a2a, 0x2a5a6a, 0xc8c2b4];
const CIV_PANTS = [0x24262c, 0x3a4458, 0x4a4036, 0x2e3a52, 0x5a5650];
const SHOES = [0xd8d8d4, 0x2a2a2a, 0x5a4636, 0x8a2a2a];

function lookFor(faction, variant) {
  if (LOOK[faction]) return LOOK[faction];
  return { cloth: 'fabric', top: CIV_TOPS[variant % CIV_TOPS.length], pants: CIV_PANTS[(variant >> 1) % CIV_PANTS.length], boot: SHOES[(variant >> 2) % SHOES.length], glove: -1, rep: 12, camo: 0, inflate: 0.01, sleeve: variant % 3 === 0 ? 0 : 1 };
}
const SKIN_TINTS = [1.0, 0.92, 0.84, 1.06, 0.97];

export function bodyMaterial(base, faction, variant) {
  const lk = lookFor(faction, variant); const skin = SKIN_TINTS[variant % SKIN_TINTS.length];
  const key = `${base.uuid}|${faction}|${faction === 'civ' ? variant % 60 : 0}|${skin}`;
  if (LIB.mats.has(key)) return LIB.mats.get(key);
  const m = base.clone();
  const cloth = pbr(lk.cloth, { repeat: [1, 1], key: `cloth_${lk.cloth}` }).map;
  const U = {
    uCloth: { value: cloth }, uRep: { value: lk.rep }, uTop: { value: new THREE.Color(lk.top) }, uPants: { value: new THREE.Color(lk.pants) },
    uBoot: { value: new THREE.Color(lk.boot) }, uGlove: { value: new THREE.Color(lk.glove < 0 ? 0xffffff : lk.glove) }, uGloveOn: { value: lk.glove < 0 ? 0 : 1 },
    uSleeve: { value: lk.sleeve ?? 1 }, uInflate: { value: lk.inflate }, uSkin: { value: skin },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 zoneA; attribute vec2 zoneB; varying vec4 vZA; varying vec2 vZB; uniform float uInflate, uSleeve, uGloveOn;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 bindN = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZA = zoneA; vZB = zoneB;\nfloat clothW = zoneA.y + zoneA.z * 1.35 + zoneA.w * 0.8 + zoneB.x * uSleeve + zoneB.y * uGloveOn * 0.3;\ntransformed += bindN * uInflate * clothW;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vZA; varying vec2 vZB; uniform sampler2D uCloth; uniform float uRep, uSleeve, uGloveOn, uSkin; uniform vec3 uTop, uPants, uBoot, uGlove;\nfloat clothMask = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float wTop = smoothstep(0.3, 0.7, vZA.y + vZB.x * uSleeve);
        float wPants = smoothstep(0.3, 0.7, vZA.z);
        float wBoot = smoothstep(0.35, 0.65, vZA.w);
        float wGlove = smoothstep(0.35, 0.65, vZB.y) * uGloveOn;
        vec2 cuv = vMapUv * uRep;
        vec3 clothT = texture2D(uCloth, cuv).rgb;
        vec3 clothP = texture2D(uCloth, cuv * 1.13 + 0.37).rgb;
        vec3 c = diffuseColor.rgb * uSkin;
        c = mix(c, clothT * uTop, wTop);
        c = mix(c, clothP * uPants, wPants);
        c = mix(c, uBoot, wBoot);
        c = mix(c, uGlove, wGlove);
        diffuseColor.rgb = c;
        clothMask = clamp(wTop + wPants + wBoot + wGlove, 0.0, 1.0);
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.93, clothMask);')
      .replace('#include <normal_fragment_maps>', 'vec3 nGeom = normal;\n#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nGeom, clothMask * 0.9));');
  };
  m.customProgramCacheKey = () => 'clothes';
  LIB.mats.set(key, m);
  return m;
}

// ---------------- rigid gear, built once per kind in rest space ----------------
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const GM = {};
const gearMats = (faction) => GM[faction] ||= {
  shell: faction === 'kpa' ? pbr('paintedMetal', { color: 0x5c6040, key: 'helmkpa2' }) : faction === 'us' ? pbr('paintedMetal', { color: 0x76684c, key: 'helmus2' }) : pbr('camoROK', { repeat: [1.5, 1.5], key: 'helmrok2' }),
  vest: pbr('fabric', { color: faction === 'kpa' ? 0x4a4630 : faction === 'us' ? 0x6c5e44 : 0x3c4130, repeat: [4, 4], key: `vest${faction}` }),
  pouch: pbr('fabric', { color: faction === 'kpa' ? 0x5a5537 : faction === 'us' ? 0x7a6a4e : 0x4b5036, repeat: [4, 4], key: `pouch${faction}` }),
  dark: std(0x1c1d1e, 0.55, 0.3), sole: std(0x111111, 0.9), patch: std(faction === 'kpa' ? 0x7a2020 : faction === 'us' ? 0x3c3c34 : 0x2a4a8a, 0.7),
  cap: std(faction === 'police' ? 0x1c2436 : 0x3a3d32, 0.8),
};

// returns [{ bone, geometry, material }] (geometry in the bone's local space)
export function gearFor(kind, faction, hat, variant, sex = 'm') {
  const key = `${kind}|${faction}|${hat}|${variant % 4}|${sex}`;
  if (LIB.gear.has(key)) return LIB.gear.get(key);
  const R = LIB[sex].rest, M = gearMats(faction);
  const parts = []; const P = (bone, mat, geo) => parts.push({ bone, mat, geo });
  const head = R.Head, chest = R.spine_03, pel = R.pelvis;
  const hc = new THREE.Vector3(head.x, head.y + 0.105, head.z + 0.01);          // skull centre
  if (hat === 'helmet' && faction === 'kpa') {
    P('Head', M.shell, T(sphere(0.138, 1, 0.92, 1.06, 22, 10, Math.PI * 0.52), hc.x, hc.y + 0.02, hc.z - 0.005));
    P('Head', M.shell, T(cyl(0.158, 0.158, 0.012, 22), hc.x, hc.y + 0.012, hc.z - 0.005));
  } else if (hat === 'helmet') {
    P('Head', M.shell, T(sphere(0.134, 1, 0.94, 1.1, 22, 10, Math.PI * 0.5), hc.x, hc.y + 0.02, hc.z - 0.008));
    for (const s of [-1, 1]) {
      P('Head', M.dark, T(roundedBox(0.012, 0.028, 0.13, 0.004), hc.x + s * 0.13, hc.y + 0.01, hc.z - 0.005));
    }
    P('Head', M.dark, T(roundedBox(0.05, 0.034, 0.022, 0.006), hc.x, hc.y + 0.1, hc.z + 0.135, -0.4));
    if (variant % 2 === 0) P('Head', M.dark, T(new THREE.TorusGeometry(0.135, 0.009, 4, 24), hc.x, hc.y + 0.05, hc.z, Math.PI / 2));
  } else if (hat === 'cap') {
    P('Head', M.cap, T(cyl(0.118, 0.124, 0.08, 18), hc.x, hc.y + 0.06, hc.z - 0.005));
    P('Head', M.cap, T(roundedBox(0.16, 0.012, 0.1, 0.004), hc.x, hc.y + 0.03, hc.z + 0.11));
  } else if (hat === 'headset') {
    P('Head', M.dark, T(new THREE.TorusGeometry(0.12, 0.01, 4, 18, Math.PI), hc.x, hc.y + 0.01, hc.z));
    for (const s of [-1, 1]) P('Head', M.dark, T(cyl(0.038, 0.038, 0.032, 12), hc.x + s * 0.112, hc.y - 0.02, hc.z, 0, 0, Math.PI / 2));
  }
  if (kind === 'soldier') {
    const cz = chest.z;
    if (faction === 'kpa') {
      // chest rig: a row of magazine pouches on a harness
      P('spine_03', M.vest, T(roundedBox(0.32, 0.16, 0.06, 0.02), 0, chest.y - 0.09, cz + 0.13));
      for (const x of [-0.1, 0, 0.1]) P('spine_03', M.pouch, T(roundedBox(0.085, 0.13, 0.05, 0.012), x, chest.y - 0.07, cz + 0.17));
      for (const s of [-1, 1]) P('spine_03', M.vest, T(roundedBox(0.04, 0.025, 0.32, 0.008), s * 0.11, chest.y + 0.16, cz - 0.01));
    } else {
      P('spine_03', M.vest, T(roundedBox(0.31, 0.34, 0.06, 0.02), 0, chest.y - 0.02, cz + 0.125));
      P('spine_03', M.vest, T(roundedBox(0.31, 0.36, 0.06, 0.02), 0, chest.y - 0.01, cz - 0.155));
      for (const s of [-1, 1]) {
        P('spine_03', M.vest, T(roundedBox(0.05, 0.16, 0.27, 0.015), s * 0.175, chest.y - 0.1, cz - 0.015));
        P('spine_03', M.vest, T(roundedBox(0.07, 0.03, 0.3, 0.01), s * 0.11, chest.y + 0.17, cz - 0.015));
      }
      for (const x of [-0.085, 0, 0.085]) P('spine_03', M.pouch, T(roundedBox(0.075, 0.13, 0.045, 0.012), x, chest.y - 0.09, cz + 0.172));
      P('spine_03', M.pouch, T(roundedBox(0.1, 0.07, 0.04, 0.012), 0.07, chest.y + 0.07, cz + 0.17));
      P('spine_03', M.pouch, T(roundedBox(0.08, 0.16, 0.06, 0.015), -0.09, chest.y - 0.02, cz - 0.21));     // radio
      P('spine_03', M.dark, T(cyl(0.005, 0.004, 0.42, 5), -0.11, chest.y + 0.25, cz - 0.22));                 // antenna
      if (variant % 3 === 1) P('spine_03', M.pouch, T(roundedBox(0.28, 0.34, 0.13, 0.03), 0, chest.y - 0.03, cz - 0.26)); // assault pack
      for (const sd of ['l', 'r']) P(`calf_${sd}`, M.dark, T(roundedBox(0.11, 0.12, 0.05, 0.02), R[`calf_${sd}`].x, R[`calf_${sd}`].y + 0.01, R[`calf_${sd}`].z + 0.085)); // knee pads
    }
    // belt with side pouches
    P('pelvis', M.pouch, T(new THREE.TorusGeometry(0.165, 0.028, 5, 24).scale(1.04, 1, 0.82), pel.x, pel.y + 0.05, pel.z + 0.02, Math.PI / 2));
    for (const s of [-1, 1]) P('pelvis', M.pouch, T(roundedBox(0.06, 0.1, 0.09, 0.015), pel.x + s * 0.17, pel.y + 0.02, pel.z - 0.01));
    P('pelvis', M.pouch, T(roundedBox(0.13, 0.09, 0.05, 0.015), pel.x, pel.y + 0.04, pel.z - 0.15));
  } else if (kind === 'civ' && variant % 4 === 2) {
    P('spine_03', M.pouch, T(roundedBox(0.26, 0.32, 0.12, 0.04), 0, chest.y - 0.03, chest.z - 0.2)); // backpack
  }
  // soles under the boots/shoes
  for (const s of ['l', 'r']) P(`foot_${s}`, M.sole, T(roundedBox(0.1, 0.035, 0.27, 0.012), R[`foot_${s}`].x, 0.018, (R[`foot_${s}`].z + R[`ball_${s}`].z) / 2 + 0.02));
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
  LIB.gear.set(key, out);
  return out;
}

export function cloneBody(sex) { return SkeletonUtils.clone(LIB[sex].scene); }
