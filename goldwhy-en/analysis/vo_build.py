# The voiceover: cut the chosen Gemini TTS take (Charon) to the script (its spoken style prefix and the click it ends
# with are cut away), place it at VO_AT in the edit, and time every on-screen word from the take's Groq whisper-large-v3
# word stamps (aligned to data/script.txt token by token, by spelling, so a mis-heard word keeps the script's form).
# Writes audio/voiceover-src.wav (48 kHz mono, the edit's clock) and data/lyrics.json.
import json, re, subprocess, sys, unicodedata, difflib
TAKE, A, Z, VO_AT = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
GAPS = {int(k): float(v) for k, v in json.loads(sys.argv[5]).items()} if len(sys.argv) > 5 else {}   # extra breath (s) before a line
SR = 48000
def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    s = re.sub(r'[إأآا]', 'ا', s).replace('ة', 'ه').replace('ى', 'ي')
    s = s.lower().replace('vexoda', 'فيكسودا') if False else s.lower()
    return re.sub(r'[^ء-يa-z0-9]', '', s)
ALIAS = {'vexoda': ['فيكسودا', 'فكسودا', 'فكسوده', 'فيكسوده', 'vexoda', 'vexota']}
W = json.load(open(TAKE + '.words.json'))['words']
W = [w for w in W if A - 0.05 <= w['start'] < Z]
lines = [l.strip() for l in open('data/script.txt', encoding='utf-8') if l.strip()]
toks = [(li, t) for li, l in enumerate(lines) for t in l.split()]
def key(s):
    n = norm(s)
    for k, al in ALIAS.items():
        if n in [norm(a) for a in al]: return k
    return n
a = [key(t) for _, t in toks]; b = [key(w['word']) for w in W]
sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
times = [None] * len(toks)
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
        for k in range(i2 - i1): times[i1 + k] = (W[j1 + k]['start'], W[j1 + k]['end'])
    elif tag == 'replace':   # n script tokens heard as m words: spread the span evenly
        s0, s1 = W[j1]['start'], W[j2 - 1]['end']
        for k in range(i2 - i1): times[i1 + k] = (s0 + (s1 - s0) * k / (i2 - i1), s0 + (s1 - s0) * (k + 1) / (i2 - i1))
    if tag != 'equal': print('ALIGN', tag, [toks[i][1] for i in range(i1, i2)], [W[j]['word'] for j in range(j1, j2)])
miss = [toks[i][1] for i, t in enumerate(times) if t is None]
if miss: raise SystemExit(f'unaligned: {miss}')
# breaths: silence inserted in the middle of the pause before a line; every later word moves with it
splits = []
for li, g in sorted(GAPS.items()):
    i0 = next(i for i in range(len(toks)) if toks[i][0] == li)
    splits.append(((times[i0 - 1][1] + times[i0][0]) / 2, g))
def shift(x):
    return x + sum(g for s, g in splits if x >= s)
times = [(shift(a_), shift(b_)) for a_, b_ in times]
# a word never swallows the pause after it (whisper stretches line-final words): cap at 0.75 s
out = []
for li, l in enumerate(lines):
    ws = [{'w': toks[i][1], 'start': round(times[i][0] - A + VO_AT, 3), 'end': round(min(times[i][1], times[i][0] + 0.75) - A + VO_AT, 3)} for i in range(len(toks)) if toks[i][0] == li]
    out.append({'text': l, 'start': ws[0]['start'], 'end': ws[-1]['end'], 'words': ws})
json.dump({'source': f'{TAKE} {A}-{Z} @ {VO_AT}', 'lines': out}, open('data/lyrics.json', 'w'), ensure_ascii=False, indent=1)
import numpy as np, wave
w = wave.open(TAKE + '.wav'); sr0 = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
x = x[int(A * sr0):int(Z * sr0)].copy()
fi, fo = int(0.02 * sr0), int(0.06 * sr0)
x[:fi] *= np.linspace(0, 1, fi); x[-fo:] *= np.linspace(1, 0, fo)
pieces, last = [np.zeros(int(VO_AT * sr0), np.float32)], 0
for s_, g in splits:
    k = int((s_ - A) * sr0); pieces += [x[last:k], np.zeros(int(g * sr0), np.float32)]; last = k
pieces.append(x[last:])
y = np.concatenate(pieces)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr0), '-ac', '1', '-i', '-', '-ar', str(SR), 'audio/voiceover-src.wav'], input=y.tobytes(), check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'audio/voiceover-src.wav', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', 'audio/voiceover.mp3'], check=True)
Z = A + len(y) / sr0 - VO_AT
for l in out: print(f"{l['start']:6.2f}-{l['end']:6.2f}  {l['text']}")
print('vo ends', round(Z - A + VO_AT, 2))
