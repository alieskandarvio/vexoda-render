"""Sound design for the voiceover video (starter cue sheet: edit the CUES section).

The cue sheet below is derived from data/lyrics.json — the same word times the plates animate on —
so every effect lands on its visual event. The sounds are the ElevenLabs library in audio/sfx/
(name_1.mp3, name_2.mp3 … alternate takes). Each sound is placed by its transient ('onset'), by its
loudest point ('peak', whooshes), by its end ('end', reverse sucks and risers) or as recorded
('raw', beds). Effects are ducked under the voice, then the whole mix is loudness-normalised.

    uv run --no-project --with numpy python analysis/sfx_mix.py
Writes out/mix.wav (48 kHz stereo) and out/sfx_cues.json; mux with:
    ffmpeg -i out/motion-as-code.mp4 -i out/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest out/…
"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _tools import ROOT, ffmpeg, voiceover  # noqa: E402

SFX = ROOT / "audio" / "sfx"
SR = 48000
DUR = json.loads((ROOT / "data" / "audio.json").read_text(encoding="utf-8"))["duration"]  # the video's length

# ------------------------------------------------------------------ the script
LY = json.loads((ROOT / "data" / "lyrics.json").read_text(encoding="utf-8"))["lines"]
fold = lambda s: s.lower().replace("’", "'").replace("“", '"').replace("”", '"')
norm = lambda s: re.sub(r"[^\w()]|_", "", fold(s))  # letters/digits of any script, as the engine's norm()


def line(q, nth=0):
    ls = [l for l in LY if fold(q) in fold(l["text"])]
    return ls[nth]


def W(lq, wq, nth=0):
    ws = [w for w in line(lq)["words"] if norm(w["w"]) == norm(wq)]
    return ws[nth]


def parts(w):
    return w.get("syl") or [[w["start"], w["end"]]]


def cut(q):
    l = line(q)
    i = LY.index(l)
    gap = l["start"] - LY[i - 1]["end"] if i else 1
    return l["start"] - min(0.18, max(0.04, gap * 0.45))


# ------------------------------------------------------------------ the library
MODE = {  # how a sound is placed relative to its cue time
    "whoosh_fast": "peak", "whoosh_soft": "peak", "reverse_suck": "end", "riser": "end",
    "spark_sizzle": "raw", "projector_run": "raw", "tape_rewind": "raw", "tape_ff": "raw", "scan_sweep": "raw", "spark_zip": "raw",
    "falling_pieces": "onset", "paper_slide": "onset",
}
_cache = {}


def decode(path):
    raw = subprocess.run([ffmpeg(), "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def takes(name):
    if name == "tape_ff":  # the rewind, played backwards: a fast-forward
        return [t[::-1].copy() for t in takes("tape_rewind")]
    if name not in _cache:
        fs = sorted(SFX.glob(f"{name}_*.mp3"))
        if not fs:
            raise FileNotFoundError(f"no takes for {name}")
        out = []
        for f in fs:
            x = decode(f)
            x = x - x.mean()
            # 🔴 LOUDNESS, NOT PEAK: the library's takes differ by 30+ dB in how loud they sound at the same peak
            #    (impact_small_2 is ~25 dB quieter than impact_small_1), so alternating takes made one card hit
            #    loud and the next one vanish. Every take is set by its loudest 100 ms to -14 dBFS RMS (peak capped at
            #    -1 dBFS); a take with nothing in it is dropped.
            w = int(0.1 * SR)
            rms = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode="valid")).max() if len(x) > w else np.sqrt((x ** 2).mean())
            if rms < 10 ** (-48 / 20):
                continue
            g = min(10 ** (-14 / 20) / rms, 10 ** (-1 / 20) / (np.abs(x).max() + 1e-9))
            out.append((x * g).astype(np.float32))
        if not out:
            raise FileNotFoundError(f"only silent takes for {name}")
        _cache[name] = out
    return _cache[name]


def onset(x):
    """Start of the main transient: the first sample above half the peak, less 8 ms of attack
    (a soft pre-noise before the hit must not shift the hit off its frame)."""
    a = np.abs(x)
    idx = np.where(a > 0.5 * a.max())[0]
    return max(0, int(idx[0]) - int(0.008 * SR)) if len(idx) else 0


def peak_at(x):
    env = np.convolve(np.abs(x), np.ones(int(0.02 * SR)) / (0.02 * SR), mode="same")
    return int(np.argmax(env))


def resample(x, rate):
    if abs(rate - 1) < 1e-4:
        return x
    n = int(len(x) / rate)
    return np.interp(np.arange(n) * rate, np.arange(len(x)), x).astype(np.float32)


# ------------------------------------------------------------------ cues
CUES = []
_n = {}


def cue(t, name, db, pan=0.0, rate=1.0, take=None, length=None, fade=0.03, mode=None):
    """Place `name` at time t (seconds). take: 1-based take index (default: alternate)."""
    k = _n.get(name, 0)
    _n[name] = k + 1
    CUES.append(dict(t=float(t), name=name, db=float(db), pan=float(pan), rate=float(rate), take=take if take else None, k=k, length=length, fade=fade, mode=mode or MODE.get(name, "onset")))


def bed(name, t0, t1, db, pan=0.0, rate=1.0, fin=0.06, fout=0.12):
    CUES.append(dict(t=float(t0), name=name, db=float(db), pan=float(pan), rate=float(rate), take=1, k=0, length=float(t1 - t0), fade=fout, fin=fin, mode="bed"))


def jitter(i, a=0.05):
    """Deterministic ±a pitch jitter for repeated sounds."""
    return 1.0 + a * (((i * 7919) % 101) / 50.0 - 1.0)


def typing(name, t0, t1, db, pan=0.0, step=0.075, start=0):
    """Key strikes from t0 to t1 at ~step intervals (with a little swing)."""
    t, i = t0, start
    while t < t1 - 0.01:
        cue(t, name, db + (((i * 37) % 7) - 3) * 0.6, pan=pan, rate=jitter(i))
        t += step * (0.8 + 0.4 * (((i * 53) % 11) / 10.0))
        i += 1
    return i


def type_words(name, words, db, pan=0.0, frac=0.75, per=2.6):
    """Key clicks for words typed as they are said: ~one strike per `per` chars, over frac of each word."""
    i = 0
    for w in words:
        n = max(1, round(len(w["w"]) / per))
        d = max(0.08, (w["end"] - w["start"]) * frac)
        for j in range(n):
            cue(w["start"] + d * j / n, name, db + (((i * 37) % 7) - 3) * 0.5, pan=pan, rate=jitter(i))
            i += 1


# ================================================================== CUES — «التردّد مكلف» / «Hesitation is expensive»
# Light, clean UI sounds only; every cue keys to the line / word its plate animates on (by line index, so the
# Arabic and the English cut share this sheet). The clock ticks on the music's beats, like the plate's hand.
BIG, SMALL, SWOOSH, SOFT, UI, TINY, RISE = -1, -7, -6, -9, -9, -14, -5
P = lambda i: LY[i]
Wd = lambda i, j: LY[i]["words"][j]
def cutI(i):
    l, prev = LY[i], LY[i - 1] if i else None
    gap = l["start"] - prev["end"] if prev else 1
    return max(0.0, l["start"] - min(0.18, max(0.04, gap * 0.45)))
AUD = json.loads((ROOT / "data" / "audio.json").read_text(encoding="utf-8"))
BEATS = AUD["beats"]
ACC0 = 1 if len(LY[0]["words"]) == 2 else 2           # the costly word: «مكلف.» / «expensive.»
# SH0 · the hook: the arcs draw in, the hook lands, the costly word, three little «$»
cue(0.02, "whoosh_soft", SOFT, rate=0.9)
cue(Wd(0, 0)["start"] - 0.04, "impact_small", SMALL + 1)
cue(Wd(0, ACC0)["start"], "ui_dry_pop", UI)
for i in range(3): cue(Wd(0, ACC0)["start"] + 0.12 + i * 0.16, "ui_blip", TINY - 2, pan=0.2 * (i - 1), rate=jitter(i, 0.08))
# SH1 · the dial: a whip in, then one tick per beat
c1, c2 = cutI(1), cutI(2)
cue(c1 - 0.03, "whoosh_fast", SWOOSH, take=1)
for b in BEATS:
    if c1 + 0.05 <= b < c2 - 0.05: cue(b, "ui_tick", TINY + 2, rate=1.0 + 0.04 * ((int(b * 10)) % 3))
# SH2 · the chart: whip, the tape running, the frame locking
c3 = cutI(3)
cue(c2 - 0.03, "whoosh_fast", SWOOSH, take=2)
cue(c2 + 0.05, "scan_sweep", TINY - 1, length=max(0.4, c3 - c2 - 0.1), pan=0.2)
cue(c2 + 0.33, "ui_blip", UI, take=1)
# SH3 · the ring fills over its line; a small hit when the second is gone
c4 = cutI(4)
cue(c3 - 0.03, "whoosh_soft", SOFT)
cue(P(3)["end"] + 0.15, "riser", RISE - 6)
cue(P(3)["end"] + 0.16, "impact_small", SMALL)
# SH4 · one pop per hexagon, one blip per callout
for k in range(3):
    t0 = P(4 + k)["start"] - 0.05
    cue(t0, "ui_dry_pop", UI + 1, pan=[0.3, -0.3, 0.0][k], rate=jitter(k, 0.06))
    cue(t0 + 0.3, "ui_blip", TINY, pan=[0.3, -0.3, 0.0][k], take=1 + k % 2)
# SH5 · the glowing words
c7 = cutI(7)
cue(c7 - 0.02, "whoosh_soft", SOFT)
for j, w in enumerate(P(7)["words"]): cue(w["start"] - 0.02, "spark_zip", TINY - 1, length=0.35, rate=1.0 + 0.08 * j)
# SH6 · the italic wiped in
cue(P(8)["start"] - 0.06, "whoosh_soft", SOFT - 1, rate=1.1)
# SH7 · the turn on the music's lift; one pop per pill
cue(P(9)["start"], "impact_slam", BIG - 3)
cue(P(9)["start"] + 0.01, "ui_msg_pop", UI)
for k, i in enumerate(range(10, 15)):
    cue(P(i)["start"] - 0.03, "ui_msg_pop" if k % 2 else "ui_dry_pop", UI, pan=0.25 if k % 2 else -0.25, rate=jitter(k + 3, 0.05))
# SH8 · the sentence ticks in word by word; the push; the ellipse drawn; the payoff
c15 = cutI(15)
cue(c15 - 0.03, "whoosh_soft", SOFT)
for j, w in enumerate(P(15)["words"]): cue(w["start"], "ui_tick", TINY, rate=1.0 + 0.05 * j)
cue(P(16)["start"] - 0.1, "whoosh_fast", SWOOSH, take=1)
cue(P(16)["start"] + 0.02, "impact_small", SMALL + 2)
cue(P(16)["start"] + 0.14, "spark_zip", SOFT - 2, length=0.55)
# SH9 · the lockup
c17 = cutI(17)
cue(c17 - 0.03, "whoosh_soft", SOFT)
vx = P(17)["words"][-1]
cue(vx["start"] - 0.02, "impact_slam", BIG - 2)
cue(vx["start"] + 0.12, "spark_zip", SOFT, length=0.5)
cue(vx["start"] + 0.62, "ui_positive", TINY + 1)

# ------------------------------------------------------------------ the music bed: Mixkit 474 (122.87 BPM) from S0, its full
# section entering on the turn; the last 2.2 s close down through a low-pass.
MUSIC = ROOT / "audio" / "music-474.mp3"
S0 = AUD["music_src0"]
SECTIONS = [
    (0.0, DUR, S0, lambda t: None if t < DUR - 2.4 else 16000 * (220 / 16000) ** ((t - (DUR - 2.4)) / 2.4), 0.0),
]


def decode_st(path):
    raw = subprocess.run([ffmpeg(), "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()


def lowpass_auto(x, t0, fc):
    """STFT low-pass with a time-varying cutoff fc(t) (Hz); x: (2, n), t0: its start time."""
    nfft, hop = 2048, 512
    win = np.hanning(nfft).astype(np.float32)
    n = x.shape[1]
    out = np.zeros_like(x)
    norm = np.zeros(n, np.float32)
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    for i in range(0, n, hop):
        seg = np.zeros((2, nfft), np.float32)
        m = min(nfft, n - i)
        seg[:, :m] = x[:, i:i + m]
        c = fc(t0 + (i + nfft / 2) / SR)
        mask = 1.0 if c is None else 1 / np.sqrt(1 + (freqs / max(40.0, c)) ** 8)
        y = np.fft.irfft(np.fft.rfft(seg * win, axis=1) * mask, n=nfft, axis=1).astype(np.float32)
        out[:, i:i + m] += y[:, :m] * win[:m]
        norm[i:i + m] += win[:m] ** 2
    return out / np.maximum(norm, 1e-3)


def music_bus(n):
    src = decode_st(MUSIC)
    bus = np.zeros((2, n), np.float32)
    xf = int(0.012 * SR)
    for (d0, d1, s0, fc, gdb) in SECTIONS:
        i0, i1 = int(round(d0 * SR)), min(n, int(round(d1 * SR)))
        j0 = int(round(s0 * SR))
        seg = np.zeros((2, i1 - i0), np.float32)
        a, b = max(0, j0), min(src.shape[1], j0 + (i1 - i0))
        if b > a:
            seg[:, a - j0:b - j0] = src[:, a:b]
        if fc is not None:
            seg = lowpass_auto(seg, d0, fc)
        seg *= 10 ** (gdb / 20)
        seg[:, :xf] *= np.linspace(0, 1, xf)[None, :]
        seg[:, -xf:] *= np.linspace(1, 0, xf)[None, :]
        bus[:, i0:i1] += seg
    # a short reverb-ish tail after the last section fade (the pad rings out)
    return bus


# ------------------------------------------------------------------ render the mix
def main():
    n = int(DUR * SR)
    bus = np.zeros((2, n), np.float32)
    report = []
    for c in CUES:
        tk = takes(c["name"])
        x = tk[(c["take"] - 1) % len(tk)] if c["take"] else tk[c["k"] % len(tk)]
        x = resample(x, c["rate"])
        mode = c["mode"]
        if mode == "onset":
            x = x[onset(x):]
            start = c["t"]
        elif mode == "peak":
            start = c["t"] - peak_at(x) / SR
        elif mode == "end":
            start = c["t"] - len(x) / SR
        else:
            start = c["t"]
        if mode == "bed":
            L = int(c["length"] * SR)
            reps = int(np.ceil(L / len(x))) + 1
            x = np.tile(x, reps)[:L].copy()
            fi = int(c.get("fin", 0.06) * SR)
            if fi:
                x[:fi] *= np.linspace(0, 1, fi)
        if c.get("length") and mode != "bed":
            x = x[: int(c["length"] * SR)].copy()
        fo = min(len(x), int(c["fade"] * SR))
        if fo > 1:
            x[-fo:] *= np.linspace(1, 0, fo)
        g = 10 ** (c["db"] / 20)
        a = (c["pan"] + 1) * np.pi / 4
        i0 = int(round(start * SR))
        j0 = max(0, -i0)
        i0 = max(0, i0)
        seg = x[j0:]
        m = min(len(seg), n - i0)
        if m <= 0:
            continue
        bus[0, i0:i0 + m] += seg[:m] * g * np.cos(a)
        bus[1, i0:i0 + m] += seg[:m] * g * np.sin(a)
        report.append({**{k: c[k] for k in ("t", "name", "db", "pan", "rate", "mode")}, "start": round(start, 3)})
    # the voice
    vo = decode(voiceover())[:n]
    vo = np.pad(vo, (0, n - len(vo)))
    # ducking: effects dip up to 7 dB while the voice is speaking (10 ms attack, 180 ms release)
    hop = int(0.005 * SR)
    env = np.sqrt(np.convolve(vo ** 2, np.ones(hop * 4) / (hop * 4), mode="same"))
    env = env / (np.percentile(env, 99) + 1e-9)
    sm = np.zeros_like(env)
    a_att, a_rel = np.exp(-1 / (0.010 * SR)), np.exp(-1 / (0.180 * SR))
    prev = 0.0
    for i in range(0, n, hop):  # one-pole follower at 5 ms steps
        e = float(env[i])
        coef = a_att if e > prev else a_rel
        coef = coef ** hop
        prev = coef * prev + (1 - coef) * e
        sm[i:i + hop] = prev
    duck = 10 ** (-4 * np.clip(sm, 0, 1) / 20)   # effects dip a steady 4 dB under the voice (7 made equal cues unequal)
    mduck = 10 ** (-7 * np.clip(sm * 1.4, 0, 1) / 20)
    mus = music_bus(n)
    m_rms = float(np.sqrt((mus ** 2).mean())) + 1e-9; v_rms = float(np.sqrt((vo ** 2).mean())) + 1e-9
    mus *= (v_rms / m_rms) * 10 ** (-7.5 / 20)   # the bed sits ~7.5 dB under the voice before ducking (an upbeat bed, as in the reference)
    mix = bus * duck[None, :] + mus * mduck[None, :] + vo[None, :]
    peak = np.abs(mix).max()
    if peak > 0.99:
        mix *= 0.99 / peak
    (ROOT / "out").mkdir(exist_ok=True)
    out = ROOT / "out" / "mix_raw.wav"
    import wave
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
    with wave.open(str(out), "wb") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    (ROOT / "out" / "sfx_cues.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    sfx_rms = float(np.sqrt((bus ** 2).mean())); vo_rms = float(np.sqrt((vo ** 2).mean()))
    print(f"{len(report)} cues; SFX bus {20*np.log10(sfx_rms+1e-9):.1f} dB RMS vs voice {20*np.log10(vo_rms+1e-9):.1f} dB RMS; mix peak {20*np.log10(peak+1e-9):.1f} dBFS")
    # loudness: two-pass loudnorm to -14 LUFS, true peak -1.5
    meas = subprocess.run([ffmpeg(), "-hide_banner", "-i", str(out), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(meas[meas.rindex("{"): meas.rindex("}") + 1])
    af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
          f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", str(out), "-af", af, "-ar", str(SR), str(ROOT / "out" / "mix.wav")], check=True)
    import shutil; shutil.copy(ROOT / "out" / "mix.wav", ROOT / "audio" / "mix.wav")
    print(f"input {j['input_i']} LUFS -> -14 LUFS; wrote out/mix.wav")


if __name__ == "__main__":
    main()
