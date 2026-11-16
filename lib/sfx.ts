'use client';

import type { LogKind } from './game';

/** Tiny chiptune beeps with the Web Audio API. No audio files needed. */

let audio: AudioContext | null = null;

/** Browsers only allow sound after a click, so call this from a button. */
export function enableSound() {
  audio ??= new AudioContext();
  void audio.resume();
}

function tone(freq: number, startS: number, durS: number, type: OscillatorType = 'square') {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.06, audio.currentTime + startS);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + startS + durS);
  osc.connect(gain).connect(audio.destination);
  osc.start(audio.currentTime + startS);
  osc.stop(audio.currentTime + startS + durS);
}

const JINGLES: Record<LogKind, [freq: number, start: number, dur: number][]> = {
  start: [[392, 0, 0.12], [523, 0.13, 0.12], [659, 0.26, 0.12], [784, 0.39, 0.3]],
  level: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]],
  pellet: [[880, 0, 0.08], [1175, 0.08, 0.16]],
  gremlin: [[330, 0, 0.15], [262, 0.15, 0.15], [196, 0.3, 0.4]],
  lost: [[440, 0, 0.2], [415, 0.22, 0.2], [392, 0.44, 0.2], [370, 0.66, 0.5]],
  found: [[392, 0, 0.1], [523, 0.1, 0.2]],
  hint: [[988, 0, 0.08], [988, 0.12, 0.08]],
  token: [[1319, 0, 0.08], [1568, 0.08, 0.15]],
  home: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.15], [784, 0.6, 0.15], [1047, 0.75, 0.5]],
};

export function playJingle(kind: LogKind) {
  if (!audio) return;
  for (const [freq, start, dur] of JINGLES[kind]) tone(freq, start, dur);
}

export function playBlip() {
  tone(660, 0, 0.04, 'triangle');
}
