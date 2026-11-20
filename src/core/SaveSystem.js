// Campaign progression + checkpoint persistence (localStorage).
// Survives page reloads / browser restarts.
const KEY = 'fie.save.v1';

const EMPTY = () => ({
  version: 1,
  unlocked: ['m01'],
  completed: {},            // missionId -> { time, kills, accuracy, deaths, date, difficulty }
  checkpoint: null,         // { missionId, checkpointId, player:{health, ammo...}, flags, savedAt }
  lastMission: null,
  storyFlags: {},           // persistent narrative state carried between missions
});

class SaveSystem {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d.version === 1) return { ...EMPTY(), ...d }; }
    } catch (e) { console.warn('save load failed', e); }
    return EMPTY();
  }
  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('save failed', e); } }
  hasContinue() { return !!this.data.checkpoint || !!this.data.lastMission; }
  isUnlocked(id) { return this.data.unlocked.includes(id); }
  saveCheckpoint(cp) { this.data.checkpoint = { ...cp, savedAt: Date.now() }; this.data.lastMission = cp.missionId; this.persist(); }
  clearCheckpoint() { this.data.checkpoint = null; this.persist(); }
  completeMission(id, stats, nextId) {
    const prev = this.data.completed[id];
    this.data.completed[id] = { ...stats, date: Date.now(), best: prev ? Math.min(prev.best ?? prev.time, stats.time) : stats.time };
    if (nextId && !this.data.unlocked.includes(nextId)) this.data.unlocked.push(nextId);
    this.data.checkpoint = null;
    this.data.lastMission = nextId || id;
    this.persist();
  }
  setFlag(k, v) { this.data.storyFlags[k] = v; this.persist(); }
  newCampaign() { const keepUnlocked = this.data.unlocked; this.data = EMPTY(); this.data.unlocked = keepUnlocked; this.persist(); }
  wipe() { this.data = EMPTY(); this.persist(); }
}

export const saves = new SaveSystem();
