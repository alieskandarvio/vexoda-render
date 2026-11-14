# The music's beat grid for the plates (data/audio.json). Mixkit 469 (Mixkit free licence), 123 BPM, beats at
# src 0.0203 + k·0.4878 s; its fuller section enters on the downbeat at src 15.63. S0 places that lift on the first
# market. The bed itself is laid by sfx_mix.py (music_bus), from the same S0.
import json, sys
S0, D = float(sys.argv[1]), float(sys.argv[2])
P, PH = 0.4878, 0.0203
beats, k = [], 0
while PH + k * P - S0 < D:
    e = PH + k * P - S0
    if e >= 0: beats.append(round(e, 4))
    k += 1
down = [b for b in beats if round((b + S0 - PH) / P) % 4 == 0]
z = [0.0] * (int(D * 100) + 1)
json.dump({"duration": D, "bpm": 60 / P, "beat_period": P, "time_signature": 4, "beats": beats, "downbeats": down, "sections": [], "fps": 100,
           "rms": z, "vocal": z, "low": z, "mid": z, "high": z, "drums": z, "bass": z, "other": z, "onsets": {"vocal": [], "kick": [], "snare": [], "hat": []},
           "notes": f"music: Mixkit 469 from src {S0}", "music_src0": S0}, open('data/audio.json', 'w'))
print('ok', D, 'beats', len(beats), 'first downbeat', down[0])
