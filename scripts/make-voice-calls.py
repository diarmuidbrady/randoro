#!/usr/bin/env python3
"""Writes the voice calls into assets/sounds with Kokoro text-to-speech: each
letter in each voice, named <letter>_<voice>.wav (a_adam.wav).

Kokoro's model and voices are Apache 2.0, so the calls can ship in the app.

Setup, once, in a virtualenv:
  pip install kokoro-onnx soundfile
  download kokoro-v1.0.onnx and voices-v1.0.bin (model-files-v1.0) from
  https://github.com/thewh1teagle/kokoro-onnx/releases into one folder
Needs ffmpeg.

Usage: python scripts/make-voice-calls.py <models-folder>

Each call is cut to the spoken letter (silence trimmed, capped at 0.5 s so it
stays punchy), peak-normalised, then padded to 1 s like the beeps from
generate-sounds.js: Android needs a file over 1 s for its first play to sound.
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# Keys match VOICES in src/constants/sounds.js.
VOICES = {"adam": "am_adam", "michael": "am_michael", "lewis": "bm_lewis"}

# Phonemes, not text: Kokoro reads "A!" as "eye".
LETTERS = {"a": "ˈeɪ!", "b": "bˈiː!", "c": "sˈiː!"}

SPEED = 1.1
RATE = 44100
PEAK_DB = -0.5
MAX_S = 0.5
FILE_S = 1.0

TRIM = "silenceremove=start_periods=1:start_threshold=-45dB"
FILTERS = f"{TRIM},areverse,{TRIM},areverse,atrim=end={MAX_S},afade=t=out:st={MAX_S - 0.05}:d=0.05,highpass=f=100"


def main():
    models = sys.argv[1]
    out = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds")
    os.makedirs(out, exist_ok=True)
    kokoro = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))

    with tempfile.TemporaryDirectory() as tmp:
        for key, voice in VOICES.items():
            for letter, phonemes in LETTERS.items():
                samples, rate = kokoro.create(phonemes, voice=voice, speed=SPEED, is_phonemes=True)
                raw, cut = os.path.join(tmp, "raw.wav"), os.path.join(tmp, "cut.wav")
                sf.write(raw, samples, rate)
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", FILTERS, "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_f32le", cut],
                    check=True,
                )
                audio, _ = sf.read(cut, dtype="float32")
                audio *= 10 ** (PEAK_DB / 20) / np.abs(audio).max()
                audio = np.pad(audio, (0, max(0, int(RATE * FILE_S) - len(audio))))
                name = f"{letter}_{key}.wav"
                sf.write(os.path.join(out, name), audio, RATE, subtype="PCM_16")
                print(f"  ✓  {name}")


if __name__ == "__main__":
    main()
