# One-minute video-podcast cut (pod1): every clip is lip-synced to the SAME 60.6 s timeline, so the edit only picks
# which picture plays when. Sources: W = the two-shot (InfiniteTalk Multi), SA/SB = Samer close-ups, LA/LB/LC = Layla
# close-ups (InfiniteTalk), CA/CB = the gold charts (stills with a slow push). Sound = the finished mix of the window.
import json, subprocess, sys
D = 60.6
SRC = {'W': ('clips/wide.mp4', 0.0), 'SA': ('clips/samer-a.mp4', 4.5), 'SB': ('clips/samer-b.mp4', 13.5),
       'LA': ('clips/layla-a.mp4', 8.6), 'LB': ('clips/layla-b.mp4', 35.9), 'LC': ('clips/layla-c.mp4', 49.7)}
EDL = [  # (from, to, source) on the window's clock
    (0.00, 4.80, 'W'), (4.80, 7.60, 'SA'), (7.60, 9.20, 'W'), (9.20, 13.90, 'LA'), (13.90, 16.80, 'SB'),
    (16.80, 20.80, 'LA'), (20.80, 28.60, 'CA'), (28.60, 31.40, 'SB'), (31.40, 33.30, 'W'), (33.30, 36.20, 'SB'),
    (36.20, 40.60, 'LB'), (40.60, 49.90, 'CB'), (49.90, 53.20, 'LC'), (53.20, 55.90, 'W'), (55.90, 59.60, 'LC'), (59.60, D, 'W')]
OVL = [('gfx/ltS.png', 4.95, 7.45), ('gfx/ltL.png', 9.35, 13.75)]   # name captions, each on that host's first close-up
inputs, chains, labels = [], [], []
def add_input(args):
    inputs.extend(args); return len([a for a in inputs if a == '-i']) - 1
src_idx = {k: add_input(['-i', f]) for k, (f, _) in SRC.items()}
img_idx = {'CA': add_input(['-loop', '1', '-framerate', '30', '-i', 'gfx/chartA.png']), 'CB': add_input(['-loop', '1', '-framerate', '30', '-i', 'gfx/chartB.png'])}
bug = add_input(['-loop', '1', '-framerate', '30', '-i', 'gfx/bug.png'])
ovl = [add_input(['-loop', '1', '-framerate', '30', '-i', f]) for f, a, b in OVL]
aud = add_input(['-i', 'mix-window.wav'])
GRADE = "eq=contrast=1.04:saturation=0.97:gamma=0.98,vignette=PI/5"
for n, (a, b, s) in enumerate(EDL):
    d = b - a
    if s in ('CA', 'CB'):
        # the chart: a slow push-in, as if the editor cut to the screen
        chains.append(f"[{img_idx[s]}:v]trim=duration={d:.3f},setpts=PTS-STARTPTS,scale=2112:1188,"
                      f"crop=1920:1080:x='96*(1-t/{d:.3f})':y='54*(1-t/{d:.3f})',fps=30,format=yuv420p[s{n}]")
    else:
        idx, off = src_idx[s], SRC[s][1]
        t0 = a - off
        # a gentle push-in on every camera shot (a real operator never holds perfectly still)
        nf = max(1, round(d * 30))
        chains.append(f"[{idx}:v]trim=start={t0:.3f}:duration={d:.3f},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,"
                      f"zoompan=z='1+0.018*on/{nf}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,{GRADE},format=yuv420p[s{n}]")
    labels.append(f"[s{n}]")
chains.append(''.join(labels) + f"concat=n={len(EDL)}:v=1:a=0[cut]")
cur = 'cut'
chains.append(f"[{bug}:v]trim=duration={D},format=rgba,colorchannelmixer=aa=0.85[bugv]")
chains.append(f"[{cur}][bugv]overlay=0:0:shortest=1[v0]"); cur = 'v0'
for k, (f, a, b) in enumerate(OVL):
    chains.append(f"[{ovl[k]}:v]trim=duration={D},format=rgba,fade=t=in:st={a}:d=0.3:alpha=1,fade=t=out:st={b - 0.3}:d=0.3:alpha=1[o{k}]")
    chains.append(f"[{cur}][o{k}]overlay=0:0:enable='between(t,{a},{b})'[v{k + 1}]"); cur = f'v{k + 1}'
chains.append(f"[{cur}]noise=alls=5:allf=t,fade=t=in:st=0:d=0.4,fade=t=out:st={D - 0.6}:d=0.6[vout]")
chains.append(f"[{aud}:a]atrim=duration={D},afade=t=in:d=0.25,afade=t=out:st={D - 0.6}:d=0.6[aout]")
cmd = ['ffmpeg', '-v', 'error', '-y'] + inputs + ['-filter_complex', ';'.join(chains), '-map', '[vout]', '-map', '[aout]', '-t', str(D),
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', sys.argv[1]]
print(' '.join(cmd[:8]), '…'); subprocess.run(cmd, check=True)
