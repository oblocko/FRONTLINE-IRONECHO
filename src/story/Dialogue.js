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
  }
  bindSpeaker(id, agent) { this.speakers.set(id, agent); }
  clear() { for (const q of this.queue) q.resolve(); this.queue = []; if (this.current) this.current.resolve(); this.current = null; events.emit('subtitle', null); this.audio.duck(false); }

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
    this.audio.voiceMurmur(line.dur * 0.9, c.pitch ?? 1, line.radio);
    this.audio.duck(true);
    const agent = this.speakers.get(line.speaker); if (agent && !line.radio) agent.actor.startTalk(line.dur);
    if (agent && line.radio) agent.actor.gesture('radio', line.dur);
    this.log.push({ t: this.time, speaker: line.speaker, text: line.text });
    events.emit('subtitle', settings.data.audio.subtitles || line.priority >= 3 ? { name: speakerLabel(line.speaker), color: c.color || '#fff', text: line.text, radio: line.radio } : null);
    events.emit('radio:active', line.radio ? { speaker: speakerLabel(line.speaker) } : null);
  }
  end() {
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
