# Sound design for «مساعد VEXODA» on top of the music bed (audio/music.wav): one sound per visual event, digital palette,
# every take levelled by its loudest 100 ms (-14 dBFS RMS) then set per kind. Writes audio/mix.wav at -14 LUFS.
import glob, subprocess
import numpy as np
SR = 48000; BEAT = 60 / 123.047; BAR = 4 * BEAT
S1 = 7.802 - 3.32; S2 = S1 + 4.3; S3 = BAR * 6; S4 = BAR * 7.5; S5 = BAR * 9; S6 = BAR * 10.5; S7 = BAR * 11.5
def dec(p, ch=1):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).copy()
    return x.reshape(-1, ch).T if ch > 1 else x
cache = {}
def take(name, k=0):
    if name not in cache:
        out = []
        for f in sorted(glob.glob(f'audio/sfx/{name}_*.mp3')):
            x = dec(f); x -= x.mean(); w = int(0.1 * SR)
            rms = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, 'valid')).max() if len(x) > w else np.sqrt((x ** 2).mean())
            if rms < 1e-4: continue
            out.append(x * min(10 ** (-14 / 20) / rms, 10 ** (-1 / 20) / (np.abs(x).max() + 1e-9)))
        cache[name] = out
    return cache[name][k % len(cache[name])]
music = dec('audio/music.wav', 2)
N = music.shape[1]
bus = np.zeros((2, N), np.float32)
def cue(t, name, db, pan=0.0, k=0, length=None, onset=True):
    x = take(name, k)
    if onset:
        a = np.abs(x); idx = np.where(a > 0.5 * a.max())[0]; x = x[max(0, idx[0] - int(0.008 * SR)):] if len(idx) else x
    if length: x = x[:int(length * SR)].copy(); f = int(0.05 * SR); x[-f:] *= np.linspace(1, 0, f)
    i0 = int(t * SR); i1 = min(N, i0 + len(x))
    if i1 <= i0: return
    g = 10 ** (db / 20); l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    bus[0, i0:i1] += x[:i1 - i0] * g * l * 1.414; bus[1, i0:i1] += x[:i1 - i0] * g * r * 1.414
SOFT, UI, TINY, SW = -12, -11, -17, -9
# S0
cue(0.02, 'whoosh_soft', SOFT); cue(2.38, 'whoosh_soft', SOFT - 2, pan=-0.3)
# S1 — the prompt
cue(S1 + 0.02, 'scan_sweep', TINY, length=0.9)
for i in range(4): cue(S1 + 0.72 + 0.07 * i, 'ui_dry_pop', UI - 2, pan=0.3 - 0.2 * i)
for i in range(5): cue(S1 + 1.25 + i * (1.05 / 5), 'key_click', TINY + 1 + ((i * 37) % 5 - 2) * 0.6, pan=0.1 * ((i % 3) - 1), k=i)   # «الذهب»: five letters
cue(S1 + 2.5, 'whoosh_soft', TINY)
cue(S1 + 3.32, 'mouse_click', UI + 2)
cue(S1 + 3.36, 'ui_scifi_confirm', UI)
cue(S1 + 3.95, 'whoosh_fast', SW, k=0)
# S2 — analysing
cue(S2, 'impact_small', UI)
cue(S2 + 0.15, 'typing_laptop', TINY - 2, length=2.3)
# S3 — the cards
cue(S3 - 0.42, 'whoosh_fast', SW, k=1)
for i, dt in enumerate((0.45, 0.6, 0.8)): cue(S3 + dt, 'ui_dry_pop', UI - 1, pan=(-0.3, 0.3, 0)[i])
cue(S3 + 0.9, 'ui_blip', TINY)
# S4 — the trade organised
cue(S4 - 0.36, 'whoosh_fast', SW, k=0)
cue(S4 + 0.3, 'spark_ignite', UI - 2)
for i, dt in enumerate((0.83, 1.08, 1.33)): cue(S4 + dt, 'ui_tick', UI - 1, pan=(-0.2, 0.2, 0)[i])
# S5 — the spark, the ring, the pill, the world
cue(S5, 'spark_ignite', UI - 1)
cue(S5 + 0.35, 'spark_zip', TINY, length=0.6)
cue(S5 + 1.15, 'ui_confirm', UI)
for i in range(8): cue(S5 + 1.35 + 0.05 * i, 'ui_blip', TINY - 2, pan=np.cos(i * np.pi / 4) * 0.6, k=i)
# S6, S7
cue(S6, 'whoosh_soft', SOFT)
cue(S7 + 0.05, 'confirm_chime', UI)
mix = music * 10 ** (-3 / 20) + bus
tmp = 'audio/_mix.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', tmp], input=mix.T.astype(np.float32).tobytes(), check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', str(SR), 'audio/mix.wav'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'audio/mix.wav', '-b:a', '256k', 'audio/voiceover.mp3'], check=True)
import os; os.remove(tmp); print('wrote audio/mix.wav')
