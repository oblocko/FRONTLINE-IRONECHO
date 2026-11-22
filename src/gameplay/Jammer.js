// Portable counter-drone jammer (fictional, abstracted EW device).
// B raises the jammer in place of the rifle. Holding fire emits a cone: any
// drone kept inside the cone fills its lock gauge and, when full, loses its
// control link — it wobbles, spirals down and crashes. The battery drains while
// emitting and recharges when idle, so the player has to pick targets instead
// of spraying. A threat radar (edge-of-screen arrows with range, red when a
// drone is about to dive) runs whenever the jammer is issued.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { keyName } from '../player/Player.js';

const CONE = THREE.MathUtils.degToRad(9);   // half-angle of the jamming cone
const RANGE = 150;
const LOCK_TIME = 1.0;                      // seconds inside the cone to break the link

function buildModel() {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const body = new THREE.MeshStandardMaterial({ color: 0x4b5240, metalness: 0.2, roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1c, metalness: 0.4, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.9, roughness: 0.3 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.85 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  add(new THREE.BoxGeometry(0.07, 0.08, 0.34), body, 0, 0, 0);                         // main housing
  add(new THREE.BoxGeometry(0.075, 0.03, 0.2), dark, 0, 0.055, 0.02);                   // top rail / handle
  add(new THREE.BoxGeometry(0.035, 0.11, 0.045), dark, 0, -0.085, 0.08, 0.25);          // pistol grip
  add(new THREE.BoxGeometry(0.05, 0.07, 0.16), dark, 0, -0.01, 0.24);                   // battery / stock
  add(new THREE.BoxGeometry(0.03, 0.09, 0.03), dark, 0, -0.07, -0.08);                  // fore grip
  // twin directional antenna panels
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.11, 0.008, 0.2), body, s * 0.07, 0.0, -0.27, 0, 0, s * 0.35);
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), metal, s * 0.07, 0.006, -0.19 - i * 0.03, 0, 0, Math.PI / 2 + s * 0.35);
  }
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 5), metal, 0, 0.02, -0.33, Math.PI / 2);
  const screen = add(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0x40ff90, toneMapped: false }), 0, 0.072, 0.09, -Math.PI / 2 + 0.4);
  const ledM = new THREE.MeshBasicMaterial({ color: 0x40ff90, toneMapped: false });
  add(new THREE.SphereGeometry(0.006, 6, 4), ledM, 0.03, 0.045, -0.15);
  // gloved hands
  add(new THREE.BoxGeometry(0.06, 0.05, 0.09), glove, 0.005, -0.06, 0.09);
  add(new THREE.BoxGeometry(0.055, 0.05, 0.08), glove, -0.005, -0.07, -0.08);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { g, screen, ledM };
}

export class Jammer {
  constructor(game) {
    this.game = game; this.active = false; this.battery = 1; this.emitting = false; this.raise = 0; this.locks = new Map();
    const m = buildModel(); this.model = m.g; this.screen = m.screen; this.ledM = m.ledM; this.model.visible = false;
    game.renderer.vmScene.add(this.model);
    this.el = document.createElement('div'); this.el.className = 'jammer-hud';
    this.el.innerHTML = `<div class="cone hidden"><div class="ring"></div><div class="lbl">EW JAMMER</div></div><div class="brk"></div><div class="arrows"></div>
      <div class="bat hidden"><div class="tag">JAMMER · BATTERY</div><div class="bar"><i></i></div><div class="st"></div></div>`;
    (game.ui.hud || document.body).appendChild(this.el);
    this.hum = null;
  }
  get key() { return keyName(this.game.input.binding('support')); }
  announce() {
    // big centred key card so the player can't miss how to raise the jammer
    const card = document.createElement('div'); card.className = 'gadget-card';
    card.innerHTML = `<div class="tag">새 장비 지급 // EW JAMMER</div><div class="row"><kbd class="big">${this.key}</kbd><div><b>재밍건 들기 / 내리기</b><span>들고 있는 동안 <b>좌클릭을 누르고 있으면</b> 원 안의 드론 통제 신호가 끊깁니다</span></div></div><div class="foot">총으로 바꾼 뒤에도 언제든 <b>${this.key}</b> 키로 다시 들 수 있습니다</div>`;
    (this.game.ui.hud || document.body).appendChild(card);
    const t0 = performance.now(); const tick = () => { if (this.active || performance.now() - t0 > 9000) { card.classList.add('out'); setTimeout(() => card.remove(), 500); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    this.game.audio.click(0.25, 1200, 0.08);
  }
  toggle(on = !this.active) {
    const g = this.game, p = g.player;
    if (on && (p.seat || !p.alive)) return;
    this.active = on; g.weapons.hidden = on; this.setHum(false); g.ui.hud?.classList.toggle('jamming', on);
    g.audio.click(0.2, on ? 1400 : 700, 0.05);
  }
  setHum(on) {
    const a = this.game.audio; if (!a.ready) return;
    if (on && !this.hum) {
      const c = a.ctx; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 140;
      const lfo = c.createOscillator(); lfo.frequency.value = 23; const lg = c.createGain(); lg.gain.value = 60; lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
      const gn = c.createGain(); gn.gain.value = 0.0001; gn.gain.setTargetAtTime(0.05, c.currentTime, 0.05);
      o.connect(f).connect(gn).connect(a.master); o.start(); lfo.start(); this.hum = { o, lfo, gn };
    } else if (!on && this.hum) {
      const h = this.hum; this.hum = null; const t = a.ctx.currentTime; h.gn.gain.setTargetAtTime(0.0001, t, 0.04); setTimeout(() => { try { h.o.stop(); h.lfo.stop(); } catch {} }, 200);
    }
  }
  drones() { return this.game.director.vehicles.filter((v) => v.isDrone && !v.dead && !v.removed && !v.jammed); }

  update(dt) {
    const g = this.game, inp = g.input, p = g.player, cam = g.renderer.camera;
    if (inp.pressed('support')) this.toggle();
    if (this.active && (!p.alive || p.seat || g.state !== 'playing')) this.toggle(false);
    if (this.active && (inp.pressed('weapon1') || inp.pressed('weapon2') || inp.mouse.wheel !== 0 || inp.pressed('reload'))) this.toggle(false);
    this.raise += ((this.active ? 1 : 0) - this.raise) * Math.min(1, dt * 10);
    // ---- emit / lock ----
    if (this.battery <= 0.01) this.empty = true; if (this.empty && this.battery > 0.3) this.empty = false;
    const firing = this.active && this.raise > 0.8 && inp.fire() && !this.empty;
    this.emitting = firing; this.setHum(firing);
    if (firing) this.battery = Math.max(0, this.battery - dt * 0.09); else this.battery = Math.min(1, this.battery + dt * 0.22);
    const eye = p.eyePos(new THREE.Vector3()); const fwd = p.forward(new THREE.Vector3());
    const list = this.drones();
    for (const d of list) {
      const to = d.position.clone().sub(eye); const dist = to.length();
      const inCone = firing && dist < RANGE && to.normalize().angleTo(fwd) < CONE + Math.atan(1.2 / Math.max(1, dist));
      let l = this.locks.get(d) || 0;
      d.occluded = !g.world.lineOfSight(eye, d.position);
      if (inCone && !d.occluded) { l += dt / LOCK_TIME; d.jamFlicker?.(); } else l = Math.max(0, l - dt * 0.3);
      if (l >= 1) { l = 0; d.jam(); g.audio.click(0.3, 2200, 0.08); events.emit('hud:hitmarker', { kill: true }); }
      this.locks.set(d, l);
    }
    for (const d of [...this.locks.keys()]) if (!list.includes(d)) this.locks.delete(d);
    // ---- viewmodel ----
    this.model.visible = this.raise > 0.05 && !p.cameraOverride;
    const t = performance.now() / 1000;
    this.model.position.set(0.2, -0.25 - (1 - this.raise) * 0.3 + Math.sin(t * 1.7) * 0.003, -0.68 + (firing ? Math.sin(t * 60) * 0.002 : 0));
    this.model.rotation.set(0.03, 0.06, 0); this.model.scale.setScalar(0.85);
    this.ledM.color.setHex(firing ? (Math.sin(t * 30) > 0 ? 0xffd040 : 0x40ff90) : 0x40ff90);
    this.screen.material.color.setHex(this.battery < 0.15 ? 0xff5040 : 0x40ff90);
    this.renderHud(cam, list, firing);
  }

  renderHud(cam, list, firing) {
    const el = this.el, W = innerWidth, H = innerHeight, p = this.game.player;
    el.querySelector('.cone').classList.toggle('hidden', !this.active);
    el.querySelector('.cone').classList.toggle('on', firing);
    el.querySelector('.bat').classList.toggle('hidden', !!this.game.player.seat);
    el.querySelector('.bat i').style.width = `${Math.round(this.battery * 100)}%`;
    el.querySelector('.bat').classList.toggle('low', this.battery < 0.2);
    el.querySelector('.bat .st').textContent = firing ? '교란 중' : this.empty ? '방전 — 충전 중' : this.active ? '대기 · 좌클릭 유지로 교란' : `재밍건 들기: [${this.key}] 키`;
    // cone ring sized to the jamming angle at the current FOV
    const px = Math.tan(CONE) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * H / 2;
    const ring = el.querySelector('.ring'); ring.style.width = ring.style.height = `${px * 2}px`;
    let brk = '', arr = '';
    for (const d of list) {
      const v = d.position.clone(); const dist = Math.round(v.distanceTo(p.position)); const proj = v.clone().project(cam);
      const lock = this.locks.get(d) || 0; const danger = d.state === 'arm' || d.state === 'dive';
      if (proj.z < 1 && Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.92) {
        const sx = (proj.x * 0.5 + 0.5) * W, sy = (-proj.y * 0.5 + 0.5) * H;
        brk += `<div class="b ${danger ? 'danger' : ''} ${lock > 0 ? 'locking' : ''} ${d.occluded ? 'occ' : ''}" style="left:${sx}px;top:${sy}px"><i style="width:${Math.round(lock * 100)}%"></i><span>${d.occluded ? '차폐 · ' : danger ? '급강하 ' : ''}${dist}m</span></div>`;
      } else {
        // off-screen: arrow on a ring around the crosshair
        const rel = v.clone().applyMatrix4(cam.matrixWorldInverse); const ang = Math.atan2(rel.x, rel.y);
        const r = Math.min(W, H) * 0.32; const ax = W / 2 + Math.sin(ang) * r, ay = H / 2 - Math.cos(ang) * r;
        arr += `<div class="a ${danger ? 'danger' : ''}" style="left:${ax}px;top:${ay}px;transform:translate(-50%,-50%) rotate(${ang}rad)"><b></b><span style="transform:rotate(${-ang}rad)">${dist}m</span></div>`;
      }
    }
    el.querySelector('.brk').innerHTML = brk; el.querySelector('.arrows').innerHTML = arr;
  }
  dispose() { this.setHum(false); this.game.ui.hud?.classList.remove('jamming'); this.game.renderer.vmScene.remove(this.model); this.el.remove(); if (this.active) this.game.weapons.hidden = false; }
}
