/**
 * Background music, composed on the fly: slow chords in A minor, a soft bass and a music
 * box over them. It darkens with the threat: the sound grows muffled, the pace quickens,
 * chords go out of tune, wrong notes slip into the tune, and under pressure a heartbeat
 * joins. Everything sits where a phone speaker can play it.
 */

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

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

export interface Step {
  /** Seconds this step lasts. */
  seconds: number;
  /** Chord notes when a new chord starts. */
  pad?: number[];
  bass?: number;
  /** A music-box note. */
  tune?: number;
  heart?: boolean;
}

/**
 * What plays on a step at a threat level. Pure, so the music can be checked without sound.
 * `broken` (0..1) is the one that listens coming: the music drags, loses notes and goes wrong.
 */
export function composeStep(step: number, threat: number, rand: () => number, broken = 0): Step {
  const seconds = (0.75 - 0.25 * threat) * (1 + 0.8 * broken);
  threat = Math.max(threat, broken);
  const chordIndex = Math.floor(step / STEPS_PER_CHORD) % CHORDS.length;
  const chord = threat >= 0.5 && chordIndex === 3 ? DREAD_CHORD : CHORDS[chordIndex];
  const out: Step = { seconds };
  const inChord = step % STEPS_PER_CHORD;
  if (inChord === 0) {
    out.pad = chord.map((n) => n + 12);
    out.bass = chord[0] - 12;
  } else if (inChord === 4) {
    out.bass = chord[0] - 12;
  }
  // The tune: a chord tone or a scale step two octaves up, sparser when it is quiet.
  // Coming apart, it loses notes.
  if (rand() < (0.45 + 0.2 * threat) * (1 - 0.6 * broken)) {
    const fromChord = rand() < 0.6;
    let note = fromChord ? chord[Math.floor(rand() * chord.length)] + 24 : 69 + SCALE[Math.floor(rand() * SCALE.length)];
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
    while (this.at < this.ctx.currentTime + 0.4) {
      const s = composeStep(this.step, this.threat, Math.random, this.broken);
      if (this.on && !this.hushed) this.play(s, this.at);
      this.at += s.seconds;
      // Coming apart, it sticks on a step, like a worn tape.
      if (Math.random() >= this.broken * 0.3) this.step++;
    }
  }

  private play(s: Step, t: number): void {
    const detune = this.threat * 18 + this.broken * 45;
    if (s.pad) for (const n of s.pad) this.pad(midi(n), t, detune);
    if (s.bass !== undefined) this.bass(midi(s.bass), t);
    if (s.tune !== undefined) this.box(midi(s.tune), t);
    if (s.heart) this.heart(t);
  }

  /** A slow pad: two detuned voices, swelling in and fading out over the chord. */
  private pad(f: number, t: number, detune: number): void {
    const g = this.ctx.createGain();
    const len = STEPS_PER_CHORD * (0.75 - 0.25 * this.threat);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1100;
    soft.connect(g).connect(this.bus);
    for (const [type, cents] of [['triangle', -detune], ['sawtooth', 7 + detune]] as const) {
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
