/**
 * The score while the one that listens is out, in place of the music: a tone that rises
 * for ever and never arrives, a pulse that quickens from a slow beat to a run, and
 * trembling strings whose filter opens as it comes. It cuts dead when it stops to listen,
 * and in the silence at the door only a low drone is left.
 */

const RISER_VOICES = 6;
/** Seconds for the rising tone to climb one octave. */
const RISER_OCTAVE_SECONDS = 9;

export class HuntScore {
  private bus: GainNode;
  private riser: { osc: OscillatorNode; gain: GainNode }[] = [];
  private riserPhase = 0;
  private strings: GainNode;
  private stringTone: BiquadFilterNode;
  private drone: GainNode;
  /** Context time of the next beat of the pulse. */
  private beatAt = 0;
  private level = 0;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);

    // The rising tone: octaves of one note gliding up, the top fading out as the bottom fades in.
    for (let i = 0; i < RISER_VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.bus);
      osc.start();
      this.riser.push({ osc, gain });
    }

    // Strings: a cluster of three semitones, trembling, behind a filter that opens.
    this.stringTone = ctx.createBiquadFilter();
    this.stringTone.type = 'lowpass';
    this.stringTone.frequency.value = 400;
    this.strings = ctx.createGain();
    this.strings.gain.value = 0;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(tremolo.gain);
    lfo.start();
    for (const f of [220, 233.1, 246.9, 440, 466.2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 20;
      o.connect(this.stringTone);
      o.start();
    }
    this.stringTone.connect(tremolo).connect(this.strings).connect(this.bus);

    // The drone that stays in the silence.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(out);
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 500;
    dl.connect(this.drone);
    for (const f of [110, 116.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dl);
      o.start();
    }
  }

  /**
   * Every frame: `level` 0 for nothing, rising to 1 at the door; `stopped` while it
   * listens mid-walk; `silence` during the ten seconds at the door.
   */
  update(dt: number, level: number, stopped: boolean, silence: boolean): void {
    const t = this.ctx.currentTime;
    this.level = level;
    const on = level > 0 && !stopped && !silence;
    // Cut dead on a stop: the silence is the point.
    this.bus.gain.setTargetAtTime(on ? 0.9 : 0, t, stopped ? 0.02 : 0.4);
    this.drone.gain.setTargetAtTime(silence ? 0.05 : level > 0 && !stopped ? 0.03 * level : 0, t, 0.3);
    if (!on) return;

    this.riserPhase = (this.riserPhase + dt / RISER_OCTAVE_SECONDS) % 1;
    for (let i = 0; i < RISER_VOICES; i++) {
      const pos = (i + this.riserPhase) / RISER_VOICES;
      const f = 110 * 2 ** (pos * RISER_VOICES);
      // Loudest in the middle of the range, silent at both ends: the climb never ends.
      const bell = Math.sin(pos * Math.PI) ** 2;
      this.riser[i].osc.frequency.setTargetAtTime(f, t, 0.05);
      this.riser[i].gain.gain.setTargetAtTime(0.025 * bell * (0.3 + 0.7 * level), t, 0.05);
    }
    this.strings.gain.setTargetAtTime(0.03 * level ** 1.3, t, 0.3);
    this.stringTone.frequency.setTargetAtTime(400 + 2600 * level, t, 0.5);

    // The pulse: from a slow beat to a run.
    if (t >= this.beatAt) {
      if (this.beatAt > 0) this.beat(t);
      this.beatAt = t + 60 / (60 + 90 * this.level);
    }
  }

  /** A beat of the pulse: a low hit with a metal edge, where a phone can play it. */
  private beat(t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 + 0.12 * this.level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    o.connect(low).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.25);
  }
}
