/**
 * Sound, made on the spot with Web Audio: no files to download, and every sound can lean
 * into the mood. A phone lets a page make sound only after a touch, so the sound starts
 * with the first tap anywhere. On by default; volume lives on the device.
 */

const VOLUME_KEY = 'scrap-idle-volume';
const DEFAULT_VOLUME = 0.6;

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
  /** The camera hum and the threat's rumble, always running once sound starts. */
  private hum: GainNode | null = null;
  private rumble: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private volume: number;
  private threat = 0;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VOLUME_KEY);
    } catch {
      // No storage: the default volume.
    }
    this.volume = parseVolume(stored);
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
    this.startHum();
    this.setThreat(this.threat);
  }

  /** The camera's mains hum, and a low rumble that swells with the threat. */
  private startHum(): void {
    const ctx = this.ctx!;
    this.hum = ctx.createGain();
    this.hum.gain.value = 0.025;
    this.hum.connect(this.master!);
    for (const f of [50, 100]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(this.hum);
      o.start();
    }
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    this.rumble.connect(this.master!);
    this.rumbleOsc = ctx.createOscillator();
    this.rumbleOsc.type = 'sawtooth';
    this.rumbleOsc.frequency.value = 38;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 120;
    this.rumbleOsc.connect(low).connect(this.rumble);
    this.rumbleOsc.start();
  }

  /** The rumble follows the threat: silent until the noises start, loud near the edge. */
  setThreat(level: number): void {
    this.threat = level;
    if (!this.ctx || !this.rumble || !this.rumbleOsc) return;
    const t = this.ctx.currentTime;
    const loud = level < 0.25 ? 0 : ((level - 0.25) / 0.75) ** 2 * 0.22;
    this.rumble.gain.setTargetAtTime(loud, t, 0.5);
    this.rumbleOsc.frequency.setTargetAtTime(38 - level * 10, t, 0.5);
  }

  // ---- One-off sounds ------------------------------------------------------------

  private tone(type: OscillatorType, from: number, to: number, seconds: number, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + seconds);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + seconds + 0.02);
  }

  private burst(seconds: number, gain: number, filter: BiquadFilterType, freq: number, delay = 0, q = 1): void {
    if (!this.ctx || !this.master || !this.noise) return;
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
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + seconds + 0.02);
  }

  /** A purchase: a short dry tick. */
  click(): void {
    this.tone('square', 1400, 900, 0.04, 0.05);
  }

  /** The floodlight: two relay clicks and the lamp catching. */
  relay(): void {
    this.burst(0.03, 0.4, 'highpass', 3000);
    this.burst(0.03, 0.35, 'highpass', 2500, 0.09);
    this.tone('sawtooth', 120, 100, 0.6, 0.06, 0.1);
  }

  /** Interference: a burst of static, longer for a bigger glitch. */
  static(seconds: number): void {
    this.burst(Math.min(Math.max(seconds, 0.15), 1.5), 0.12, 'bandpass', 2400, 0, 0.6);
  }

  /** A whisper: breath through a narrow filter, swelling and fading. */
  whisper(): void {
    if (!this.ctx || !this.master || !this.noise) return;
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

  /** The press coming down: a deep thud with grit. */
  press(): void {
    this.tone('sine', 90, 35, 0.7, 0.4);
    this.burst(0.25, 0.25, 'lowpass', 400);
  }

  /** The threat entering a worse stage: two low notes. */
  alarm(): void {
    this.tone('triangle', 220, 210, 0.35, 0.12);
    this.tone('triangle', 165, 160, 0.5, 0.12, 0.38);
  }

  /** The automatic floodlight failing: a click, then a dying buzz. */
  fail(): void {
    this.burst(0.03, 0.4, 'highpass', 3000);
    this.tone('sawtooth', 160, 40, 0.9, 0.1, 0.05);
  }

  /** Unique waste found on the table: a soft chime, a little off. */
  chime(): void {
    this.tone('triangle', 880, 860, 0.6, 0.08);
    this.tone('triangle', 659, 640, 0.8, 0.06, 0.12);
  }

  /** The shift lost: static and a long falling drone. */
  lost(): void {
    this.static(1.5);
    this.tone('sawtooth', 70, 25, 3, 0.25);
  }
}
