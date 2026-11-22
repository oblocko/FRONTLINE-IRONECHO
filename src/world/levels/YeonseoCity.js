// Level: Yeonseo City (fictional), Mission 02.
// Avenue "연서대로" runs north(-Z) to south(+Z). Cross streets at z = -120, -40, 40, 120
// end at barricades (x = ±56). Station exit 3 at the east sidewalk (z ≈ 22); the station
// interior is a separate enclosed area at x 300..380 entered through a stair transition.
import * as THREE from 'three';
import { wreck } from '../../render/Destruction.js';
import { pbr } from '../../render/TextureFactory.js';
import { Sky } from '../../render/Sky.js';
import { settings } from '../../core/Settings.js';
import { CityKit } from '../CityProps.js';
import { buildTruck } from '../Props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CITY = {
  bounds: { minX: -60, maxX: 392, minZ: -225, maxZ: 222 },
  cross: [-120, -40, 40, 120], avenueHalf: 12, walk: 4,
  stationExit: V(14.5, 0, 22), station: { x0: 300, x1: 380, z0: -45, z1: 45, pit: [358, 370] },
};

export class YeonseoCity {
  constructor(game) { this.game = game; this.dark = 0; }
  async build() {
    const g = this.game, w = g.world, scene = g.renderer.scene, C = CITY;
    w.bounds = { ...C.bounds };
    const S = C.station;
    w.setTerrain((x, z) => (x > S.pit[0] && x < S.pit[1] && z > S.z0 && z < S.z1 ? -1.3 : 0), () => 'concrete');
    this.hf = w.heightFn;
    this.kit = new CityKit(g);
    this.atmosphere();
    this.ground();
    this.buildings();
    this.streetFurniture();
    this.wrecks();
    this.buildStation();
    this.buildOverpass(165);
    this.truck = buildTruck(); scene.add(this.truck);
  }

  atmosphere() {
    const g = this.game, scene = g.renderer.scene;
    scene.fog = new THREE.FogExp2(0x8c8a84, 0.0105);
    scene.environment = g.renderer.envMap; scene.environmentIntensity = 0.45;
    this.sky = new Sky(scene, { zenith: 0x6d747c, horizon: 0xa9a49a, stars: 0, sunDir: [-0.3, 0.45, 0.6], sunColor: 0xd8d0c0, sunSize: 0.9996 });
    this.hemi = new THREE.HemisphereLight(0xb4b8bc, 0x5a554c, 1.25); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xe8dcc8, 1.6); const sh = settings.data.graphics.shadows;
    sun.castShadow = sh !== 'off'; const size = { medium: 1024, high: 2048, ultra: 4096 }[sh] || 1024;
    sun.shadow.mapSize.set(size, size); Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target); g.sun = sun; g.sunOffset = V(-45, 80, 60); this.sunLight = sun;
    g.renderer.renderer.toneMappingExposure = 1.0;
    g.effects.setSmokeLight(0.85);
  }

  ground() {
    const g = this.game, scene = g.renderer.scene, C = CITY, k = this.kit;
    const big = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), pbr('concrete', { repeat: [300, 300], color: 0x8e8c86, key: 'pavement' }));
    big.rotation.x = -Math.PI / 2; big.position.y = -0.01; big.receiveShadow = true; scene.add(big);
    const road = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), pbr('asphalt', { repeat: [(x1 - x0) / 6, (z1 - z0) / 6], color: 0x7c7c7c, key: `road${x0}${z0}` }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); };
    road(-C.avenueHalf, C.avenueHalf, C.bounds.minZ, C.bounds.maxZ);
    for (const z of C.cross) road(-56, 56, z - 7, z + 7);
    // curbs (walkable 15 cm step) along the avenue, broken at crossings
    const curb = pbr('concrete', { color: 0xa8a69e, key: 'curb' });
    const zs = [C.bounds.minZ, ...C.cross.flatMap((z) => [z - 7, z + 7]), C.bounds.maxZ];
    for (let i = 0; i < zs.length; i += 2) for (const s of [-1, 1]) {
      const z0 = zs[i], z1 = zs[i + 1]; const m = new THREE.Mesh(new THREE.BoxGeometry(C.walk, 0.15, z1 - z0), curb);
      m.position.set(s * (C.avenueHalf + C.walk / 2), 0.075, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
      g.world.addBoxCentered(m.position, V(C.walk, 0.15, z1 - z0), { surface: 'concrete', cover: false });
    }
    // road markings
    k.laneLine(0, C.bounds.minZ, C.bounds.maxZ, { dashed: false, color: 0xd8b020, width: 0.25 });
    for (const x of [-6, 6]) k.laneLine(x, C.bounds.minZ, C.bounds.maxZ);
    for (const z of C.cross) { k.crosswalk(0, z - 9, 22, false); k.crosswalk(0, z + 9, 22, false); }
  }

  buildings() {
    const C = CITY, k = this.kit; let seed = 3;
    const spans = [[-218, -127], [-113, -47], [-33, 33], [47, 113], [127, 215]];
    for (const [z0, z1] of spans) for (const side of [-1, 1]) {
      let z = z0;
      while (z < z1 - 8) {
        const len = Math.min(z1 - z, 18 + ((seed * 7) % 14)); const depth = 22 + (seed % 3) * 6;
        const x = side * (C.avenueHalf + C.walk + depth / 2);
        const tall = (seed % 4 === 0) ? 48 + (seed % 5) * 6 : 14 + (seed % 4) * 5;
        // leave a gap for the station exit plaza on the east side
        if (!(side > 0 && z0 === -33 && z < 30 && z + len > 12)) k.building({ x, z: z + len / 2, w: depth, d: len - 1.2, h: tall, kind: seed % 5, seed, shopSide: [-side, 0] });
        z += len; seed++;
      }
    }
    // cross-street backdrops & barricade walls closing the side streets
    for (const zc of C.cross) for (const side of [-1, 1]) {
      k.building({ x: side * 72, z: zc, w: 20, d: 40, h: 30 + (seed++ % 3) * 12, kind: seed % 5, seed });
    }
    // station plaza building (east) behind the exit, with a set-back
    k.building({ x: 44, z: 0, w: 26, d: 26, h: 36, kind: 1, seed: 77, shopSide: [-1, 0] });
    k.building({ x: 44, z: 26, w: 26, d: 14, h: 18, kind: 2, seed: 78 });
  }

  streetFurniture() {
    const g = this.game, p = g.props, k = this.kit, C = CITY;
    for (let z = -210; z < 215; z += 26) {
      if (C.cross.some((c) => Math.abs(z - c) < 10)) continue;
      p.streetLamp(-13.5, z, { on: false }); p.streetLamp(13.5, z + 13, { on: false });
    }
    for (const z of C.cross) { k.trafficLight(-13.5, z - 8, 0); k.trafficLight(13.5, z + 8, Math.PI); }
    k.busShelter(-14.2, 66, Math.PI / 2); k.busShelter(14.2, -70, -Math.PI / 2);
    p.bareTrees([-150, -95, -60, 0, 60, 90, 150, 180].flatMap((z) => [{ x: -14.4, z, s: 0.8 }, { x: 14.4, z: z + 9, s: 0.8 }]).filter((t) => !C.cross.some((c) => Math.abs(t.z - c) < 9) && !(t.x > 0 && Math.abs(t.z - 22) < 8)));
    this.exit = k.subwayEntrance(C.stationExit.x, C.stationExit.z, Math.PI / 2 * 0, '연서역 3번 출구');
    // barricades closing side streets
    for (const z of C.cross) for (const s of [-1, 1]) {
      for (let dz = -6; dz <= 6; dz += 2.5) p.jerseyBarrier(s * 52, z + dz, 1);
    }
    // evacuation checkpoint at the far south
    for (let x = -10; x <= 10; x += 2.6) if (Math.abs(x) > 4) p.jerseyBarrier(x, 205, 0);
    p.sandbagWall(-8, 200, 4, 3); p.sandbagWall(8, 200, 4, 3);
    p.sign(0, 207, '대피 검문소', { sub: 'EVACUATION CHECKPOINT', bg: '#2f4a33', rotY: Math.PI, w: 3, h: 1, height: 2.6 });
  }

  wrecks() {
    const k = this.kit, colors = [0x9aa0a6, 0x2a2d33, 0xd8d8d4, 0x6a1a1a, 0x1f3a6a, 0x5a5a52, 0xb8b0a0];
    let i = 0; const car = (x, z, rot, opts = {}) => k.car({ x, z, rotY: rot, color: colors[i++ % colors.length], kind: i % 3 === 0 ? 'suv' : 'sedan', ...opts });
    // northern traffic jam (truck must stop here)
    this.jamCar = car(-1.8, -112, 0.35, { dynamic: true }); car(4.5, -114, -0.2); car(-7.5, -109, 0.1); car(8.5, -118, 0.6, { wrecked: true });
    car(-9, -128, 0.05); car(9.5, -100, Math.PI + 0.1); car(-3, -98, Math.PI - 0.05);
    // abandoned cars down the avenue (cover)
    const spots = [[-5, -78, 0.4], [6, -70, -0.3], [-8, -55, 0.1, true], [3, -22, 1.2], [-6, -12, -0.2], [7, 8, 0.15], [-9, 30, -0.5, true], [9, 52, 0.2], [-2, 64, 1.4], [6, 90, -0.1], [-7, 104, 0.3], [5, 132, 0.6, true], [-6, 150, -0.2]];
    for (const [x, z, r, wr] of spots) car(x, z, r, { wrecked: !!wr });
    this.city_bus = null;
  }

  // ---------------- station interior (separate enclosed area) ----------------
  buildStation() {
    const g = this.game, p = g.props, scene = g.renderer.scene, w = g.world, S = CITY.station;
    const conc = pbr('concrete', { color: 0xb0aea6, key: 'stn' }); const tile = pbr('concrete', { color: 0xd8d6cc, key: 'stnfloor' });
    const H = 5;
    const box = (sx, sy, sz, x, y, z, mat, opts = {}) => p.box(V(sx, sy, sz), V(x, y, z), mat, opts);
    // floor (concourse + platform), ceiling, outer walls
    box(S.pit[0] - S.x0, 0.2, S.z1 - S.z0, (S.x0 + S.pit[0]) / 2, -0.1, 0, tile, { collide: false });
    const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(S.pit[1] - S.pit[0], S.z1 - S.z0), pbr('dirt', { color: 0x5a554e, key: 'ballast' })); pitFloor.rotation.x = -Math.PI / 2; pitFloor.position.set((S.pit[0] + S.pit[1]) / 2, -1.29, 0); scene.add(pitFloor);
    box(S.x1 - S.x0, 0.4, S.z1 - S.z0, (S.x0 + S.x1) / 2, H + 0.2, 0, conc, { walkable: false });
    box(0.5, H, S.z1 - S.z0, S.x0, H / 2, 0, conc); box(0.5, H, S.z1 - S.z0, S.x1, H / 2, 0, conc);
    box(S.x1 - S.x0, H, 0.5, (S.x0 + S.x1) / 2, H / 2, S.z0, conc); box(S.x1 - S.x0, H, 0.5, (S.x0 + S.x1) / 2, H / 2, S.z1, conc);
    // concourse / platform divider wall with three openings
    const dx = 334;
    for (const [z0, z1] of [[S.z0, -26], [-20, -3], [3, 20], [26, S.z1]]) box(0.4, H, z1 - z0, dx, H / 2, (z0 + z1) / 2, tile);
    // ticket gates row
    for (let z = -16; z <= 16; z += 2) box(0.3, 1.0, 0.9, 322, 0.5, z, pbr('metal', { color: 0x8a9096, key: 'gate' }), { surface: 'metal' });
    // security shutter blocking the platform opening at z=0 (raised by the player)
    this.shutter = box(0.15, H, 6, dx + 0.1, H / 2, 0, pbr('corrugated', { color: 0x8a8c88, key: 'shutter' }), { surface: 'metal' }); this.shutter.userData.dynamic = true;
    // pillars on the platform
    for (let z = -36; z <= 36; z += 12) box(0.8, H, 0.8, 348, H / 2, z, conc);
    // platform edge strip
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.6, S.z1 - S.z0), new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.8 })); edge.rotation.x = -Math.PI / 2; edge.position.set(S.pit[0] - 0.4, 0.011, 0); scene.add(edge);
    // platform screen doors (glass) along the edge
    const psd = new THREE.MeshStandardMaterial({ color: 0x9ab0b8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    // one door bay (z 1.5..4.5) stands open, facing the stalled car's door
    const D0 = 1.5, D1 = 4.5, px = S.pit[0] - 0.9;
    for (const [z0, z1] of [[S.z0, D0], [D1, S.z1]]) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 2.3), psd); pm.rotation.y = Math.PI / 2; pm.position.set(px, 1.15, (z0 + z1) / 2); scene.add(pm);
      w.addBox(V(px - 0.05, -2, z0), V(px + 0.05, 2.4, z1), { surface: 'metal', walkable: false, cover: false }).passBullets = true;
    }
    for (let z = S.z0 + 2; z < S.z1; z += 4) if (z < D0 - 0.2 || z > D1 + 0.2) box(0.12, 2.4, 0.12, px, 1.2, z, pbr('metal', { color: 0x9aa0a6, key: 'psd' }), { surface: 'metal' });
    for (const z of [D0, D1]) box(0.16, 2.5, 0.16, px, 1.25, z, pbr('metal', { color: 0x9aa0a6, key: 'psd' }), { surface: 'metal' });
    // the two sliding panels pushed open behind the fixed glass
    for (const [z, s2] of [[D0 - 0.75, -1], [D1 + 0.75, 1]]) { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), psd); pnl.rotation.y = Math.PI / 2; pnl.position.set(px - 0.12, 1.1, z); scene.add(pnl); }
    const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x40d070, toneMapped: false })); doorSign.position.set(px - 0.06, 2.42, (D0 + D1) / 2); doorSign.rotation.y = -Math.PI / 2; scene.add(doorSign);
    // emergency gangway plank laid from the platform edge across the pit to the car door
    const plank = pbr('metal', { color: 0x8a7a52, key: 'gangway' });
    box(362.4 - (S.pit[0] - 1.0), 0.1, 1.6, (S.pit[0] - 1.0 + 362.4) / 2, -0.05, 3, plank, { surface: 'metal' });
    for (const s2 of [-1, 1]) box(362.4 - S.pit[0], 0.06, 0.06, (S.pit[0] + 362.4) / 2, 0.9, 3 + s2 * 0.8, pbr('metal', { color: 0xc8a020, key: 'rail' }), { surface: 'metal', collide: false });
    for (const s2 of [-1, 1]) w.addBox(V(S.pit[0], 0, 3 + s2 * 0.8 - 0.05), V(362.4, 1.0, 3 + s2 * 0.8 + 0.05), { surface: 'metal', walkable: false, cover: false }).passBullets = true;
    // stopped train in the pit
    this.train = new THREE.Group(); scene.add(this.train);
    const tb = pbr('paintedMetal', { color: 0xc8ccd0, key: 'train' });
    for (let i = 0; i < 2; i++) {
      const cz = -18 + i * 21;
      box(3.0, 3.4, 20, 364, 0.4, cz, tb, { surface: 'metal' });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.3, 20.02), new THREE.MeshStandardMaterial({ color: 0x2a6ab0 })); stripe.position.set(364, 0.5, cz); scene.add(stripe);
      if (i === 1) { const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 })); door.position.set(362.47, 0.95, 3); door.rotation.y = -Math.PI / 2; scene.add(door); }
      for (let wz = -8; wz <= 8; wz += 4) { if (i === 1 && Math.abs(cz + wz - 3) < 1.5) continue; const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.1, metalness: 0.4 })); win.position.set(362.48, 1.2, cz + wz); win.rotation.y = -Math.PI / 2; scene.add(win); }
    }
    // emergency lighting: few red lights + green exit signs
    this.emergency = [];
    for (const [x, z] of [[315, -30], [315, 30], [346, 0]]) { const l = new THREE.PointLight(0xff3a20, 9, 26, 2); l.position.set(x, H - 0.4, z); scene.add(l); this.emergency.push(l); }
    const exitTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#0a8a3a'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText('비상구 EXIT', 18, 62); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const [x, z, r] of [[300.3, 0, Math.PI / 2], [333.7, -23, -Math.PI / 2], [333.7, 23, -Math.PI / 2]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false })); s.position.set(x, 3.4, z); s.rotation.y = r; scene.add(s); }
    // debris, benches, the power room charge site
    p.crate(326, -36); p.crate(327, -34.8, 0.8); this.game.propLib?.place('utility_box_02', 352.5, -40, { rotQ: 1 }); this.game.propLib?.place('metal_trash_can', 330, 8, { scale: 0.55 });
    for (let z = -30; z <= 30; z += 15) box(2.4, 0.45, 0.6, 342, 0.22, z, pbr('metal', { color: 0x6a7076, key: 'bench' }), { surface: 'metal' });
    this.chargeSite = V(353, 1.2, -40.5);
    // the station sits in the dark: an indoor acoustic zone
    w.indoorZones.push({ min: V(S.x0, -2, S.z0), max: V(S.x1, H, S.z1) });
    this.stationArrive = V(305, 0, 0); this.stationExitInside = V(302, 0, 0);
  }
  // elevated road crossing the avenue; its centre span can be dropped by script
  buildOverpass(z) {
    const g = this.game, scene = g.renderer.scene, conc = pbr('concrete', { color: 0x9c9a92, key: 'overpass' });
    this.overpass = { z, spans: [] };
    for (const [x0, x1] of [[-60, -9], [-9, 9], [9, 60]]) {
      const span = new THREE.Group(); span.position.set((x0 + x1) / 2, 7.6, z); span.userData.dynamic = true; scene.add(span);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.2, 12), conc); deck.castShadow = true; deck.receiveShadow = true; span.add(deck);
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.0, 0.3), conc); rail.position.set(0, 1.1, s * 5.85); span.add(rail); }
      this.overpass.spans.push(span);
    }
    for (const x of [-14.5, 14.5]) for (const dz of [-4, 4]) g.props.box(V(1.4, 7, 1.4), V(x, 3.5, z + dz), conc, { surface: 'concrete' });
    for (const x of [-40, 40]) g.props.box(V(2, 7, 8), V(x, 3.5, z), conc, { surface: 'concrete' });
  }
  collapseOverpass() {
    const g = this.game, o = this.overpass; if (o.down) return; o.down = true;
    const mid = o.spans[1]; let v = 0, rot = 0;
    for (const x of [-9, 9]) g.combat.explode(V(x, 7, o.z), { radius: 4, damage: 60, scale: 1.4, playerSafe: true });
    g.mission.every((dt) => {
      v += 15 * dt; mid.position.y = Math.max(0.9, mid.position.y - v * dt); rot = Math.min(0.22, rot + dt * 0.3); mid.rotation.z = rot;
      if (mid.position.y <= 0.9) {
        g.effects.explosion(V(0, 0.5, o.z), 1.6); g.audio.explosion(V(0, 1, o.z), 1.4); g.player.addShake(0.45);
        { const W = wreck(g); for (const x of [-8, 0, 8]) W.chunks(V(x, 1.5, o.z), { count: 20, size: 0.55, speed: 7, up: 5, mat: 'concrete' }); W.dustPuff(V(0, 0.8, o.z), 4); for (const x of [-9.5, 9.5]) { W.rebar(V(x, 7, o.z), V(-Math.sign(x), 0, 0).applyAxisAngle(V(0, 1, 0), 0), { width: 10, n: 9, len: 1.2 }); W.dustFall(V(x, 6.6, o.z), { width: 10, dur: 10, side: V(0, 0, 1) }); } }
        g.world.addBoxCentered(V(0, 1.5, o.z), V(20, 3, 12), { surface: 'concrete', cover: true });
        return false;
      }
    });
  }
  // light level for the interior (0 = outdoors, 1 = inside the station)
  setDark(v) {
    this.dark = v; const g = this.game;
    this.hemi.intensity = 1.25 * (1 - v * 0.93); this.sunLight.intensity = 1.6 * (1 - v);
    g.renderer.scene.environmentIntensity = 0.45 * (1 - v * 0.9);
    g.effects.setSmokeLight(0.85 - v * 0.6);
  }
  update(dt, t) {
    const g = this.game; this.sky.update(dt, g.renderer.camera);
    for (const [i, l] of (this.emergency || []).entries()) l.intensity = 9 * (0.75 + 0.25 * Math.sin(t * 3 + i));
  }
}
