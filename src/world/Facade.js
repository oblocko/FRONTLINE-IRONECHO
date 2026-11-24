// 3D facade relief for the solid city blocks (M02 Yeonseo, M05 Paris, M06 Mumbai).
// The blocks are plain boxes; their street faces get a plain wall texture and this module puts
// real geometry on the wall plane: window reveals and sills, frames with mullions, glass (some
// lit), floor bands, guard rails, sunshades, grilles and AC units. Every part is one InstancedMesh
// per level (a few draw calls for the whole street), coloured per instance.
//
//   const f = new Facades(game, 'korea');
//   f.face({ cx, cz, nx, nz, len, floors, y0, startFloor, wall, frame, lit, seed });
//   f.build();
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../render/TextureFactory.js';
import { interiorMaterial, windowPlane } from '../render/InteriorGlass.js';

const box = (sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; };
const merge = (gs) => mergeGeometries(gs);
// a window opening's surround: jambs + head + sill seat, `t` wide, `d` deep, around a w x h hole
const surround = (w, h, t, d) => [box(t, h + 2 * t, d, -(w + t) / 2, 0, d / 2), box(t, h + 2 * t, d, (w + t) / 2, 0, d / 2), box(w, t, d, 0, (h + t) / 2, d / 2), box(w, t, d, 0, -(h + t) / 2, d / 2)];
// a frame with `cols` x `rows` panes: outer bars + mullions + transoms, bar width b, depth d at z0
function frame(w, h, b, d, z0, cols, rows) {
  const g = [box(w, b, d, 0, (h - b) / 2, z0), box(w, b, d, 0, -(h - b) / 2, z0), box(b, h, d, -(w - b) / 2, 0, z0), box(b, h, d, (w - b) / 2, 0, z0)];
  for (let i = 1; i < cols; i++) g.push(box(b * 0.8, h, d * 0.9, -w / 2 + (w * i) / cols, 0, z0));
  for (let i = 1; i < rows; i++) g.push(box(w, b * 0.7, d * 0.9, 0, -h / 2 + (h * i) / rows, z0));
  return g;
}

// Style catalogue. Sizes in metres; a window sits `sill` above its floor line.
const STYLES = {
  // Korean concrete block: aluminium sliding windows in a concrete reveal, precast sill, floor bands
  korea: { bay: 3, floorH: 3, w: 2.2, h: 1.55, sill: 0.85, band: 0.22, bandOut: 0.07,
    parts: (S) => ({
      reveal: { geo: merge([...surround(S.w, S.h, 0.12, 0.13)]), mat: 'trim' },
      sill: { geo: box(S.w + 0.4, 0.07, 0.22, 0, -S.h / 2 - 0.155, 0.11), mat: 'trim' },
      frame: { geo: merge([...frame(S.w / 2 + 0.03, S.h, 0.05, 0.05, 0.035, 1, 1).map((g) => g.translate(-S.w / 4, 0, 0)), ...frame(S.w / 2 + 0.03, S.h, 0.05, 0.05, 0.075, 1, 1).map((g) => g.translate(S.w / 4, 0, 0))]), mat: 'alu' },
      glass: { geo: windowPlane(0.03), mat: 'glass', scale: [S.w, S.h] },
      // a guard rail in front of the lower half (on the balcony-type blocks)
      guard: { geo: merge([box(S.w + 0.1, 0.04, 0.04, 0, -S.h / 2 + 0.85, 0.2), box(S.w + 0.1, 0.03, 0.03, 0, -S.h / 2 + 0.1, 0.2), ...Array.from({ length: 10 }, (_, i) => box(0.018, 0.75, 0.018, -S.w / 2 + 0.05 + (i * (S.w - 0.1)) / 9, -S.h / 2 + 0.475, 0.2))]), mat: 'iron' },
      // outdoor AC unit on a bracket under the window
      ac: { geo: merge([box(0.8, 0.55, 0.3, 0.3, -S.h / 2 - 0.62, 0.3), box(0.04, 0.04, 0.42, -0.05, -S.h / 2 - 0.91, 0.21), box(0.04, 0.04, 0.42, 0.65, -S.h / 2 - 0.91, 0.21)]), mat: 'acbox' },
      acgrille: { geo: new THREE.CircleGeometry(0.2, 14).translate(0.42, -S.h / 2 - 0.62, 0.452), mat: 'dark' },
    }) },
  // Haussmann stone: tall French casements in a moulded stone surround with a cornice-lintel,
  // iron guard rails on the floors without a balcony
  paris: { bay: 3.2, floorH: 3.2, w: 1.4, h: 2.2, sill: 0.3,
    parts: (S) => ({
      reveal: { geo: merge([...surround(S.w, S.h, 0.2, 0.09), box(S.w + 0.7, 0.16, 0.2, 0, S.h / 2 + 0.28, 0.1), box(S.w + 0.5, 0.08, 0.14, 0, S.h / 2 + 0.16, 0.07), box(0.26, 0.3, 0.14, 0, S.h / 2 + 0.12, 0.07)]), mat: 'trim' },
      sill: { geo: box(S.w + 0.5, 0.1, 0.18, 0, -S.h / 2 - 0.2, 0.09), mat: 'trim' },
      frame: { geo: merge([...frame(S.w / 2, S.h, 0.06, 0.05, 0.04, 1, 3).map((g) => g.translate(-S.w / 4, 0, 0)), ...frame(S.w / 2, S.h, 0.06, 0.05, 0.04, 1, 3).map((g) => g.translate(S.w / 4, 0, 0)), box(S.w, 0.3, 0.05, 0, S.h / 2 - 0.5, 0.04)]), mat: 'paint' },
      glass: { geo: windowPlane(0.02), mat: 'glass', scale: [S.w, S.h] },
      guard: { geo: merge([box(S.w + 0.2, 0.045, 0.05, 0, -S.h / 2 + 0.95, 0.16), box(S.w + 0.2, 0.03, 0.03, 0, -S.h / 2 + 0.12, 0.16), ...Array.from({ length: 12 }, (_, i) => box(0.016, 0.82, 0.016, -S.w / 2 + (i * S.w) / 11, -S.h / 2 + 0.53, 0.16)), ...[-0.35, 0, 0.35].map((x) => box(0.16, 0.16, 0.012, x, -S.h / 2 + 0.6, 0.16).rotateZ(0))]), mat: 'iron' },
      // closed grey folding shutters across the opening on some windows
      shutter: { geo: merge([box(S.w / 2 - 0.02, S.h - 0.04, 0.04, -S.w / 4, 0, 0.06), box(S.w / 2 - 0.02, S.h - 0.04, 0.04, S.w / 4, 0, 0.06), ...Array.from({ length: 14 }, (_, i) => box(S.w - 0.06, 0.02, 0.012, 0, -S.h / 2 + 0.12 + (i * (S.h - 0.24)) / 13, 0.085))]), mat: 'shutterGrey' },
    }) },
  // Mumbai plaster: small windows with iron grilles behind a projecting concrete sunshade (chajja)
  mumbai: { bay: 3, floorH: 3.1, w: 1.5, h: 1.45, sill: 0.95, band: 0.16, bandOut: 0.05,
    parts: (S) => ({
      reveal: { geo: merge([...surround(S.w, S.h, 0.1, 0.1)]), mat: 'trim' },
      sill: { geo: box(S.w + 0.24, 0.06, 0.14, 0, -S.h / 2 - 0.13, 0.07), mat: 'trim' },
      chajja: { geo: merge([box(S.w + 0.9, 0.08, 0.6, 0, S.h / 2 + 0.3, 0.3), box(S.w + 0.9, 0.12, 0.05, 0, S.h / 2 + 0.24, 0.585)]), mat: 'trim' },
      frame: { geo: merge(frame(S.w, S.h, 0.06, 0.05, 0.03, 2, 2)), mat: 'paint' },
      glass: { geo: windowPlane(0.02), mat: 'glass', scale: [S.w, S.h] },
      grille: { geo: merge([...Array.from({ length: 8 }, (_, i) => box(0.02, S.h, 0.02, -S.w / 2 + 0.1 + (i * (S.w - 0.2)) / 7, 0, 0.09)), box(S.w, 0.03, 0.03, 0, S.h / 4, 0.09), box(S.w, 0.03, 0.03, 0, -S.h / 4, 0.09)]), mat: 'iron' },
      ac: { geo: merge([box(0.75, 0.5, 0.28, 0.35, -S.h / 2 - 0.55, 0.3), box(0.04, 0.04, 0.4, 0, -S.h / 2 - 0.82, 0.2), box(0.04, 0.04, 0.4, 0.7, -S.h / 2 - 0.82, 0.2)]), mat: 'acbox' },
      acgrille: { geo: new THREE.CircleGeometry(0.18, 14).translate(0.45, -S.h / 2 - 0.55, 0.442), mat: 'dark' },
    }) },
};

const UNIT = new THREE.BoxGeometry(1, 1, 1);

export class Facades {
  // night: dark sky, more lit rooms. sky / ground: colours reflected in the glass
  constructor(game, style, { night = false, sky, ground } = {}) {
    this.game = game; this.S = STYLES[style]; this.style = style; this.night = night;
    this.sky = sky ?? (night ? 0x161c26 : 0x9aa4ac); this.ground = ground ?? (night ? 0x0b0b0c : 0x4a4844);
    this.parts = this.S.parts(this.S); this.inst = {};
    for (const k of Object.keys(this.parts)) this.inst[k] = [];
    this.inst.band = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    let r = 7; this.rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  }
  materials() {
    const S = this.S, trimMap = pbr('concrete', { color: 0xffffff, key: 'facadeTrim' });
    const std = (o) => new THREE.MeshStandardMaterial(o);
    return {
      trim: std({ map: trimMap.map, normalMap: trimMap.normalMap, roughness: 0.9, color: 0xffffff }),
      alu: std({ color: 0xffffff, roughness: 0.4, metalness: 0.7 }),
      paint: std({ color: 0xffffff, roughness: 0.6, metalness: 0.05 }),
      glass: interiorMaterial({ sky: this.sky, ground: this.ground, day: this.night ? 0.03 : 1, pad: (S.bay - S.w) / 2 - 0.15, sill: S.sill, height: S.floorH - 0.3, depth: 4.2 }),
      shop: interiorMaterial({ sky: this.sky, ground: this.ground, day: this.night ? 0.03 : 1, shop: true, pad: 0.3, sill: 0.3, height: 3.6, depth: 7 }),
      iron: std({ color: 0x1c1e1e, roughness: 0.55, metalness: 0.6 }),
      acbox: std({ color: 0xd8d8d2, roughness: 0.6, metalness: 0.2 }),
      dark: std({ color: 0x141414, roughness: 0.9 }),
      shutterGrey: std({ color: 0x7c827f, roughness: 0.7, metalness: 0.2 }),
    };
  }
  put(key, x, y, z, rotY, color, sx = 1, sy = 1, sz = 1) {
    this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY); this._p.set(x, y, z); this._s.set(sx, sy, sz);
    this.inst[key].push({ m: this._m.compose(this._p, this._q, this._s).clone(), c: color });
  }
  // One building face. (cx, cz): centre of the face on the wall plane; (nx, nz): outward normal;
  // len: face width; floors from startFloor to floors-1 get windows; y0: ground floor line.
  // wall / frame: colours (hex); lit: chance a window is lit; opts.guard / opts.ac / opts.shutter: chances;
  // opts.minY: no windows below this height (e.g. where a neighbour hides the wall).
  face({ cx, cz, nx, nz, len, floors, y0 = 0, startFloor = 1, wall = 0xb8b4aa, frame = 0x9aa0a4, lit = 0.08, guard = 0, ac = 0, shutter = 0, bands = true, minY = -1, skip = null }) {
    const S = this.S, rot = Math.atan2(nx, nz), rx = Math.cos(rot), rz = -Math.sin(rot), rnd = this.rnd;
    const nb = Math.floor((len - 0.8) / S.bay); if (nb < 1) return;
    const m0 = (len - nb * S.bay) / 2;
    const trim = new THREE.Color(wall).multiplyScalar(0.82), fr = new THREE.Color(frame);
    for (let f = startFloor; f < floors; f++) {
      const fy = y0 + f * S.floorH, wy = fy + S.sill + S.h / 2; if (wy < minY) continue;
      for (let i = 0; i < nb; i++) {
        if (skip?.(i, f)) continue;
        const a = -len / 2 + m0 + (i + 0.5) * S.bay, x = cx + rx * a, z = cz + rz * a;
        this.put('reveal', x, wy, z, rot, trim); this.put('sill', x, wy, z, rot, trim);
        if (this.parts.chajja) this.put('chajja', x, wy, z, rot, trim);
        this.put('frame', x, wy, z, rot, fr);
        const r = rnd();
        // room seed, light level (0 = lights off), temperature (warm incandescent .. cool LED / tube)
        this.put('glass', x, wy, z, rot, new THREE.Color(rnd(), r < lit ? 0.45 + rnd() * 0.55 : 0, rnd() < 0.6 ? rnd() * 0.35 : 0.55 + rnd() * 0.45), S.w, S.h, 1);
        if (this.parts.shutter && r >= lit && rnd() < shutter) this.put('shutter', x, wy, z, rot, trim);
        if (this.parts.guard && rnd() < (typeof guard === 'function' ? guard(f) : guard)) this.put('guard', x, wy, z, rot, null);
        if (this.parts.grille) this.put('grille', x, wy, z, rot, null);
        if (this.parts.ac && f > startFloor - 1 && rnd() < ac) { this.put('ac', x, wy, z, rot, null); this.put('acgrille', x, wy, z, rot, null); }
      }
      // continuous floor band at each floor line (concrete slab edge)
      if (bands && S.band && f > 0 && fy >= minY - S.floorH) this.put('band', cx + nx * S.bandOut / 2, fy, cz + nz * S.bandOut / 2, rot, trim, len + 0.02, S.band, S.bandOut);
    }
  }
  // a shop window (w x h, centre x,y,z on the wall plane, facing rotY) with a stocked shop behind it
  shop(x, y, z, rotY, w, h, { lit = 0.5 } = {}) {
    const rnd = this.rnd;
    this.inst.shop ||= [];
    this.put('shop', x, y, z, rotY, new THREE.Color(rnd(), rnd() < lit ? 0.6 + rnd() * 0.4 : 0, 0.5 + rnd() * 0.5), w, h, 1);
  }
  build() {
    const scene = this.game.renderer.scene, mats = this.materials(); this.meshes = [];
    const defs = { ...this.parts, band: { geo: UNIT, mat: 'trim' }, shop: { geo: windowPlane(0.02), mat: 'shop' } };
    for (const [k, list] of Object.entries(this.inst)) {
      if (!list.length) continue;
      const d = defs[k], mesh = new THREE.InstancedMesh(d.geo, mats[d.mat], list.length);
      const white = new THREE.Color(0xffffff);
      list.forEach((e, i) => { mesh.setMatrixAt(i, e.m); mesh.setColorAt(i, e.c || white); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
      mesh.castShadow = !['glass', 'shop', 'acgrille'].includes(k); mesh.receiveShadow = true;
      mesh.userData.facade = k; scene.add(mesh); this.meshes.push(mesh);
    }
    return this;
  }
  count() { return Object.values(this.inst).reduce((s, l) => s + l.length, 0); }
}
export const FACADE = STYLES;
