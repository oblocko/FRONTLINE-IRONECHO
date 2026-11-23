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
  low:    { shadows: 'off',    textures: 'low',    effects: 'low',    post: false, renderScale: 0.75, aa: 0, ao: 'off' },
  medium: { shadows: 'medium', textures: 'medium', effects: 'medium', post: true,  renderScale: 1.0,  aa: 2, ao: 'off' },
  high:   { shadows: 'high',   textures: 'high',   effects: 'high',   post: true,  renderScale: 1.0,  aa: 4, ao: 'medium' },
  ultra:  { shadows: 'ultra',  textures: 'high',   effects: 'high',   post: true,  renderScale: 1.0,  aa: 4, ao: 'high' },
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
    aa: 4,                    // MSAA samples on the scene render target (0 | 2 | 4)
    ao: 'medium',             // ambient occlusion (GTAO): off | medium (half resolution) | high (full)
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
      if (raw) {
        const saved = JSON.parse(raw); const out = deepMerge(DEFAULT_SETTINGS, saved);
        // settings added later (antialiasing, ambient occlusion) follow the saved preset, not the defaults
        const pr = QUALITY_PRESETS[out.graphics.preset];
        if (pr) for (const k of ['aa', 'ao']) if (!(saved.graphics && k in saved.graphics)) out.graphics[k] = pr[k];
        return out;
      }
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
