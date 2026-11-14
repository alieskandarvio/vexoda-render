# Music for «مساعد VEXODA»: Mixkit track 744 (Mixkit free licence), 123.05 BPM. The edit's 0 sits on a downbeat of the
# track (src 0.93), so the shot cuts (bars of 1.9505 s) land on the music; the last 1.6 s fade out.
# Writes audio/music.wav (bed) and data/audio.json (beat grid); sfx_mix.py lays the sound design on top → audio/mix.wav.
import json, subprocess
import numpy as np
SR = 48000; BEAT = 60 / 123.047; S0 = 0.93; D = 27.3
raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(S0), '-t', str(D), '-i', 'audio/music-744.mp3', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()
fi = int(0.03 * SR); x[:, :fi] *= np.linspace(0, 1, fi)
fo = int(1.6 * SR); x[:, -fo:] *= np.linspace(1, 0, fo) ** 2
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', 'audio/music.wav'], input=x.T.astype(np.float32).tobytes(), check=True)
n = int(D * 100) + 1; z = [0.0] * n
beats = [round(i * BEAT, 4) for i in range(int(D / BEAT) + 1)]
json.dump({"duration": D, "bpm": 123.047, "beat_period": BEAT, "time_signature": 4, "beats": beats, "downbeats": beats[::4], "sections": [], "fps": 100,
           "rms": z, "vocal": z, "low": z, "mid": z, "high": z, "drums": z, "bass": z, "other": z, "onsets": {"vocal": [], "kick": [], "snare": [], "hat": []},
           "notes": f"music: Mixkit 744 from src {S0}"}, open('data/audio.json', 'w'))
print('ok', D)
