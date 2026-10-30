import { HOLD_SECONDS, MAX_NOISE, nearness, type HearingState } from '../game/hearing';
import { el, textBar } from './dom';

/** m:ss, for how long it still walks. */
const mss = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * The plant's noise, in the header so it is in reach from every tab: the load, what it
 * pays, and how much the one that listens has heard. Walking, it says so; at the door it
 * says what to do. During the silence a dark screen counts down over everything.
 */
export class HearingBar {
  readonly root: HTMLElement;
  /** Over the whole screen while the silence holds. */
  readonly hush: HTMLElement;
  private slider: HTMLInputElement;
  private load: HTMLElement;
  private heard: HTMLElement;
  private hushCount: HTMLElement;
  /** A finger is on the slider. */
  private dragging = false;
  private eye: HTMLElement;
  private whisperLine: HTMLElement;
  /** It stopped mid-walk to listen. */
  listening = false;

  constructor(onNoise: (noise: number) => void) {
    this.root = el('div', 'noise');
    this.root.hidden = true;
    const top = el('div', 'noise-top');
    this.load = el('span', 'noise-load');
    this.heard = el('span', 'noise-heard');
    top.append(this.load, this.heard);
    this.slider = el('input', 'noise-slider');
    this.slider.type = 'range';
    this.slider.id = 'noise';
    this.slider.min = '0';
    this.slider.max = String(MAX_NOISE * 100);
    this.slider.step = '5';
    this.slider.setAttribute('aria-label', 'Шум цеха, процентов');
    this.slider.addEventListener('input', () => onNoise(Number(this.slider.value) / 100));
    this.slider.addEventListener('pointerdown', () => (this.dragging = true));
    for (const ev of ['pointerup', 'pointercancel', 'change']) this.slider.addEventListener(ev, () => (this.dragging = false));
    this.root.append(top, this.slider);

    this.hush = el('div', 'hush');
    this.hush.hidden = true;
    this.hush.setAttribute('aria-live', 'assertive');
    this.hushCount = el('div', 'hush-count');
    // An eye opening in the dark over the ten seconds, and what it says through the door.
    this.eye = el('div', 'hush-eye');
    this.eye.innerHTML = EYE_SVG;
    this.whisperLine = el('div', 'hush-whisper', 'я знаю, что ты там');
    this.hush.append(this.eye, el('div', 'hush-line', 'НЕ ДВИГАЙТЕСЬ'), this.hushCount, el('div', 'hush-line small', 'оно за дверью'), this.whisperLine);
  }

  render(h: HearingState, open: boolean): void {
    this.root.hidden = !open;
    if (!open) return;
    const pct = Math.round(h.noise * 100);
    // Never move the thumb under a finger that is dragging it.
    if (!this.dragging) this.slider.value = String(pct);
    this.slider.style.setProperty('--fill', `${(h.noise / MAX_NOISE) * 100}%`);
    this.root.dataset.phase = h.phase;
    this.root.classList.toggle('loud', h.noise > 1);

    if (h.phase === 'check') {
      const left = Math.max(0, Math.ceil(h.left));
      this.load.textContent = h.held > 0 ? `ТИШИНА · ${Math.ceil(HOLD_SECONDS - h.held)}` : `ШУМ НА 0! · 0:${String(left).padStart(2, '0')}`;
      this.heard.textContent = h.held > 0 ? 'не трогайте' : `${pct}% · ${HOLD_SECONDS} с тишины`;
    } else if (h.phase === 'walk') {
      this.load.textContent = `шум ${pct}% · ×${h.noise.toFixed(2)}`;
      this.heard.textContent = this.listening ? 'ОНО ОСТАНОВИЛОСЬ. СЛУШАЕТ' : `ОНО ИДЁТ ${textBar(nearness(h), 6)} ${mss(h.left)}`;
    } else {
      this.load.textContent = `шум цеха ${pct}% · ×${h.noise.toFixed(2)}`;
      this.heard.textContent = h.noise > 1 || h.meter > 0 ? `слух ${textBar(h.meter, 6)} ${Math.floor(h.meter * 100)}%` : 'тихо';
    }

    const holding = h.phase === 'check' && h.held > 0;
    this.hush.hidden = !holding;
    if (!holding) {
      this.hush.classList.remove('whisper');
      return;
    }
    // The numbers do not hold still either.
    const n = Math.ceil(HOLD_SECONDS - h.held);
    this.hushCount.textContent = Math.random() < 0.08 ? '█▓▒░9?'[Math.floor(Math.random() * 6)] : String(n);
    this.hush.style.setProperty('--eye', String(Math.min(h.held / HOLD_SECONDS, 1)));
  }

  /** Something at the door during the silence: the screen answers it. */
  beat(kind: 'knock' | 'rattle' | 'whisper'): void {
    if (kind === 'whisper') {
      this.hush.classList.add('whisper');
      return;
    }
    this.hush.classList.remove('knock', 'rattle');
    void this.hush.offsetWidth;
    this.hush.classList.add(kind);
  }
}

/** An eye in the dark, too large and too close, the pupil not quite round. */
const EYE_SVG = `<svg viewBox="0 0 200 100" aria-hidden="true">
  <defs>
    <radialGradient id="hush-iris" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.35" stop-color="#000"/>
      <stop offset="0.4" stop-color="#9fbfa4"/>
      <stop offset="0.8" stop-color="#3d5a42"/>
      <stop offset="1" stop-color="#111"/>
    </radialGradient>
  </defs>
  <path d="M5 50 Q100 -12 195 50 Q100 112 5 50Z" fill="#cfe0cc" opacity="0.85"/>
  <circle cx="104" cy="52" r="30" fill="url(#hush-iris)"/>
  <ellipse cx="104" cy="52" rx="6" ry="15" fill="#000"/>
  <circle cx="92" cy="40" r="4" fill="#fff" opacity="0.7"/>
  <path d="M5 50 Q100 -12 195 50" fill="none" stroke="#000" stroke-width="6"/>
</svg>`;
