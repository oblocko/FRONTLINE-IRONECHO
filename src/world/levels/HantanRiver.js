// Level: Hantan River defense line (Mission 03). Night, heavy rain.
// The river runs east–west through z ≈ 0. A two-lane concrete bridge (x ±4.5)
// crosses it; the friendly line holds the south bank (+Z) behind sandbags with
// an MG nest and a command bunker; the enemy comes from the wooded north bank.
// A road leads south from the bridge past a hamlet to the medevac point.
// The west ford (x ≈ -130) is where the "armoured battalion" is reported.
import * as THREE from 'three';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { Weather } from '../../render/Effects.js';
import { settings } from '../../core/Settings.js';
import { buildTruck } from '../Props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, z) { let h = x * 374761393 + z * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const fbm = (x, z) => (vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1);

export const RIVER = {
  bounds: { minX: -165, maxX: 165, minZ: -125, maxZ: 205 },
  water: -1.25, bridge: { half: 4.5, z0: -28, z1: 28, deck: 0.9, mid: [-10, 10] },
  ford: V(-130, 0, 0), mgNest: V(9, 0, 25.5), cmd: V(-24, 0, 42), thermal: V(-15.5, 0, 29.5),
  detonator: V(5.5, 0, 36), evac: V(0, 0, 152), riverJump: V(-38, 0, 19),
  charges: [V(3.6, 0.9, -7.5), V(-3.6, 0.9, 0), V(3.6, 0.9, 7.5)],
};

// ---- terrain height ----
function heightAt(x, z) {
  const R = RIVER; const az = Math.abs(z);
  let h = (fbm(x * 0.03, z * 0.03) - 0.5) * 1.6;
  h += smooth(-20, -70, z) * (2.5 + fbm(x * 0.02 + 9, z * 0.02) * 4);             // north bank rises into wooded hills
  h += smooth(20, 45, z) * 1.6 - smooth(60, 140, z) * 0.8;                          // low ridge of the south defense line
  h += smooth(130, 165, Math.abs(x)) * 10;                                          // valley sides
  // river channel (shallower at the west ford)
  const fordK = Math.exp(-((x - R.ford.x) ** 2) / (2 * 14 ** 2));
  const bed = -4.6 * (1 - fordK) + -1.55 * fordK;
  const k = 1 - smooth(11, 19, az + Math.sin(x * 0.05) * 1.5);
  h = h * (1 - k) + bed * k;
  // bridge embankments
  if (Math.abs(x) < 16 && az > 15 && az < 48) {
    const w = 1 - smooth(6, 16, Math.abs(x));
    const em = R.bridge.deck * (1 - smooth(28, 46, az)) - 0.02;
    h = h + (Math.max(h, em) - h) * w;
  }
  return h;
}

export class HantanRiver {
  constructor(game) { this.game = game; this.flares = []; this.flashT = 2; this.thermal = 0; }

  async build(progress = () => {}) {
    const g = this.game, w = g.world, R = RIVER;
    w.bounds = { ...R.bounds };
    const surf = (x, z) => (Math.abs(x) < 3.5 && z > 28 ? 'concrete' : Math.abs(z) < 22 ? 'dirt' : 'grass');
    w.setTerrain(heightAt, surf); this.hf = heightAt;
    this.atmosphere();
    await this.terrain();
    this.water();
    this.roads();
    this.bridge();
    this.southLine();
    this.hamlet();
    this.northBank();
    this.nature();
    this.riverBlockers();
    this.truck = buildTruck(); g.renderer.scene.add(this.truck);
    this.medevac = buildTruck(); g.renderer.scene.add(this.medevac); this.medevac.position.set(1.8, this.hf(1.8, R.evac.z), R.evac.z); this.medevac.rotation.y = 0;
    this.ghosts = this.buildGhostArmor();
    this.weather = new Weather(g.renderer.scene, 'rain', 1.0);
    w.ladders = [];
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    scene.fog = new THREE.FogExp2(0x10151b, 0.0165);
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.18;
    this.sky = new Sky(scene, { zenith: 0x05070b, horizon: 0x1a2028, stars: 0, sunDir: [-0.4, 0.35, -0.8], sunColor: 0x8090a8, sunSize: 0.9999 });
    this.hemi = new THREE.HemisphereLight(0x58667e, 0x24261f, 0.75); scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x8fa2c8, 0.55); const sh = settings.data.graphics.shadows;
    moon.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    moon.shadow.mapSize.set(size, size); Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 220 }); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.03;
    scene.add(moon); scene.add(moon.target); g.sun = moon; g.sunOffset = V(-40, 70, -50);
    g.renderer.renderer.toneMappingExposure = 1.3;
    g.effects.setSmokeLight(0.35);
    this.horizonLight = new THREE.PointLight(0xff8a40, 0, 700, 1.2); this.horizonLight.position.set(0, 40, -260); scene.add(this.horizonLight);
  }

  async terrain() {
    const g = this.game, B = RIVER.bounds, scene = g.renderer.scene;
    const mat = pbr('grassdead', { repeat: [1, 1], color: 0x7a7a62, key: 'wetgrass' }); mat.roughness = 0.82;
    const mud = pbr('dirt', { repeat: [1, 1], color: 0x7d7468, key: 'mudbank' }); mud.roughness = 0.6;
    const CH = 4, sx = (B.maxX - B.minX + 60) / CH, sz = (B.maxZ - B.minZ + 60) / CH, ox = B.minX - 30, oz = B.minZ - 30;
    for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
      const geo = new THREE.PlaneGeometry(sx, sz, Math.round(sx), Math.round(sz)); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv; const cx = ox + (ci + 0.5) * sx, cz = oz + (cj + 0.5) * sz;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, heightAt(x, z), z); uv.setXY(i, x / 6, z / 6); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
      await new Promise((r) => setTimeout(r, 0));
    }
    // muddy banks: a ribbon either side of the channel drawn over the grass
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(B.maxX - B.minX + 40, 14, 220, 10); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i) + s * 15; p.setXYZ(i, x, heightAt(x, z) + 0.03, z); uv.setXY(i, x / 5, z / 5); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mud); m.receiveShadow = true; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; scene.add(m);
    }
    // distant hills ring
    const far = new THREE.PlaneGeometry(2400, 2400, 90, 90); far.rotateX(-Math.PI / 2);
    const fp = far.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i); const d = Math.max(Math.abs(x) - 170, z < 0 ? -z - 130 : z - 210, 0);
      fp.setY(i, d <= 0 ? -20 : fbm(x * 0.004, z * 0.004) * 140 * smooth(0, 500, d) + smooth(0, 60, d) * 8);
    }
    far.computeVertexNormals();
    scene.add(new THREE.Mesh(far, new THREE.MeshStandardMaterial({ color: 0x2a3030, roughness: 1 })));
  }

  water() {
    const scene = this.game.renderer.scene, R = RIVER;
    // procedural ripple normal map so rain-lit flares glint off the surface
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const img = x.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const nx = Math.sin(i * 0.15 + Math.sin(j * 0.07) * 2) * 0.3 + (vnoise(i * 0.08, j * 0.3) - 0.5) * 0.6, nz = Math.cos(j * 0.11 + Math.sin(i * 0.05) * 3) * 0.3;
      const k = (j * 256 + i) * 4; img.data[k] = 128 + nx * 90; img.data[k + 1] = 128 + nz * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0); const nm = new THREE.CanvasTexture(c); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(40, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b252b, metalness: 0.55, roughness: 0.12, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.93 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(R.bounds.maxX - R.bounds.minX + 400, 44), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, R.water, 0); m.receiveShadow = true;
    m.userData.dynamic = true; scene.add(m); this.waterMesh = m; this.waterNormal = nm;
  }

  roads() {
    const hf = this.hf; const scene = this.game.renderer.scene;
    const ribbon = (pts, w, mat, lift = 0.05) => {
      const pos = [], uv = [], idx = []; let dist = 0; const P = [];
      for (let s = 0; s < pts.length - 1; s++) { const [ax, az] = pts[s], [bx, bz] = pts[s + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5)); for (let i = 0; i < n; i++) { const t = i / n; P.push([ax + (bx - ax) * t, az + (bz - az) * t]); } }
      P.push(pts.at(-1));
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i]; const [px, pz] = P[Math.max(0, i - 1)], [qx, qz] = P[Math.min(P.length - 1, i + 1)];
        let dx = qx - px, dz = qz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (i > 0) dist += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
        for (const s of [-1, 1]) { const vx = x - dz * w / 2 * s, vz = z + dx * w / 2 * s; pos.push(vx, hf(vx, vz) + lift, vz); uv.push((s + 1) / 2 * w / 4, dist / 4); }
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -3; m.receiveShadow = true; scene.add(m);
    };
    const asphalt = pbr('asphalt', { color: 0x6e6e6e, key: 'wetasphalt' }); asphalt.roughness = 0.35;
    ribbon([[0, 28], [0, 60], [2, 90], [0, 120], [1, 152], [0, 210]], 7, asphalt);
    ribbon([[0, -28], [0, -60], [-6, -90], [-4, -130]], 7, asphalt);
    ribbon([[0, 66], [30, 72], [60, 70], [165, 74]], 4.5, pbr('dirt', { color: 0x8a8076, key: 'farmroad' }));
    ribbon([[1, 118], [-30, 122], [-70, 112], [-165, 110]], 4.5, pbr('dirt', { color: 0x8a8076, key: 'farmroad' }));
  }

  bridge() {
    const g = this.game, p = g.props, scene = g.renderer.scene, R = RIVER, B = R.bridge, w = g.world;
    const conc = pbr('concrete', { color: 0x8c8c86, key: 'bridge' }); const dark = pbr('concrete', { color: 0x5e5f5c, key: 'bridgeDark' });
    const rail = pbr('paintedMetal', { color: 0x8a9096, key: 'bridgeRail' });
    const span = (z0, z1, parent) => {
      const len = z1 - z0, cz = (z0 + z1) / 2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2, 0.7, len), conc); deck.position.set(0, B.deck - 0.35, cz); deck.castShadow = deck.receiveShadow = true; parent.add(deck);
      const girder = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2 - 1.2, 1.1, len), dark); girder.position.set(0, B.deck - 1.25, cz); girder.castShadow = true; parent.add(girder);
      for (const s of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, len), dark); curb.position.set(s * (B.half - 0.25), B.deck + 0.17, cz); parent.add(curb);
        for (let z = z0 + 1; z < z1; z += 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), rail); post.position.set(s * (B.half - 0.2), B.deck + 0.72, z); parent.add(post); }
        for (const y of [0.75, 1.1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), rail); bar.position.set(s * (B.half - 0.2), B.deck + y, cz); parent.add(bar); }
      }
      // lane markings
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, len), new THREE.MeshStandardMaterial({ color: 0xc9a43a, roughness: 0.6 })); line.rotation.x = -Math.PI / 2; line.position.set(0, B.deck + 0.012, cz); parent.add(line);
      const cols = [w.addBox(V(-B.half, B.deck - 0.7, z0), V(B.half, B.deck, z1), { surface: 'concrete', cover: false })];
      for (const s of [-1, 1]) cols.push(w.addBox(V(s > 0 ? B.half - 0.45 : -B.half, B.deck, z0), V(s > 0 ? B.half : -B.half + 0.45, B.deck + 1.15, z1), { surface: 'metal', cover: false }));
      return cols;
    };
    this.bridgeCols = { north: span(B.z0, B.mid[0], scene), south: span(B.mid[1], B.z1, scene) };
    // the middle span is a separate group: it is dropped when the bridge is blown
    const mid = new THREE.Group(); mid.userData.dynamic = true; scene.add(mid); this.midSpan = mid;
    this.bridgeCols.mid = span(B.mid[0], B.mid[1], mid);
    // piers
    for (const z of [-10, 10]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2 - 1, 6, 1.6), dark); pier.position.set(0, B.deck - 4.6, z); pier.castShadow = true; scene.add(pier);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2 + 0.6, 0.5, 2.2), conc); cap.position.set(0, B.deck - 1.95, z); scene.add(cap);
    }
    // abutment walls where the embankment meets the deck
    for (const z of [-20, 20]) { const ab = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2 + 1, 4, 3), dark); ab.position.set(0, B.deck - 2.6, z); ab.castShadow = true; scene.add(ab); }
    // lamp posts (dark: power is out)
    for (const z of [-18, 0, 18]) for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), rail); pole.position.set(s * (B.half - 0.2), B.deck + 3, z + s * 4); scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.15), rail); arm.position.set(s * (B.half - 0.75), B.deck + 5.95, z + s * 4); scene.add(arm);
    }
    p.sign(6.5, 31, '한탄대교', { sub: 'HANTAN BRIDGE · 중량 40t', bg: '#1e4c7a', rotY: Math.PI, w: 2.6, h: 0.9, height: 2.2 });
    // abandoned cars on the bridge (cover for the enemy rush)
    const car = (x, z, c, rot) => { const t = buildTruck({ canopy: false }); t.scale.setScalar(0.6); t.position.set(x, B.deck, z); t.rotation.y = rot; t.remove(t.userData.cargoLamp); t.traverse((o) => { if (o.isMesh && o.material?.map) { o.material = o.material.clone(); o.material.color.setHex(c); } }); scene.add(t); w.addBoxCentered(V(x, B.deck + 0.9, z), V(1.8, 1.8, 4.4), { surface: 'metal' }); return t; };
    car(-2, -22, 0x6a7a8a, 0.15); car(2.3, 17, 0x8a3a2a, Math.PI - 0.1);
  }

  southLine() {
    const g = this.game, p = g.props, scene = g.renderer.scene, R = RIVER;
    // sandbag line along the bank top, gaps at the road and the MG nest
    for (let x = -60; x <= 60; x += 4.4) { if (Math.abs(x) < 7) continue; p.sandbagWall(x, 23.5 + Math.sin(x * 0.2) * 0.6, 4, 3); }
    // MG nest: U of sandbags around the gun
    const n = R.mgNest; p.sandbagWall(n.x, n.z - 1.3, 3.2, 4); p.sandbagWall(n.x - 1.7, n.z, 2.4, 4, 1); p.sandbagWall(n.x + 1.7, n.z, 2.4, 4, 1);
    // second line further back
    for (const [x, z] of [[-30, 36], [-18, 34], [20, 35], [34, 37], [46, 33]]) p.sandbagWall(x, z, 4, 3);
    // command bunker
    const c = R.cmd;
    this.cmdBunker = p.building({ x: c.x, z: c.z, w: 8, d: 6, h: 2.5, wall: pbr('concrete', { color: 0x7e7f78, key: 'cmd' }), roof: 'flat', light: { intensity: 2.4, color: 0xffb070 }, lit: true,
      doors: [{ side: 's', at: 0, width: 1.3 }], windows: [{ side: 'n', at: -2, width: 1.6, sill: 1.3, height: 0.4 }, { side: 'n', at: 2, width: 1.6, sill: 1.3, height: 0.4 }] });
    const fy = this.cmdBunker.userData.floorY;
    p.box(V(2.2, 0.75, 1), V(c.x, fy + 0.37, c.z - 1.5), pbr('wood', { color: 0x5e5040 }), { surface: 'wood' });
    this.cmdRadio = p.radioSet(c.x - 0.5, fy + 0.75, c.z - 1.5, Math.PI);
    p.sign(c.x + 3.2, c.z + 3.3, '3대대 전방지휘소', { bg: '#2f4a33', rotY: Math.PI, w: 2.2, h: 0.6, height: 1.6 });
    // thermal sight on a tripod looking west along the river
    const t = R.thermal; const ty = this.hf(t.x, t.z);
    const tri = new THREE.Group(); tri.position.set(t.x, ty, t.z); tri.rotation.y = Math.PI / 2 + 0.25; scene.add(tri);
    const dm = new THREE.MeshStandardMaterial({ color: 0x2b2e2a, metalness: 0.4, roughness: 0.6 });
    for (const a of [0, 2.1, -2.1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), dm); leg.position.set(Math.sin(a) * 0.25, 0.65, Math.cos(a) * 0.25); leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); tri.add(leg); }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.55), dm); body.position.y = 1.4; tri.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x1a2a30, metalness: 0.9, roughness: 0.1 })); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.42, 0.3); tri.add(lens);
    p.sandbagWall(t.x, t.z - 1.4, 3, 3);
    this.thermalPos = V(t.x, ty + 1.4, t.z);
    // detonator box + wire to the bridge
    const d = R.detonator; const dy = this.hf(d.x, d.z);
    const det = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7 })); det.position.set(d.x, dy + 0.12, d.z); scene.add(det);
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), dm); plunger.position.set(d.x, dy + 0.4, d.z); scene.add(plunger); this.plunger = plunger;
    const wirePts = [V(d.x, dy + 0.05, d.z), V(4.5, this.hf(4.5, 30) + 0.05, 30), V(4.4, RIVER.bridge.deck + 0.05, 20), V(3.6, RIVER.bridge.deck + 0.05, 8)];
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), 40, 0.012, 4), new THREE.MeshStandardMaterial({ color: 0x111111 })));
    p.sandbagWall(d.x, d.z - 1.2, 2.4, 3);
    // ammo points
    p.crate(-6, 30); p.ammoBox(-6.6, 31.2); p.crate(14, 31); p.ammoBox(14.6, 32);
    this.ammoPos = [V(-6, this.hf(-6, 30) + 0.9, 30), V(14, this.hf(14, 31) + 0.9, 31)];
    const lib = g.propLib;
    if (lib) { lib.place('ammo_box', 7.5, 28.2, { yawJitter: 0.5, collide: false }); lib.place('ammo_box', 10.5, 28.4, { yawJitter: 0.5, collide: false }); lib.place('metal_jerrycan_green', -21, 37.5, { yawJitter: 1, collide: false }); lib.place('old_military_crate', -28, 38, { rotQ: 1 }); lib.place('medical_box', -25.5, 38.6, { collide: false }); }
    // camo net over the bunker entrance
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 6, 9, 6), new THREE.MeshStandardMaterial({ color: 0x3e4434, roughness: 1, side: THREE.DoubleSide }));
    const np = net.geometry.attributes.position; for (let i = 0; i < np.count; i++) np.setZ(i, Math.sin(i * 1.7) * 0.18);
    net.rotation.x = -Math.PI / 2; net.position.set(c.x, this.hf(c.x, c.z) + 3.1, c.z + 1); scene.add(net);
  }

  hamlet() {
    const p = this.game.props;
    const walls = [pbr('plaster', { color: 0xcfcab8, key: 'h1' }), pbr('brick', { color: 0xb09080 }), pbr('plaster', { color: 0xb8c0b2, key: 'h2' })];
    const roofs = [0x3a4c5e, 0x5c3a32, 0x3c5446];
    const houses = [
      { x: 18, z: 80, w: 9, d: 7, doors: [{ side: 'w', at: 0, width: 1.2 }], windows: [{ side: 'n', at: 0, width: 1.6 }] },
      { x: -17, z: 90, w: 8, d: 7, doors: [{ side: 'e', at: 0, width: 1.2 }], windows: [{ side: 'n', at: 0, width: 1.6 }, { side: 's', at: 1, width: 1.4 }] },
      { x: 20, z: 100, w: 7, d: 6, doors: [{ side: 'w', at: -1, width: 1.2 }], windows: [{ side: 'n', at: 1, width: 1.4 }] },
      { x: -19, z: 128, w: 10, d: 7, doors: [{ side: 'e', at: 1, width: 1.2 }], windows: [{ side: 'n', at: -2, width: 1.6 }, { side: 's', at: 2, width: 1.6 }] },
      { x: 19, z: 138, w: 8, d: 6, doors: [{ side: 'w', at: 0, width: 1.2 }], windows: [{ side: 'n', at: 0, width: 1.4 }] },
    ];
    this.houses = houses.map((h, i) => p.building({ ...h, h: 2.8, wall: walls[i % 3], roof: 'hip', roofColor: roofs[i % 3], roofHeight: 1.4 }));
    const blk = pbr('concrete', { color: 0x9c988c, key: 'blk3' });
    for (const [x, z, len, rot] of [[12, 86, 8, 1], [-10, 96, 7, 1], [12, 106, 6, 1], [-11, 122, 9, 1], [12, 133, 7, 1], [25, 75, 8, 0], [-22, 84, 6, 0]]) {
      const sx = rot ? 0.3 : len, sz = rot ? len : 0.3; p.box(V(sx, 1.1, sz), V(x, this.hf(x, z) + 0.55, z), blk, { surface: 'concrete' });
    }
    // medevac point: aid tent, sandbags, stretcher crates
    const e = RIVER.evac; const ey = this.hf(e.x - 9, e.z);
    const tent = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 5), pbr('fabric', { color: 0x4f5a3e, key: 'tent' })); tent.position.set(e.x - 9, ey + 1.3, e.z); tent.castShadow = true; this.game.renderer.scene.add(tent);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5.2, 3, 1, false), pbr('fabric', { color: 0x4f5a3e, key: 'tent' })); roof.rotation.set(Math.PI / 2, 0, Math.PI / 2); roof.scale.set(1, 1, 0.35); roof.position.set(e.x - 9, ey + 2.9, e.z); this.game.renderer.scene.add(roof);
    this.game.world.addBoxCentered(V(e.x - 9, ey + 1.5, e.z), V(6, 3, 5), { surface: 'wood' });
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: this.crossTex() })); cross.position.set(e.x - 5.98, ey + 1.6, e.z); cross.rotation.y = Math.PI / 2; this.game.renderer.scene.add(cross);
    p.sandbagWall(e.x - 4, e.z - 6, 4, 3); p.sandbagWall(e.x + 6, e.z - 6, 4, 3);
    p.sign(e.x + 5.5, e.z + 2, '환자 후송 지점', { sub: 'CASEVAC', bg: '#7a1d1d', rotY: -Math.PI / 2, w: 2, h: 0.7 });
    const poles = [[6, 50], [6, 78], [6, 106], [6, 134], [6, 162]].map(([x, z]) => p.utilityPole(x, z));
    for (let i = 0; i < poles.length - 1; i++) p.wire(poles[i], poles[i + 1]);
  }
  crossTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#e8e8e0'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#b01818'; x.fillRect(24, 8, 16, 48); x.fillRect(8, 24, 48, 16);
    return new THREE.CanvasTexture(c);
  }

  northBank() {
    const p = this.game.props;
    const dark = [pbr('plaster', { color: 0x8c887c, key: 'nb1' }), pbr('brick', { color: 0x806a5c, key: 'nb2' })];
    for (const [x, z, w, d, i] of [[-32, -48, 9, 7, 0], [30, -52, 8, 7, 1], [52, -46, 7, 6, 0], [-55, -55, 10, 7, 1]]) p.building({ x, z, w, d, h: 2.6, wall: dark[i], roof: 'hip', roofColor: 0x3a3a38, roofHeight: 1.3, doors: [{ side: 's', at: 0, width: 1.2 }], windows: [{ side: 's', at: 2.5, width: 1.4 }] });
    // enemy-side positions: low walls and bags along the north bank
    for (const [x, z, l, r] of [[-18, -27, 4, 0], [14, -28, 4, 0], [-36, -30, 4, 0], [32, -31, 4, 0], [-8, -36, 3, 1], [9, -38, 3, 1]]) p.sandbagWall(x, z, l, 2, r);
    p.sign(-7, -31, '한탄강', { sub: 'HANTAN RIVER', bg: '#1e4c7a', rotY: 0, w: 1.8, h: 0.7, height: 1.6 });
  }

  nature() {
    const p = this.game.props; const rnd = (a, b) => a + Math.random() * (b - a);
    const nearRoad = (x, z) => Math.abs(x) < 9 || (Math.abs(z - 70) < 6 && x > 0) || (Math.abs(z - 115) < 7 && x < 0);
    const pines = [];
    for (let i = 0; i < 260; i++) { const x = rnd(-160, 160), z = rnd(-120, -42); if (!nearRoad(x, z) && !(Math.abs(x + 20) < 45 && z > -60)) pines.push({ x, z, s: rnd(0.9, 1.6), collide: z > -70 }); }
    for (let i = 0; i < 160; i++) { const x = rnd(-160, 160), z = rnd(45, 200); if (!nearRoad(x, z) && !(Math.abs(x) < 32 && z > 70 && z < 145) && !(Math.abs(x) < 20 && z > 140)) pines.push({ x, z, s: rnd(0.8, 1.3) }); }
    p.pineForest(pines);
    p.bareTrees([[-40, 30], [42, 28], [-62, 26], [60, 30], [25, 60], [-26, 62], [30, 118], [-30, 140], [-45, -24], [48, -26], [-80, -25], [85, 24]].map(([x, z]) => ({ x, z, s: rnd(0.8, 1.2) })));
    const rocks = []; for (let i = 0; i < 70; i++) { const x = rnd(-150, 150), z = (Math.random() < 0.5 ? -1 : 1) * rnd(17, 24); if (Math.abs(x) > 12) rocks.push({ x, z, r: rnd(0.4, 1.2) }); }
    p.rocks(rocks);
    p.grassTufts(Math.floor(3500 * ({ low: 0.3, medium: 0.6, high: 1 }[settings.data.graphics.effects] ?? 1)), { minX: -150, maxX: 150, minZ: 22, maxZ: 190, reject: (x, z) => nearRoad(x, z) }, this.hf);
  }

  // keep everyone out of the deep channel: invisible walls along both banks
  // (the bridge deck is above them; the west ford is open to the scripted ghosts only)
  riverBlockers() {
    const w = this.game.world, R = RIVER;
    for (const s of [-1, 1]) for (const [x0, x1] of [[R.bounds.minX, -R.bridge.half - 0.2], [R.bridge.half + 0.2, R.bounds.maxX]]) {
      w.addBox(V(x0, -6, s * 16 - 0.5), V(x1, 0.6, s * 16 + 0.5), { surface: 'dirt', walkable: false, cover: false }).passBullets = true;
    }
  }

  // enemy MBT (fictional generic design) — used for the bridge assault
  buildTank(mat = null) {
    const g = new THREE.Group(); g.userData.dynamic = true;
    const paint = mat || pbr('paintedMetal', { color: 0x4c5040, repeat: [2, 2], key: 'enemyTank' });
    const dark = mat || new THREE.MeshStandardMaterial({ color: 0x1a1b18, roughness: 0.9 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
    const hull = new THREE.Shape(); hull.moveTo(-3.3, 0.55); hull.lineTo(2.9, 0.55); hull.lineTo(3.5, 1.15); hull.lineTo(2.6, 1.75); hull.lineTo(-3.3, 1.75); hull.lineTo(-3.4, 1.0);
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.3, bevelEnabled: false }); hg.translate(0, 0, -1.65); hg.rotateY(-Math.PI / 2); add(hg, paint, 0, 0, 0);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.6, 0.9, 6.8), dark, s * 1.75, 0.55, 0); add(new THREE.BoxGeometry(0.65, 0.5, 6.9), paint, s * 1.75, 1.3, 0); }
    const tur = new THREE.Group(); tur.position.set(0, 1.75, -0.3); g.add(tur);
    const ts = new THREE.Shape(); ts.moveTo(-1.6, -1.4); ts.lineTo(1.6, -1.4); ts.lineTo(1.4, 1.6); ts.lineTo(-1.4, 1.6);
    const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.75, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.1, bevelSegments: 1 }); tg.rotateX(-Math.PI / 2); add(tg, paint, 0, 0, 0, 0, 0, 0, tur);
    const gun = add(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 10), dark, 0, 0.42, 3.8, Math.PI / 2, 0, 0, tur);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10), dark, 0, 0.42, 1.8, Math.PI / 2, 0, 0, tur);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10), paint, 0.6, 1.0, -0.4, 0, 0, 0, tur);
    g.userData.turret = tur; g.userData.gun = gun;
    return g;
  }
  // thermal-only "armour" at the west ford: bright silhouettes visible only in the sight
  buildGhostArmor() {
    const hot = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
    const list = [];
    for (let i = 0; i < 6; i++) {
      const t = this.buildTank(hot); const x = RIVER.ford.x + (i % 3) * 9 - 9, z = -26 - Math.floor(i / 3) * 12 + (i % 2) * 3;
      t.position.set(x, this.hf(x, z), z); t.rotation.y = 0.15; t.visible = false; this.game.renderer.scene.add(t); list.push(t);
    }
    return list;
  }

  // ---- dynamic ----
  // illumination flare: drifts down under a parachute, lights the river
  flare(pos) {
    const g = this.game, scene = g.renderer.scene;
    const light = new THREE.PointLight(0xfff2d8, 0, 160, 1.4); light.position.copy(pos); scene.add(light);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff6e0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })); spr.scale.setScalar(1.6); spr.position.copy(pos); scene.add(spr);
    const f = { light, spr, t: 0, life: 22, vel: V(0.8, -1.4, 0.3) }; this.flares.push(f);
    g.audio.click(0.25, 200, 0.4);
    return f;
  }
  dropMidSpan() {
    const g = this.game, w = g.world;
    for (const c of this.bridgeCols.mid) w.removeCollider(c);
    const mid = this.midSpan; let t = 0;
    g.mission.every((dt) => {
      t += dt; const k = Math.min(1, t / 1.4);
      mid.position.y = -k * k * 5.2; mid.rotation.x = k * 0.22; mid.rotation.z = Math.sin(k * 3) * 0.04;
      if (k >= 1) { g.effects.explosion(V(0, RIVER.water + 0.2, 0), 1.6); return false; }
    });
  }
  // thermal sight: cold sky, grey ground, hot engines glow white
  setThermal(on) {
    const scene = this.game.renderer.scene;
    this.thermal = on ? 1 : 0;
    for (const t of this.ghosts) t.visible = on && !this.ghostsGone;
    if (on) { this._fog = scene.fog; scene.fog = new THREE.FogExp2(0x2c2c2c, 0.0035); this.sky.mesh.visible = false; this._bg = scene.background; scene.background = new THREE.Color(0x0c0c0c); this.weather.points.visible = false; }
    else { scene.fog = this._fog; this.sky.mesh.visible = true; scene.background = this._bg ?? null; this.weather.points.visible = true; }
  }
  update(dt, t) {
    const g = this.game;
    this.sky.update(dt, g.renderer.camera);
    this.weather.update(dt, g.renderer.camera.position);
    if (this.waterNormal) { this.waterNormal.offset.x += dt * 0.06; this.waterNormal.offset.y += dt * 0.01; }
    for (const f of this.flares) {
      f.t += dt; f.light.position.addScaledVector(f.vel, dt); f.spr.position.copy(f.light.position);
      const k = f.t < 1 ? f.t : f.t > f.life - 3 ? Math.max(0, (f.life - f.t) / 3) : 1;
      f.light.intensity = (2600 + Math.sin(f.t * 23) * 300) * k; f.spr.material.opacity = k;
      if (f.t > f.life) { g.renderer.scene.remove(f.light); g.renderer.scene.remove(f.spr); f.dead = true; }
    }
    this.flares = this.flares.filter((f) => !f.dead);
    if (this.war) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 0.5 + Math.random() * 2.5;
        this.horizonLight.position.set((Math.random() - 0.5) * 600, 30 + Math.random() * 30, -220 - Math.random() * 150);
        this.horizonLight.intensity = 1200 + Math.random() * 3000;
        if (Math.random() < 0.7) setTimeout(() => g.audio.distantArtillery(), 500 + Math.random() * 1500);
      }
      this.horizonLight.intensity *= Math.exp(-dt * 7);
    }
  }
}
