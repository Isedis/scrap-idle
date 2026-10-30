import { format, D } from '../game/num';
import { PRODUCERS, costOf, type ProducerDef } from '../game/producers';
import { buy, canBuy, newGame, ratePerSecond, type GameState } from '../game/state';
import { exportSave, importSave, wipeSave, writeSave } from '../game/save';
import { ICONS } from './icons';

type Tab = 'dump' | 'settings';

interface ProducerRow {
  def: ProducerDef;
  root: HTMLElement;
  count: HTMLElement;
  rate: HTMLElement;
  button: HTMLButtonElement;
  price: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Owns the DOM; the game loop calls `render` a few times a second. */
export class App {
  private rows: ProducerRow[] = [];
  private trashEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private list!: HTMLElement;
  private teaser!: HTMLElement;
  private teaserText!: HTMLElement;
  private panels = new Map<Tab, HTMLElement>();
  private tabs = new Map<Tab, HTMLButtonElement>();
  private toastEl!: HTMLElement;
  private toastTimer = 0;

  constructor(
    private root: HTMLElement,
    private getState: () => GameState,
    private setState: (state: GameState) => void,
  ) {
    this.build();
  }

  private build(): void {
    const header = el('header', 'top');
    header.append(el('div', 'brand', 'Scrap Idle'));
    this.trashEl = el('div', 'trash', '0');
    const unit = el('div', 'trash-unit', 'кг мусора');
    this.rateEl = el('div', 'rate', '+0 /с');
    header.append(this.trashEl, unit, this.rateEl);

    const main = el('main', 'panels');
    main.append(this.buildDump(), this.buildSettings());

    const nav = el('nav', 'tabs');
    nav.append(this.tabButton('dump', 'Свалка', ICONS.heap), this.tabButton('settings', 'Настройки', ICONS.gear));

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;

    this.root.append(header, main, nav, this.toastEl);
    this.show('dump');
  }

  private tabButton(tab: Tab, label: string, icon: string): HTMLButtonElement {
    const b = el('button', 'tab');
    b.type = 'button';
    b.id = `tab-${tab}`;
    b.innerHTML = icon;
    b.append(el('span', '', label));
    b.addEventListener('click', () => this.show(tab));
    this.tabs.set(tab, b);
    return b;
  }

  private show(tab: Tab): void {
    for (const [t, panel] of this.panels) panel.hidden = t !== tab;
    for (const [t, b] of this.tabs) b.setAttribute('aria-current', t === tab ? 'page' : 'false');
  }

  private buildDump(): HTMLElement {
    const panel = el('section', 'panel');
    this.panels.set('dump', panel);
    panel.append(el('h2', 'panel-title', 'Производство'));
    this.list = el('div', 'producers');
    for (const def of PRODUCERS) this.rows.push(this.buildRow(def));

    this.teaser = el('div', 'producer teaser');
    const icon = el('div', 'p-icon');
    icon.innerHTML = ICONS.locked;
    const body = el('div', 'p-body');
    body.append(el('div', 'p-name', '???'));
    this.teaserText = el('div', 'p-flavor');
    body.append(this.teaserText);
    this.teaser.append(icon, body);

    panel.append(this.list);
    return panel;
  }

  private buildRow(def: ProducerDef): ProducerRow {
    const root = el('div', 'producer');
    const icon = el('div', 'p-icon');
    icon.innerHTML = ICONS[def.id] ?? ICONS.heap;

    const body = el('div', 'p-body');
    const head = el('div', 'p-head');
    const count = el('span', 'p-count', '0');
    head.append(el('span', 'p-name', def.name), count);
    const rate = el('div', 'p-rate');
    body.append(head, el('div', 'p-flavor', def.flavor), rate);

    const button = el('button', 'buy');
    button.type = 'button';
    button.id = `buy-${def.id}`;
    const price = el('span', 'buy-price');
    button.append(el('span', 'buy-label', 'Купить'), price);
    button.addEventListener('click', () => {
      if (buy(this.getState(), def.id)) {
        button.classList.remove('pop');
        void button.offsetWidth; // restart the animation
        button.classList.add('pop');
        this.render();
      }
    });

    root.append(icon, body, button);
    return { def, root, count, rate, button, price };
  }

  private buildSettings(): HTMLElement {
    const panel = el('section', 'panel');
    this.panels.set('settings', panel);
    panel.append(el('h2', 'panel-title', 'Сохранение'));
    panel.append(el('p', 'note', 'Игра сохраняется сама каждые 10 секунд и при сворачивании.'));

    const area = el('textarea', 'save-text');
    area.id = 'save-text';
    area.rows = 4;
    area.placeholder = 'Сюда появится строка сохранения или вставьте свою';
    area.spellcheck = false;

    const exportBtn = el('button', 'btn', 'Экспорт');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () => {
      area.value = exportSave(this.getState());
      area.select();
      navigator.clipboard?.writeText(area.value).then(
        () => this.toast('Строка сохранения скопирована'),
        () => this.toast('Скопируйте строку из поля'),
      );
    });

    const importBtn = el('button', 'btn', 'Загрузить');
    importBtn.type = 'button';
    importBtn.addEventListener('click', () => {
      const state = importSave(area.value);
      if (!state) {
        this.toast('Строка не читается. Проверьте, что она скопирована целиком');
        return;
      }
      state.lastTick = Date.now();
      this.setState(state);
      writeSave(state);
      this.toast('Сохранение загружено');
      this.render();
    });

    const row = el('div', 'btn-row');
    row.append(exportBtn, importBtn);
    panel.append(area, row);

    panel.append(el('h2', 'panel-title', 'Начать заново'));
    panel.append(el('p', 'note', 'Удаляет весь прогресс без возможности вернуть.'));
    const reset = el('button', 'btn danger', 'Сбросить игру');
    reset.type = 'button';
    reset.id = 'reset';
    let armed = 0;
    reset.addEventListener('click', () => {
      if (!armed) {
        reset.textContent = 'Нажмите ещё раз, чтобы сбросить';
        armed = window.setTimeout(() => {
          armed = 0;
          reset.textContent = 'Сбросить игру';
        }, 3000);
        return;
      }
      clearTimeout(armed);
      armed = 0;
      reset.textContent = 'Сбросить игру';
      wipeSave();
      this.setState(newGame());
      this.show('dump');
      this.toast('Игра начата заново');
      this.render();
    });
    panel.append(reset);
    panel.append(el('p', 'version', `Версия ${__APP_VERSION__}`));
    return panel;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 3500);
  }

  render(): void {
    const state = this.getState();
    this.trashEl.textContent = format(state.trash);
    this.rateEl.textContent = `+${format(ratePerSecond(state))} /с`;

    // Rebuild the list order only when a new producer is revealed.
    const visible = this.rows.filter((r) => state.revealed.includes(r.def.id));
    const next = PRODUCERS.find((p) => !state.revealed.includes(p.id));
    const wanted = [...visible.map((r) => r.root), ...(next ? [this.teaser] : [])];
    if (wanted.length !== this.list.children.length || wanted.some((n, i) => this.list.children[i] !== n)) {
      this.list.replaceChildren(...wanted);
    }
    if (next) this.teaserText.textContent = `Появится, когда соберёте ${format(next.baseCost.div(2))} кг`;

    for (const row of visible) {
      const owned = state.owned[row.def.id] ?? 0;
      row.count.textContent = `×${owned}`;
      row.rate.textContent = `+${format(row.def.baseRate)} /с за штуку · всего +${format(row.def.baseRate.mul(D(owned)))} /с`;
      row.price.textContent = `${format(costOf(row.def, owned))} кг`;
      row.button.disabled = !canBuy(state, row.def.id);
    }
  }
}
