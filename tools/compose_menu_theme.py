#!/usr/bin/env python3
"""Original main-menu theme for FRONTLINE — IRON ECHO ("Iron Echo — Main Theme").

Fully synthesised with numpy (no samples): drone pad, radio static, distant
artillery, felt-piano motif, gayageum-like pentatonic pluck (Karplus-Strong),
string ensemble, war drums, sub bass, convolution reverb.
72 BPM, A minor, 44 bars (~2:27), seamless loop (ends on the opening drone).

usage: python3 tools/compose_menu_theme.py [out.wav]
then:  ffmpeg -i out.wav -codec:a libmp3lame -b:a 192k assets/audio/menu_theme.mp3
"""
import sys, wave
import numpy as np

SR = 44100
BPM = 72
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 44
LEN = int(BARS * BAR * SR) + SR * 4          # + reverb tail (folded back for looping)
rng = np.random.default_rng(2029)
L = np.zeros(LEN); R = np.zeros(LEN)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def t_of(bar, beat=0.0): return (bar * 4 + beat) * BEAT
def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n, s, dtype=float)
    a = min(a, n); e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    d = min(d, n - a); e[a:a + d] = np.linspace(1, s, d, endpoint=False) if d else e[a:a + d]
    if r and n > r: e[n - r:] *= np.linspace(1, 0, r)
    return e
def add(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR); n = min(len(sig), LEN - i)
    if n <= 0: return
    gl, gr = np.cos((pan + 1) * np.pi / 4) * gain, np.sin((pan + 1) * np.pi / 4) * gain
    L[i:i + n] += sig[:n] * gl; R[i:i + n] += sig[:n] * gr
def lowpass_fft(x, cutoff, q=0.0):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (f / cutoff) ** 4)
    if q: H *= 1 + q * np.exp(-((f - cutoff) / (cutoff * 0.25)) ** 2)
    return np.fft.irfft(X * H, len(x))
def bandpass_fft(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] *= 0.02
    return np.fft.irfft(X, len(x))

# ---------------- instruments ----------------
def saw_additive(freq, dur, harmonics=24, bright=8.0, detune_cents=0.0, vib=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * 2 ** (detune_cents / 1200) * (1 + vib * np.sin(2 * np.pi * 5.1 * t + rng.random() * 6))
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if freq * k > 16000: break
        out += np.sin(k * ph + rng.random() * 6) / k * np.exp(-k / bright)
    return out

def pad(midis, dur, bright=5.0, gain=0.06):
    n = int(dur * SR); sig = np.zeros(n)
    for m in midis:
        for dc in (-7, 0, 7):
            sig += saw_additive(hz(m), dur, harmonics=16, bright=bright, detune_cents=dc)
    return sig * env_adsr(n, dur * 0.35, 0.1, 1.0, dur * 0.4) * gain

def strings(midi, dur, gain=0.05, bright=7.0):
    n = int(dur * SR); sig = np.zeros(n)
    for dc in (-9, -3, 4, 10):
        sig += saw_additive(hz(midi), dur, harmonics=28, bright=bright, detune_cents=dc + rng.normal(0, 2), vib=0.004)
    return sig * env_adsr(n, min(1.2, dur * 0.4), 0.2, 0.85, min(1.0, dur * 0.35)) * gain

def piano(midi, dur=4.0, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f0 = hz(midi); sig = np.zeros(n)
    for k in range(1, 12):
        fk = f0 * k * np.sqrt(1 + 0.0004 * k * k)          # string inharmonicity
        if fk > 12000: break
        amp = (1 / k ** 1.2) * (0.6 if k % 2 == 0 else 1.0)
        sig += amp * np.sin(2 * np.pi * fk * t) * np.exp(-t * (0.9 + 0.55 * k) * (1 + (midi - 60) / 48))
    ham = rng.normal(0, 1, n) * np.exp(-t * 90) * 0.04       # felt hammer
    sig = (sig + ham) * (1 - np.exp(-t * 400))
    sig = lowpass_fft(sig, 2200 + 1800 * vel)
    return sig * 0.22 * vel

def pluck(midi, dur=2.2, gain=0.16, bend=0.0):
    """Karplus-Strong pluck with a gayageum-style downward bend (nong-hyeon)."""
    n = int(dur * SR); f = hz(midi); N = int(SR / f)
    buf = rng.uniform(-1, 1, N) * np.hanning(N) ** 0.3
    out = np.zeros(n); decay = 0.996
    # process period by period (vectorised): y[i] = decay * 0.5 * (y[i-N] + y[i-N-1])
    y = np.concatenate([buf, np.zeros(n)])
    for start in range(N, n + N, N):
        end = min(start + N, n + N)
        prev = y[start - N:end - N]; prev1 = y[start - N - 1:end - N - 1] if start - N - 1 >= 0 else np.concatenate([[0], prev[:-1]])
        y[start:end] = decay * 0.5 * (prev + prev1[:len(prev)])
    out = y[:n]
    if bend:  # pitch bend via resampling the tail
        t = np.arange(n); warp = t * (1 - bend * np.clip((t / SR - 0.35) / 0.6, 0, 1))
        out = np.interp(warp, t, out)
    out = lowpass_fft(out, 3500)
    return out * env_adsr(n, 0.002, 0.05, 1.0, 0.4) * gain

def tom(freq=70, dur=1.6, gain=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * (1 + 1.5 * np.exp(-t * 18)); ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 3.2)
    skin = lowpass_fft(rng.normal(0, 1, n), 900) * np.exp(-t * 22) * 0.5
    return (body + skin) * gain

def boom(dur=5.0, gain=0.25):
    """distant artillery: low rumble with slow decay"""
    n = int(dur * SR); t = np.arange(n) / SR
    brown = np.cumsum(rng.normal(0, 1, n)); brown -= np.linspace(brown[0], brown[-1], n); brown /= np.abs(brown).max() + 1e-9
    return lowpass_fft(brown, 140) * np.exp(-t * 1.1) * (1 - np.exp(-t * 30)) * gain

def static(dur, gain=0.02):
    n = int(dur * SR); x = bandpass_fft(rng.normal(0, 1, n), 1200, 5200)
    gate = (rng.random(n // 2205 + 1) < 0.55).repeat(2205)[:n].astype(float)
    gate = np.convolve(gate, np.ones(400) / 400, mode='same')
    crackle = (rng.random(n) < 0.0006) * rng.normal(0, 4, n)
    return (x * (0.35 + 0.65 * gate) + crackle) * gain

def sub(midi, dur, gain=0.12):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(midi) * t) * env_adsr(n, 0.02, 0.2, 0.8, 0.15) * gain

# ---------------- score ----------------
# A minor: i - VI - III - VII ; climax: i - VI - iv - V
PROG_A = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
PROG_B = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
def chord(bar, climax=False): return (PROG_B if climax else PROG_A)[bar % 4]

# intensity per section
INTRO, A, B, CLIMAX, OUTRO = range(0, 8), range(8, 16), range(16, 28), range(28, 36), range(36, 44)

# 1) drone + pads (whole piece)
for bar in range(BARS):
    c = chord(bar, bar in CLIMAX)
    bright = 3.5 if bar in INTRO or bar in OUTRO else 5.5 if bar in A else 7.0
    g = 0.035 if bar in INTRO or bar in OUTRO else 0.05
    add(pad([m - 12 for m in c], BAR * 1.15, bright=bright, gain=g), t_of(bar), pan=0.0)
    add(saw_additive(hz(33), BAR * 1.05, harmonics=6, bright=2.0) * env_adsr(int(BAR * 1.05 * SR), 0.8, 0.1, 1, 0.6) * 0.09, t_of(bar))  # A1 drone

# 2) radio static + distant artillery atmosphere (intro/outro heavier)
for bar in list(INTRO) + list(OUTRO):
    if bar % 2 == 0: add(static(BAR * 1.6, 0.012), t_of(bar, rng.random() * 2), pan=rng.uniform(-0.6, 0.6))
for bar, beat in [(1, 2.5), (4, 1.0), (6, 3.0), (10, 0.5), (13, 2.0), (38, 1.5), (41, 3.0)]:
    add(boom(gain=0.3), t_of(bar, beat), pan=rng.uniform(-0.5, 0.5))

# 3) piano motif — the main theme (bars 2-15, returns in outro)
MOTIF = [(69, 0, 1.5), (72, 1.5, 0.5), (76, 2, 1.0), (74, 3, 1.0),   # A C E D
         (72, 4, 1.5), (69, 5.5, 0.5), (67, 6, 2.0),                   # C A G
         (69, 8, 1.5), (72, 9.5, 0.5), (79, 10, 1.0), (76, 11, 1.0),   # A C G E
         (74, 12, 2.0), (72, 14, 0.5), (71, 14.5, 0.5), (69, 15, 1.0)] # D C B A
def play_motif(start_bar, octave=0, vel=0.8, pan=-0.2):
    for m, beat, dur in MOTIF:
        add(piano(m + octave, dur=max(2.5, dur * BEAT + 1.5), vel=vel * (0.85 + 0.3 * rng.random())), t_of(start_bar, beat), pan=pan)
play_motif(2, vel=0.7); play_motif(6, vel=0.75)
play_motif(10, vel=0.8); play_motif(14, -12, vel=0.6, pan=0.15)
play_motif(36, vel=0.65); play_motif(40, vel=0.5)

# 4) gayageum-like pentatonic ostinato (A minor pentatonic) from section A
PENTA = [57, 60, 62, 64, 67, 69, 72]
for bar in list(A) + list(B) + list(CLIMAX):
    pattern = [0, 4, 2, 5, 3, 4, 1, 5] if bar % 2 == 0 else [0, 3, 2, 4, 5, 3, 2, 1]
    c = chord(bar, bar in CLIMAX); base = c[0] % 12
    for i, idx in enumerate(pattern):
        m = PENTA[idx] + (12 if bar in CLIMAX and i % 4 == 3 else 0)
        bend = 0.03 if i == 7 else 0.0
        add(pluck(m, gain=0.11 if bar in A else 0.13, bend=bend), t_of(bar, i * 0.5), pan=0.45 * (1 if i % 2 else -1) * 0.6)

# 5) strings: long tones in A, melody in B/climax
for bar in A:
    c = chord(bar); add(strings(c[0], BAR * 1.05, gain=0.022), t_of(bar), pan=-0.35); add(strings(c[2], BAR * 1.05, gain=0.018), t_of(bar), pan=0.35)
STR_MEL = [(76, 4), (74, 2), (72, 2), (71, 4), (72, 2), (74, 2), (76, 6), (79, 2), (77, 4), (76, 4), (74, 4), (76, 4)]
def string_melody(start_bar, octave=0, gain=0.03):
    beat = 0
    for m, d in STR_MEL:
        add(strings(m + octave, d * BEAT + 0.4, gain=gain, bright=9), t_of(start_bar, beat), pan=0.1); beat += d
for start in (16, 22):
    string_melody(start, 0, 0.026)
string_melody(28, 0, 0.036); string_melody(28, -12, 0.03); string_melody(32, 12, 0.02)
for bar in list(B) + list(CLIMAX):
    c = chord(bar, bar in CLIMAX)
    for m, pan in ((c[0] - 12, -0.5), (c[1], 0.5), (c[2], -0.2)):
        add(strings(m, BAR * 1.05, gain=0.016 if bar in B else 0.022), t_of(bar), pan=pan)

# 6) bass pulse and war drums (B → climax)
for bar in list(B) + list(CLIMAX):
    c = chord(bar, bar in CLIMAX); root = c[0] - 24
    for i in range(8):
        if bar in B and i % 2: continue
        add(sub(root, BEAT * 0.45, gain=0.10 if bar in CLIMAX else 0.08), t_of(bar, i * 0.5))
    hits = [0, 1.5, 2, 3.5] if bar in CLIMAX else ([0, 2.5] if bar >= 20 else [0])
    for h in hits: add(tom(62 if h % 2 == 0 else 78, gain=0.42 if bar in CLIMAX else 0.3), t_of(bar, h), pan=rng.uniform(-0.3, 0.3))
    if bar in CLIMAX and bar % 2 == 1:
        add(tom(48, 2.5, 0.55), t_of(bar, 3.75))                     # big ensemble hit
for i in range(16):                                                   # snare-roll swell into climax
    add(lowpass_fft(rng.normal(0, 1, int(0.12 * SR)), 4000) * np.exp(-np.arange(int(0.12 * SR)) / SR * 30) * 0.02 * (i / 16 + 0.2), t_of(27, i * 0.25), pan=0.2)

# 7) final swell resolving back into the opening drone for a seamless loop
add(pad([45, 52, 57], BAR * 2.2, bright=3, gain=0.04), t_of(42))

# ---------------- mix ----------------
def reverb(x, seconds=3.2, seed=0):
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = r.normal(0, 1, n) * np.exp(-t * 6.9 / seconds) * (1 - np.exp(-t * 200))
    ir = lowpass_fft(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return y
wetL, wetR = reverb(L, seed=1), reverb(R, seed=2)
outL, outR = L * 0.78 + wetL * 0.42, R * 0.78 + wetR * 0.42
# fold the reverb tail back onto the start so the loop point is seamless
loop_n = int(BARS * BAR * SR); tail = LEN - loop_n
outL[:tail] += outL[loop_n:]; outR[:tail] += outR[loop_n:]
outL, outR = outL[:loop_n], outR[:loop_n]
# gentle glue: soft-knee saturation + normalise to -1 dBFS
st = np.stack([outL, outR], 1); st = np.tanh(st * 1.4) / np.tanh(1.4)
st *= 10 ** (-1 / 20) / np.abs(st).max()
pcm = (st * 32767).astype(np.int16)
out = sys.argv[1] if len(sys.argv) > 1 else 'menu_theme.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'wrote {out}: {loop_n / SR:.1f}s')
