#!/usr/bin/env python3
"""Cut the downloaded OpenGameArt sound packs into game-ready one-shot samples.

usage: python3 tools/build_sfx.py <extracted-packs-dir>
Writes assets/sfx/<bank>_<n>.mp3 (mono 44.1 kHz) and assets/sfx/manifest.json ({bank: count}).
Sources and licences: assets/CREDITS.md (Sound effects section). Needs ffmpeg + numpy.

Shots are cut from multi-shot field recordings at each muzzle report (a shot is kept only when the
next one is far enough away that its tail is clean), trimmed with a fade, and loudness-matched within
the bank. Reload foley is cut at hand-picked spans (mag out / mag in / bolt or slide) so the game can
time each part to the reload animation.
"""
import json, os, subprocess, sys
import numpy as np

SR = 44100
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')


def load(rel):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SRC, rel), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def peaks(x, mindb=10, sep=0.45):
    h = int(SR * 0.003); n = len(x) // h
    db = 20 * np.log10(np.array([np.abs(x[i * h:(i + 1) * h]).max() for i in range(n)]) + 1e-9)
    chosen = []
    for i in np.argsort(-db):
        if db[i] < db.max() - mindb: break
        t = i * h / SR
        if all(abs(t - c) > sep for c in chosen): chosen.append(t)
    out = []
    for t in sorted(chosen):   # walk back to the start of the attack
        i = int(t * SR); pk = np.abs(x[i:i + int(SR * 0.01)]).max(); j = i
        while j > 0 and np.abs(x[max(0, j - 64):j]).max() > pk * 0.1 and i - j < SR * 0.03: j -= 64
        out.append(j / SR)
    return out


def cut(x, a, b, fade=0.25, pre=0.004):
    s = x[max(0, int((a - pre) * SR)):int(b * SR)].copy()
    s -= s.mean()
    fi = int(pre * SR); s[:fi] *= np.linspace(0, 1, fi) if fi else 1
    fo = min(len(s), int(fade * SR)); s[-fo:] *= np.linspace(1, 0, fo) ** 2
    return s


def norm(clips, peak_db=-1.0, match=True):
    # loudness-match on the first 120 ms (the report), then bring the loudest to peak_db
    if match:
        r = [np.sqrt((c[:int(SR * 0.12)] ** 2).mean()) for c in clips]; ref = np.median(r)
        clips = [c * min(3.0, ref / max(v, 1e-6)) for c, v in zip(clips, r)]
    g = 10 ** (peak_db / 20) / max(np.abs(c).max() for c in clips)
    return [c * g for c in clips]


def write(bank, clips, manifest):
    for i, c in enumerate(clips):
        p = os.path.join(OUT, f'{bank}_{i}.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '96k', p], input=np.clip(c, -1, 1).astype(np.float32).tobytes(), check=True)
    manifest[bank] = len(clips)
    print(f'{bank}: {len(clips)} ({", ".join(f"{len(c) / SR:.2f}s" for c in clips)})')


def shots(rel, length, gap, maxn, fade=0.35, mindb=10, minpk=0.5, tail=0.88):
    x = load(rel); t = peaks(x, mindb=mindb)
    keep = [a for k, a in enumerate(t) if (k + 1 == len(t) or t[k + 1] - a >= gap) and (k == 0 or a - t[k - 1] >= 0.3)]
    top = np.abs(x).max(); out = []
    for a in keep:
        c = cut(x, a, min(a + length, len(x) / SR), fade); pk = np.abs(c[:int(SR * 0.03)]).max()
        if pk < top * minpk: continue                                   # a bolt cycle or a far shot, not a report
        if np.abs(c[int(SR * 0.12):]).max() > pk * tail: continue     # a second shot inside the tail
        out.append(c)
    return out[:maxn]


def spans(rel, ranges, fade=0.04):
    x = load(rel); return [cut(x, a, b, fade, pre=0.0) for a, b in ranges]


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.mp3'): os.remove(os.path.join(OUT, f))
    m = {}
    # gunshots — field recordings (tabasco, CC0): SKS for rifles, Mosin for the heavy MG / cannon report, CZ pistol
    write('rifle', norm(shots('sounds/sounds/sks.wav', 1.0, 0.8, 8)), m)
    write('heavy', norm(shots('sounds/sounds/mosin.wav', 1.1, 1.0, 6, mindb=6, minpk=0.75)), m)
    write('pistol', norm(shots('sounds/sounds/cz.wav', 0.9, 0.4, 5, tail=1.05)), m)
    # explosions (qubodup CC-BY 3.0; lamoot CC-BY 3.0)
    write('explosion', norm([load('explosions/explosions/explode.wav'), load('explosions/explosions/explodemini.wav'), load('DeathFlash.flac')], match=False), m)
    # reload foley (springyspringo CC0, zer0sol CC0, starninjas CC0)
    write('rifle_magout', norm(spans('gunreload1.wav', [(0.03, 0.32)]) + spans('assaultriflereload1_0.wav', [(0.07, 0.32)]), -3), m)
    write('rifle_magin', norm(spans('assaultriflereload1_0.wav', [(1.0, 1.15)]) + spans('starninjas/gun_reload.1.ogg', [(0.28, 0.62)]), -3), m)
    write('rifle_charge', norm(spans('gunreload1.wav', [(1.12, 1.58)], 0.2) + spans('assaultriflereload1_0.wav', [(1.15, 1.556)], 0.2), -2), m)
    write('pistol_magout', norm(spans('reload.wav', [(0.04, 0.3)]) + spans('starninjas/gun_reload.2.ogg', [(0.0, 0.36)]), -4), m)
    write('pistol_magin', norm(spans('reload.wav', [(0.35, 0.62)]) + spans('starninjas/gun_reload.2.ogg', [(0.46, 0.86)]), -3), m)
    write('pistol_slide', norm(spans('reload.wav', [(0.74, 1.05)], 0.15) + spans('starninjas/gun_reload.2.ogg', [(1.04, 1.36)], 0.15), -3), m)
    # footsteps (congusbongus CC-BY 3.0; metal: thimras CC0; snow: Corsica_S / qubodup CC0)
    fs = 'footsteps_0/footsteps'
    for surf, d in [('concrete', 'boots'), ('gravel', 'gravel'), ('dirt', 'grass'), ('wood', 'wood'), ('tile', 'tile'), ('water', 'water')]:
        files = sorted(f for f in os.listdir(os.path.join(SRC, fs, d)) if f.endswith('.ogg'))
        write(f'step_{surf}', norm([load(f'{fs}/{d}/{f}') for f in files], -6), m)
    files = sorted(os.listdir(os.path.join(SRC, 'metal_steps_48k24b')))[:12]
    write('step_metal', norm([load(f'metal_steps_48k24b/{f}') for f in files], -6), m)
    sd = 'snow/Corsica_S-Walking_in_Snow'
    files = sorted(f for f in os.listdir(os.path.join(SRC, sd)) if f.endswith('.flac') and 'ice' not in f)[:12]
    snow = []
    for f in files:   # each file is one step with some lead-in; keep from the attack, 0.35 s
        x = load(f'{sd}/{f}'); a = peaks(x, mindb=3, sep=1.0)[0]; snow.append(cut(x, a, a + 0.35, 0.12, pre=0.02))
    write('step_snow', norm(snow, -6), m)
    json.dump(m, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


main()
