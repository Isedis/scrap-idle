/**
 * Background music, composed on the fly. Each layer the player opens brings its own piece,
 * in the same spirit: the dump's A minor with a music box, the plant's old piano, the
 * line's glass arpeggio, the town's organ and bell, the bottom's drone and drops.
 * The first: slow chords in A minor, a soft bass and a music
 * box over them. It darkens with the threat: the sound grows muffled, the pace quickens,
 * chords go out of tune, wrong notes slip into the tune, and under pressure a heartbeat
 * joins. Everything sits where a phone speaker can play it.
 */

import type { GameState } from '../game/state';

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/**
 * Which piece plays: the furthest layer the player has opened. A reform or the descent
 * starts the layers above over, but what was opened stays opened for the music.
 */
export function pieceFor(s: GameState): number {
  if (s.bottom.open) return 4;
  if (s.city.open || s.city.reforms > 0) return 3;
  if (s.sorting.open || s.sorting.sorts > 0) return 2;
  if (s.recycle.resets > 0) return 1;
  return 0;
}

/** A minor, then F, D minor and E: each chord as MIDI notes, root first. */
const CHORDS: readonly number[][] = [
  [57, 60, 64],
  [53, 57, 60],
  [50, 53, 57],
  [52, 56, 59],
];
/** Under pressure the last chord turns into a tritone cluster. */
const DREAD_CHORD = [51, 57, 58];
/** Natural minor over A, for the tune. */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
/** Loud enough to carry on a phone speaker under the game's other sounds. */
const MUSIC_LEVEL = 1.8;
/** Steps per chord. */
const STEPS_PER_CHORD = 8;

export type Lead = 'box' | 'piano' | 'bell' | 'organ' | 'drop';

/** One piece: its harmony, its pace and what plays the tune. */
export interface Piece {
  name: string;
  chords: readonly number[][];
  /** The last chord under pressure. */
  dread: number[];
  /** Scale of the tune, from `tonic`. */
  scale: readonly number[];
  tonic: number;
  /** Seconds a step lasts when it is quiet. */
  step: number;
  lead: Lead;
  /** Chance of a tune note on a step. */
  density: number;
  /** A fixed pattern over the chord instead of a wandering tune: indices, 3+ an octave up. */
  arp?: readonly number[];
  pad: 'warm' | 'organ' | 'drone';
  /** A soft mechanical tick on every other step. */
  tick?: boolean;
  /** A low bell on every chord. */
  toll?: boolean;
}

/** The pieces, in the order the layers open: dump, plant, line, town, bottom. */
export const PIECES: readonly Piece[] = [
  { name: 'Свалка', chords: CHORDS, dread: DREAD_CHORD, scale: SCALE, tonic: 69, step: 0.75, lead: 'box', density: 0.45, pad: 'warm' },
  {
    name: 'Цех',
    // D minor, B flat, G minor, A: an old piano in an empty shop, the machines ticking.
    chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
    dread: [44, 50, 51],
    scale: [0, 2, 3, 5, 7, 8, 10],
    tonic: 62,
    step: 0.9,
    lead: 'piano',
    density: 0.4,
    pad: 'warm',
    tick: true,
  },
  {
    name: 'Лента',
    // E phrygian: a glass arpeggio running like the belt.
    chords: [[52, 55, 59], [53, 57, 60], [50, 53, 57], [52, 55, 59]],
    dread: [52, 53, 58],
    scale: [0, 1, 3, 5, 7, 8, 10],
    tonic: 64,
    step: 0.42,
    lead: 'bell',
    density: 1,
    arp: [0, 1, 2, 3, 2, 1, 4, 1],
    pad: 'warm',
  },
  {
    name: 'Город',
    // C minor and A flat under an organ; a bell tolls on every chord.
    chords: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]],
    dread: [42, 48, 49],
    scale: [0, 2, 3, 5, 7, 8, 11],
    tonic: 60,
    step: 1,
    lead: 'organ',
    density: 0.3,
    pad: 'organ',
    toll: true,
  },
  {
    name: 'Дно',
    // Almost no harmony: a drone on B flat, water dripping somewhere far down.
    chords: [[46, 53, 58], [46, 53, 58], [45, 52, 57], [46, 53, 58]],
    dread: [46, 47, 53],
    scale: [0, 1, 3, 6, 7, 8],
    tonic: 70,
    step: 1.1,
    lead: 'drop',
    density: 0.35,
    pad: 'drone',
  },
];

export interface Step {
  /** Seconds this step lasts. */
  seconds: number;
  /** Chord notes when a new chord starts. */
  pad?: number[];
  bass?: number;
  /** A music-box note. */
  tune?: number;
  heart?: boolean;
  tick?: boolean;
  toll?: number;
}

/**
 * What plays on a step at a threat level. Pure, so the music can be checked without sound.
 * `broken` (0..1) is the one that listens coming: the music drags, loses notes and goes wrong.
 */
export function composeStep(step: number, threat: number, rand: () => number, broken = 0, piece: Piece = PIECES[0]): Step {
  const seconds = piece.step * (1 - threat / 3) * (1 + 0.8 * broken);
  threat = Math.max(threat, broken);
  const chordIndex = Math.floor(step / STEPS_PER_CHORD) % piece.chords.length;
  const chord = threat >= 0.5 && chordIndex === 3 ? piece.dread : piece.chords[chordIndex];
  const out: Step = { seconds };
  const inChord = step % STEPS_PER_CHORD;
  if (inChord === 0) {
    out.pad = chord.map((n) => n + 12);
    out.bass = chord[0] - 12;
  } else if (inChord === 4) {
    out.bass = chord[0] - 12;
  }
  if (piece.toll && inChord === 0) out.toll = chord[0] - 12;
  if (piece.tick && step % 2 === 0 && broken < 0.6) out.tick = true;
  // A fixed pattern: every step, the chord tone it names, an octave up past the third.
  if (piece.arp) {
    if (rand() < 1 - 0.6 * broken) {
      const k = piece.arp[step % piece.arp.length];
      let note = chord[k % chord.length] + 24 + (k >= chord.length ? 12 : 0);
      if (threat >= 0.5 && rand() < (threat - 0.4) * 0.6) note += 1;
      out.tune = note;
    }
    if (threat >= 0.7 && step % 2 === 0 && broken < 0.5) out.heart = true;
    return out;
  }
  // The tune: a chord tone or a scale step two octaves up, sparser when it is quiet.
  // Coming apart, it loses notes.
  if (rand() < (piece.density + 0.2 * threat) * (1 - 0.6 * broken)) {
    const fromChord = rand() < 0.6;
    let note = fromChord ? chord[Math.floor(rand() * chord.length)] + 24 : piece.tonic + piece.scale[Math.floor(rand() * piece.scale.length)];
    // A wrong note now and then, more often the worse it gets.
    if (threat >= 0.5 && rand() < (threat - 0.4) * 0.6) note += 1;
    out.tune = note;
  }
  if (threat >= 0.7 && step % 2 === 0 && broken < 0.5) out.heart = true;
  return out;
}

/** Plays the composition through Web Audio. */
export class Music {
  private bus: GainNode;
  private tone: BiquadFilterNode;
  private echo: DelayNode;
  private step = 0;
  /** Context time the next step starts. */
  private at = 0;
  private timer = 0;
  private threat = 0;
  private broken = 0;
  private on = true;
  /** Silenced for the moment, without touching the player's choice. */
  private hushed = false;
  private piece = 0;
  /** Context time until which the music is fading out to change pieces. */
  private changingUntil = 0;
  private nextPiece = 0;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = MUSIC_LEVEL;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2600;
    this.bus.connect(this.tone).connect(out);
    // A soft echo for the music box.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.375;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    this.echo.connect(feedback).connect(this.echo);
    this.echo.connect(this.tone);
  }

  start(): void {
    this.at = this.ctx.currentTime + 0.1;
    // Schedules a little ahead, so the timer's jitter is never heard.
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  setOn(on: boolean): void {
    this.on = on;
    this.level();
  }

  /** Cuts the music off at once, or brings it back, whatever the player chose. */
  hush(on: boolean): void {
    this.hushed = on;
    this.level(on ? 0.02 : 0.3);
  }

  private level(time = 0.3): void {
    this.bus.gain.setTargetAtTime(this.on && !this.hushed ? MUSIC_LEVEL : 0, this.ctx.currentTime, time);
  }

  /**
   * Moves to another piece: the one playing fades out over two seconds, the new one
   * starts from its first chord.
   */
  setPiece(index: number): void {
    const i = Math.min(Math.max(index, 0), PIECES.length - 1);
    // Not playing yet: simply start with it.
    if (!this.timer) {
      this.piece = this.nextPiece = i;
      return;
    }
    if (i === this.piece && this.changingUntil === 0) return;
    if (i === this.nextPiece && this.changingUntil > 0) return;
    this.nextPiece = i;
    const now = this.ctx.currentTime;
    if (this.changingUntil === 0) this.bus.gain.setTargetAtTime(0, now, 0.6);
    this.changingUntil = now + 2.2;
  }

  /** The one that listens coming: 0 for nothing, 1 at the door. */
  setBroken(level: number): void {
    this.broken = level;
  }

  setThreat(level: number): void {
    this.threat = level;
    // Muffled as it gets worse, as if heard through the heap.
    this.tone.frequency.setTargetAtTime(2600 - 1700 * level, this.ctx.currentTime, 1);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') {
      this.at = this.ctx.currentTime + 0.1;
      return;
    }
    if (this.changingUntil > 0) {
      if (this.ctx.currentTime < this.changingUntil) return;
      this.changingUntil = 0;
      this.piece = this.nextPiece;
      this.step = 0;
      this.at = this.ctx.currentTime + 0.1;
      this.level(1.2);
    }
    while (this.at < this.ctx.currentTime + 0.4) {
      const s = composeStep(this.step, this.threat, Math.random, this.broken, PIECES[this.piece]);
      if (this.on && !this.hushed) this.play(s, this.at);
      this.at += s.seconds;
      // Coming apart, it sticks on a step, like a worn tape.
      if (Math.random() >= this.broken * 0.3) this.step++;
    }
  }

  private play(s: Step, t: number): void {
    const piece = PIECES[this.piece];
    const detune = this.threat * 18 + this.broken * 45;
    if (s.pad) {
      if (piece.pad === 'drone') this.drone(midi(s.pad[0]), t, detune);
      else for (const n of s.pad) this.pad(midi(n), t, detune, piece.pad === 'organ');
    }
    if (s.bass !== undefined) this.bass(midi(s.bass), t);
    if (s.tune !== undefined) {
      const f = midi(s.tune);
      if (piece.lead === 'piano') this.piano(f, t);
      else if (piece.lead === 'bell') this.bell(f, t, 0.03);
      else if (piece.lead === 'organ') this.organ(f, t);
      else if (piece.lead === 'drop') this.drop(f, t);
      else this.box(f, t);
    }
    if (s.toll !== undefined) this.bell(midi(s.toll), t, 0.06, 4);
    if (s.tick) this.tick(t);
    if (s.heart) this.heart(t);
  }

  /** An old upright: a quick hammer, a slow decay, two strings slightly apart. */
  private piano(f: number, t: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2200;
    soft.connect(g);
    g.connect(this.bus);
    g.connect(this.echo);
    for (const cents of [-6, 5]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(soft);
      o.start(t);
      o.stop(t + 2.5);
    }
  }

  /** Glass or a bell: a few inharmonic partials ringing out; `ring` seconds long. */
  private bell(f: number, t: number, level: number, ring = 1.8): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    g.connect(this.bus);
    g.connect(this.echo);
    for (const [mult, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.2]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const v = this.ctx.createGain();
      v.gain.value = amp;
      o.connect(v).connect(g);
      o.start(t);
      o.stop(t + ring + 0.1);
    }
  }

  /** A reed of the organ: held, a little breathy. */
  private organ(f: number, t: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1600;
    soft.connect(g).connect(this.bus);
    for (const mult of [1, 2]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * mult;
      o.connect(soft);
      o.start(t);
      o.stop(t + 2.7);
    }
  }

  /** A drop of water far down: a short sine falling in pitch, echoing. */
  private drop(f: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    g.connect(this.bus);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** The machines: a soft dry click. */
  private tick(t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.04);
  }

  /** The bottom's drone: the root and its fifth, low, swelling slowly. */
  private drone(f: number, t: number, detune: number): void {
    const len = STEPS_PER_CHORD * PIECES[this.piece].step;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 2.5);
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 700;
    soft.connect(g).connect(this.bus);
    for (const [mult, type] of [[0.5, 'sawtooth'], [0.75, 'triangle'], [1, 'sine']] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune * (mult === 1 ? 1 : -1);
      o.connect(soft);
      o.start(t);
      o.stop(t + len + 2.6);
    }
  }

  /** A slow pad: two detuned voices, swelling in and fading out over the chord. */
  private pad(f: number, t: number, detune: number, organ = false): void {
    const g = this.ctx.createGain();
    const len = STEPS_PER_CHORD * PIECES[this.piece].step * (1 - this.threat / 3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1100;
    soft.connect(g).connect(this.bus);
    const voices = organ ? ([['square', -detune], ['triangle', 4 + detune]] as const) : ([['triangle', -detune], ['sawtooth', 7 + detune]] as const);
    for (const [type, cents] of voices) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(soft);
      o.start(t);
      o.stop(t + len + 1.6);
    }
  }

  /** A bass note, from a low saw so its harmonics carry on a small speaker. */
  private bass(f: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(low).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 2.3);
  }

  /** A music-box note: a bright pluck with an echo. */
  private box(f: number, t: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(this.bus);
    g.connect(this.echo);
    for (const [mult, level] of [[1, 1], [4, 0.25]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * mult;
      const v = this.ctx.createGain();
      v.gain.value = level;
      o.connect(v).connect(g);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  /** A heartbeat: two dull knocks, pitched where a phone can play them. */
  private heart(t: number): void {
    for (const dt of [0, 0.18]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(170, t + dt);
      o.frequency.exponentialRampToValueAtTime(80, t + dt + 0.15);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(dt ? 0.07 : 0.1, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
      o.connect(g).connect(this.bus);
      o.start(t + dt);
      o.stop(t + dt + 0.22);
    }
  }
}
