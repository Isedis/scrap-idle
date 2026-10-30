import { el } from './dom';

/**
 * What the one that listens does, for the eyes as well as the ears: plenty of people play
 * with the sound off. Wet footprints come down the screen toward the player, on the side
 * the steps are heard from, the dragged leg smearing between them; the edges fog with its
 * breath; and every sound it makes is written as a subtitle.
 */

/** A bare footprint, the toes too long, pointing down the screen at the player. */
const PRINT_SVG = `<svg viewBox="0 0 40 80" aria-hidden="true">
  <path d="M20 78 C9 77 6 66 8 54 C10 42 7 34 9 26 C11 18 29 18 31 27 C33 36 30 44 32 56 C34 68 31 78 20 78Z"/>
  <ellipse cx="9" cy="14" rx="3.2" ry="6.5" transform="rotate(-14 9 14)"/>
  <ellipse cx="16" cy="9" rx="3.2" ry="7.5" transform="rotate(-5 16 9)"/>
  <ellipse cx="23" cy="8" rx="3" ry="7.5"/>
  <ellipse cx="29" cy="11" rx="2.8" ry="6.5" transform="rotate(10 29 11)"/>
  <ellipse cx="34" cy="17" rx="2.5" ry="5.5" transform="rotate(20 34 17)"/>
</svg>`;

/** Footprints kept on screen at once; the oldest go first. */
const MAX_PRINTS = 12;

export class HuntFx {
  readonly root: HTMLElement;
  private prints: HTMLElement;
  private fog: HTMLElement;
  private subtitle: HTMLElement;
  private subtitleTimer = 0;
  private leftFoot = false;

  constructor() {
    this.root = el('div', 'hunt-fx');
    this.root.setAttribute('aria-hidden', 'true');
    this.prints = el('div', 'hunt-prints');
    this.fog = el('div', 'hunt-fog');
    this.subtitle = el('div', 'hunt-subtitle');
    this.subtitle.hidden = true;
    this.root.append(this.prints, this.fog, this.subtitle);
  }

  /**
   * A footstep: a print lower on the screen the nearer it is, to the side it is heard
   * from, alternating feet; the dragged leg leaves a smear behind it.
   */
  step(near: number, pan: number): void {
    this.leftFoot = !this.leftFoot;
    const x = 50 + pan * 30 + (this.leftFoot ? -4 : 4);
    const y = 8 + near * 70;
    const size = 26 + near * 46;
    this.addPrint(x, y, size, this.leftFoot);
    // The smear of the other foot, dragged after it.
    const smear = el('div', 'hunt-smear');
    smear.style.left = `${x + (this.leftFoot ? 6 : -6)}%`;
    smear.style.top = `${y - 6}%`;
    smear.style.height = `${size * 1.4}px`;
    this.prints.append(smear);
    window.setTimeout(() => smear.remove(), 7000);
    this.trim();
    this.say(pan < -0.35 ? '[тяжёлые шаги слева]' : pan > 0.35 ? '[тяжёлые шаги справа]' : '[тяжёлые шаги]', 1600);
  }

  /** The hard step after a stop: a large print at the bottom and a red flash. */
  lunge(pan: number): void {
    this.addPrint(50 + pan * 20, 72, 110, Math.random() < 0.5, true);
    this.root.classList.remove('lunge');
    void this.root.offsetWidth;
    this.root.classList.add('lunge');
    this.say('[резкий шаг, совсем рядом]', 2200);
  }

  /** It stopped: the prints hold still and the words come up large. */
  listening(on: boolean): void {
    this.root.classList.toggle('listening', on);
    if (on) this.say('[тишина. оно прислушивается]', 6000);
  }

  /** Its breath fogs the edges of the screen, then clears. */
  breathe(close = false): void {
    this.fog.classList.toggle('close', close);
    this.fog.classList.remove('on');
    void this.fog.offsetWidth;
    this.fog.classList.add('on');
    this.say(close ? '[дыхание прямо за дверью]' : '[тяжёлое дыхание]', 2200);
  }

  /** It left: the prints pale and dry away. */
  leave(): void {
    this.root.classList.remove('listening');
    for (const p of this.prints.children) (p as HTMLElement).classList.add('drying');
    window.setTimeout(() => this.clear(), 3500);
    this.say('[шаги удаляются]', 3500);
  }

  clear(): void {
    this.prints.replaceChildren();
    this.root.classList.remove('listening', 'lunge');
  }

  /** A subtitle at the bottom, for what is only heard. */
  say(text: string, ms: number): void {
    clearTimeout(this.subtitleTimer);
    this.subtitle.textContent = text;
    this.subtitle.hidden = false;
    this.subtitleTimer = window.setTimeout(() => (this.subtitle.hidden = true), ms);
  }

  private addPrint(x: number, y: number, size: number, left: boolean, big = false): void {
    const p = el('div', `hunt-print${big ? ' big' : ''}`);
    p.innerHTML = PRINT_SVG;
    p.style.left = `${x}%`;
    p.style.top = `${y}%`;
    p.style.width = `${size}px`;
    // Pointing down at the player, a little askew, the left foot mirrored.
    p.style.setProperty('--turn', `${(Math.random() - 0.5) * 16}deg`);
    p.style.setProperty('--flip', left ? '-1' : '1');
    this.prints.append(p);
    window.setTimeout(() => p.remove(), big ? 9000 : 12000);
  }

  private trim(): void {
    const all = [...this.prints.children];
    for (const p of all.slice(0, Math.max(0, all.length - MAX_PRINTS * 2))) p.remove();
  }
}
