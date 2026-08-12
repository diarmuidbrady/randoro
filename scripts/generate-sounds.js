/**
 * Generates WAV audio files for Randoro v2.
 *
 * Sound types:
 *   ping.wav        — single 750 Hz / 0.15 s  (interval cue)
 *   double.wav      — two   750 Hz / 0.15 s   (work/round start)
 *   double_rest.wav — two   500 Hz / 0.30 s   (rest start)
 *   triple.wav      — three 750 Hz / 0.15 s   (warmup / cooldown / done)
 *   silence.wav     — 60 min of 110 Hz sine at amplitude 0.05, 8 kHz mono (~57 MB)
 *
 * Beeps: 44.1 kHz, 16-bit mono PCM.
 * Each beep has a 20 ms linear fade-in + fade-out envelope.
 * Multi-beep files have 80 ms silence between beeps.
 *
 * Silence: low-amplitude 110 Hz drone (not actual silence) at 8 kHz to keep file
 * size down. Played non-looped at volume 0.05 in the app — Bluetooth audio routing
 * in background and on lock screen needs constant non-zero volume.
 * See memory/randoro_bluetooth_audio_journey_log.md.
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const FADE_S      = 0.02;   // 20 ms fade at each end of a beep
const GAP_S       = 0.08;   // 80 ms silence between beeps

// A pure sine reads as quiet: all its energy sits at one frequency and its
// average (RMS) level is low relative to its peak. Summing odd harmonics
// (fundamental + 3rd + 5th + 7th) builds a brighter, square-ish tone that
// packs far more energy at the same peak, and lands that energy in the
// 2–4 kHz band where the ear is most sensitive so it sounds much louder
// without ever exceeding full scale.
const HARMONICS = [
  { mult: 1, gain: 1.00 },
  { mult: 3, gain: 0.31 },
  { mult: 5, gain: 0.15 },
  { mult: 7, gain: 0.10 },
];

const PEAK = 0.97; // target true peak of the final WAV, just under full scale (1.0)

// One sample of the harmonic-rich tone at sample index i, before normalization.
function tone(freq, i) {
  let v = 0;
  for (const h of HARMONICS) {
    v += h.gain * Math.sin(2 * Math.PI * freq * h.mult * i / SAMPLE_RATE);
  }
  return v;
}

function buildWav(beeps) {
  const fadeSamples = Math.floor(SAMPLE_RATE * FADE_S);
  const gapSamples  = Math.floor(SAMPLE_RATE * GAP_S);

  const pcm = [];

  for (let b = 0; b < beeps.length; b++) {
    const { freq, duration } = beeps[b];
    const n = Math.floor(SAMPLE_RATE * duration);

    for (let i = 0; i < n; i++) {
      let amp = tone(freq, i);
      // fade in
      if (i < fadeSamples) amp *= i / fadeSamples;
      // fade out
      if (i >= n - fadeSamples) amp *= (n - i) / fadeSamples;
      pcm.push(amp);
    }

    // silence gap between beeps (not after the last one)
    if (b < beeps.length - 1) {
      for (let i = 0; i < gapSamples; i++) pcm.push(0);
    }
  }

  // Peak-normalize to the true measured peak (not the theoretical harmonic sum,
  // which overshoots because the harmonics never all crest on the same sample).
  // Scaling by PEAK / actualPeak lands the loudest sample exactly at PEAK.
  let actualPeak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > actualPeak) actualPeak = a;
  }
  if (actualPeak > 0) {
    const scale = PEAK / actualPeak;
    for (let i = 0; i < pcm.length; i++) pcm[i] *= scale;
  }

  const numSamples = pcm.length;
  const dataBytes  = numSamples * 2; // 16-bit = 2 bytes per sample
  const buf        = Buffer.alloc(44 + dataBytes);

  // RIFF chunk
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);

  // fmt sub-chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);                         // sub-chunk size
  buf.writeUInt16LE(1, 20);                          // PCM
  buf.writeUInt16LE(1, 22);                          // channels
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);            // byte rate
  buf.writeUInt16LE(2, 32);                          // block align
  buf.writeUInt16LE(16, 34);                         // bits per sample

  // data sub-chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buf;
}

function buildSilenceWav(durationS) {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationS);
  const dataBytes  = numSamples * 2; // 16-bit = 2 bytes per sample
  const buf        = Buffer.alloc(44 + dataBytes);

  // RIFF chunk
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);

  // fmt sub-chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);                         // sub-chunk size
  buf.writeUInt16LE(1, 20);                          // PCM
  buf.writeUInt16LE(1, 22);                          // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);             // byte rate
  buf.writeUInt16LE(2, 32);                          // block align
  buf.writeUInt16LE(16, 34);                         // bits per sample

  // data sub-chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  const amplitude = 0.05;
  const freq      = 110;
  for (let i = 0; i < numSamples; i++) {
    const v = amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate);
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }

  return buf;
}

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

const files = {
  'ping.wav':        [ { freq: 750, duration: 0.10 } ],
  'double.wav':      [ { freq: 625, duration: 0.10 }, { freq: 625, duration: 0.10 } ],
  'double_rest.wav': [ { freq: 500, duration: 0.20 }, { freq: 500, duration: 0.20 } ],
  'warmup.wav':      [ { freq: 500, duration: 0.20 }, { freq: 510, duration: 0.15 }, { freq: 600, duration: 0.10 } ],
  'cooldown.wav':    [ { freq: 600, duration: 0.20 }, { freq: 500, duration: 0.15 }, { freq: 500, duration: 0.10 } ],
};

for (const [name, beeps] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), buildWav(beeps));
  console.log(`  ✓  ${name}`);
}

fs.writeFileSync(path.join(outDir, 'silence.wav'), buildSilenceWav(60 * 60));
console.log(`  ✓  silence.wav`);

console.log('\nAll sounds written to assets/sounds/');
