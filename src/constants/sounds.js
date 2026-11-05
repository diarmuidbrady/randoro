// The sounds a call can make. Classic is a whistle or a beep; A, B and C are
// spoken in one voice, chosen for all three. Files come from
// scripts/generate-sounds.js and scripts/make-voice-calls.py.

export const CLASSIC_SOUNDS = [
  { key: 'whistle', name: 'Whistle' },
  { key: 'beep', name: 'Beep' },
];

export const VOICES = [
  { key: 'adam', name: 'Adam', note: 'American' },
  { key: 'michael', name: 'Michael', note: 'American' },
  { key: 'lewis', name: 'Lewis', note: 'British' },
];

export const DEFAULT_CLASSIC_SOUND = 'whistle';
export const DEFAULT_VOICE = 'adam';

// Each call's sound files, by the call's key and then the sound's.
export const CALL_SOUNDS = {
  classic: {
    whistle: require('../../assets/sounds/classic_whistle.wav'),
    beep: require('../../assets/sounds/classic_beep.wav'),
  },
  a: {
    adam: require('../../assets/sounds/a_adam.wav'),
    michael: require('../../assets/sounds/a_michael.wav'),
    lewis: require('../../assets/sounds/a_lewis.wav'),
  },
  b: {
    adam: require('../../assets/sounds/b_adam.wav'),
    michael: require('../../assets/sounds/b_michael.wav'),
    lewis: require('../../assets/sounds/b_lewis.wav'),
  },
  c: {
    adam: require('../../assets/sounds/c_adam.wav'),
    michael: require('../../assets/sounds/c_michael.wav'),
    lewis: require('../../assets/sounds/c_lewis.wav'),
  },
};

// The options a call's sound picker offers: Classic's sounds or the voices.
export const soundOptions = (callKey) => (callKey === 'classic' ? CLASSIC_SOUNDS : VOICES);

// The chosen sound for a call, from { classicSound, voice }.
export const chosenSound = (callKey, { classicSound, voice }) =>
  (callKey === 'classic' ? classicSound : voice);

export const callSound = (callKey, sounds) => CALL_SOUNDS[callKey][chosenSound(callKey, sounds)];
