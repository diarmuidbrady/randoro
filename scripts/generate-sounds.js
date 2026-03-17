/**
 * Generates WAV audio files for Randoro v2.
 *
 * Sound types:
 *   ping.wav        — single 750 Hz / 0.15 s  (interval cue)
 *   double.wav      — two   750 Hz / 0.15 s   (work/round start)
 *   double_rest.wav — two   500 Hz / 0.30 s   (rest start)
 *   triple.wav      — three 750 Hz / 0.15 s   (warmup / cooldown / done)
 *
 * WAV format: mono, 44100 Hz, 16-bit PCM.
 * Each beep has a 20 ms linear fade-in + fade-out envelope.
 * Multi-beep files have 80 ms silence between beeps.
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const FADE_S      = 0.02;   // 20 ms fade at each end of a beep
const GAP_S       = 0.08;   // 80 ms silence between beeps

/**
 * Build a 16-bit PCM WAV buffer from an array of beep descriptors.
 * @param {Array<{freq: number, duration: number}>} beeps
 * @returns {Buffer}
 */
function buildWav(beeps) {
  const fadeSamples = Math.floor(SAMPLE_RATE * FADE_S);
  const gapSamples  = Math.floor(SAMPLE_RATE * GAP_S);

  const pcm = [];

  for (let b = 0; b < beeps.length; b++) {
    const { freq, duration } = beeps[b];
    const n = Math.floor(SAMPLE_RATE * duration);

    for (let i = 0; i < n; i++) {
      let amp = 0.8 * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
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

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

const files = {
  'ping.wav':        [{ freq: 750, duration: 0.15 }],
  'double.wav':      [{ freq: 750, duration: 0.15 }, { freq: 750, duration: 0.15 }],
  'double_rest.wav': [{ freq: 500, duration: 0.30 }, { freq: 500, duration: 0.30 }],
  'triple.wav':      [{ freq: 750, duration: 0.15 }, { freq: 750, duration: 0.15 }, { freq: 750, duration: 0.15 }],
};

for (const [name, beeps] of Object.entries(files)) {
  const outPath = path.join(outDir, name);
  fs.writeFileSync(outPath, buildWav(beeps));
  console.log(`  ✓  ${name}`);
}

console.log('\nAll sounds written to assets/sounds/');
