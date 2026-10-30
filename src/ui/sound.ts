import { Music } from './music';
import { HuntScore } from './huntScore';

/**
 * Sound, made on the spot with Web Audio: no files to download, and every sound can lean
 * into the mood. A phone lets a page make sound only after a touch, so the sound starts
 * with the first tap anywhere. On by default; volume lives on the device.
 */

const VOLUME_KEY = 'scrap-idle-volume';
const DEFAULT_VOLUME = 0.6;
const MUSIC_KEY = 'scrap-idle-music';

/** Reads a stored volume, falling back to the default for anything unreadable. */
export function parseVolume(stored: string | null): number {
  if (stored === null) return DEFAULT_VOLUME;
  const v = Number(stored);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : DEFAULT_VOLUME;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Background music, running once sound starts. */
  private music: Music | null = null;
  private musicOn: boolean;
  private volume: number;
  private threat = 0;
  /** Context time of the next creak under pressure. */
  private creakAt = 0;
  /** Everything but the one that listens is silent. */
  private hushed = false;
  /** The plant's own din: a bed of grinding and a motor's whine, following the load. */
  private plant: { bed: GainNode; motor: OscillatorNode; whine: OscillatorNode; whineGain: GainNode } | null = null;
  private plantLoad = 0;
  /** The score while it is out, in place of the music. */
  private huntScore: HuntScore | null = null;
  /** The music gives way: to the silence, to a stop, to its score. */
  private ducked = false;
  private hunting = false;
  /** Context time of the next clank of the shredder. */
  private clankAt = 0;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VOLUME_KEY);
    } catch {
      // No storage: the default volume.
    }
    this.volume = parseVolume(stored);
    let music: string | null = null;
    try {
      music = localStorage.getItem(MUSIC_KEY);
    } catch {
      // No storage: music on.
    }
    this.musicOn = music !== 'off';
    // The first touch anywhere starts the sound; a phone allows nothing before it.
    const start = () => {
      this.start();
      if (this.ctx) {
        window.removeEventListener('pointerdown', start);
        window.removeEventListener('keydown', start);
      }
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    // In the background the hum stops, which also spares the battery.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get level(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.min(Math.max(v, 0), 1);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Without storage the volume resets next time.
    }
  }

  private start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // A second of white noise, reused for static, whispers and thuds.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.buildPlant(ctx, this.master);
    this.huntScore = new HuntScore(ctx, this.master);
    this.music = new Music(ctx, this.master);
    this.music.setOn(this.musicOn);
    this.music.start();
    this.setThreat(this.threat);
  }

  /** The music follows the threat; under pressure, something creaks now and then. Called every render. */
  setThreat(level: number): void {
    this.threat = level;
    if (!this.ctx) return;
    this.music?.setThreat(level);
    const t = this.ctx.currentTime;
    if (level >= 0.25 && t >= this.creakAt) {
      if (this.creakAt > 0 && !this.hushed) this.creak();
      this.creakAt = t + (25 + Math.random() * 35) / (1 + 2 * level);
    }
  }

  get musicPlaying(): boolean {
    return this.musicOn;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.music?.setOn(on);
    try {
      localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
    } catch {
      // Without storage the music is on again next time.
    }
  }

  /** Something heavy shifting in the heap: a slow, grinding creak. */
  private creak(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140 + Math.random() * 60, t);
    o.frequency.linearRampToValueAtTime(90 + Math.random() * 30, t + 0.9);
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 5;
    // Stuttering amplitude makes a creak of a plain tone.
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 9; k++) g.gain.setValueAtTime(k % 2 ? 0.02 : 0.09, t + k * 0.1);
    g.gain.setValueAtTime(0.0001, t + 0.95);
    o.connect(band).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }

  // ---- One-off sounds ------------------------------------------------------------

  private tone(type: OscillatorType, from: number, to: number, seconds: number, gain: number, delay = 0, it = false, out?: AudioNode): void {
    if (!this.ctx || !this.master || (this.hushed && !it)) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + seconds);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(out ?? this.master);
    o.start(t);
    o.stop(t + seconds + 0.02);
  }

  private burst(seconds: number, gain: number, filter: BiquadFilterType, freq: number, delay = 0, q = 1, it = false, out?: AudioNode): void {
    if (!this.ctx || !this.master || !this.noise || (this.hushed && !it)) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(f).connect(g).connect(out ?? this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + seconds + 0.02);
  }

  /** Somewhere to the left (-1) or right (1) of the listener; the middle where panning is not supported. */
  private side(pan: number): AudioNode | undefined {
    if (!this.ctx || !this.master || !this.ctx.createStereoPanner) return undefined;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.min(Math.max(pan, -1), 1);
    p.connect(this.master);
    return p;
  }

  /** A purchase: a short dry tick. */
  click(): void {
    this.tone('square', 1400, 900, 0.04, 0.05);
  }

  /** The floodlight: two relay clicks and the lamp catching. */
  relay(): void {
    this.burst(0.03, 0.4, 'highpass', 3000);
    this.burst(0.03, 0.35, 'highpass', 2500, 0.09);
    // The lamp catching: a buzz high enough for a phone speaker.
    this.tone('sawtooth', 240, 200, 0.6, 0.06, 0.1);
  }

  /** Interference: a burst of static, longer for a bigger glitch. */
  static(seconds: number): void {
    this.burst(Math.min(Math.max(seconds, 0.15), 1.5), 0.12, 'bandpass', 2400, 0, 0.6);
  }

  /** A whisper: breath through a narrow filter, swelling and fading. */
  whisper(): void {
    if (!this.ctx || !this.master || !this.noise || this.hushed) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + 1.6);
    f.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 2.5);
  }

  /** The press coming down: a thud with metal grit, pitched where a phone can play it. */
  press(): void {
    this.tone('square', 180, 60, 0.5, 0.18);
    this.burst(0.35, 0.35, 'lowpass', 1500);
    this.burst(0.12, 0.2, 'bandpass', 3500, 0.02, 2);
  }

  /** The threat entering a worse stage: two hard notes, like a siren clearing its throat. */
  alarm(): void {
    this.tone('square', 440, 430, 0.3, 0.07);
    this.tone('square', 330, 320, 0.45, 0.07, 0.33);
  }

  /** The automatic floodlight failing: a click, then a dying buzz. */
  fail(): void {
    this.burst(0.03, 0.4, 'highpass', 3000);
    this.tone('sawtooth', 420, 70, 1, 0.12, 0.05);
  }

  /** Unique waste found on the table: a soft chime, a little off. */
  chime(): void {
    this.tone('triangle', 880, 860, 0.6, 0.08);
    this.tone('triangle', 659, 640, 0.8, 0.06, 0.12);
  }

  // ---- Its score -----------------------------------------------------------------------

  /**
   * Every frame: the score while it is out, in place of the music. `level` rises as it
   * comes; `stopped` while it listens mid-walk; `silence` in the ten seconds at the door.
   */
  score(dt: number, level: number, stopped: boolean, silence: boolean): void {
    if (!this.huntScore) return;
    this.huntScore.update(dt, level, stopped, silence);
    if (this.hunting !== level > 0) {
      this.hunting = level > 0;
      this.updateMusic();
    }
  }

  /** Claws along the wall: a screech sweeping down. */
  scrape(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(2300, t + 1.2);
    f.Q.value = 14;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.1);
    for (let k = 1; k < 10; k++) g.gain.setValueAtTime(k % 2 ? 0.2 : 0.5, t + k * 0.11);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
  }

  /** Seen facing the lens: a hard, wrong chord and a hit. */
  sting(): void {
    for (const f of [466, 494, 622, 740]) this.tone('square', f, f * 0.97, 1.3, 0.05, 0, true);
    this.burst(0.25, 0.45, 'lowpass', 2000, 0, 1, true);
    this.tone('sine', 90, 40, 0.8, 0.3, 0, true);
  }

  // ---- The plant ---------------------------------------------------------------------

  private buildPlant(ctx: AudioContext, out: AudioNode): void {
    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(out);
    // Grinding: noise through a low band, wobbling as the drums turn.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.8;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 3;
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    const grind = ctx.createGain();
    grind.gain.value = 0.65;
    wobble.connect(depth).connect(grind.gain);
    src.connect(band).connect(grind).connect(bed);
    // A motor: a low saw whose harmonics a phone can play.
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 98;
    const motorTone = ctx.createBiquadFilter();
    motorTone.type = 'lowpass';
    motorTone.frequency.value = 700;
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.25;
    motor.connect(motorTone).connect(motorGain).connect(bed);
    // Over normal load the bearings start to whine.
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.value = 1400;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(bed);
    for (const node of [src, wobble, motor, whine]) node.start();
    this.plant = { bed, motor, whine, whineGain };
    this.setPlant(this.plantLoad);
  }

  /**
   * The plant's din at a load (0 silent, 1 normal, 2 double): louder, faster, higher, and
   * past normal a whine and the shredder's clanks coming quicker. Called on every render.
   */
  setPlant(load: number): void {
    this.plantLoad = load;
    if (!this.ctx || !this.plant) return;
    const t = this.ctx.currentTime;
    const on = this.hushed ? 0 : load;
    const p = this.plant;
    p.bed.gain.setTargetAtTime(0.05 * on ** 1.4, t, 0.15);
    p.motor.frequency.setTargetAtTime(70 + 40 * load, t, 0.3);
    p.whine.frequency.setTargetAtTime(1100 + 700 * Math.max(0, load - 1), t, 0.3);
    p.whineGain.gain.setTargetAtTime(this.hushed ? 0 : 0.18 * Math.max(0, load - 1), t, 0.2);
    if (on > 0 && t >= this.clankAt) {
      if (this.clankAt > 0) this.clank(on);
      this.clankAt = t + (1.6 + Math.random()) / on;
    }
  }

  /** The shredder biting on something hard. */
  private clank(load: number): void {
    const g = 0.03 + 0.04 * load;
    this.burst(0.05, g, 'bandpass', 1900 + Math.random() * 900, 0, 5);
    this.tone('square', 130, 80, 0.12, g * 0.6);
  }

  /** A recording of the plant at work while it stood still, ending on a breath. */
  echo(): void {
    for (let i = 0; i < 6; i++) this.burst(0.06, 0.08, 'bandpass', 1900 + Math.random() * 600, i * 0.55 + Math.random() * 0.2, 5);
    this.tone('square', 180, 60, 0.5, 0.1, 2.2);
    window.setTimeout(() => this.breath(1, true), 4300);
  }

  // ---- The one that listens --------------------------------------------------------

  /** The music drags and comes apart as it comes: 0 for nothing, 1 at the door. */
  setHunt(near: number): void {
    this.music?.setBroken(near);
  }

  /**
   * Silence for everything but it: the music and every other sound stop at once,
   * and what is left is what it makes.
   */
  hush(on: boolean): void {
    if (this.hushed === on) return;
    this.hushed = on;
    this.updateMusic();
    this.setPlant(this.plantLoad);
  }

  /** The music falls away for a moment, as if something stopped to listen. */
  duck(on: boolean): void {
    this.ducked = on;
    this.updateMusic();
  }

  private updateMusic(): void {
    this.music?.hush(this.hushed || this.ducked || this.hunting);
  }

  /**
   * A footstep somewhere in the plant, from one side: a heavy thud and grit, then the
   * other leg dragged after it along the floor. Louder as it comes.
   */
  step(near: number, pan = 0, drag = true): void {
    const out = this.side(pan);
    const g = 0.06 + 0.22 * near;
    this.tone('sine', 150, 55, 0.35, g, 0, true, out);
    this.burst(0.18, g * 1.4, 'lowpass', 900, 0.01, 1, true, out);
    // Metal underfoot.
    this.burst(0.06, g * 0.6, 'bandpass', 2600, 0.03, 4, true, out);
    if (drag) this.drag(g, out);
  }

  /** The leg that does not lift: a scrape along the floor, falling in pitch. */
  private drag(gain: number, out?: AudioNode): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + 0.32;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(380, t + 0.55);
    f.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * 0.7, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f).connect(g).connect(out ?? this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.65);
  }

  /** The step that ends a stop: closer and harder than the others. */
  lunge(pan: number): void {
    const out = this.side(pan);
    this.tone('square', 120, 40, 0.5, 0.3, 0, true, out);
    this.burst(0.3, 0.6, 'lowpass', 1400, 0, 1, true, out);
    this.burst(0.1, 0.3, 'bandpass', 3000, 0.02, 3, true, out);
  }

  /** Three knocks on the booth door: dull, slow, even, as Ignatyev wrote. */
  knock(): void {
    for (let i = 0; i < 3; i++) {
      this.tone('sine', 110, 60, 0.25, 0.45, i * 0.55, true);
      this.tone('square', 80, 45, 0.35, 0.15, i * 0.55, true);
      this.burst(0.07, 0.6, 'bandpass', 700, i * 0.55, 2, true);
      // The wood answers with a rattle of the frame.
      this.burst(0.25, 0.12, 'bandpass', 2400, i * 0.55 + 0.03, 5, true);
    }
  }

  /** The door handle tried from outside: a rattle of loose metal. */
  rattle(): void {
    for (let i = 0; i < 9; i++) this.burst(0.03, 0.25 + Math.random() * 0.15, 'bandpass', 2800 + Math.random() * 800, i * 0.07 + Math.random() * 0.02, 6, true);
    this.tone('sawtooth', 60, 50, 0.7, 0.05, 0, true);
  }

  /** A whisper through the door, heard in the silence too. */
  whisperIt(): void {
    const was = this.hushed;
    this.hushed = false;
    this.whisper();
    this.hushed = was;
  }

  /** It leaves: steps going away, quieter, to one side. */
  walkAway(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      const g = 0.2 * (1 - i / 5);
      const out = this.side(side * (0.2 + i * 0.18));
      this.tone('sine', 140, 55, 0.3, g, i * 0.9, true, out);
      this.burst(0.15, g * 1.2, 'lowpass', 800, i * 0.9 + 0.01, 1, true, out);
    }
  }

  /** Breathing: a slow draw in and a longer breath out, close enough to hear the wet in it. */
  breath(near: number, close = false): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const peak = (close ? 0.32 : 0.05 + 0.12 * near);
    for (const [at, len, from, to] of [[0, 1.1, 500, 900], [1.3, 1.8, 800, 380]] as const) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(from, t + at);
      f.frequency.linearRampToValueAtTime(to, t + at + len);
      f.Q.value = close ? 2.5 : 4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(peak, t + at + len * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      src.connect(f).connect(g).connect(this.master);
      src.start(t + at, Math.random() * 0.5);
      src.stop(t + at + len + 0.05);
    }
  }

  /** Right by the booth: a wet click in its throat and a low scrape along the door. */
  near(): void {
    if (Math.random() < 0.5) {
      // Clicks, two or three, too regular.
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.burst(0.025, 0.35, 'bandpass', 1800, i * 0.11, 6, true);
    } else {
      this.tone('sawtooth', 95, 70, 1.6, 0.05, 0, true);
      this.burst(1.4, 0.06, 'bandpass', 1300, 0, 8, true);
    }
  }

  /** It heard: a scream of metal and a blow that cuts off everything. */
  heard(): void {
    this.tone('sawtooth', 900, 120, 1.4, 0.16, 0, true);
    this.tone('square', 1350, 160, 1.2, 0.08, 0.05, true);
    this.burst(0.5, 0.5, 'lowpass', 1200, 1.2, 1, true);
    this.tone('square', 120, 40, 2.5, 0.25, 1.2, true);
  }

  /** The shift lost: static and a long falling drone. */
  lost(): void {
    this.static(1.5);
    this.tone('sawtooth', 260, 55, 3, 0.2);
  }
}
