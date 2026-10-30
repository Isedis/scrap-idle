import { format, D, type Decimal } from '../game/num';
import { PRODUCERS, costOf, type ProducerDef } from '../game/producers';
import { buy, canBuy, newGame, ratePerSecond, type GameState } from '../game/state';
import { exportSave, importSave, wipeSave, writeSave } from '../game/save';
import { ICONS } from './icons';
import { Scene } from './scene';

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

/** Text progress bar in the terminal's own style: [██████░░░░]. */
export function textBar(fraction: number, cells = 10): string {
  const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * cells);
  return `[${'█'.repeat(filled)}${'░'.repeat(cells - filled)}]`;
}

/** How far `have` is toward `need`, 0..1. */
function progress(have: Decimal, need: Decimal): number {
  if (need.lte(0) || have.gte(need)) return 1;
  return have.div(need).toNumber();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Owns the DOM; the game loop calls `render` a few times a second and `frame` every frame. */
export class App {
  private rows: ProducerRow[] = [];
  private trashEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private list!: HTMLElement;
  private teaser!: HTMLElement;
  private teaserBar!: HTMLElement;
  private teaserText!: HTMLElement;
  private panels = new Map<Tab, HTMLElement>();
  private tabs = new Map<Tab, HTMLButtonElement>();
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private updateEl!: HTMLElement;
  private scene!: Scene;

  constructor(
    private root: HTMLElement,
    private getState: () => GameState,
    private setState: (state: GameState) => void,
  ) {
    this.build();
  }

  private build(): void {
    const header = el('header', 'top');
    header.append(el('div', 'brand', `scrap_idle v${__APP_VERSION__}`));
    this.trashEl = el('div', 'trash', '0');
    const unit = el('div', 'trash-unit', 'кг мусора в системе');
    this.rateEl = el('div', 'rate', 'поток: +0 кг/с');
    header.append(this.trashEl, unit, this.rateEl);

    const main = el('main', 'panels');
    main.append(this.buildDump(), this.buildSettings());

    const nav = el('nav', 'tabs');
    nav.append(this.tabButton('dump', 'Свалка', ICONS.heap), this.tabButton('settings', 'Настройки', ICONS.gear));

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;

    this.updateEl = el('div', 'update');
    this.updateEl.setAttribute('role', 'status');
    this.updateEl.hidden = true;

    this.root.append(header, main, nav, this.toastEl, this.updateEl);
    this.show('dump');
  }

  private buildFeed(): HTMLElement {
    const feed = el('div', 'feed');
    const canvas = el('canvas', 'feed-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const label = el('div', 'feed-label', 'КАМ-01 · СВАЛКА');
    const rec = el('div', 'feed-rec', 'REC');
    this.clockEl = el('div', 'feed-clock', '00:00:00');
    feed.append(canvas, label, rec, this.clockEl);
    this.scene = new Scene(canvas);
    return feed;
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
    panel.append(this.buildFeed());
    panel.append(el('h2', 'panel-title', 'Производство'));
    this.list = el('div', 'producers');
    for (const def of PRODUCERS) this.rows.push(this.buildRow(def));

    this.teaser = el('div', 'producer teaser');
    const icon = el('div', 'p-icon');
    icon.innerHTML = ICONS.locked;
    const body = el('div', 'p-body');
    const head = el('div', 'p-head');
    this.teaserBar = el('span', 'p-bar');
    head.append(el('span', 'p-name', '???'), this.teaserBar);
    this.teaserText = el('div', 'p-flavor');
    body.append(head, this.teaserText);
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
    const count = el('span', 'p-count', '×0');
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
    return panel;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 3500);
  }

  /** Persistent strip offering a newer build; stays until the player taps it. */
  offerUpdate(onUpdate: () => void): void {
    if (!this.updateEl.hidden) return;
    const button = el('button', 'update-btn', 'Обновить');
    button.type = 'button';
    button.id = 'update';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Загрузка…';
      onUpdate();
    });
    this.updateEl.replaceChildren(el('span', 'update-text', 'Доступна новая версия'), button);
    this.updateEl.hidden = false;
  }

  /** Every animation frame: only the camera feed. */
  frame(dt: number): void {
    const state = this.getState();
    this.scene.update(dt, ratePerSecond(state), state.totalTrash);
  }

  render(): void {
    const state = this.getState();
    this.trashEl.textContent = format(state.trash);
    this.rateEl.textContent = `поток: +${format(ratePerSecond(state))} кг/с`;
    const now = new Date();
    this.clockEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    // Rebuild the list order only when a new producer is revealed.
    const visible = this.rows.filter((r) => state.revealed.includes(r.def.id));
    const next = PRODUCERS.find((p) => !state.revealed.includes(p.id));
    const wanted = [...visible.map((r) => r.root), ...(next ? [this.teaser] : [])];
    if (wanted.length !== this.list.children.length || wanted.some((n, i) => this.list.children[i] !== n)) {
      this.list.replaceChildren(...wanted);
    }
    if (next) {
      const need = next.baseCost.div(2);
      const p = progress(state.totalTrash, need);
      this.teaserBar.textContent = `${textBar(p)} ${Math.floor(p * 100)}%`;
      this.teaserText.textContent = `Сигнал появится при ${format(need)} кг`;
    }

    for (const row of visible) {
      const owned = state.owned[row.def.id] ?? 0;
      const cost = costOf(row.def, owned);
      row.count.textContent = `×${owned}`;
      row.rate.textContent = `+${format(row.def.baseRate)}/с за шт · всего +${format(row.def.baseRate.mul(D(owned)))}/с`;
      row.price.textContent = `${format(cost)} кг`;
      row.button.disabled = !canBuy(state, row.def.id);
      // The button fills up as the player saves toward the price.
      row.button.style.setProperty('--p', String(progress(state.trash, cost)));
    }
  }
}
