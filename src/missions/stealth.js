// Shared stealth / scavenging helpers for the Voss missions (from M06 on): suspicion meter, takedowns
// from behind, fades, shot tracking, picking up the carbines contractors drop.
import * as THREE from 'three';
import { events } from '../core/Events.js';
import { V } from './common.js';

export function suspicion(game, m, { watchers, range = 22, crowd = null, label = '발각 위험', start = 0, dark = () => false }) {
  const p = game.player; const el = document.createElement('div'); el.className = 'stealth-meter';
  el.innerHTML = `<div class="lbl">${label}</div><div class="bar"><i></i></div><div class="st"></div>`; game.ui.hud.appendChild(el);
  const st = { meter: start, spotted: false, stop: () => { st.done = true; el.remove(); } }; m.bind(() => el.remove());
  const eye = new THREE.Vector3(), tp = new THREE.Vector3();
  m.every((dt) => {
    if (st.done) return false;
    if (p.firingRecently) st.meter = 1;
    let rate = 0; p.chestPos(tp);
    const inCrowd = crowd ? crowd().filter((c) => c.position.distanceTo(p.position) < 2.6).length >= 2 : false;
    const R = range * (dark() ? (p.flashOn ? 1.1 : 0.45) : 1);
    for (const e of watchers()) {
      if (e.dead || e.koed) continue; e.eyePos(eye); const d = eye.distanceTo(tp); if (d > R) continue;
      const fwd = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)); const to = tp.clone().sub(eye); const cosA = (to.x * fwd.x + to.z * fwd.z) / Math.max(0.01, Math.hypot(to.x, to.z));
      if (cosA < 0.45 && d > 3) continue;
      if (!game.world.lineOfSight(eye, tp)) continue;
      rate += (1 - d / R) * (p.crouching ? 0.5 : 1) * (p.sprinting ? 2.2 : p.speed > 0.6 ? 1.3 : 1) * (d < 5 ? 2.2 : 1) * (inCrowd ? 0.2 : 1) * (p.flashOn ? 1.8 : 1) * 0.9;
    }
    st.meter = rate > 0 ? Math.min(1, st.meter + rate * dt) : Math.max(0, st.meter - dt * 0.2);
    el.querySelector('i').style.width = `${Math.round(st.meter * 100)}%`; el.classList.toggle('warn', st.meter > 0.35); el.classList.toggle('danger', st.meter > 0.75);
    el.querySelector('.st').textContent = rate > 0 ? (st.meter > 0.75 ? '발각 직전!' : inCrowd ? '군중 속 — 눈에 덜 띈다' : '누군가 이쪽을 보고 있다') : st.meter > 0.05 ? '의심이 가라앉는 중' : (inCrowd ? '군중 속' : '눈에 띄지 않음');
    if (st.meter >= 1) { st.spotted = true; st.stop(); }
  });
  return st;
}
// Non-lethal takedowns from behind on guards that have not spotted the player
export function takedowns(game, m, guards, { canUse = () => true, onUse = null, radius = 1.7 } = {}) {
  const p = game.player;
  for (const g of guards) {
    const it = p.addInteractable({ pos: () => g.position.clone().add(V(0, 1, 0)), prompt: '뒤에서 제압', radius, onUse: () => {
      if (g.dead || g.koed) return; g.koed = true; g.setPassive(true); g.pose('wounded'); g.visionRange = 0.1; game.audio.click(0.4, 300, 0.12);
      game.stats.kills++; it.enabled = false; onUse?.(g);
    } });
    m.every(() => {
      if (g.dead || g.koed) { it.enabled = false; return false; }
      const fwd = V(Math.sin(g.yaw), 0, Math.cos(g.yaw)); const to = p.position.clone().sub(g.position).setY(0).normalize();
      it.enabled = canUse() && g.state !== 'combat' && fwd.dot(to) < -0.3;
    });
    m.bind(() => p.removeInteractable(it));
  }
}
export function fade(game, m, mid) { return (async () => { events.emit('ui:fade', { to: 1, dur: 0.6 }); await m.wait(0.7); await mid(); events.emit('ui:fade', { to: 0, dur: 0.9 }); })(); }
export function trackShots(game, m, onShot) { let last = null; m.every(() => { const s = game.weapons.lastShot; if (s && s !== last) { last = s; onShot(s); } }); }
// A downed contractor's carbine lies where it fell: walk up to it and pick it up (that exact gun leaves the
// ground and becomes the viewmodel). Magazines from the dead top up ammo automatically.
export function ammoFromDead(game, m, { giveRifle } = {}) {
  const d = game.director, p = game.player;
  m.every(() => {
    for (const a of d.agents) {
      if (a.team !== 'enemy' || !a.dead) continue;
      const gun = a.actor.droppedWeapon;
      if (gun && !a.gunOffered && gun.parent) {
        a.gunOffered = true;
        const it = p.addInteractable({ pos: () => gun.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)), prompt: 'M4A1 카빈 줍기', radius: 1.8, onUse: () => {
          const had = !!game.weapons.inventory.carbine;
          gun.parent?.remove(gun); a.actor.droppedWeapon = null; it.enabled = false; p.removeInteractable(it);
          game.audio.click(0.3, 1500, 0.05);
          if (!giveRifle(game) && had) { const got = game.weapons.addAmmo('carbine', 30); game.ui.hint(`탄약 +${got}`, 1.5); }
        } });
        m.bind(() => p.removeInteractable(it));
      }
      if (a.ammoDrop === undefined) a.ammoDrop = true;
      if (a.ammoDrop && a.position.distanceTo(p.position) < 1.8) { a.ammoDrop = false; let got = game.weapons.addAmmo('pistol', 17); if (game.weapons.inventory.carbine) got += game.weapons.addAmmo('carbine', 30); if (got > 0) game.ui.hint(`탄약 +${got}`, 1.5); }
    }
  });
}

