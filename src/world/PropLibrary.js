// Library of scanned CC0 props (Poly Haven glTF, see assets/CREDITS.md).
// Loads prototypes once, places shared-geometry clones on the terrain and
// registers an axis-aligned collider from each prop's bounds.
import * as THREE from 'three';
import { loadGLTF } from '../core/Assets.js';

export const PROP_IDS = ['ammo_box', 'wooden_crate_01', 'wooden_crate_02', 'old_military_crate', 'metal_jerrycan_green', 'plastic_jerrycan', 'medical_box',
  'Barrel_01', 'Barrel_02', 'barrel_03', 'propane_tank', 'utility_box_01', 'utility_box_02', 'concrete_road_barrier_02', 'metal_trash_can'];

export class PropLibrary {
  constructor(game) { this.game = game; this.protos = new Map(); }
  async load(ids = PROP_IDS) {
    await Promise.all(ids.map(async (id) => {
      try {
        const gltf = await loadGLTF(`models/${id}/${id}.gltf`);
        const scene = gltf.scene;
        scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const box = new THREE.Box3().setFromObject(scene);
        this.protos.set(id, { scene, box });
      } catch (e) { console.warn(`prop ${id} unavailable`, e); }
    }));
    return this;
  }
  has(id) { return this.protos.has(id); }
  size(id) { const p = this.protos.get(id); return p ? p.box.getSize(new THREE.Vector3()) : null; }
  // rotQ: quarter turns (keeps the collider exact); yawJitter adds a small visual-only twist
  place(id, x, z, { rotQ = 0, y = null, scale = 1, collide = true, cover = null, surface = 'metal', yawJitter = 0, walkable = true } = {}) {
    const p = this.protos.get(id); if (!p) return null;
    const w = this.game.world; const gy = y ?? w.heightFn(x, z);
    const o = p.scene.clone(true); o.scale.setScalar(scale);
    o.rotation.y = rotQ * Math.PI / 2 + (Math.random() - 0.5) * yawJitter;
    o.position.set(x, gy - p.box.min.y * scale, z);
    this.game.renderer.scene.add(o);
    if (collide) {
      const s = p.box.getSize(new THREE.Vector3()).multiplyScalar(scale); const c = p.box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      const swap = ((rotQ % 2) + 2) % 2 === 1;
      const [cx, cz] = [[c.x, c.z], [c.z, -c.x], [-c.x, -c.z], [-c.z, c.x]][((rotQ % 4) + 4) % 4];
      const size = new THREE.Vector3(swap ? s.z : s.x, s.y, swap ? s.x : s.z);
      w.addBoxCentered(new THREE.Vector3(x + cx, gy + s.y / 2, z + cz), size, { surface, cover: cover ?? s.y > 0.7, walkable });
    }
    return o;
  }
}
