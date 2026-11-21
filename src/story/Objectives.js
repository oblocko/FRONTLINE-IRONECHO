// Objective tracker: primary objectives with optional sub-tasks, world markers,
// counters (e.g. "Sensors checked 2/3") and completion events.
import * as THREE from 'three';
import { events } from '../core/Events.js';

export class Objectives {
  constructor() { this.list = []; this.markers = []; }
  add(id, text, { sub = null, count = 0, marker = null, optional = false } = {}) {
    const o = { id, text, sub, count, progress: 0, done: false, failed: false, optional, marker: marker ? marker.clone?.() ?? marker : null };
    this.list.push(o); events.emit('objective:new', o); this.changed(); return o;
  }
  get(id) { return this.list.find((o) => o.id === id); }
  progress(id, n = 1) { const o = this.get(id); if (!o) return; o.progress = Math.min(o.count, o.progress + n); this.changed(); if (o.count && o.progress >= o.count) this.complete(id); }
  setMarker(id, pos) { const o = this.get(id); if (o) { o.marker = pos ? pos.clone() : null; this.changed(); } }
  setMarkers(id, list) { const o = this.get(id); if (o) { o.markers = list.map((p) => p.clone()); this.changed(); } }
  complete(id) { const o = this.get(id); if (!o || o.done) return; o.done = true; o.marker = null; o.markers = null; events.emit('objective:complete', o); this.changed(); }
  // failed objectives show struck-through for a few seconds, then leave the list
  fail(id) { const o = this.get(id); if (!o || o.failed || o.done) return; o.failed = true; o._doneAt = performance.now(); this.changed(); setTimeout(() => this.changed(), 4100); }
  active() { return this.list.filter((o) => !o.done && !o.failed); }
  clear() { this.list = []; this.changed(); }
  changed() { events.emit('objectives:changed', this.list); }
  serialize() { return this.list.map((o) => ({ id: o.id, text: o.text, done: o.done, progress: o.progress, count: o.count, sub: o.sub })); }
}

export const vec = (x, y, z) => new THREE.Vector3(x, y, z);
