/**
 * Generates WAV audio files for Randoro v2.
 *
 * Sound types (frequencies and durations are in the `files` map below):
 *   classic_whistle.wav — a referee's pea whistle (the Classic call, by default)
 *   classic_beep.wav    — single beep             (the Classic call, as a beep)
 *   double.wav      — two beeps              (work/round start)
 *   double_rest.wav — two lower, longer beeps (rest start)
 *   warmup.wav      — three rising beeps     (warmup start)
 *   cooldown.wav    — three falling beeps    (cooldown start / done)
 *   warning.wav     — one long low beep      (10 s before a work round)
 *   countdown.wav   — one long beep          (3-2-1 before a work round)
 *   silence.wav     — 5 min of 110 Hz sine at amplitude 0.05, 8 kHz mono (~4.8 MB)
 *
 * Beeps: 44.1 kHz, 16-bit mono PCM.
 * Each beep has a 20 ms linear fade-in + fade-out envelope.
 * Multi-beep files have 80 ms silence between beeps, and are padded to MIN_FILE_S.
 *
 * Silence: low-amplitude 110 Hz drone at 8 kHz to keep file size down.
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const FADE_S      = 0.02;   // 20 ms fade at each end of a beep
const GAP_S       = 0.08;   // 80 ms silence between beeps
const MIN_FILE_S  = 1.0;    // beeps are padded to this length

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

function beepPcm(beeps) {
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

  return pcm;
}

// ── Whistle ──────────────────────────────────────────────────
// A pea whistle: a bright tone near 3 kHz that the rolling pea trills, wobbling
// its pitch and loudness about 30 times a second, with breath through it.
const WHISTLE = {
  duration: 0.38,   // s
  freq: 3000,       // Hz, where the tone settles
  scoop: 0.9,       // starts at this share of freq as the breath builds...
  scoopS: 0.025,    // ...over this long
  trillHz: 30,      // the pea's rattle
  trillJitter: 0.15,
  trillPitch: 0.03, // pitch wobble, as a share of freq
  trillDepth: 0.45, // how far the rattle dips the loudness
  breath: 0.18,     // breath noise around the tone, relative to it
  attackS: 0.012,
  releaseS: 0.05,
};

// Repeatable noise, so the file is the same every run.
function noiseSource(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 31 - 1;
  };
}

// A band-pass filter (RBJ biquad) around `freq`.
function bandPass(freq, q) {
  const w = 2 * Math.PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0;
  const a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function whistlePcm(w = WHISTLE) {
  const n = Math.floor(SAMPLE_RATE * w.duration);
  const noise = noiseSource(7);
  const breath = bandPass(w.freq, 3);
  const pcm = [];
  let phase = 0;
  let trillPhase = 0;
  let trillRate = w.trillHz;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // The pea doesn't roll evenly: each turn of the trill takes a slightly different time.
    const lastTrill = trillPhase;
    trillPhase += 2 * Math.PI * trillRate / SAMPLE_RATE;
    if (Math.floor(trillPhase / (2 * Math.PI)) > Math.floor(lastTrill / (2 * Math.PI))) {
      trillRate = w.trillHz * (1 + w.trillJitter * noise());
    }
    const trill = Math.sin(trillPhase);

    // Pitch scoops up as the breath builds, then wobbles with the pea.
    const scoop = t < w.scoopS ? w.scoop + (1 - w.scoop) * (t / w.scoopS) : 1;
    const freq = w.freq * scoop * (1 + w.trillPitch * trill);
    phase += 2 * Math.PI * freq / SAMPLE_RATE;
    const tone = Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.05 * Math.sin(3 * phase);
    const air = breath(noise()) * 6;

    let amp = (tone + w.breath * air) * (1 - w.trillDepth * (0.5 + 0.5 * Math.sin(trillPhase + 0.8)));
    if (t < w.attackS) amp *= t / w.attackS;
    if (t > w.duration - w.releaseS) amp *= (w.duration - t) / w.releaseS;
    pcm.push(amp);
  }
  return pcm;
}

function buildWav(pcm) {
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

  const minSamples = Math.ceil(SAMPLE_RATE * MIN_FILE_S);
  while (pcm.length < minSamples) pcm.push(0);

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

const ROUND_START_HZ = 625;

const files = {
  'classic_beep.wav': [ { freq: 750, duration: 0.10 } ],
  'double.wav':      [ { freq: ROUND_START_HZ, duration: 0.10 }, { freq: ROUND_START_HZ, duration: 0.10 } ],
  'double_rest.wav': [ { freq: 500, duration: 0.20 }, { freq: 500, duration: 0.20 } ],
  'warmup.wav':      [ { freq: 500, duration: 0.20 }, { freq: 510, duration: 0.15 }, { freq: 600, duration: 0.10 } ],
  'cooldown.wav':    [ { freq: 600, duration: 0.20 }, { freq: 500, duration: 0.15 }, { freq: 500, duration: 0.10 } ],
  'warning.wav':     [ { freq: ROUND_START_HZ / 2,     duration: 0.60 } ],
  'countdown.wav':   [ { freq: ROUND_START_HZ * 3 / 4, duration: 0.40 } ],
};

for (const [name, beeps] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), buildWav(beepPcm(beeps)));
  console.log(`  ✓  ${name}`);
}

fs.writeFileSync(path.join(outDir, 'classic_whistle.wav'), buildWav(whistlePcm()));
console.log(`  ✓  classic_whistle.wav`);

fs.writeFileSync(path.join(outDir, 'silence.wav'), buildSilenceWav(5 * 60));
console.log(`  ✓  silence.wav`);

console.log('\nAll sounds written to assets/sounds/');
