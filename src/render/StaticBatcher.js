// Static geometry batching: after a level is built, merge every plain Mesh that
// never moves into one mesh per (material, shadow flags, 64 m cell). Cuts draw
// calls by an order of magnitude while keeping per-cell frustum culling.
// Subtrees flagged with userData.dynamic = true (things scripts move later) are skipped,
// as are skinned/instanced meshes, points, sprites and anything already batched.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CELL = 64;

export function batchStatic(scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map(); const victims = [];
  const visit = (o) => {
    if (o.userData?.dynamic || o.isCamera || o.isLight) return;
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.batched && o.visible && o.geometry && !Array.isArray(o.material)
        && o.geometry.attributes.position && o.frustumCulled !== false && !o.material.userData?.noBatch) {
      const g = o.geometry;
      const sig = Object.keys(g.attributes).sort().join(',');
      const c = new THREE.Vector3(); g.boundingSphere || g.computeBoundingSphere(); c.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${sig}|${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}|${o.renderOrder}`;
      if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, recv: o.receiveShadow, renderOrder: o.renderOrder, list: [] });
      groups.get(key).list.push(o);
    }
    for (const ch of o.children) visit(ch);
  };
  for (const ch of scene.children) visit(ch);
  let before = 0, after = 0;
  for (const grp of groups.values()) {
    before += grp.list.length;
    if (grp.list.length < 2) { after++; continue; }
    const geos = grp.list.map((o) => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k]; return g; });
    const merged = mergeGeometries(geos, false);
    if (!merged) { after += grp.list.length; continue; }
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const m = new THREE.Mesh(merged, grp.material); m.castShadow = grp.cast; m.receiveShadow = grp.recv; m.renderOrder = grp.renderOrder; m.userData.batched = true;
    m.matrixAutoUpdate = false; scene.add(m);
    for (const o of grp.list) victims.push(o);
    after++;
  }
  for (const o of victims) o.parent?.remove(o);
  return { before, after };
}
