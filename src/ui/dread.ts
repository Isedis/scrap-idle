/**
 * The interface itself starts to break as the threat rises: labels flicker into the
 * wrong words, pale words show through the panels, the terminal types on its own,
 * the screen goes black for a blink, tears, and at the edge a face fills it.
 * Flashes, tears and the face count as sharp moments and can be switched off.
 */

/** What labels turn into for a moment. */
const WRONG_WORDS = ['ДЕВЯТЫЙ', 'ОНО', 'ПОД НАМИ', 'НЕ СМОТРИ', 'ИГНАТЬЕВ', 'ЯМА', 'ВНИЗ', 'ТЫ', 'ОБЕРНИСЬ', 'ТЕПЛО', 'ОТКРОЙ', 'ВНУТРИ'];
/** Whole-line replacements for specific labels: the subtle kind, early on. */
const SWAPS: Record<string, string> = {
  'кг мусора в системе': 'кг мусора в тебе',
  'Производство': 'Пробуждение',
  'Улучшения': 'Углубления',
  'Свалка': 'Свалка свалка свалка',
  'Журнал': 'Он читает',
  'Настройки': 'Не уходи',
};
/** Pale words behind the panels. */
const WHISPERS = ['НЕ ВЫКЛЮЧАЙ', 'ОН ВИДИТ', 'ВНИЗУ ТЕПЛО', 'ТЫ НЕ ПЕРВЫЙ', 'ЗАЧЕМ СВЕТ', 'МЫ СЧИТАЕМ', 'ПОСМОТРИ ВНИЗ', 'ДЕВЯТЬ', 'ОТКРОЙ'];
/** Lines the terminal types by itself under pressure. */
const TERMINAL_LINES = [
  'КТО-ТО СМОТРИТ В КАМЕРУ С ДРУГОЙ СТОРОНЫ',
  'ОПЕРАТОР, НЕ ОБОРАЧИВАЙТЕСЬ',
  'ДАТЧИК ДВИЖЕНИЯ: В БУДКЕ',
  'ГЛУБИНА ОБЪЕКТА БОЛЬШЕ НЕ ИЗМЕРЯЕТСЯ',
  'ЭТО НЕ ВАШЕ ОТРАЖЕНИЕ В ЭКРАНЕ',
  'ОНО ЗНАЕТ, ЧТО ВЫ ЧИТАЕТЕ ЭТО',
  'ДЫШИТЕ ТИШЕ',
];
const NOISE = '█▓▒░';

/** Labels that never change on their own, so a flicker can be undone safely. */
const TARGETS = '.p-name, .trash-unit, .panel-title, .tab > span:not(.badge), .brand';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** Per-stage pace of each effect: seconds between occurrences, or 0 for never. */
const PACE = {
  glitch: [0, 7, 2.5, 1, 0.35],
  whisper: [0, 0, 9, 4, 1.6],
  say: [0, 0, 40, 22, 12],
  black: [0, 0, 0, 9, 4],
  tear: [0, 0, 0, 0, 2.5],
  face: [0, 0, 0, 0, 30],
};

export class Dread {
  private stage = 0;
  private clocks: Record<keyof typeof PACE, number> = { glitch: 0, whisper: 0, say: 0, black: 0, tear: 0, face: 0 };
  private whisperEl: HTMLElement;
  private blackEl: HTMLElement;
  private faceEl: HTMLElement;
  private reducedMotion: boolean;
  /** Sharp moments (blackouts, tears, the face) are on. */
  sharp: boolean;

  constructor(
    private root: HTMLElement,
    private main: HTMLElement,
    private typeLine: (line: string) => void,
  ) {
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.sharp = readSharp(!this.reducedMotion);
    this.whisperEl = mk('dread-whisper');
    this.blackEl = mk('dread-black');
    this.faceEl = mk('dread-face');
    this.faceEl.innerHTML = FACE_SVG;
    root.append(this.whisperEl, this.blackEl, this.faceEl);
  }

  setSharp(on: boolean): void {
    this.sharp = on;
    writeSharp(on);
  }

  /** Called every frame with the current threat stage (0..4). */
  update(dt: number, stage: number): void {
    if (stage !== this.stage) {
      // Entering the last stage, the face comes soon; leaving it, everything calms down.
      if (stage === 4) this.clocks.face = rnd(3, 7);
      if (stage < this.stage) this.calm();
      this.stage = stage;
    }
    for (const key of Object.keys(PACE) as (keyof typeof PACE)[]) {
      const every = PACE[key][stage];
      if (!every) continue;
      const sharpOnly = key === 'black' || key === 'tear' || key === 'face';
      if (sharpOnly && (!this.sharp || this.reducedMotion)) continue;
      this.clocks[key] -= dt;
      if (this.clocks[key] > 0) continue;
      this.clocks[key] = every * rnd(0.6, 1.4);
      this[key]();
    }
  }

  /** A label flickers into the wrong word or into noise, then comes back. */
  private glitch(): void {
    const nodes = [...this.root.querySelectorAll<HTMLElement>(TARGETS)].filter((n) => n.offsetParent && !n.dataset.dread);
    const node = pick(nodes);
    if (!node) return;
    const original = node.textContent ?? '';
    node.dataset.dread = '1';
    const swap = SWAPS[original];
    node.textContent =
      swap && Math.random() < 0.6
        ? swap
        : this.stage >= 2 && Math.random() < 0.5
          ? pick(WRONG_WORDS)
          : [...original].map((c) => (c !== ' ' && Math.random() < 0.35 ? pick([...NOISE]) : c)).join('');
    node.classList.add('dread-glitch');
    window.setTimeout(
      () => {
        node.textContent = original;
        node.classList.remove('dread-glitch');
        delete node.dataset.dread;
      },
      rnd(90, this.stage >= 3 ? 600 : 300),
    );
  }

  /** A pale word shows through the interface and fades. */
  private whisper(): void {
    const el = this.whisperEl;
    el.textContent = pick(WHISPERS);
    el.style.left = `${rnd(5, 45)}%`;
    el.style.top = `${rnd(20, 75)}%`;
    el.style.setProperty('--strength', String(this.stage >= 4 ? 0.5 : this.stage >= 3 ? 0.28 : 0.14));
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private say(): void {
    this.typeLine(pick(TERMINAL_LINES));
  }

  /** The whole screen goes black for a blink. */
  private black(): void {
    this.flash(this.blackEl, rnd(70, 160));
  }

  /** The interface tears sideways for a moment. */
  private tear(): void {
    this.main.classList.add('dread-tear');
    window.setTimeout(() => this.main.classList.remove('dread-tear'), rnd(90, 200));
  }

  /** The face fills the screen for a fraction of a second. */
  private face(): void {
    this.flash(this.faceEl, 240);
    navigator.vibrate?.([90, 40, 160]);
  }

  private flash(el: HTMLElement, ms: number): void {
    el.classList.add('on');
    window.setTimeout(() => el.classList.remove('on'), ms);
  }

  private calm(): void {
    this.main.classList.remove('dread-tear');
    for (const el of [this.blackEl, this.faceEl]) el.classList.remove('on');
  }
}

function mk(cls: string): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

const SHARP_KEY = 'scrap-idle-sharp';

function readSharp(fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(SHARP_KEY);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeSharp(on: boolean): void {
  try {
    localStorage.setItem(SHARP_KEY, on ? '1' : '0');
  } catch {
    // A per-device preference; losing it is harmless.
  }
}

/**
 * A face pressed right up to the lens, as night vision would catch it: mostly dark,
 * gaunt, eye sockets with only the glint of eyeshine, a mouth hanging open too far.
 * Cropped by the frame, warped and grainy.
 */
const FACE_SVG = `<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="dread-skin" cx="48%" cy="38%" r="62%">
      <stop offset="0" stop-color="#9fbfa4"/>
      <stop offset="0.35" stop-color="#5e7d63"/>
      <stop offset="0.7" stop-color="#1c2c1f"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <radialGradient id="dread-socket" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.7" stop-color="#000" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dread-shine" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#f4fff4"/>
      <stop offset="0.4" stop-color="#c8ffd2" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#c8ffd2" stop-opacity="0"/>
    </radialGradient>
    <filter id="dread-warp" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
    <filter id="dread-grain">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3"/>
      <feColorMatrix values="0 0 0 0 0.78  0 0 0 0 1  0 0 0 0 0.82  0 0 0 0.5 0"/>
    </filter>
  </defs>
  <rect width="100" height="140" fill="#000"/>
  <g filter="url(#dread-warp)" transform="rotate(-6 50 70)">
    <path d="M18 40 C16 14 38 2 52 4 C70 6 86 22 84 48 C83 70 76 96 64 118 C58 130 42 132 34 118 C24 98 19 66 18 40Z" fill="url(#dread-skin)"/>
    <ellipse cx="34" cy="52" rx="13" ry="15" fill="url(#dread-socket)"/>
    <ellipse cx="65" cy="49" rx="12" ry="17" fill="url(#dread-socket)"/>
    <circle cx="35" cy="54" r="2.6" fill="url(#dread-shine)"/>
    <circle cx="64" cy="51" r="2.1" fill="url(#dread-shine)"/>
    <path d="M47 74 L45 82 M53 74 L55 82" stroke="#000" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
    <path d="M38 92 C40 88 60 87 62 92 C64 106 58 128 50 132 C42 128 36 106 38 92Z" fill="#000"/>
    <path d="M41 93 l1.5 5 M45 91.5 l1 5 M55 91.5 l-1 5 M59 93 l-1.5 5" stroke="#9fbfa4" stroke-width="1.2" opacity="0.55"/>
  </g>
  <rect width="100" height="140" filter="url(#dread-grain)" opacity="0.35"/>
</svg>`;
