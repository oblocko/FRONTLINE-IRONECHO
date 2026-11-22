// Dialogue & radio system with priority arbitration:
//   priority 3 = story-critical (never dropped, interrupts lower)
//   priority 2 = mission radio / scripted lines (queued)
//   priority 1 = combat barks (dropped when anything else is playing; cooldown-limited)
// Lines drive subtitles, speaker lip/gesture animation, radio squelch/static,
// and audio ducking so speech never fights with music/SFX.
import { events } from '../core/Events.js';
import { settings } from '../core/Settings.js';
import { CHARACTERS, speakerLabel, LANG_LABEL } from './Characters.js';

export class Dialogue {
  constructor(audio) {
    this.audio = audio; this.queue = []; this.current = null; this.speakers = new Map();
    this.barkCD = new Map(); this.time = 0; this.log = [];
    try { if (typeof speechSynthesis !== 'undefined') { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); } } catch {}
  }
  bindSpeaker(id, agent) { this.speakers.set(id, agent); }
  clear() { try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch {} for (const q of this.queue) q.resolve(); this.queue = []; if (this.current) this.current.resolve(); this.current = null; events.emit('subtitle', null); this.audio.duck(false); }

  // returns a promise resolved when the line finishes
  say(speaker, text, { radio = false, priority = 2, duration = null, delay = 0, lang = null } = {}) {
    return new Promise((resolve) => {
      const dur = duration ?? Math.max(1.8, 0.75 + text.length * 0.065);
      // lines spoken in another language are shown translated, tagged with the language: "[영어] ..."
      const lg = lang ?? CHARACTERS[speaker]?.lang; if (lg && lg !== 'ko' && LANG_LABEL[lg]) text = `[${LANG_LABEL[lg]}] ${text}`;
      const line = { speaker, text, radio, priority, dur, resolve, delay };
      if (priority >= 3 && this.current && this.current.priority < 3) { this.current.resolve(); this.end(); this.queue.unshift(line); }
      else if (priority <= 1) {
        if (this.current || this.queue.length) return resolve();
        const cd = this.barkCD.get(speaker) ?? -99; if (this.time - cd < 6) return resolve();
        this.barkCD.set(speaker, this.time); this.queue.push(line);
      } else this.queue.push(line);
    });
  }
  // sequence helper: [[speaker, text, opts], ...]
  async conversation(lines) { for (const l of lines) await this.say(l[0], l[1], l[2] || {}); }
  bark(speaker, text) { return this.say(speaker, text, { priority: 1, duration: 1.6 }); }

  start(line) {
    this.current = line; line.t = 0;
    const c = CHARACTERS[line.speaker] || {};
    if (line.radio) this.audio.radio(true, line.dur);
    if (!this.speak(line, c)) this.audio.voiceMurmur(line.dur * 0.9, c.pitch ?? 1, line.radio);
    this.audio.duck(true);
    const agent = this.speakers.get(line.speaker); if (agent && !line.radio) agent.actor.startTalk(line.dur);
    if (agent && line.radio) agent.actor.gesture('radio', line.dur);
    this.log.push({ t: this.time, speaker: line.speaker, text: line.text });
    events.emit('subtitle', settings.data.audio.subtitles || line.priority >= 3 ? { name: speakerLabel(line.speaker), color: c.color || '#fff', text: line.text, radio: line.radio } : null);
    events.emit('radio:active', line.radio ? { speaker: speakerLabel(line.speaker) } : null);
  }
  // Korean speech synthesis (Web Speech API) with a per-character pitch/rate. Speaks the Korean line
  // (language tag and stage directions in parentheses removed). The line stays up until the voice has
  // finished (capped), so long lines are not cut off. Returns false when no Korean voice is available.
  speak(line, c) {
    if (settings.data.audio.voice !== 'tts' || typeof speechSynthesis === 'undefined' || line.priority <= 1 && Math.random() < 0.5) return false;
    const voices = speechSynthesis.getVoices(); const ko = voices.filter((v) => /^ko/i.test(v.lang));
    if (!ko.length) return false;
    const text = line.text.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]*\)/g, '').replace(/[—–]/g, ', ').trim();
    if (!text) return false;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR';
    // different characters get different voices where the OS has several (e.g. male / female)
    const female = ['seoyeon', 'maya', 'nadia', 'pa'].includes(line.speaker);
    const pickF = ko.find((v) => /heami|sunhi|yuna|female|여/i.test(v.name)), pickM = ko.find((v) => /injoon|male|남/i.test(v.name) && !/female/i.test(v.name));
    u.voice = (female ? pickF : pickM) || ko[0];
    u.pitch = Math.max(0.3, Math.min(2, (c.pitch ?? 1) * (female || u.voice === pickF ? 1 : 0.9)));
    u.rate = line.priority >= 3 ? 1.05 : 1.15; u.volume = (settings.data.audio.dialogue ?? 1) * (settings.data.audio.master ?? 1) * (line.radio ? 0.85 : 1);
    try { speechSynthesis.cancel(); } catch {}
    line.dur = Math.max(line.dur, Math.min(14, text.length * 0.11 + 0.6)); line.tts = true;
    u.onend = () => { if (this.current === line) line.t = Math.max(line.t, line.dur - 0.15); };
    speechSynthesis.speak(u);
    return true;
  }
  end() {
    if (this.current?.tts && this.current.t < this.current.dur - 0.2) { try { speechSynthesis.cancel(); } catch {} }
    if (!this.current) return;
    if (this.current.radio) this.audio.radio(false);
    this.current = null; events.emit('subtitle', null); events.emit('radio:active', null);
    if (!this.queue.length) this.audio.duck(false);
  }
  update(dt) {
    this.time += dt;
    if (this.current) {
      this.current.t += dt;
      if (this.current.t >= this.current.dur) { const r = this.current.resolve; this.end(); r(); this.gap = 0.25; }
    } else if (this.queue.length) {
      if (this.gap > 0) { this.gap -= dt; return; }
      const next = this.queue[0];
      if (next.delay > 0) { next.delay -= dt; return; }
      this.queue.shift(); this.start(next);
    }
  }
  get busy() { return !!this.current || this.queue.length > 0; }
}
