// Level: West-coast port and coastal batteries (Mission 04). Dawn, heavy sea fog.
// The sea lies to the west (x < -62). North of z ≈ -50 the land rises onto a
// bluff where three coastal gun batteries face the sea and the helicopter LZ
// sits. A road ramps down the bluff into the port: container yard, a quay
// gantry crane with its control room, warehouses, and the landing-zone plaza in
// the south. When the fog lifts the allied fleet fills the horizon.
import { warehouse } from '../Industrial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ContainerYard, containerMesh, CONTAINER } from '../Containers.js';
import * as THREE from 'three';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { settings } from '../../core/Settings.js';
import { buildTruck, buildHelicopter } from '../Props.js';
import { cloneRaw } from '../../gear/GearLib.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, z) { let h = x * 374761393 + z * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;

export const PORT = {
  bounds: { minX: -64, maxX: 250, minZ: -195, maxZ: 135 },
  base: V(170, 0, -142),         // enemy compound on the inland hill east of the LZ (seen from the battery bluff)
  noGoX: 104,                    // minefield fence: the player stays west of it
  coastX: -62, quay: 2.5,
  lz: V(30, 0, -150), batteries: [V(-46, 0, -108), V(-47, 0, -140), V(-36, 0, -172)],
  crane: { x: -52, z: 12 }, control: V(-36, 0, -30), plaza: V(28, 0, 96),
  rampTop: V(36, 0, -112), rampBottom: V(34, 0, -48),
};

function heightAt(x, z) {
  const P = PORT;
  const bluff = smooth(-50, -105, z) * 12.5;
  const rough = smooth(-60, -110, z) * (fbm(x * 0.05, z * 0.05) - 0.5) * 2.2 * (1 - Math.exp(-((x - 36) ** 2) / 60));
  // inland hill carrying the enemy compound (flat top), rising beyond the minefield fence
  const dh = Math.hypot((x - P.base.x) * 0.9, z - P.base.z);
  const hill = smooth(-60, -100, z) * (1 - smooth(40, 75, dh)) * 4;
  const land = P.quay + bluff + rough + hill;
  // the coast: vertical quay in the port, a steep cliff below the bluff
  return x >= P.coastX ? land : -9;
}

// Fit a ship model: long axis along Z with the bow (the narrower end) toward +Z, scaled to `length`,
// keel `draft` metres below the waterline (y = 0).
function fitShip(src, length, draft) {
  if (!src) return null; src.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const alongX = sz.x > sz.z; const v = new THREE.Vector3(); let wA = 0, nA = 0, wB = 0, nB = 0; const L = alongX ? sz.x : sz.z;
  src.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; const step = Math.max(1, Math.floor(p.count / 4000));
    for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const a = alongX ? v.x - c.x : v.z - c.z, w = Math.abs(alongX ? v.z - c.z : v.x - c.x);
      if (a > L * 0.38) { wA += w; nA++; } else if (a < -L * 0.38) { wB += w; nB++; } } });
  const bowPositive = (nA ? wA / nA : 0) < (nB ? wB / nB : 0);   // narrower end = bow
  const yaw = alongX ? (bowPositive ? Math.PI / 2 : -Math.PI / 2) : (bowPositive ? 0 : Math.PI);
  const k = length / L; const inner = new THREE.Group(); inner.add(src); src.position.sub(c);
  inner.rotation.y = yaw; inner.scale.setScalar(k);
  const g = new THREE.Group(); g.add(inner); g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner); inner.position.y = -draft - b2.min.y;
  src.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export class CoastalPort {
  constructor(game) { this.game = game; this.fog = 0.03; this.fogTarget = 0.03; this.helos = []; }

  async build() {
    const g = this.game, w = g.world, P = PORT;
    w.bounds = { ...P.bounds };
    const surf = (x, z) => (z > -50 ? 'concrete' : 'dirt');
    w.setTerrain(heightAt, surf); this.hf = heightAt;
    this.atmosphere();
    await this.terrain();
    this.sea();
    this.roads();
    this.bluff();
    this.port();
    this.crane();
    this.plaza();
    this.fleet();
    this.blockers();
    w.ladders = [];
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    scene.fog = new THREE.FogExp2(0x8a96a0, this.fog);
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.4;
    this.sky = new Sky(scene, { zenith: 0x5c6c80, horizon: 0xc8b8a4, stars: 0, sunDir: [0.85, 0.12, 0.3], sunColor: 0xffc890, sunSize: 0.9993 });
    this.hemi = new THREE.HemisphereLight(0xa8b4c0, 0x5c5850, 1.1); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffd2a0, 1.3); const sh = settings.data.graphics.shadows;
    sun.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    sun.shadow.mapSize.set(size, size); Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target); g.sun = sun; g.sunOffset = V(90, 25, 30); this.sunLight = sun;
    g.renderer.renderer.toneMappingExposure = 1.05;
    g.effects.setSmokeLight(0.8);
  }

  async terrain() {
    const g = this.game, B = PORT.bounds, scene = g.renderer.scene;
    const grass = pbr('grassdead', { repeat: [1, 1], color: 0x8a8a70, key: 'coastgrass' });
    const pave = pbr('concrete', { repeat: [1, 1], color: 0x9a9890, key: 'portpave' });
    const build = (z0, z1, mat) => {
      const sx = B.maxX - B.minX + 60, sz = z1 - z0; const geo = new THREE.PlaneGeometry(sx, sz, Math.round(sx / 1.2), Math.round(sz / 1.2)); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv; const cx = (B.minX + B.maxX) / 2 + 20, cz = (z0 + z1) / 2;
      for (let i = 0; i < p.count; i++) { const x = Math.max(PORT.coastX, p.getX(i) + cx), z = p.getZ(i) + cz; p.setXYZ(i, x, heightAt(x, z), z); uv.setXY(i, x / 6, z / 6); }
      geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
    };
    build(B.minZ - 40, -46, grass); await new Promise((r) => setTimeout(r, 0));
    build(-46, B.maxZ + 40, pave); await new Promise((r) => setTimeout(r, 0));
    // quay wall / cliff face along the coast
    const wallMat = pbr('concrete', { color: 0x6c6a64, key: 'quaywall' });
    const cliffMat = pbr('rock', { color: 0x7a746a, key: 'cliff' });
    for (let z = B.minZ - 40; z < B.maxZ + 40; z += 8) {
      const top = heightAt(PORT.coastX + 0.5, z + 4); const h = top + 9;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 8.05), z < -50 ? cliffMat : wallMat); m.position.set(PORT.coastX - 0.6, top - h / 2, z + 4); m.receiveShadow = true; scene.add(m);
    }
    // bollards and fenders along the quay
    const bm = new THREE.MeshStandardMaterial({ color: 0x2a2c2c, roughness: 0.6, metalness: 0.4 });
    for (let z = -44; z < 130; z += 12) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10), bm); b.position.set(PORT.coastX + 0.8, PORT.quay + 0.3, z); scene.add(b); }
    for (let z = -44; z < 130; z += 6) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })); f.position.set(PORT.coastX - 1.3, 0.6, z); scene.add(f); }
    // distant coast ring
    const far = new THREE.PlaneGeometry(3000, 3000, 80, 80); far.rotateX(-Math.PI / 2);
    const fp = far.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), z = fp.getZ(i); const d = Math.max(x - 110, Math.abs(z - (-30)) - 190, 0); fp.setY(i, x < -60 ? -30 : d <= 0 ? -30 : fbm(x * 0.004, z * 0.004) * 90 * smooth(0, 400, d) + 3); }
    far.computeVertexNormals(); scene.add(new THREE.Mesh(far, new THREE.MeshStandardMaterial({ color: 0x55605a, roughness: 1 })));
  }

  sea() {
    const scene = this.game.renderer.scene;
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const img = x.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const nx = (vnoise(i * 0.06, j * 0.06) - 0.5) * 1.2 + Math.sin(i * 0.1 + j * 0.03) * 0.25, nz = (vnoise(i * 0.06 + 40, j * 0.06) - 0.5) * 1.2;
      const k = (j * 256 + i) * 4; img.data[k] = 128 + nx * 80; img.data[k + 1] = 128 + nz * 80; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0); const nm = new THREE.CanvasTexture(c); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(160, 160);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x2c3a40, metalness: 0.5, roughness: 0.2, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5) }));
    m.rotation.x = -Math.PI / 2; m.position.set(-3000 + PORT.coastX - 0.5, 0, 0); m.userData.dynamic = true; scene.add(m); this.seaNormal = nm;
  }

  roads() {
    const hf = this.hf, scene = this.game.renderer.scene;
    const ribbon = (pts, w, mat) => {
      const pos = [], uv = [], idx = []; let dist = 0; const P = [];
      for (let s = 0; s < pts.length - 1; s++) { const [ax, az] = pts[s], [bx, bz] = pts[s + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5)); for (let i = 0; i < n; i++) { const t = i / n; P.push([ax + (bx - ax) * t, az + (bz - az) * t]); } }
      P.push(pts.at(-1));
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i]; const [px, pz] = P[Math.max(0, i - 1)], [qx, qz] = P[Math.min(P.length - 1, i + 1)];
        let dx = qx - px, dz = qz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (i > 0) dist += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
        for (const s of [-1, 1]) { const vx = x - dz * w / 2 * s, vz = z + dx * w / 2 * s; pos.push(vx, hf(vx, vz) + 0.04, vz); uv.push((s + 1) / 2 * w / 4, dist / 4); }
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -3; m.receiveShadow = true; scene.add(m);
    };
    const asphalt = pbr('asphalt', { color: 0x777777, key: 'portroad' });
    ribbon([[30, -160], [34, -130], [36, -112], [36, -80], [34, -48], [30, -20], [24, 20], [22, 60], [28, 96]], 8, asphalt);
    ribbon([[-50, -40], [-50, 130]], 9, asphalt);                // quay road under the crane
    ribbon([[-50, -40], [34, -42]], 7, asphalt);
    ribbon([[-46, -108], [36, -112]], 5, pbr('dirt', { color: 0x9a8e80, key: 'bluffroad' }));
  }

  bluff() {
    const g = this.game, p = g.props, scene = g.renderer.scene, P = PORT, hf = this.hf;
    const conc = pbr('concrete', { color: 0x8a8a82, key: 'battery' });
    const gunMat = pbr('paintedMetal', { color: 0x4e5442, key: 'batteryGun' });
    this.batteries = P.batteries.map((b, i) => {
      const y = hf(b.x, b.z);
      // circular gun pit with a parapet ring
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2; if (Math.cos(a) > 0.85) continue;   // open to the rear (east)
        const seg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.8), conc); seg.position.set(b.x + Math.cos(a) * 5, y + 0.65, b.z + Math.sin(a) * 5); seg.rotation.y = -a + Math.PI / 2; seg.castShadow = seg.receiveShadow = true; scene.add(seg);
        g.world.addBoxCentered(seg.position.clone(), V(1.8, 1.3, 1.8), { surface: 'concrete', cover: true });
      }
      const grp = new THREE.Group(); grp.position.set(b.x, y, b.z); grp.userData.dynamic = true; scene.add(grp);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 0.5, 18), gunMat); ring.position.y = 0.25; grp.add(ring);
      const mount = new THREE.Group(); mount.position.y = 0.5; mount.rotation.y = -Math.PI / 2; grp.add(mount);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), gunMat); shield.position.set(0, 1.0, 0.2); mount.add(shield);
      const barrelPivot = new THREE.Group(); barrelPivot.position.set(0, 1.2, 1.2); barrelPivot.rotation.x = -0.12; mount.add(barrelPivot);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.5, 12), gunMat); barrel.rotation.x = Math.PI / 2; barrel.position.z = 3.2; barrelPivot.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x1e1f1c, roughness: 0.6 })); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 6.4; barrelPivot.add(muzzle);
      const breech = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.1), new THREE.MeshStandardMaterial({ color: 0x2a2c26, metalness: 0.5, roughness: 0.5 })); breech.position.set(0, 1.2, -1.1); mount.add(breech);
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.world.addBoxCentered(V(b.x, y + 1.2, b.z), V(2.8, 2.4, 2.8), { surface: 'metal', cover: true });
      // ammo bunker behind each gun
      p.box(V(3.2, 1.6, 2.4), V(b.x + 9, y + 0.8, b.z + (i % 2 ? 3 : -3)), conc, { surface: 'concrete' });
      p.sandbagWall(b.x + 7, b.z + 6, 4, 3, 1); p.sandbagWall(b.x + 7, b.z - 6, 4, 3, 1);
      return { pos: V(b.x, y, b.z), mount, barrelPivot, breechPos: V(b.x + 1.4, y + 1.2, b.z), destroyed: false, name: ['A', 'B', 'C'][i] };
    });
    // command bunker and trench line on the bluff
    this.bunker = p.building({ x: 4, z: -138, w: 9, d: 6, h: 2.6, wall: conc, roof: 'flat', doors: [{ side: 'e', at: 0, width: 1.3 }], windows: [{ side: 'w', at: -2, width: 1.6, sill: 1.2, height: 0.4 }, { side: 'w', at: 2, width: 1.6, sill: 1.2, height: 0.4 }] });
    for (const [x, z, l, r] of [[-14, -118, 5, 1], [-12, -152, 5, 1], [-20, -96, 4, 0], [16, -100, 4, 0], [14, -162, 4, 0], [-4, -178, 4, 0], [40, -124, 3, 1], [22, -140, 4, 1]]) p.sandbagWall(x, z, l, 3, r);
    for (const [x, z] of [[10, -120], [-6, -160], [24, -170], [-22, -132]]) p.crate(x, z);
    // the LZ marker
    const lz = P.lz; const ly = hf(lz.x, lz.z);
    const hm = new THREE.Mesh(new THREE.RingGeometry(5, 5.5, 32), new THREE.MeshBasicMaterial({ color: 0xd8d8c8 })); hm.rotation.x = -Math.PI / 2; hm.position.set(lz.x, ly + 0.06, lz.z); scene.add(hm);
    p.bareTrees([[50, -100], [60, -150], [44, -180], [70, -120], [-20, -186], [80, -170], [64, -90]].map(([x, z]) => ({ x, z, s: 0.9 })));
    const pines = []; for (let i = 0; i < 90; i++) { const x = 50 + Math.random() * 48, z = -190 + Math.random() * 120; if (Math.abs(x - 36) > 9 && !(Math.abs(z - P.base.z) < 40 && Math.random() < 0.85)) pines.push({ x, z, s: 0.8 + Math.random() * 0.6 }); }   // sparse in front of the enemy hill so it can be seen
    p.pineForest(pines);
    p.rocks(Array.from({ length: 30 }, () => ({ x: -58 + Math.random() * 8, z: -190 + Math.random() * 135, r: 0.5 + Math.random() * 1.2 })));
  }

  port() {
    const g = this.game, p = g.props, scene = g.renderer.scene, w = g.world, P = PORT;
    // container yard: stacked 40 ft boxes in rows, lanes between (modelled, Korean lines — see world/Containers.js)
    const yard = new ContainerYard(g); const lines = ['hanbada', 'garam', 'mir', 'solbit', 'taebaek', 'hanbada', 'plain', 'garam'];
    const cont = (x, z, level = 0, c = 0, rotY = 0) => yard.add({ x, y: P.quay + level * CONTAINER.H, z, rotY, len: 40, line: lines[c % lines.length] });
    let k = 0;
    for (const row of [-34, -20, -6, 8]) for (const zc of [-18, 2, 22, 42, 62]) {
      if ((row === 8 && zc === 22) || (row === -20 && zc === 42)) continue;    // gaps for flanking lanes
      for (let s = 0; s < 2; s++) { const h = (k * 7 + s * 3) % 5 === 0 ? 3 : (k + s) % 3 === 0 ? 2 : 1; for (let l = 0; l < h; l++) cont(row + s * 2.6, zc, l, k * 3 + s + l); }
      k++;
    }
    // loose containers along the quay (cover for the crane fight)
    cont(-42, 70, 0, 2, Math.PI / 2); cont(-42, 88, 0, 5); cont(-38, -6, 0, 1, Math.PI / 2);
    yard.build();
    // warehouses east
    [[70, -20, 30, '1'], [70, 20, 30, '2'], [72, 70, 36, '3']].forEach(([x, z, d, n], i) => warehouse(g, { x, z, y: w.heightFn(x, z), w: 22, d, h: 8, sign: n, owner: i === 2 ? '가람해운 물류센터' : '한바다해운 보세창고',
      doors: [{ side: 'w', at: -6, width: 5, open: 0.55 }, { side: 'w', at: 5, width: 5, open: i === 1 ? 0.95 : 0.1 }, { side: 'w', at: 11.5, width: 1.1, kind: 'person' }, { side: 'e', at: 0, width: 5, open: 0 }] }));
    // crane control room
    const c = P.control;
    this.controlRoom = p.building({ x: c.x, z: c.z, w: 8, d: 6, h: 3, wall: pbr('plaster', { color: 0xd6d2c4, key: 'ctrl' }), roof: 'flat', light: { intensity: 3, color: 0xdde8ff }, lit: true,
      doors: [{ side: 'e', at: 1, width: 1.3 }], windows: [{ side: 'w', at: -1.5, width: 2.4, sill: 1.0, height: 1.2 }, { side: 'n', at: 0, width: 2.0, sill: 1.0, height: 1.0 }, { side: 's', at: 0, width: 2.0, sill: 1.0, height: 1.0 }] });
    const fy = this.controlRoom.userData.floorY;
    p.box(V(2.4, 0.9, 0.8), V(c.x - 2.6, fy + 0.45, c.z - 1), pbr('paintedMetal', { color: 0x4a5a6a, key: 'console' }), { surface: 'metal' });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ color: 0x40c0ff, toneMapped: false })); screen.position.set(c.x - 2.2, fy + 1.15, c.z - 1); screen.rotation.y = -Math.PI / 2; scene.add(screen);
    this.consolePos = V(c.x - 1.8, fy + 1.0, c.z - 1);
    p.sign(c.x + 4.2, c.z + 2.5, '크레인 관제실', { sub: 'CRANE CONTROL', bg: '#2a4a6a', rotY: -Math.PI / 2, w: 1.8, h: 0.6, height: 2.2 });
    p.sign(20, -46, '서해 3부두', { sub: 'WEST PIER 3', bg: '#2a4a6a', rotY: 0, w: 2.4, h: 0.9, height: 2.6 });
    // vehicles, barriers, lamps
    for (const [x, z, r] of [[0, -40, 0], [-24, -42, 1], [12, -44, 0], [40, 40, 1], [40, 52, 1]]) p.jerseyBarrier(x, z, r);
    const t = buildTruck({ canopy: false }); t.remove(t.userData.cargoLamp); t.position.set(10, P.quay, 30); t.rotation.y = 0.4; scene.add(t); w.addBoxCentered(V(10, P.quay + 1.4, 30), V(3, 2.8, 8), { surface: 'metal' });
    for (let z = -30; z < 130; z += 26) p.streetLamp(-44, z, { on: false });
    const lib = g.propLib;
    if (lib) { for (const [x, z] of [[-30, -26], [-28, -24], [15, 12], [16, 13.2]]) lib.place('barrel_02', x, z, { yawJitter: 2 }); lib.place('old_military_crate', -33, -24, { rotQ: 1 }); lib.place('ammo_box', 6, -38, { collide: false }); }
  }

  // ship-to-shore container crane (modelled): portal legs on rail bogies with X-bracing and cross beams,
  // box-girder boom out over the water and back-reach, A-frame with fore- and backstays, machinery house,
  // stairs and walkways, floodlights; the trolley (with the operator cab) runs along the boom and carries
  // the spreader and its container. Red / white, as many Korean terminals paint them.
  crane() {
    const g = this.game, scene = g.renderer.scene, P = PORT, C = P.crane;
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e4de, roughness: 0.55, metalness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.4, metalness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.1, metalness: 0.6, emissive: 0x334455, emissiveIntensity: 0.25 });
    const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8c020'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#1a1a1a'; for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t; })();
    const stripes = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
    const grp = new THREE.Group(); grp.position.set(C.x, P.quay, C.z); grp.userData.dynamic = true; scene.add(grp);
    // batch static parts per material
    const parts = new Map(); const put = (geo, mat) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
    const box = (sx, sy, sz, x, y, z, mat) => put(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), mat);
    const beam = (a, b, t, mat) => { const d = b.clone().sub(a), L = d.length(); const geo = new THREE.BoxGeometry(t, L, t); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); geo.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); put(geo, mat); };
    const rope = (a, b, r, mat) => { const d = b.clone().sub(a), L = d.length(); const geo = new THREE.CylinderGeometry(r, r, L, 6); geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); put(geo, mat); };
    const Vv = (x, y, z) => new THREE.Vector3(x, y, z);
    const LX = 6, LZ = 8, PORTAL = 19, BOOM = 30.6;
    // legs: tapered box sections, striped feet, bogies with wheels on the quay rails
    for (const lx of [-LX, LX]) for (const lz of [-LZ, LZ]) {
      box(1.3, PORTAL - 2.6, 1.3, lx, 2.6 + (PORTAL - 2.6) / 2, lz, red);
      box(1.4, 1.6, 1.4, lx, 1.8, lz, stripes);
      box(1.6, 0.8, 5.2, lx, 0.65, lz, dark);
      for (const wz of [-1.8, -0.6, 0.6, 1.8]) put(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12).rotateZ(Math.PI / 2).translate(lx, 0.32, lz + wz), steel);
      g.world.addBoxCentered(V(C.x + lx, P.quay + 15, C.z + lz), V(1.4, 30, 1.4), { surface: 'metal', walkable: false });
    }
    // quay rails the crane runs on
    for (const lx of [-LX, LX]) box(0.16, 0.12, 120, lx, 0.06, 0, steel);
    // portal: sill beams along z (between the legs of a side) and the portal beams across x at the top
    for (const lx of [-LX, LX]) { box(1.0, 1.4, LZ * 2 + 1.3, lx, PORTAL - 0.7, 0, red); box(0.7, 0.8, LZ * 2, lx, 9, 0, red); }
    for (const lz of [-LZ, LZ]) box(LX * 2 + 1.3, 1.6, 1.2, 0, PORTAL - 0.8, lz, red);
    // X-bracing in the side frames (between the legs along z) below the portal
    for (const lx of [-LX, LX]) for (const [y0, y1] of [[2.6, 9], [9, PORTAL - 1.4]]) { beam(Vv(lx, y0, -LZ), Vv(lx, y1, LZ), 0.35, red); beam(Vv(lx, y0, LZ), Vv(lx, y1, -LZ), 0.35, red); }
    // upper frame from the portal up to the boom
    for (const lz of [-LZ, LZ]) for (const lx of [-LX, LX]) box(0.9, BOOM - PORTAL - 1.1, 0.9, lx, PORTAL + (BOOM - PORTAL - 1.1) / 2, lz * 0.22, white);
    for (const lz of [-1, 1]) box(LX * 2 + 0.9, 0.8, 0.8, 0, BOOM - 1.6, lz * LZ * 0.22, white);
    // boom: two box girders (trolley runs between them), out over the water to x −42, back-reach to x 18
    const B0 = -42, B1 = 18, bz = 1.7;
    for (const s of [-1, 1]) { box(B1 - B0, 2.2, 0.9, (B0 + B1) / 2, BOOM, s * bz, white); box(B1 - B0, 0.14, 0.2, (B0 + B1) / 2, BOOM + 1.17, s * (bz - 0.3), steel); }
    for (let x = B0 + 2; x < B1; x += 6) box(0.4, 0.4, bz * 2, x, BOOM + 1.0, 0, white);              // cross ties above the trolley
    box(2.6, 2.6, bz * 2 + 1, B0 + 0.4, BOOM, 0, red);                                                // boom tip
    // walkways with handrails along the outside of the girders
    for (const s of [-1, 1]) { box(B1 - B0, 0.08, 0.9, (B0 + B1) / 2, BOOM - 0.95, s * (bz + 0.9), dark); for (let x = B0; x <= B1; x += 2) box(0.05, 1.0, 0.05, x, BOOM - 0.45, s * (bz + 1.32), steel); box(B1 - B0, 0.05, 0.05, (B0 + B1) / 2, BOOM + 0.05, s * (bz + 1.32), steel); }
    // A-frame: two legs per side to the apex, fore- and backstays (ropes) down to the boom
    const AP = Vv(1, 50, 0);
    for (const s of [-1, 1]) { beam(Vv(-LX, BOOM + 1, s * bz), AP.clone().setZ(s * 1.1), 1.0, red); beam(Vv(LX + 2, BOOM + 1, s * bz), AP.clone().setZ(s * 1.1), 1.0, red); }
    box(1.4, 1.4, 3.2, AP.x, AP.y, 0, red);
    for (const s of [-1, 1]) { for (const tx of [-22, -40]) rope(Vv(AP.x - 0.4, AP.y - 0.3, s * 1.2), Vv(tx, BOOM + 1.1, s * bz), 0.09, dark); rope(Vv(AP.x + 0.4, AP.y - 0.3, s * 1.2), Vv(B1 - 1, BOOM + 1.1, s * bz), 0.11, dark); }
    // machinery house on the back-reach, with louvres and a door; electrical room below
    box(7, 4.2, 5.6, 13.5, BOOM + 3.2, 0, white);
    for (let i = 0; i < 5; i++) box(0.05, 0.6, 1.4, 10 + i * 1.6 + 0.0, BOOM + 3.4, 2.82, dark);
    box(0.06, 2.0, 0.9, 16.99, BOOM + 2.2, 1.2, dark);
    box(5, 3, 4.6, 13, BOOM - 2.6, 0, red);
    // stairs: zig-zag flights up one leg, landings
    for (let f = 0; f < 6; f++) { const y0 = 1.2 + f * 3, dir = f % 2 ? -1 : 1; for (let k = 0; k < 14; k++) box(0.9, 0.06, 0.25, LX + 1.2, y0 + k * 0.215, -LZ + 1 + (dir > 0 ? k * 0.25 : 3.5 - k * 0.25), steel); box(1.0, 0.08, 1.2, LX + 1.2, y0 + 3, dir > 0 ? -LZ + 4.8 : -LZ + 0.5, dark); }
    // floodlights under the boom and the portal
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0d0, emissiveIntensity: 2.2 });
    for (const x of [-38, -26, -14, -2, 10]) for (const sgn of [-1, 1]) box(0.5, 0.25, 0.5, x, BOOM - 1.25, sgn * (bz + 0.2), lampMat);
    for (const [mat, list] of parts) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    // trolley + operator cab + spreader + hanging container (moves along the boom)
    const trolley = new THREE.Group(); trolley.position.set(-24, BOOM - 1.0, 0); grp.add(trolley);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, bz * 2 - 0.9), white); tb.castShadow = true; trolley.add(tb);
    for (const sx of [-1.6, 1.6]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), steel); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.8, sz * (bz - 0.6)); trolley.add(w); }
    const cab = new THREE.Group(); cab.position.set(-0.5, -2.2, bz + 0.2); trolley.add(cab);
    const cb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 2.2), white); cb.castShadow = true; cab.add(cb);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 2.25), glass); win.position.y = 0.1; cab.add(win);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 1.8), glass); floor.position.y = -1.16; cab.add(floor);   // glass floor: the operator looks down at the load
    const spreader = new THREE.Group(); spreader.position.y = -10; trolley.add(spreader);
    for (const sx of [-1.2, 1.2]) for (const sz of [-0.7, 0.7]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 10, 5), dark); r.position.set(sx, 5, sz); spreader.add(r); }
    const sp = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 12.3), new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.5, metalness: 0.4 })); sp.castShadow = true; spreader.add(sp);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.4), dark); head.position.y = 0.6; spreader.add(head);
    const load = containerMesh(g, 'hanbada', 40); load.position.y = -1.55; spreader.add(load);
    this.craneParts = { grp, trolley, spreader, box: load };
  }

  plaza() {
    const p = this.game.props, scene = this.game.renderer.scene, P = PORT.plaza;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: this.hTex(), transparent: true }));
    h.rotation.x = -Math.PI / 2; h.position.set(P.x, PORT.quay + 0.05, P.z); scene.add(h);
    for (const [x, z, r] of [[16, 84, 1], [16, 108, 1], [42, 84, 1], [42, 108, 1]]) p.jerseyBarrier(x, z, r);
    for (const [x, z] of [[10, 96], [46, 96], [28, 118]]) p.sandbagWall(x, z, 4, 3, x === 28 ? 0 : 1);
    p.crate(12, 88); p.ammoBox(12.6, 89.2);
    this.ammoPos = [V(12, PORT.quay + 0.9, 88), V(-8, this.hf(-8, -118) + 0.9, -118)];
    p.crate(-8, -118); p.ammoBox(-7.4, -116.8);
  }
  hTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = '#e8e4d0'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#e8e4d0'; x.fillRect(36, 28, 14, 72); x.fillRect(78, 28, 14, 72); x.fillRect(36, 57, 56, 14);
    return new THREE.CanvasTexture(c);
  }

  // allied fleet on the horizon: hidden by the fog until it lifts
  fleet() {
    const scene = this.game.renderer.scene; const grey = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.9, metalness: 0.1, envMapIntensity: 0.2 });
    const band = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.95 });
    const ship = (x, z, L, H) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = 0.15 + Math.random() * 0.2; g.userData.dynamic = true;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(L * 0.14, H * 0.5, L), grey); hull.position.y = H * 0.2; g.add(hull);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(L * 0.142, H * 0.12, L * 1.002), band); wl.position.y = H * 0.02; g.add(wl);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(L * 0.07, L * 0.18, 4), grey); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.6); bow.position.set(0, H * 0.25, L * 0.58); g.add(bow);
      const sup = new THREE.Mesh(new THREE.BoxGeometry(L * 0.1, H * 0.7, L * 0.2), grey); sup.position.set(0, H * 0.75, -L * 0.05); g.add(sup);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, H * 0.8, 6), grey); mast.position.set(0, H * 1.45, -L * 0.05); g.add(mast);
      scene.add(g); return g;
    };
    this.ships = [];
    // destroyers (Sketchfab DDG-51, CC-BY) for the nearer half of the fleet, silhouettes further out
    const ddg = (x, z) => { const g = fitShip(cloneRaw('ddg51'), 154, 6.2); if (!g) return ship(x, z, 150, 24); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5; g.userData.dynamic = true; scene.add(g); return g; };
    for (let i = 0; i < 14; i++) { const x = -280 - Math.random() * 420, z = -500 + i * 75 + (Math.random() - 0.5) * 40; this.ships.push(ddg(x, z)); }
    for (const [x, z] of [[-240, -40], [-300, 20]]) this.ships.push(ddg(x, z));                 // close escorts off the port
    // landing craft for the ending
    this.craft = [];
    const cm = new THREE.MeshStandardMaterial({ color: 0x55605a, roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.userData.dynamic = true; g.visible = false;
      const real = fitShip(cloneRaw('lcu'), 41, 1.4);   // landing craft utility (Sketchfab, CC-BY)
      if (real) g.add(real);
      else { const b = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 14), cm); b.position.y = 0.6; g.add(b); const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 0.3), cm); ramp.position.set(0, 1.2, 7); g.add(ramp); }
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(6, 18), new THREE.MeshBasicMaterial({ color: 0xd0d8d8, transparent: true, opacity: 0.4, depthWrite: false })); wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.05, -14); g.add(wake);
      g.position.set(-360 - i * 20, 0, -60 + i * 28); g.rotation.y = Math.PI / 2; scene.add(g); this.craft.push(g);
    }
  }

  blockers() {
    const w = this.game.world, B = PORT.bounds;
    w.addBox(V(PORT.coastX - 2, -10, B.minZ - 10), V(PORT.coastX + 0.4, 30, B.maxZ + 10), { surface: 'concrete', walkable: false, cover: false }).passBullets = true;
    // minefield fence east of the LZ: wire posts, triangle signs; an invisible wall keeps the player (and the squad) west of it
    const X = PORT.noGoX, scene = this.game.renderer.scene; const pm = new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 0.9 }); const wm = new THREE.MeshStandardMaterial({ color: 0x777770, metalness: 0.6, roughness: 0.5 });
    const sign = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.6 });
    for (let z = -194; z < -58; z += 3) {
      const y = heightAt(X, z); const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), pm); post.position.set(X, y + 0.7, z); scene.add(post);
      for (const h of [0.45, 0.95, 1.3]) { const wire = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 3), wm); wire.position.set(X, heightAt(X, z + 1.5) + h, z + 1.5); scene.add(wire); }
      if (Math.round(z) % 12 === 0) { const t = new THREE.Mesh(new THREE.CircleGeometry(0.28, 3), sign); t.position.set(X - 0.06, y + 1.0, z); t.rotation.y = -Math.PI / 2; t.rotation.z = Math.PI / 2; scene.add(t); }
    }
    w.addBox(V(X - 0.2, -10, B.minZ - 10), V(X + 0.2, 60, -56), { surface: 'concrete', walkable: false, cover: false }).passBullets = true;
  }

  // ---- dynamic ----
  helicopter(pos) { const h = buildHelicopter(); h.position.copy(pos); this.game.renderer.scene.add(h); this.helos.push(h); return h; }
  // the morning haze thins enough to see the enemy compound on the inland hill
  thinFog(target = 0.0042, seconds = 14) { if (this.fog <= target) return; this.fogTarget = target; this.fogRate = (this.fog - target) / seconds; }
  liftFog(seconds = 10) { this.fogTarget = 0.0006; this.fogRate = (this.fog - this.fogTarget) / seconds; this.landingCraft = true; for (const c of this.craft) c.visible = true; }
  update(dt, t) {
    const g = this.game, scene = g.renderer.scene;
    this.sky.update(dt, g.renderer.camera);
    if (this.seaNormal) { this.seaNormal.offset.x += dt * 0.012; this.seaNormal.offset.y += dt * 0.006; }
    if (this.fog > this.fogTarget) { this.fog = Math.max(this.fogTarget, this.fog - (this.fogRate || 0.001) * dt); scene.fog.density = this.fog; const k = 1 - this.fog / 0.03; scene.fog.color.setRGB(0.54 + k * 0.2, 0.59 + k * 0.12, 0.63 + k * 0.05); this.sunLight.intensity = 1.3 + k * 1.2; }
    for (const h of this.helos) { h.userData.rotor.rotation.y += dt * 30; h.userData.tail.rotation.x += dt * 40; h.userData.beacon.visible = Math.sin(t * 8) > 0; }
    if (this.landingCraft) for (const [i, c] of this.craft.entries()) { if (c.position.x < -70) c.position.x += dt * (9 + i * 0.6); c.position.y = Math.sin(t * 1.5 + i) * 0.15; }
  }
}
