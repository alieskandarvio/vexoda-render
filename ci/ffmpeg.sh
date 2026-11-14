#!/bin/bash
# ffmpeg for the runner: a static build (BtbN) — apt on a fresh runner can sit for many minutes behind its dpkg lock.
command -v ffmpeg >/dev/null && { ffmpeg -version | head -1; exit 0; }
set -e
cd /tmp
for i in 1 2 3; do
  curl -sSL -o ff.tar.xz https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz && break
  sleep 5
done
tar -xf ff.tar.xz
sudo cp ffmpeg-master-latest-linux64-gpl/bin/ffmpeg ffmpeg-master-latest-linux64-gpl/bin/ffprobe /usr/local/bin/
ffmpeg -version | head -1
