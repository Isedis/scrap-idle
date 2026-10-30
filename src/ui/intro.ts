import { el } from './dom';

/** One screen of an introduction: a title, a picture in letters, and a few plain sentences. */
export interface IntroStep {
  title: string;
  /** A small diagram in terminal letters. */
  art?: string;
  text: string;
}

/** Steps that explain Sorting the first time the line starts. */
export const SORTING_INTRO: readonly IntroStep[] = [
  {
    title: 'ЛИНИЯ ЗАПУЩЕНА',
    art: 'КУЧА ▼\nП · Б П ? М · С Б П ▶',
    text: 'С кучи по ленте едет мусор. Буквы — это фракции: П — пластик, М — металл, С — стекло, Б — бумага. Фракции — новая валюта, они не сгорают.',
  },
  {
    title: 'СТАНЦИИ',
    art: 'П · Б П М · С Б ▶\n[1] Оптика  ⇐ П П П\n· Б · М · С Б ▶',
    text: 'Каждая станция снимает с ленты свою букву. Иногда она сбивает в брак чужую — тогда станциям ниже её уже не достанется. Порядок важен: двигай станции стрелками ▲▼.',
  },
  {
    title: 'ХВОСТЫ',
    art: '· · М · С · ▶\n▼ ОБРАТНО В КУЧУ',
    text: 'Всё, что доехало до конца, падает обратно в кучу. Оно этим питается: чем больше хвостов, тем быстрее растёт угроза. Хорошая линия держит его на расстоянии.',
  },
  {
    title: 'СТОЛ ОСМОТРА',
    art: 'стол: [?] [?] [ ]',
    text: '«?» — неопознанное. Его осматривают по одному: обычно это тюк фракций, иногда — уникальная находка с вечным бонусом. Иногда на столе оказывается то, чего там быть не должно.',
  },
  {
    title: 'ПЕРЕСОРТИРОВКА',
    art: '✕ вторсырьё   ✕ дерево\n+ фракции    + доход ×2',
    text: 'Когда наберётся вторсырьё, пересортируй: вся переработка сгорит, взамен — фракции и доход ×2 навсегда. Разряды вернут удобства. Строка «Сейчас» вверху всегда подскажет следующий шаг.',
  },
];

/** A terminal window over the game that walks through a few steps. */
export class Intro {
  readonly root: HTMLElement;
  private steps: readonly IntroStep[] = [];
  private at = 0;
  private title: HTMLElement;
  private art: HTMLElement;
  private text: HTMLElement;
  private dots: HTMLElement;
  private next: HTMLButtonElement;
  private back: HTMLButtonElement;

  constructor() {
    this.root = el('div', 'intro');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const box = el('div', 'intro-box');
    this.title = el('div', 'intro-title');
    this.art = el('pre', 'intro-art');
    this.text = el('p', 'intro-text');
    this.dots = el('div', 'intro-dots');
    const buttons = el('div', 'intro-buttons');
    this.back = el('button', 'btn intro-back', 'Назад');
    this.back.type = 'button';
    this.back.addEventListener('click', () => this.go(this.at - 1));
    this.next = el('button', 'btn intro-next');
    this.next.type = 'button';
    this.next.id = 'intro-next';
    this.next.addEventListener('click', () => (this.at < this.steps.length - 1 ? this.go(this.at + 1) : this.close()));
    buttons.append(this.back, this.next);
    box.append(this.title, this.art, this.text, this.dots, buttons);
    this.root.append(box);
  }

  show(steps: readonly IntroStep[]): void {
    this.steps = steps;
    this.root.hidden = false;
    this.go(0);
  }

  private go(i: number): void {
    this.at = Math.max(0, Math.min(i, this.steps.length - 1));
    const step = this.steps[this.at];
    this.title.textContent = `> ${step.title}`;
    this.art.hidden = !step.art;
    this.art.textContent = step.art ?? '';
    this.text.textContent = step.text;
    this.dots.textContent = this.steps.map((_, k) => (k === this.at ? '■' : '□')).join(' ');
    this.back.hidden = this.at === 0;
    this.next.textContent = this.at < this.steps.length - 1 ? 'Далее' : 'Понятно';
    this.next.focus();
  }

  close(): void {
    this.root.hidden = true;
  }
}
