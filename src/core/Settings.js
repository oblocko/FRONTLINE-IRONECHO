// Persistent settings (localStorage). Every value here is wired to a real system:
// renderer (quality/shadows/textures/post/fov/scale/frame cap), audio buses,
// subtitles, input (sensitivity, invert, bindings, ADS mode).
import { events } from './Events.js';

const KEY = 'fie.settings.v1';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', crouch: 'KeyC', jump: 'Space',
  reload: 'KeyR', interact: 'KeyF', grenade: 'KeyG',
  weapon1: 'Digit1', weapon2: 'Digit2', melee: 'KeyV',
  pause: 'Escape', objectives: 'Tab', support: 'KeyB', flashlight: 'KeyL',
};

export const QUALITY_PRESETS = {
  low:    { shadows: 'off',    textures: 'low',    effects: 'low',    post: false, renderScale: 0.75 },
  medium: { shadows: 'medium', textures: 'medium', effects: 'medium', post: true,  renderScale: 1.0 },
  high:   { shadows: 'high',   textures: 'high',   effects: 'high',   post: true,  renderScale: 1.0 },
  ultra:  { shadows: 'ultra',  textures: 'high',   effects: 'high',   post: true,  renderScale: 1.0 },
};

export const DEFAULT_SETTINGS = {
  graphics: {
    preset: 'high',
    renderScale: 1.0,        // browser equivalent of "resolution": internal render resolution scale
    fullscreen: false,
    shadows: 'high',          // off | medium | high | ultra
    textures: 'high',         // low | medium | high (procedural texture resolution)
    effects: 'high',          // low | medium | high (particle budgets)
    post: true,               // bloom + film grain + vignette + color grading
    fov: 80,
    frameLimit: 0,            // 0 = unlimited (display refresh)
    vsync: true,              // browsers always present on vblank; see docs
  },
  audio: { master: 0.9, music: 0.6, sfx: 0.85, dialogue: 1.0, subtitles: true, subtitleSize: 'medium', voice: 'tts' },   // voice: 'tts' (OS Korean speech synthesis) | 'murmur'
  controls: {
    sensitivity: 1.0, adsSensitivity: 0.7, invertY: false, adsToggle: false,
    gamepadEnabled: true, gamepadSensitivity: 1.0, bindings: { ...DEFAULT_BINDINGS },
  },
  gameplay: { difficulty: 'regular', hints: true },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else if (k in (base || {})) out[k] = over[k];
  }
  return out;
}

class SettingsStore {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { console.warn('settings load failed', e); }
    return structuredClone(DEFAULT_SETTINGS);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('settings save failed', e); }
    events.emit('settings:changed', this.data);
  }
  get(path) { return path.split('.').reduce((o, k) => o?.[k], this.data); }
  set(path, value) {
    const parts = path.split('.');
    let o = this.data;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts.at(-1)] = value;
    if (path === 'graphics.preset' && QUALITY_PRESETS[value]) Object.assign(this.data.graphics, QUALITY_PRESETS[value]);
    this.save();
  }
  resetBindings() { this.data.controls.bindings = { ...DEFAULT_BINDINGS }; this.save(); }
  resetAll() { this.data = structuredClone(DEFAULT_SETTINGS); this.save(); }
}

export const settings = new SettingsStore();
