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
    this.hush.append(el('div', 'hush-line', 'НЕ ДВИГАЙТЕСЬ'), this.hushCount, el('div', 'hush-line small', 'оно за дверью'));
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
      this.heard.textContent = `ОНО ИДЁТ ${textBar(nearness(h), 6)} ${mss(h.left)}`;
    } else {
      this.load.textContent = `шум цеха ${pct}% · ×${h.noise.toFixed(2)}`;
      this.heard.textContent = h.noise > 1 || h.meter > 0 ? `слух ${textBar(h.meter, 6)} ${Math.floor(h.meter * 100)}%` : 'тихо';
    }

    const holding = h.phase === 'check' && h.held > 0;
    this.hush.hidden = !holding;
    if (holding) this.hushCount.textContent = String(Math.ceil(HOLD_SECONDS - h.held));
  }
}

