// Unified input: keyboard/mouse with rebindable actions + Gamepad API.
// Systems query actions ("forward", "fire", "ads") rather than raw keys.
import { settings } from './Settings.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.gamepad = null;
    this.padPrev = {};
    this.padPressed = new Set();
    this.lastDevice = 'kbm';
    this.captureCallback = null; // used by key rebinding UI

    addEventListener('keydown', (e) => {
      if (this.captureCallback) { e.preventDefault(); const cb = this.captureCallback; this.captureCallback = null; cb(e.code); return; }
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
      if (this.locked && ['Tab', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; this.lastDevice = 'kbm';
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; }
      this.onLockChange?.(this.locked);
    });
    addEventListener('gamepadconnected', (e) => { this.gamepad = e.gamepad.index; });
    addEventListener('gamepaddisconnected', () => { this.gamepad = null; });
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* headless / unsupported */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  binding(action) { return settings.data.controls.bindings[action]; }

  // --- gamepad (standard mapping) ---
  pollGamepad() {
    this.padPressed.clear();
    if (!settings.data.controls.gamepadEnabled) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = this.gamepad != null ? pads[this.gamepad] : [...pads].find(Boolean);
    if (!gp) return null;
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const map = { jump: 0, crouch: 1, reload: 2, interact: 2, weapon1: 3, grenade: 5, sprint: 10, melee: 11, pause: 9, objectives: 8 };
    for (const [a, i] of Object.entries(map)) {
      const now = btn(i);
      if (now && !this.padPrev[a]) this.padPressed.add(a);
      this.padPrev[a] = now;
    }
    const dz = (v) => Math.abs(v) < 0.15 ? 0 : v;
    const state = {
      lx: dz(gp.axes[0]), ly: dz(gp.axes[1]), rx: dz(gp.axes[2]), ry: dz(gp.axes[3]),
      lt: gp.buttons[6]?.value || 0, rt: gp.buttons[7]?.value || 0, btn,
    };
    if (state.lx || state.ly || state.rx || state.ry || state.lt > 0.2 || state.rt > 0.2) this.lastDevice = 'pad';
    this.pad = state;
    return state;
  }

  down(action) {
    if (!this.enabled) return false;
    if (this.keys.has(this.binding(action))) return true;
    if (action === 'sprint' && this.keys.has('ShiftRight')) return true;
    const p = this.pad;
    if (p) {
      if (action === 'forward') return p.ly < -0.3;
      if (action === 'back') return p.ly > 0.3;
      if (action === 'left') return p.lx < -0.3;
      if (action === 'right') return p.lx > 0.3;
      if (action === 'sprint') return p.btn(10);
    }
    return false;
  }
  pressed(action) {
    if (!this.enabled) return false;
    return this.pressedThisFrame.has(this.binding(action)) || this.padPressed.has(action);
  }
  fire() { return this.enabled && (this.mouse.left || (this.pad?.rt ?? 0) > 0.5); }
  firePressed() { return this.enabled && (this.mouse.leftPressed || ((this.pad?.rt ?? 0) > 0.5 && !this._rtPrev)); }
  ads() { return this.enabled && (this.mouse.right || (this.pad?.lt ?? 0) > 0.5); }
  adsPressed() { return this.enabled && (this.mouse.rightPressed || ((this.pad?.lt ?? 0) > 0.5 && !this._ltPrev)); }
  moveAxes() {
    let x = 0, z = 0;
    if (this.down('forward')) z += 1; if (this.down('back')) z -= 1;
    if (this.down('right')) x += 1; if (this.down('left')) x -= 1;
    if (this.pad && (Math.abs(this.pad.lx) > 0 || Math.abs(this.pad.ly) > 0)) { x = this.pad.lx; z = -this.pad.ly; }
    return { x, z };
  }
  lookDelta() {
    const s = settings.data.controls;
    let dx = this.mouse.dx * 0.0022 * s.sensitivity;
    let dy = this.mouse.dy * 0.0022 * s.sensitivity;
    if (this.pad) { dx += this.pad.rx * 0.045 * s.gamepadSensitivity; dy += this.pad.ry * 0.035 * s.gamepadSensitivity; }
    if (s.invertY) dy = -dy;
    return { dx, dy };
  }
  endFrame() {
    this._rtPrev = (this.pad?.rt ?? 0) > 0.5; this._ltPrev = (this.pad?.lt ?? 0) > 0.5;
    this.pressedThisFrame.clear();
    this.mouse.dx = this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
  }
}
