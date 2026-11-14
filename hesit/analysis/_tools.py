"""Shared paths and tool lookup for the analysis scripts.

ffmpeg: $FFMPEG if set, else ~/.cache/motion-as-code/bin/ffmpeg (the static build the skill's setup.sh
installs when the system ffmpeg has no libx264), else `ffmpeg` on PATH.
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "analysis" / "models"
MODEL = MODEL_DIR / "w2v2_base_960h_q.onnx"
MODEL_SHA256 = "cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3"
MODEL_URL = "https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/main/onnx/model_quantized.onnx"


def ffmpeg() -> str:
    env = os.environ.get("FFMPEG")
    if env:
        return env
    cached = Path.home() / ".cache" / "motion-as-code" / "bin" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if cached.exists():
        return str(cached)
    return shutil.which("ffmpeg") or "ffmpeg"


def voiceover() -> Path:
    """The voiceover: always audio/voiceover.mp3 (the preview player and the renderer read that file).
    Convert other formats first:  ffmpeg -i input.wav -ac 1 -ar 44100 -c:a libmp3lame -q:a 2 audio/voiceover.mp3"""
    p = ROOT / "audio" / "voiceover.mp3"
    if not p.exists():
        raise FileNotFoundError("audio/voiceover.mp3 is missing: put the voiceover there (convert it to mp3 first), "
                                "or run analysis/draft_timings.py --wpm 150 to draft without one")
    return p
