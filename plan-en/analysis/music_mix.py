# The music's beat grid for the plates (data/audio.json). Mixkit 469 (Mixkit free licence), 123.05 BPM, beats at
# src 0.0697 + k·0.48762 s; it drops to a breakdown on beat 96 (src 46.88) and comes back in full on beat 128 (src 62.48).
# S0 = 37.40 lands the return on «الربح الحقيقي يصمد» and the drop in the pause before «ثم يتغيّر شيءٌ ما». The bed itself is laid by sfx_mix.py (music_bus), from the same S0.
import json, sys
S0, D = float(sys.argv[1]), float(sys.argv[2])
P, PH = 0.48762, 0.0697
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
