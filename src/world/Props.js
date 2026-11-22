// Procedural 3D asset library: architecture, fortifications, vegetation,
// vehicles, interactables. Every function builds meshes from PBR materials and
// registers matching colliders with the World. Rotations for collidable
// structures are restricted to multiples of 90° so AABB colliders stay exact.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../render/TextureFactory.js';
import { cloneRaw } from '../gear/GearLib.js';
import { buildK21Hull } from '../vehicles/K21Hull.js';
import { buildK21 } from '../vehicles/K21Turret.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Props {
  constructor(scene, world) { this.scene = scene; this.world = world; this.animated = []; }

  // rotate local (x,z) by quarter turns q
  static rot(x, z, q) { q = ((q % 4) + 4) % 4; return q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x]; }

  // Generic textured box; optional collider. pos = center.
  box(size, pos, mat, { collide = true, surface = 'concrete', cast = true, receive = true, parent = this.scene, rotY = 0, walkable = true, uvScale = 1 } = {}) {
    const g = new THREE.BoxGeometry(size.x, size.y, size.z);
    // world-scale UVs so textures don't stretch
    const uv = g.attributes.uv; const p = g.attributes.position; const n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      if (ay > 0.5) uv.setXY(i, px * uvScale / 2, pz * uvScale / 2); else if (ax > 0.5) uv.setXY(i, pz * uvScale / 2, py * uvScale / 2); else uv.setXY(i, px * uvScale / 2, py * uvScale / 2);
    }
    const m = new THREE.Mesh(g, mat); m.position.copy(pos); m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = receive; parent.add(m);
    if (collide) {
      const q = Math.round(rotY / (Math.PI / 2)); const sw = q % 2 ? size.z : size.x, sd = q % 2 ? size.x : size.z;
      m.userData.collider = this.world.addBoxCentered(pos, V(sw, size.y, sd), { surface, walkable });
    }
    return m;
  }

  // ---------------- fortifications ----------------
  sandbagWall(x, z, length, rows = 3, rotQ = 0, y = null) {
    const gy = y ?? this.world.heightFn(x, z);
    const grp = new THREE.Group(); grp.position.set(x, gy, z); grp.rotation.y = rotQ * Math.PI / 2;
    const bagGeo = new THREE.CapsuleGeometry(0.16, 0.36, 3, 8); bagGeo.rotateZ(Math.PI / 2); bagGeo.scale(1, 0.55, 1);
    const mat = pbr('sandbag', { repeat: [1, 1] });
    const per = Math.max(1, Math.floor(length / 0.62));
    const inst = new THREE.InstancedMesh(bagGeo, mat, per * rows);
    const d = new THREE.Object3D(); let k = 0;
    for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
      d.position.set(-length / 2 + 0.31 + i * 0.62 + (r % 2) * 0.31 * (i < per - 1 ? 1 : 0), 0.1 + r * 0.19, (Math.random() - 0.5) * 0.04);
      d.rotation.set((Math.random() - .5) * 0.08, (Math.random() - .5) * 0.12, (Math.random() - .5) * 0.06);
      d.updateMatrix(); inst.setMatrixAt(k++, d.matrix);
    }
    inst.castShadow = inst.receiveShadow = true; grp.add(inst); this.scene.add(grp);
    const h = 0.12 + rows * 0.19; const [sx, sz] = rotQ % 2 ? [0.4, length] : [length, 0.4];
    this.world.addBoxCentered(V(x, gy + h / 2, z), V(sx, h, sz), { surface: 'dirt', cover: true });
    return grp;
  }
  jerseyBarrier(x, z, rotQ = 0) {
    if (this.lib?.has('concrete_road_barrier_02')) return this.lib.place('concrete_road_barrier_02', x, z, { rotQ: rotQ + 1, surface: 'concrete', cover: true });
    const gy = this.world.heightFn(x, z);
    const shape = new THREE.Shape(); shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.3, 0.08); shape.lineTo(0.12, 0.3); shape.lineTo(0.08, 0.8); shape.lineTo(-0.08, 0.8); shape.lineTo(-0.12, 0.3); shape.lineTo(-0.3, 0.08);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false }); g.translate(0, 0, -1.2);
    const m = new THREE.Mesh(g, pbr('concrete', { repeat: [0.6, 0.6] })); m.position.set(x, gy, z); m.rotation.y = rotQ * Math.PI / 2 + Math.PI / 2;
    m.castShadow = m.receiveShadow = true; this.scene.add(m);
    const [sx, sz] = rotQ % 2 ? [0.6, 2.4] : [2.4, 0.6];
    this.world.addBoxCentered(V(x, gy + 0.4, z), V(sx, 0.8, sz), { surface: 'concrete', cover: true });
  }
  // Chain-link fence with barbed wire coil, from a to b (axis-aligned segments preferred)
  fence(ax, az, bx, bz, { height = 3.2, wire = true, collide = true } = {}) {
    if (!this._fenceMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.strokeStyle = 'rgba(170,175,180,1)'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(96, 32); g.lineTo(64, 0); g.stroke();
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
      this._fenceTex = t;
      this._fenceMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.5, color: 0x9aa0a6 });
      this._postMat = pbr('metal', { color: 0x777a70 });
      this._wireMat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.9, roughness: 0.4 });
    }
    const len = Math.hypot(bx - ax, bz - az); const ang = Math.atan2(bz - az, bx - ax);
    const segs = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const gy = this.world.heightFn(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, height + 0.4, 6), this._postMat);
      post.position.set(x, gy + height / 2, z); post.castShadow = true; this.scene.add(post);
      if (i < segs) {
        const x2 = ax + (bx - ax) * (i + 1) / segs, z2 = az + (bz - az) * (i + 1) / segs; const gy2 = this.world.heightFn(x2, z2);
        const sl = len / segs;
        const pg = new THREE.PlaneGeometry(sl, height); const uvs = pg.attributes.uv; for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * sl * 5, uvs.getY(k) * height * 5);
        const panel = new THREE.Mesh(pg, this._fenceMat);
        panel.position.set((x + x2) / 2, (gy + gy2) / 2 + height / 2, (z + z2) / 2); panel.rotation.y = -ang; panel.castShadow = true;
        this.scene.add(panel);
        if (wire) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.008, 3, 10), this._wireMat);
          const inst = new THREE.InstancedMesh(coil.geometry, this._wireMat, Math.ceil(sl / 0.18));
          const d = new THREE.Object3D();
          for (let k = 0; k < inst.count; k++) { const tt = k / inst.count; d.position.set(x + (x2 - x) * tt, gy + (gy2 - gy) * tt + height + 0.3, z + (z2 - z) * tt); d.rotation.set(0, -ang + Math.PI / 2, 0); d.updateMatrix(); inst.setMatrixAt(k, d.matrix); }
          this.scene.add(inst);
        }
      }
    }
    if (collide) {
      const minX = Math.min(ax, bx) - 0.08, maxX = Math.max(ax, bx) + 0.08, minZ = Math.min(az, bz) - 0.08, maxZ = Math.max(az, bz) + 0.08;
      // fences block movement only (bullets and line of sight pass through the mesh)
      const c = this.world.addBox(V(minX, -60, minZ), V(maxX, 90, maxZ), { surface: 'metal', cover: false, walkable: false });
      c.passBullets = true;
    }
  }
  // Trench revetment walls along a polyline (terrain carving is done by the level heightFn)
  trenchWalls(points, width = 1.6, depth = 1.7) {
    const mat = pbr('wood', { repeat: [1, 1], color: 0x8b7d6b });
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
      const nx = -Math.sin(ang), nz = Math.cos(ang);
      for (const s of [-1, 1]) {
        const cx = (ax + bx) / 2 + nx * s * (width / 2 + 0.05), cz = (az + bz) / 2 + nz * s * (width / 2 + 0.05);
        const top = this.world.heightFn(cx + nx * s * 0.5, cz + nz * s * 0.5);
        const g = new THREE.BoxGeometry(len, depth + 0.3, 0.08);
        const m = new THREE.Mesh(g, mat); m.position.set(cx, top - depth / 2 + 0.1, cz); m.rotation.y = -ang; m.receiveShadow = true; m.castShadow = true; this.scene.add(m);
        // posts
        for (let k = 0; k <= len; k += 1.5) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, depth + 0.6, 6), mat);
          p.position.set(ax + Math.cos(ang) * k + nx * s * (width / 2), top - depth / 2 + 0.2, az + Math.sin(ang) * k + nz * s * (width / 2)); this.scene.add(p);
        }
      }
    }
  }

  // ---------------- buildings ----------------
  // Building with enterable interior. Walls are segmented around door/window openings.
  // spec: { x, z, w, d, h, rotQ, wall, floorMat, roof:'flat'|'hip'|'shed', doors:[{side:'s'|'n'|'e'|'w', at, width}], windows:[{side, at, width, sill, height}], interior:fn(localToWorld) }
  building(spec) {
    const { x, z, w, d, h = 3, rotQ = 0 } = spec;
    const gy = spec.y ?? Math.min(this.world.heightFn(x - w / 2, z - d / 2), this.world.heightFn(x + w / 2, z + d / 2), this.world.heightFn(x, z));
    const wallMat = spec.wall || pbr('plaster', { repeat: [1, 1] });
    const t = 0.25;
    const grp = new THREE.Group(); this.scene.add(grp);
    const L = (lx, lz) => { const [rx, rz] = Props.rot(lx, lz, rotQ); return [x + rx, z + rz]; };
    const place = (lx, ly, lz, sx, sy, sz, mat, opts = {}) => {
      const [wx, wz] = L(lx, lz); const swap = rotQ % 2 === 1;
      return this.box(V(swap ? sz : sx, sy, swap ? sx : sz), V(wx, gy + ly, wz), mat, { parent: grp, ...opts });
    };
    // foundation slab & floor
    place(0, 0.1, 0, w + 0.3, 0.3, d + 0.3, pbr('concrete', { repeat: [1, 1] }), { surface: 'concrete' });
    const floorMat = spec.floorMat || pbr('wood', { repeat: [1, 1], color: 0xa89880 });
    const fl = place(0, 0.26, 0, w - t * 2, 0.02, d - t * 2, floorMat, { collide: false, cast: false });
    // walls per side
    const sides = { s: { len: w, pos: (a) => [a, d / 2 - t / 2], horiz: true }, n: { len: w, pos: (a) => [a, -d / 2 + t / 2], horiz: true },
      e: { len: d, pos: (a) => [w / 2 - t / 2, a], horiz: false }, w: { len: d, pos: (a) => [-w / 2 + t / 2, a], horiz: false } };
    const openings = [...(spec.doors || []).map((o) => ({ ...o, sill: 0, height: o.height || 2.15 })), ...(spec.windows || []).map((o) => ({ ...o, sill: o.sill ?? 0.95, height: o.height ?? 1.1 }))];
    for (const [sk, sd] of Object.entries(sides)) {
      const ops = openings.filter((o) => o.side === sk).sort((a, b) => a.at - b.at);
      let cur = -sd.len / 2;
      const seg = (a0, a1, y0, y1) => {
        if (a1 - a0 < 0.02 || y1 - y0 < 0.02) return;
        const mid = (a0 + a1) / 2; const [lx, lz] = sd.pos(mid);
        if (sd.horiz) place(lx, 0.25 + (y0 + y1) / 2, lz, a1 - a0, y1 - y0, t, wallMat, { surface: 'concrete' });
        else place(lx, 0.25 + (y0 + y1) / 2, lz, t, y1 - y0, a1 - a0, wallMat, { surface: 'concrete' });
      };
      for (const o of ops) {
        const a0 = o.at - o.width / 2, a1 = o.at + o.width / 2;
        seg(cur, a0, 0, h); seg(a0, a1, 0, o.sill); seg(a0, a1, o.sill + o.height, h); cur = a1;
        if (o.sill > 0) { // window frame + glass
          const [lx, lz] = sd.pos(o.at); const [wx, wz] = L(lx, lz);
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), this.glassMat(spec.lit));
          glass.position.set(wx, gy + 0.25 + o.sill + o.height / 2, wz);
          glass.rotation.y = (sd.horiz ? 0 : Math.PI / 2) - rotQ * Math.PI / 2; grp.add(glass);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(sd.horiz ? o.width + 0.1 : t + 0.04, 0.08, sd.horiz ? t + 0.04 : o.width + 0.1), pbr('wood', { color: 0x5a4a3a }));
          frame.position.set(wx, gy + 0.25 + o.sill, wz); frame.rotation.y = -rotQ * Math.PI / 2; grp.add(frame);
        }
      }
      seg(cur, sd.len / 2, 0, h);
    }
    // ceiling / roof
    const roofY = 0.25 + h;
    place(0, roofY + 0.1, 0, w, 0.2, d, pbr('concrete', { repeat: [1, 1], color: 0x9a9a98 }), { surface: 'concrete', walkable: spec.roof === 'flat' });
    if (spec.roof === 'hip' || spec.roof === 'gable') this.hipRoof(grp, x, gy + roofY + 0.2, z, (rotQ % 2 ? d : w) + 0.9, (rotQ % 2 ? w : d) + 0.9, spec.roofColor ?? 0x3c4650, spec.roofHeight ?? 1.6, rotQ % 2 === 1);
    else if (spec.roof === 'flat') {
      // parapet
      place(0, roofY + 0.45, d / 2 - 0.1, w, 0.5, 0.2, wallMat); place(0, roofY + 0.45, -d / 2 + 0.1, w, 0.5, 0.2, wallMat);
      place(w / 2 - 0.1, roofY + 0.45, 0, 0.2, 0.5, d - 0.4, wallMat); place(-w / 2 + 0.1, roofY + 0.45, 0, 0.2, 0.5, d - 0.4, wallMat);
    }
    // indoor acoustic zone
    const [c0x, c0z] = L(-w / 2, -d / 2), [c1x, c1z] = L(w / 2, d / 2);
    this.world.indoorZones.push({ min: V(Math.min(c0x, c1x), gy, Math.min(c0z, c1z)), max: V(Math.max(c0x, c1x), gy + h + 0.3, Math.max(c0z, c1z)) });
    // interior light
    if (spec.light) {
      const [lx, lz] = L(0, 0);
      const pl = new THREE.PointLight(spec.light.color ?? 0xffd9a0, spec.light.intensity ?? 4, Math.max(w, d) * 1.4, 2);
      pl.position.set(lx, gy + h - 0.2, lz); grp.add(pl);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffeecc })); bulb.position.copy(pl.position); grp.add(bulb);
      grp.userData.light = pl; grp.userData.bulb = bulb;
    }
    grp.userData.floorY = gy + 0.27; grp.userData.L = L; grp.userData.spec = spec;
    return grp;
  }
  glassMat(lit) {
    return new THREE.MeshStandardMaterial({ color: lit ? 0xffd28a : 0x1c2730, emissive: lit ? 0x8a6a30 : 0x000000, emissiveIntensity: lit ? 0.6 : 0, metalness: 0.2, roughness: 0.08, transparent: true, opacity: lit ? 0.85 : 0.55, side: THREE.DoubleSide });
  }
  hipRoof(parent, x, y, z, w, d, color, hh, swap) {
    const geo = new THREE.BufferGeometry();
    const r = Math.min(w, d) * 0.5; const hw = w / 2, hd = d / 2;
    // ridge along the longer axis
    const ridge = w >= d ? [[-hw + r * 0.9, hh, 0], [hw - r * 0.9, hh, 0]] : [[0, hh, -hd + r * 0.9], [0, hh, hd - r * 0.9]];
    const c = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
    const tris = w >= d
      ? [[c[0], c[1], ridge[1]], [c[0], ridge[1], ridge[0]], [c[2], c[3], ridge[0]], [c[2], ridge[0], ridge[1]], [c[1], c[2], ridge[1]], [c[3], c[0], ridge[0]]]
      : [[c[1], c[2], ridge[1]], [c[1], ridge[1], ridge[0]], [c[3], c[0], ridge[0]], [c[3], ridge[0], ridge[1]], [c[0], c[1], ridge[0]], [c[2], c[3], ridge[1]]];
    const pos = []; const uv = [];
    for (const t of tris) for (const p of [t[0], t[2], t[1]]) { pos.push(...p); uv.push(p[0] * 0.5, p[2] * 0.5 + p[1]); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    // tiled roof texture: corrugated recipe tinted to slate tile
    const m = new THREE.Mesh(geo, pbr('roofTiles', { repeat: [3, 3], color, metalness: 0.2 }));
    m.material.side = THREE.DoubleSide;
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    return m;
  }

  // Watchtower with searchlight
  watchtower(x, z, { light = true } = {}) {
    const gy = this.world.heightFn(x, z); const grp = new THREE.Group(); grp.position.set(x, gy, z); grp.userData.dynamic = true; this.scene.add(grp); // can collapse
    const metal = pbr('paintedMetal', { color: 0x9aa088 });
    const colliders = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6, 0.16), metal); leg.position.set(sx * 1.1, 3, sz * 1.1); leg.castShadow = true; grp.add(leg);
      colliders.push(this.world.addBoxCentered(V(x + sx * 1.1, gy + 3, z + sz * 1.1), V(0.2, 6, 0.2), { surface: 'metal', cover: false }));
    }
    for (let k = 1; k < 3; k++) for (let s = 0; s < 4; s++) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.06), metal); br.position.set(0, k * 2, 0); br.rotation.y = s * Math.PI / 2; br.translateZ(1.1); grp.add(br);
    }
    const cabin = new THREE.Group(); cabin.position.y = 6; grp.add(cabin);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 3), metal); cabin.add(fl);
    for (let s = 0; s < 4; s++) { const wl = new THREE.Mesh(new THREE.BoxGeometry(3, 1.0, 0.08), metal); wl.position.y = 0.55; wl.rotation.y = s * Math.PI / 2; wl.translateZ(1.46); wl.castShadow = true; cabin.add(wl); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.8, 4), pbr('corrugated', { color: 0x6a7060 })); roof.position.y = 2.6; roof.rotation.y = Math.PI / 4; roof.castShadow = true; cabin.add(roof);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), metal); p.position.set(sx * 1.4, 1.1, sz * 1.4); cabin.add(p); }
    let spot = null;
    if (light) {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 12), pbr('metal')); housing.rotation.x = Math.PI / 2; housing.position.set(0, 1.4, 1.2); cabin.add(housing);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.21, 12), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); lens.position.set(0, 1.4, 1.41); cabin.add(lens);
      spot = new THREE.SpotLight(0xfff2d8, 60, 90, 0.16, 0.5, 1.2); spot.position.set(x, gy + 7.4, z + 1.2);
      spot.castShadow = false; this.scene.add(spot); this.scene.add(spot.target);
      const beamGeo = new THREE.ConeGeometry(4.5, 40, 16, 1, true); beamGeo.translate(0, -20, 0); beamGeo.rotateX(-Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.copy(spot.position); beam.userData.dynamic = true; this.scene.add(beam);
      const st = { spot, beam, lens, t: Math.random() * 10, base: V(x, gy, z), on: true };
      this.animated.push({ update: (dt) => {
        st.t += dt * 0.25; if (!st.on) return;
        const tgt = V(x + Math.sin(st.t) * 30, gy, z + 30 + Math.cos(st.t * 0.7) * 10); spot.target.position.copy(tgt);
        beam.lookAt(tgt);
      } });
      spot.userData.state = st;
    }
    colliders.push(this.world.addBoxCentered(V(x, gy + 6, z), V(3, 0.2, 3), { surface: 'metal' }));
    return { grp, spot, colliders, base: V(x, gy, z) };
  }

  // ---------------- vegetation & nature ----------------
  pineForest(points) {
    // instanced pine trees: trunks + 3 stacked cones
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const cones = [];
    for (let i = 0; i < 4; i++) { const g = new THREE.ConeGeometry(1.6 - i * 0.32, 2.4, 8); g.translate(0, 2.2 + i * 1.3, 0); cones.push(g); }
    const crown = mergeGeometries(cones);
    // perturb crown vertices for organic silhouette
    const p = crown.attributes.position; for (let i = 0; i < p.count; i++) { const k = Math.sin(i * 12.9898) * 0.18; p.setX(i, p.getX(i) * (1 + k)); p.setZ(i, p.getZ(i) * (1 - k)); }
    crown.computeVertexNormals();
    const trunkMat = pbr('wood', { color: 0x5a4636 });
    const crownMat = pbr('grassdead', { color: 0x46603e, repeat: [2, 2] }); crownMat.roughness = 1;
    const snowCrownMat = crownMat.clone(); snowCrownMat.color = new THREE.Color(0x6d7f68);
    const ti = new THREE.InstancedMesh(trunkGeo, trunkMat, points.length);
    const ci = new THREE.InstancedMesh(crown, crownMat, points.length);
    const d = new THREE.Object3D();
    points.forEach((pt, i) => {
      const s = pt.s ?? 0.8 + Math.random() * 0.6; const gy = this.world.heightFn(pt.x, pt.z);
      d.position.set(pt.x, gy - 0.1, pt.z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(s, s * (0.9 + Math.random() * 0.3), s); d.updateMatrix();
      ti.setMatrixAt(i, d.matrix); ci.setMatrixAt(i, d.matrix);
      if (pt.collide !== false) this.world.addBoxCentered(V(pt.x, gy + 2, pt.z), V(0.35 * s, 4, 0.35 * s), { surface: 'wood', cover: true, walkable: false });
    });
    ti.castShadow = ci.castShadow = true; ti.receiveShadow = ci.receiveShadow = true;
    this.scene.add(ti, ci);
  }
  bareTrees(points) {
    const mat = pbr('wood', { color: 0x4a3c30 });
    for (const pt of points) {
      const gy = this.world.heightFn(pt.x, pt.z); const grp = new THREE.Group(); grp.position.set(pt.x, gy, pt.z); grp.rotation.y = Math.random() * 6;
      const s = pt.s ?? 1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.22 * s, 5 * s, 6), mat); trunk.position.y = 2.5 * s; trunk.castShadow = true; grp.add(trunk);
      const branch = (parent, len, rad, depth) => {
        if (depth > 3) return;
        const n = depth === 0 ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5), mat); b.castShadow = true;
          const pivot = new THREE.Group(); pivot.position.y = depth === 0 ? (1.5 + i * 0.8) * s - 2.5 * s : len / 2; pivot.rotation.set(0.6 + Math.random() * 0.4, i * 2.4 + Math.random(), 0);
          b.position.y = len / 2; pivot.add(b); parent.add(pivot); branch(b, len * 0.65, rad * 0.6, depth + 1);
        }
      };
      branch(trunk, 2.2 * s, 0.09 * s, 0);
      this.scene.add(grp);
      this.world.addBoxCentered(V(pt.x, gy + 2, pt.z), V(0.4, 4, 0.4), { surface: 'wood', walkable: false });
    }
  }
  rocks(points) {
    const mat = pbr('rock', { repeat: [1, 1] });
    for (const pt of points) {
      const g = new THREE.IcosahedronGeometry(pt.r ?? 0.8, 1); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.abs(Math.sin(i * 7.31 + pt.x)) * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); const gy = this.world.heightFn(pt.x, pt.z); m.position.set(pt.x, gy + (pt.r ?? 0.8) * 0.2, pt.z); m.rotation.y = pt.x;
      m.castShadow = m.receiveShadow = true; this.scene.add(m);
      const r = (pt.r ?? 0.8) * 0.9;
      if (r > 0.5) this.world.addBoxCentered(V(pt.x, gy + r * 0.4, pt.z), V(r * 1.6, r * 1.1, r * 1.6), { surface: 'concrete', cover: r > 0.7 });
    }
  }
  grassTufts(count, area, heightFn) {
    const blade = new THREE.PlaneGeometry(0.5, 0.45); blade.translate(0, 0.22, 0);
    const b2 = blade.clone(); b2.rotateY(Math.PI / 2); const g = mergeGeometries([blade, b2]);
    if (!this._grassTex) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
      for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(${150 + Math.random() * 50},${130 + Math.random() * 40},${80 + Math.random() * 30},1)`; x.lineWidth = 1.5; x.beginPath(); const bx = 4 + Math.random() * 56; x.moveTo(bx, 64); x.quadraticCurveTo(bx + (Math.random() - .5) * 20, 30, bx + (Math.random() - .5) * 26, 4 + Math.random() * 20); x.stroke(); }
      this._grassTex = new THREE.CanvasTexture(c); this._grassTex.colorSpace = THREE.SRGBColorSpace;
    }
    const mat = new THREE.MeshStandardMaterial({ map: this._grassTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: 0xb0a080 });
    const inst = new THREE.InstancedMesh(g, mat, count); const d = new THREE.Object3D(); let k = 0;
    for (let i = 0; i < count * 3 && k < count; i++) {
      const x = area.minX + Math.random() * (area.maxX - area.minX), z = area.minZ + Math.random() * (area.maxZ - area.minZ);
      if (area.reject && area.reject(x, z)) continue;
      d.position.set(x, heightFn(x, z), z); d.rotation.y = Math.random() * 3; const s = 0.6 + Math.random() * 0.9; d.scale.set(s, s, s); d.updateMatrix(); inst.setMatrixAt(k++, d.matrix);
    }
    inst.count = k; inst.receiveShadow = true; this.scene.add(inst);
  }

  // ---------------- small props ----------------
  crate(x, z, s = 1, y = null, rot = 0) {
    if (this.lib) { const ids = ['wooden_crate_02', 'old_military_crate', 'wooden_crate_01'].filter((i) => this.lib.has(i)); if (ids.length) { const id = ids[Math.abs(Math.round(x * 7 + z * 3)) % ids.length]; return this.lib.place(id, x, z, { y, scale: s, rotQ: Math.round(rot / (Math.PI / 2)), surface: 'wood', yawJitter: 0.1 }); } }
    const gy = y ?? this.world.heightFn(x, z);
    return this.box(V(1.0 * s, 0.8 * s, 0.8 * s), V(x, gy + 0.4 * s, z), pbr('wood', { color: 0x7d7055 }), { surface: 'wood', rotY: rot });
  }
  ammoBox(x, z, y = null) {
    if (this.lib?.has('ammo_box')) return this.lib.place('ammo_box', x, z, { y, rotQ: 1, yawJitter: 0.3, collide: false });
    const gy = y ?? this.world.heightFn(x, z);
    return this.box(V(0.5, 0.28, 0.25), V(x, gy + 0.14, z), pbr('paintedMetal', { color: 0x8a9070 }), { surface: 'metal' });
  }
  barrel(x, z, { color = 0x3d4a3a, burning = false } = {}) {
    if (this.lib) { const ids = ['Barrel_01', 'Barrel_02', 'barrel_03'].filter((i) => this.lib.has(i)); if (ids.length) return this.lib.place(ids[Math.abs(Math.round(x * 5 + z)) % ids.length], x, z, { yawJitter: 3, surface: 'metal', cover: true }); }
    const gy = this.world.heightFn(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), pbr('paintedMetal', { color })); m.position.set(x, gy + 0.45, z); m.castShadow = m.receiveShadow = true; this.scene.add(m);
    for (const yy of [0.2, 0.7]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.015, 4, 16), pbr('metal')); r.rotation.x = Math.PI / 2; r.position.set(x, gy + yy, z); this.scene.add(r); }
    this.world.addBoxCentered(V(x, gy + 0.45, z), V(0.55, 0.9, 0.55), { surface: 'metal' });
    return m;
  }
  utilityPole(x, z, h = 8) {
    const gy = this.world.heightFn(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 8), pbr('concrete', { color: 0xa0a0a0 })); m.position.set(x, gy + h / 2, z); m.castShadow = true; this.scene.add(m);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), pbr('metal')); arm.position.set(x, gy + h - 0.5, z); this.scene.add(arm);
    this.world.addBoxCentered(V(x, gy + h / 2, z), V(0.3, h, 0.3), { surface: 'concrete', walkable: false });
    return V(x, gy + h - 0.45, z);
  }
  wire(a, b, sag = 0.8) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 3, false);
    this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })));
  }
  streetLamp(x, z, { on = true, color = 0xffc070 } = {}) {
    const gy = this.world.heightFn(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.5, 8), pbr('paintedMetal', { color: 0x5a5e58 })); pole.position.set(x, gy + 2.75, z); pole.castShadow = true; this.scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), pbr('metal')); head.position.set(x + 0.3, gy + 5.5, z); this.scene.add(head);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshBasicMaterial({ color: on ? 0xffe2b0 : 0x222222 })); glow.rotation.x = Math.PI / 2; glow.position.set(x + 0.3, gy + 5.43, z); this.scene.add(glow);
    let light = null;
    if (on) { light = new THREE.PointLight(color, 9, 20, 2); light.position.set(x + 0.3, gy + 5.2, z); this.scene.add(light); }
    this.world.addBoxCentered(V(x, gy + 2.75, z), V(0.2, 5.5, 0.2), { surface: 'metal', walkable: false });
    return { light, glow };
  }
  sign(x, z, text, { rotY = 0, w = 1.8, h = 0.9, bg = '#b8211b', fg = '#fff', sub = '', height = 1.6 } = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, c.width - 24, c.height - 24);
    g.fillStyle = fg; g.font = `bold ${Math.round(c.height * 0.3)}px "WenQuanYi Zen Hei", "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height * (sub ? 0.4 : 0.5));
    if (sub) { g.font = `${Math.round(c.height * 0.16)}px sans-serif`; g.fillText(sub, c.width / 2, c.height * 0.74); }
    // weathering
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,50,40,${Math.random() * 0.15})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 3 + Math.random() * 8, 2 + Math.random() * 6); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const gy = this.world.heightFn(x, z);
    const grp = new THREE.Group(); grp.position.set(x, gy, z); grp.rotation.y = rotY;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [pbr('metal'), pbr('metal'), pbr('metal'), pbr('metal'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), pbr('metal')]);
    board.position.y = height; board.castShadow = true; grp.add(board);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, height + h / 2, 6), pbr('metal')); p.position.set(s * w * 0.4, (height + h / 2) / 2, -0.03); grp.add(p); }
    this.scene.add(grp); return grp;
  }

  // ---------------- interactable equipment ----------------
  sensorPost(x, z) {
    const gy = this.world.heightFn(x, z); const grp = new THREE.Group(); grp.position.set(x, gy, z); this.scene.add(grp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), pbr('paintedMetal', { color: 0x6a7060 })); pole.position.y = 0.8; grp.add(pole);
    const boxm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.22), pbr('paintedMetal', { color: 0x59604c })); boxm.position.y = 1.45; boxm.castShadow = true; grp.add(boxm);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.2 })); eye.rotation.x = Math.PI / 2; eye.position.set(0, 1.47, 0.14); grp.add(eye);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3020 }); const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), ledMat); led.position.set(0.15, 1.58, 0.12); grp.add(led);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), pbr('metal')); ant.position.set(-0.15, 1.9, 0); grp.add(ant);
    this.world.addBoxCentered(V(x, gy + 0.9, z), V(0.3, 1.8, 0.3), { surface: 'metal', walkable: false });
    let t = 0;
    const st = { grp, led, ledMat, ok: false };
    this.animated.push({ update: (dt) => { t += dt; ledMat.color.setHex(st.ok ? 0x30ff60 : (Math.sin(t * 6) > 0 ? 0xff3020 : 0x300804)); } });
    return st;
  }
  radioSet(x, y, z, rotY = 0) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY; this.scene.add(grp);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.3), pbr('paintedMetal', { color: 0x4d5440 })); body.position.y = 0.16; body.castShadow = true; grp.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.26), new THREE.MeshStandardMaterial({ color: 0x222420, roughness: 0.6 })); face.position.set(0, 0.16, 0.151); grp.add(face);
    for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), pbr('metal')); k.rotation.x = Math.PI / 2; k.position.set(-0.18 + i * 0.1, 0.1, 0.165); grp.add(k); }
    const scr = new THREE.MeshBasicMaterial({ color: 0x1a2a10 }); const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), scr); screen.position.set(0.08, 0.22, 0.153); grp.add(screen);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 1.1, 4), pbr('metal')); ant.position.set(0.22, 0.85, 0); grp.add(ant);
    const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.16, 3, 6), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 })); handset.rotation.z = Math.PI / 2; handset.position.set(-0.1, 0.34, 0); grp.add(handset);
    return { grp, screenMat: scr };
  }
}

// ======================= VEHICLE MODELS =======================
// All vehicles are original designs (generic modern military silhouettes).
// ROK transport: MAN SV 6x6 model (stand-in for the KMTV; Sketchfab, user-chosen) scaled so its bed floor sits at
// the game's 1.31 m (seats and passenger views are laid out for that). The model's closed tarp is cut away —
// the game's own roof with rolled-up sides goes on instead so passengers can see out.
const TRUCK_S = 1.31 / 1.62;
let truckGeo = null;
function realTruckMeshes() {
  if (!truckGeo) {
    const src = cloneRaw('mansv'); if (!src) return null;
    const root = new THREE.Group(); root.add(src); src.rotation.y = -Math.PI / 2; src.scale.setScalar(TRUCK_S); src.position.z = 0.1; root.updateMatrixWorld(true);
    truckGeo = [];
    src.traverse((o) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      const pos = geo.attributes.position, keep = []; const c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let t = 0; t < pos.count; t += 3) {
        c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, t + k)); c.divideScalar(3);
        if (c.y > 2.3 * TRUCK_S && c.z < 1.45 * TRUCK_S + 0.1) continue;     // tarp over the bed
        keep.push(t);
      }
      const out = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(geo.attributes)) { const arr = new a.array.constructor(keep.length * 3 * a.itemSize); keep.forEach((t, i) => { for (let k = 0; k < 3; k++) for (let j = 0; j < a.itemSize; j++) arr[(i * 3 + k) * a.itemSize + j] = a.getComponent(t + k, j); }); out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized)); }
      truckGeo.push({ geo: out, mat: o.material });
    });
  }
  return truckGeo.map(({ geo, mat }) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; });
}

function finishRealTruck(g, meshes, canopy) {
  for (const m of meshes) g.add(m);
  const canvasMat = pbr('fabric', { color: 0x5f6448, repeat: [2, 2] });
  // benches along the bed sides (passenger seat height unchanged)
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 4.0), pbr('wood', { color: 0x5c5040 })); b.position.set(s * 0.8, 1.75, -1.35); b.castShadow = true; g.add(b); }
  // roof tarp on hoops with the sides rolled up (open view out for passengers)
  const canGeo = new THREE.CylinderGeometry(1.08, 1.08, 4.7, 16, 1, true, Math.PI * 0.26, Math.PI * 0.48); canGeo.rotateX(Math.PI / 2); canGeo.rotateZ(Math.PI / 2);
  const can = new THREE.Mesh(canGeo, canvasMat); can.position.set(0, 1.95, -1.4); can.scale.set(1, 1.1, 1); can.material.side = THREE.DoubleSide; can.castShadow = true; can.visible = canopy; g.add(can);
  for (const s of [-1, 1]) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.7, 8), canvasMat); roll.rotation.x = Math.PI / 2; roll.position.set(s * 0.73, 2.85, -1.4); roll.visible = canopy; g.add(roll); }
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 4; i++) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.025, 4, 18, Math.PI), hoopMat); hoop.position.set(0, 1.95, -3.5 + i * 1.4); hoop.scale.set(1, 1.1, 1); hoop.visible = canopy; g.add(hoop); }
  g.userData.wheels = [];
  for (const s of [-1, 1]) g.userData['headlight' + s] = null;
  const lamp = new THREE.PointLight(0xffc890, 2.2, 5.5, 2); lamp.position.set(0, 2.55, -1.2); g.add(lamp); g.userData.cargoLamp = lamp;
  return g;
}
export function buildTruck({ canopy = true, model = true } = {}) {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const real = model ? realTruckMeshes() : null;
  if (real) return finishRealTruck(g, real, canopy);
  const paint = pbr('paintedMetal', { color: 0x8a9478, repeat: [1, 1] });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d1a, roughness: 0.9 });
  const canvasMat = pbr('fabric', { color: 0x6a6e52, repeat: [2, 2] });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18222a, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // chassis
  add(new THREE.BoxGeometry(2.2, 0.35, 7.2), dark, 0, 0.95, 0);
  // cab
  add(new THREE.BoxGeometry(2.3, 1.3, 1.9), paint, 0, 1.85, 2.55);
  add(new THREE.BoxGeometry(2.3, 0.7, 1.1), paint, 0, 1.45, 3.9);  // hood
  add(new THREE.BoxGeometry(2.0, 0.65, 0.05), glass, 0, 2.15, 3.5, -0.25); // windscreen
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.55, 1.0), glass, s * 1.16, 2.1, 2.6);
  add(new THREE.BoxGeometry(2.0, 0.5, 0.1), dark, 0, 1.3, 4.46); // grille
  for (const s of [-1, 1]) { const hl = add(new THREE.CircleGeometry(0.12, 12), new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffdd99, emissiveIntensity: 0.6 }), s * 0.8, 1.55, 4.47); g.userData['headlight' + s] = hl; }
  // bed
  add(new THREE.BoxGeometry(2.4, 0.12, 4.6), pbr('wood', { color: 0x6c6250 }), 0, 1.25, -1.3);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.6, 4.6), paint, s * 1.18, 1.6, -1.3);
  add(new THREE.BoxGeometry(2.4, 0.6, 0.08), paint, 0, 1.6, -3.58);
  // bench seats
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.08, 4.2), pbr('wood', { color: 0x5c5040 }), s * 0.9, 1.75, -1.3);
  // canvas canopy (arched)
  // canvas roof with rolled-up sides (open sides give passengers a view out)
  const canGeo = new THREE.CylinderGeometry(1.22, 1.22, 4.6, 16, 1, true, Math.PI * 0.26, Math.PI * 0.48); canGeo.rotateX(Math.PI / 2); canGeo.rotateZ(Math.PI / 2);
  const can = new THREE.Mesh(canGeo, canvasMat); can.position.set(0, 1.9, -1.3); can.scale.set(1, 1.1, 1); can.visible = canopy;
  for (const s of [-1, 1]) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8), canvasMat); roll.rotation.x = Math.PI / 2; roll.position.set(s * 0.82, 2.88, -1.3); roll.visible = canopy; g.add(roll); }
  for (let i = 0; i < 4; i++) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 4, 18, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.6, metalness: 0.5 })); hoop.position.set(0, 1.9, -3.4 + i * 1.4); hoop.scale.set(1, 1.1, 1); hoop.visible = canopy; g.add(hoop); }
  can.material.side = THREE.DoubleSide; can.castShadow = true; g.add(can);
  // wheels
  g.userData.wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 18); wgeo.rotateZ(Math.PI / 2);
  for (const z of [3.3, -0.6, -2.0]) for (const s of [-1, 1]) {
    const w = add(wgeo, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }), s * 1.1, 0.55, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 8), paint); hub.rotation.z = Math.PI / 2; w.add(hub); hub.rotation.set(0, 0, 0);
    g.userData.wheels.push(w);
  }
  // mud flaps / spare / jerrycans
  add(new THREE.BoxGeometry(0.35, 0.45, 0.2), pbr('paintedMetal', { color: 0x4d553f }), 1.0, 1.55, 1.45);
  // dim cargo-bay lamp
  const lamp = new THREE.PointLight(0xffc890, 2.2, 5.5, 2); lamp.position.set(0, 2.55, -1.2); g.add(lamp); g.userData.cargoLamp = lamp;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe0b0 })); bulb.position.copy(lamp.position); g.add(bulb);
  return g;
}

// ROK K21 IFV (original procedural model, src/vehicles). The legacy box APC stays available as buildAPC({ legacy: true }).
export function buildAPC({ legacy = false } = {}) {
  if (!legacy) {
    const g = buildK21(buildK21Hull); g.userData.dynamic = true;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // red troop-compartment light just inside the doorway (seen when the ramp is down)
    const il = new THREE.PointLight(0xff4020, 1.5, 4, 2); il.position.set(0, 1.4, -3.2); g.add(il); g.userData.interiorLight = il;
    return g;
  }
  const g = new THREE.Group(); g.userData.dynamic = true;
  const paint = pbr('paintedMetal', { color: 0x6f7860, repeat: [2, 2] });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.95 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // hull - sloped glacis
  const hull = new THREE.Shape(); hull.moveTo(-3.4, 0.5); hull.lineTo(2.6, 0.5); hull.lineTo(3.5, 1.3); hull.lineTo(2.4, 2.0); hull.lineTo(-3.4, 2.0); hull.lineTo(-3.5, 0.9);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.0, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  hg.translate(0, 0, -1.5); hg.rotateY(-Math.PI / 2);
  add(hg, paint, 0, 0, 0);
  // tracks
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.55, 0.85, 7.0), dark, s * 1.65, 0.55, 0);
    for (let i = 0; i < 6; i++) { const w = add(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 14), pbr('metal', { color: 0x2a2a28 }), s * 1.66, 0.42, -2.6 + i * 1.04, 0, 0, Math.PI / 2); }
    add(new THREE.BoxGeometry(0.6, 0.06, 7.0), paint, s * 1.65, 1.02, 0); // side skirt top
  }
  // turret
  const tur = new THREE.Group(); tur.position.set(0, 2.0, 0.3); g.add(tur);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.55, 8), paint); tm.position.y = 0.28; tm.castShadow = true; tur.add(tm);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 10), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.35, 2.1); gun.castShadow = true; tur.add(gun);
  const mant = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), paint); mant.position.set(0, 0.35, 0.95); tur.add(mant);
  const optic = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), dark); optic.position.set(0.55, 0.65, 0.4); tur.add(optic);
  g.userData.turret = tur;
  // rear ramp
  const ramp = new THREE.Group(); ramp.position.set(0, 0.55, -3.45); g.add(ramp);
  const rm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.12), paint); rm.position.set(0, 0.7, 0); rm.castShadow = true; ramp.add(rm);
  g.userData.ramp = ramp;
  // interior (visible when ramp lowers)
  // open-backed troop compartment (left, right, roof, floor, front bulkhead)
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x59604c, side: THREE.DoubleSide, roughness: 0.9 });
  for (const [w, h, x, y, z, rx, ry] of [[4, 1.3, -1.05, 1.25, -1.4, 0, Math.PI / 2], [4, 1.3, 1.05, 1.25, -1.4, 0, -Math.PI / 2], [2.1, 4, 0, 1.9, -1.4, Math.PI / 2, 0], [2.1, 4, 0, 0.62, -1.4, -Math.PI / 2, 0], [2.1, 1.3, 0, 1.25, 0.6, 0, Math.PI]]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), innerMat); pl.position.set(x, y, z); pl.rotation.set(rx, ry, 0); g.add(pl);
  }
  const il = new THREE.PointLight(0xff4020, 1.5, 4, 2); il.position.set(0, 1.8, -1.6); g.add(il); g.userData.interiorLight = il;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.1, 3.4), dark, s * 0.75, 0.95, -1.5);
  // details: smoke dischargers, hatches, lights
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), dark, s * (0.7 + i * 0.12), 2.6, 0.9, 0.5);
  for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.1, 10), new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffdd99, emissiveIntensity: 1 }), s * 1.1, 1.45, 3.15, 0, 0, 0).rotation.set(0, 0, 0);
  add(new THREE.BoxGeometry(0.9, 0.08, 0.9), paint, 0, 2.05, -1.9);
  return g;
}

// UH-60M (Sketchfab, CC-BY) in the game's helicopter frame: nose +Z, cabin centred at the origin with the
// floor at y ≈ -1.1 (seats / door gun offsets stay valid), main rotor and tail rotor re-pivoted on their hubs.
function realHelicopter() {
  const src = cloneRaw('uh60'); if (!src) return null;
  src.updateMatrixWorld(true);
  const find = (re) => { let f = null; src.traverse((o) => { if (!f && re.test(o.name || '')) f = o; }); return f; };
  const rotorN = find(/main.?rotor/i), tailN = find(/tail.?rotor/i), bodyN = find(/fuselage/i);
  const bb = (o) => new THREE.Box3().setFromObject(o);
  const fb = bb(bodyN || src), fs = fb.getSize(new THREE.Vector3());
  const longX = fs.x > fs.z;
  const tc = tailN ? bb(tailN).getCenter(new THREE.Vector3()) : fb.max.clone();
  const fc = fb.getCenter(new THREE.Vector3());
  // yaw so the long axis is Z with the nose (away from the tail rotor) toward +Z
  const yaw = longX ? (tc.x > fc.x ? Math.PI / 2 : -Math.PI / 2) : (tc.z > fc.z ? Math.PI : 0);
  const scale = 15.3 / Math.max(fs.x, fs.z);                                  // UH-60 fuselage length
  const root = new THREE.Group(); const inner = new THREE.Group(); root.add(inner); inner.add(src);
  inner.rotation.y = yaw; inner.scale.setScalar(scale); root.updateMatrixWorld(true);
  // cabin under the main rotor hub (z), floor (= bottom of the cabin door) at y -1.15 where the seats/door gun expect it
  const rc = rotorN ? bb(rotorN).getCenter(new THREE.Vector3()) : bb(src).getCenter(new THREE.Vector3());
  const doorN = find(/door/i); const floorY = doorN ? bb(doorN).min.y + 0.05 : bb(src).min.y + 1.0;
  inner.position.set(-rc.x, -1.15 - floorY, -0.4 - rc.z); root.updateMatrixWorld(true);
  // re-pivot the rotors on their hub centres so they can spin in place
  const pivot = (node) => { if (!node) return null; const c = bb(node).getCenter(new THREE.Vector3()); const p = new THREE.Group(); p.position.copy(c); root.add(p); p.attach(node); return p; };
  const rotor = pivot(rotorN), tail = pivot(tailN);
  src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0.7; } });
  return { root, rotor, tail };
}
export function buildHelicopter() {
  const real = realHelicopter();
  if (real) {
    const g = real.root; g.userData.dynamic = true;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010 })); beacon.position.set(0, -1.35, -2.5); g.add(beacon);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(8.1, 40), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.05, 0); real.rotor?.add(disc);
    g.userData = { dynamic: true, rotor: real.rotor || new THREE.Group(), tail: real.tail || new THREE.Group(), beacon, real: true };
    return g;
  }
  const g = new THREE.Group(); g.userData.dynamic = true;
  const paint = pbr('paintedMetal', { color: 0x4f5a48, repeat: [2, 2] });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171816, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f1820, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const body = new THREE.CapsuleGeometry(1.1, 3.2, 6, 14); body.rotateX(Math.PI / 2); body.scale(1, 1.05, 1);
  add(body, paint, 0, 0, 0);
  add(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.1, 2.0, Math.PI / 2.6);
  const boom = new THREE.CylinderGeometry(0.22, 0.45, 5.2, 10); boom.rotateX(Math.PI / 2); add(boom, paint, 0, 0.45, -4.6);
  add(new THREE.BoxGeometry(0.1, 1.4, 0.8), paint, 0, 1.0, -7.0, 0.2);
  add(new THREE.BoxGeometry(1.6, 0.06, 0.45), paint, 0, 0.5, -6.4);
  add(new THREE.BoxGeometry(1.3, 0.5, 1.4), paint, 0, 1.25, -0.2); // engine cowling
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), dark, s * 1.0, -1.35, 0.2, Math.PI / 2); add(new THREE.BoxGeometry(0.06, 0.5, 0.06), dark, s * 1.0, -1.1, 1.2); add(new THREE.BoxGeometry(0.06, 0.5, 0.06), dark, s * 1.0, -1.1, -0.8); }
  // door gunner openings: dark side panels
  for (const s of [-1, 1]) add(new THREE.PlaneGeometry(1.6, 1.0), dark, s * 1.12, 0.05, 0.2, 0, s * Math.PI / 2);
  const rotor = new THREE.Group(); rotor.position.set(0, 1.65, -0.2); g.add(rotor);
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8), dark, 0, 0, 0, 0, 0, 0, rotor);
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.28, 0.03, 7.6), dark, 0, 0.12, 0, 0, i * Math.PI / 2, 0, rotor);
  // motion-blur disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.8, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.14; rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.12, 1.0, -7.1); g.add(tail);
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.02, 1.4, 0.12), dark, 0, 0, 0, i * Math.PI / 2, 0, 0, tail);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010 })); beacon.position.set(0, -1.15, -1.5); g.add(beacon);
  g.userData = { dynamic: true, rotor, tail, beacon };
  return g;
}
