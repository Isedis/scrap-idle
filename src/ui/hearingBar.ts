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
  /** Cracks across the screen, one per knock, and the door handle. */
  private cracks: HTMLElement;
  private handle: HTMLElement;
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
    this.cracks = el('div', 'hush-cracks');
    this.handle = el('div', 'hush-handle');
    this.handle.innerHTML = HANDLE_SVG;
    this.hush.append(this.cracks, this.handle, this.eye, el('div', 'hush-line', 'НЕ ДВИГАЙТЕСЬ'), this.hushCount, el('div', 'hush-line small', 'оно за дверью'), this.whisperLine);
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
      this.hush.classList.remove('whisper', 'rattle', 'knock');
      this.cracks.replaceChildren();
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
    // Each knock cracks the screen a little more, as if the glass were the door.
    if (kind === 'knock') {
      for (let i = 0; i < 3; i++) {
        window.setTimeout(() => {
          const crack = el('div', 'hush-crack');
          crack.innerHTML = CRACK_SVG;
          crack.style.left = `${15 + Math.random() * 70}%`;
          crack.style.top = `${20 + Math.random() * 60}%`;
          crack.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg) scale(${0.8 + i * 0.35})`;
          this.cracks.append(crack);
        }, i * 550);
      }
    }
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

/** A crack in the glass: lines out from the point of the blow. */
const CRACK_SVG = `<svg viewBox="-50 -50 100 100" aria-hidden="true">
  <g fill="none" stroke="#cfe0cc" stroke-width="0.8" stroke-linecap="round" opacity="0.5">
    <path d="M0 0 L-12 -20 L-16 -38 L-26 -48"/>
    <path d="M0 0 L14 -12 L30 -16 L46 -28"/>
    <path d="M0 0 L20 10 L28 26 L44 34"/>
    <path d="M0 0 L-6 18 L-18 30 L-22 46"/>
    <path d="M0 0 L-22 4 L-38 -2 L-48 6"/>
    <path d="M-12 -20 L-4 -26 M14 -12 L16 -2 M20 10 L8 14 M-6 18 L-14 12 M-22 4 L-18 -8"/>
  </g>
</svg>`;

/** The booth door's handle, seen from inside. */
const HANDLE_SVG = `<svg viewBox="0 0 60 120" aria-hidden="true">
  <rect x="18" y="10" width="24" height="100" rx="5" fill="#1c2c1f" stroke="#5e7d63" stroke-width="2"/>
  <rect x="2" y="48" width="44" height="12" rx="6" fill="#4f6f55" stroke="#9fbfa4" stroke-width="1.5"/>
  <circle cx="30" cy="82" r="5" fill="#000" stroke="#5e7d63"/>
</svg>`;
