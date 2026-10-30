import { format } from '../game/num';
import { PRODUCERS, milestonesReached, nextMilestone, prevMilestone, producerById, type ProducerDef } from '../game/producers';
import { UPGRADES, describeUpgrade, type UpgradeDef } from '../game/upgrades';
import {
  availableUpgrades,
  buy,
  buyUpgrade,
  newGame,
  producerRate,
  purchasePlan,
  ratePerSecond,
  takeNewUpgrades,
  canRecycle,
  recycle,
  type BuyMode,
  type GameState,
} from '../game/state';
import { exportSave, importSave, wipeSave, writeSave } from '../game/save';
import { ICONS } from './icons';
import { el, progress, syncChildren, textBar } from './dom';
export { textBar } from './dom';
import { Scene } from './scene';
import { RecyclePanel } from './recyclePanel';
import { RECYCLE_AT, hasNode, milestoneBase, passiveBonus } from '../game/layers';

type Tab = 'dump' | 'upgrades' | 'recycle' | 'settings';

interface ProducerRow {
  def: ProducerDef;
  root: HTMLElement;
  count: HTMLElement;
  rate: HTMLElement;
  milestone: HTMLElement;
  button: HTMLButtonElement;
  label: HTMLElement;
  price: HTMLElement;
}

interface UpgradeRow {
  def: UpgradeDef;
  root: HTMLElement;
  button: HTMLButtonElement;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const BUY_MODES: [BuyMode, string][] = [
  ['one', '×1'],
  ['ten', '×10'],
  ['max', 'Макс'],
];

/** How long each notice stays up; several in a row play one after another. */
const TOAST_MS = 2600;
const TOAST_QUEUE_MAX = 4;

/** Owns the DOM; the game loop calls `render` a few times a second and `frame` every frame. */
export class App {
  private rows: ProducerRow[] = [];
  private upgradeRows = new Map<string, UpgradeRow>();
  private trashEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private captionTimer = 0;
  private list!: HTMLElement;
  private teaser!: HTMLElement;
  private teaserBar!: HTMLElement;
  private teaserText!: HTMLElement;
  private upgradeList!: HTMLElement;
  private upgradeEmpty!: HTMLElement;
  private upgradeCount!: HTMLElement;
  private upgradeBadge!: HTMLElement;
  private modeButtons = new Map<BuyMode, HTMLButtonElement>();
  private autoButton!: HTMLButtonElement;
  private layerEl!: HTMLElement;
  private recyclePanel!: RecyclePanel;
  private recycleTab!: HTMLButtonElement;
  private recycleBadge!: HTMLElement;
  /** Recycling was announced as ready for this run. */
  private knownRecycleReady = false;
  private panels = new Map<Tab, HTMLElement>();
  private tabs = new Map<Tab, HTMLButtonElement>();
  private toastEl!: HTMLElement;
  private toastQueue: string[] = [];
  private toastTimer = 0;
  private settingsBadge!: HTMLElement;
  private updateStatus!: HTMLElement;
  private updateButton!: HTMLButtonElement;
  /** Set by main: checks for a newer build and reloads into it. */
  onUpdate: () => Promise<'reloading' | 'latest' | 'offline'> = async () => 'latest';
  private scene!: Scene;
  /** What the player has already been told about, so each event is announced once. */
  private knownRevealed = 0;
  private knownMilestones = new Map<string, number>();

  constructor(
    private root: HTMLElement,
    private getState: () => GameState,
    private setState: (state: GameState) => void,
  ) {
    this.build();
    this.resetKnown();
  }

  /** Treats producers and milestones in the current state as already seen (on load, import or reset). */
  private resetKnown(): void {
    const state = this.getState();
    this.knownRevealed = state.revealed.length;
    for (const def of PRODUCERS) this.knownMilestones.set(def.id, milestonesReached(state.owned[def.id] ?? 0));
    this.knownRecycleReady = canRecycle(state);
  }

  private build(): void {
    const header = el('header', 'top');
    header.append(el('div', 'brand', `scrap_idle v${__APP_VERSION__}`));
    this.trashEl = el('div', 'trash', '0');
    const unit = el('div', 'trash-unit', 'кг мусора в системе');
    this.rateEl = el('div', 'rate', 'поток: +0 кг/с');
    this.layerEl = el('div', 'layer-line');
    this.layerEl.hidden = true;
    header.append(this.trashEl, unit, this.rateEl, this.layerEl);

    this.recyclePanel = new RecyclePanel(
      this.getState,
      () => this.doRecycle(),
      (node) => {
        this.toast(`Дерево: ${node.name}`);
        this.scene.flash('amber');
        this.caption(node.text);
        this.pop(this.rateEl, 'pulse');
        this.render();
      },
    );
    this.panels.set('recycle', this.recyclePanel.root);

    const main = el('main', 'panels');
    main.append(this.buildDump(), this.buildUpgrades(), this.recyclePanel.root, this.buildSettings());

    const nav = el('nav', 'tabs');
    const upgradesTab = this.tabButton('upgrades', 'Улучшения', ICONS.upgrades);
    this.upgradeBadge = el('span', 'badge');
    this.upgradeBadge.hidden = true;
    upgradesTab.append(this.upgradeBadge);
    this.recycleTab = this.tabButton('recycle', 'Переработка', ICONS.recycle);
    this.recycleBadge = el('span', 'badge', '!');
    this.recycleBadge.hidden = true;
    this.recycleTab.append(this.recycleBadge);
    this.recycleTab.hidden = true;
    const settingsTab = this.tabButton('settings', 'Настройки', ICONS.gear);
    this.settingsBadge = el('span', 'badge', '!');
    this.settingsBadge.hidden = true;
    settingsTab.append(this.settingsBadge);
    nav.append(this.tabButton('dump', 'Свалка', ICONS.heap), upgradesTab, this.recycleTab, settingsTab);

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;

    this.root.append(header, main, nav, this.toastEl);
    this.show('dump');
  }

  private buildFeed(): HTMLElement {
    const feed = el('div', 'feed');
    const canvas = el('canvas', 'feed-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const label = el('div', 'feed-label', 'КАМ-01 · СВАЛКА');
    const rec = el('div', 'feed-rec', 'REC');
    this.clockEl = el('div', 'feed-clock', '00:00:00');
    this.captionEl = el('div', 'feed-caption');
    this.captionEl.hidden = true;
    feed.append(canvas, label, rec, this.clockEl, this.captionEl);
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

    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Производство'));
    const modes = el('div', 'modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Сколько покупать');
    for (const [mode, label] of BUY_MODES) {
      const b = el('button', 'mode', label);
      b.type = 'button';
      b.id = `mode-${mode}`;
      b.addEventListener('click', () => {
        this.getState().buyMode = mode;
        this.render();
      });
      this.modeButtons.set(mode, b);
      modes.append(b);
    }
    // Auto-buyer switch, shown once it is bought in the Recycling tree.
    this.autoButton = el('button', 'mode auto', 'Авто');
    this.autoButton.type = 'button';
    this.autoButton.id = 'autobuy';
    this.autoButton.hidden = true;
    this.autoButton.addEventListener('click', () => {
      const state = this.getState();
      state.autobuy = !state.autobuy;
      this.toast(state.autobuy ? 'Автозакупщик включён' : 'Автозакупщик выключен');
      this.render();
    });
    const controls = el('div', 'controls');
    controls.append(this.autoButton, modes);
    head.append(controls);
    panel.append(head);

    this.list = el('div', 'producers');
    for (const def of PRODUCERS) this.rows.push(this.buildRow(def));

    this.teaser = el('div', 'producer teaser');
    const icon = el('div', 'p-icon');
    icon.innerHTML = ICONS.locked;
    const body = el('div', 'p-body');
    const thead = el('div', 'p-head');
    this.teaserBar = el('span', 'p-bar');
    thead.append(el('span', 'p-name', '???'), this.teaserBar);
    this.teaserText = el('div', 'p-flavor');
    body.append(thead, this.teaserText);
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
    const milestone = el('div', 'p-milestone');
    body.append(head, el('div', 'p-flavor', def.flavor), rate, milestone);

    const button = el('button', 'buy');
    button.type = 'button';
    button.id = `buy-${def.id}`;
    const label = el('span', 'buy-label', 'Купить');
    const price = el('span', 'buy-price');
    button.append(label, price);
    button.addEventListener('click', () => {
      const state = this.getState();
      const before = state.owned[def.id] ?? 0;
      if (buy(state, def.id) > 0) {
        this.pop(button);
        if (before === 0) {
          // The first unit shows up on camera: make an entrance.
          this.scene.glitch(0.6);
          this.caption(`Новое на камере: ${def.name}`);
        }
        this.render();
      }
    });

    // Tapping the card (not the button) shows or hides the description.
    body.addEventListener('click', () => root.classList.toggle('open'));
    icon.addEventListener('click', () => root.classList.toggle('open'));

    root.append(icon, body, button);
    return { def, root, count, rate, milestone, button, label, price };
  }

  private buildUpgrades(): HTMLElement {
    const panel = el('section', 'panel');
    this.panels.set('upgrades', panel);
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Улучшения'));
    this.upgradeCount = el('span', 'panel-meta');
    head.append(this.upgradeCount);
    panel.append(head);

    this.upgradeEmpty = el('p', 'empty', 'Новых улучшений пока нет. Они открываются, когда растёт производство.');
    this.upgradeList = el('div', 'producers');
    for (const def of UPGRADES) this.upgradeRows.set(def.id, this.buildUpgradeRow(def));
    panel.append(this.upgradeEmpty, this.upgradeList);
    return panel;
  }

  private buildUpgradeRow(def: UpgradeDef): UpgradeRow {
    const root = el('div', 'producer upgrade');
    const icon = el('div', 'p-icon');
    const e = def.effect;
    icon.innerHTML = e.kind === 'global' ? ICONS.global : e.kind === 'synergy' ? ICONS.synergy : (ICONS[e.target] ?? ICONS.upgrades);

    const body = el('div', 'p-body');
    body.append(el('div', 'p-name', def.name), el('div', 'p-effect', describeUpgrade(def)), el('div', 'p-flavor', def.flavor));

    const button = el('button', 'buy');
    button.type = 'button';
    button.id = `upgrade-${def.id}`;
    button.append(el('span', 'buy-label', 'Купить'), el('span', 'buy-price', `${format(def.cost)} кг`));
    button.addEventListener('click', () => {
      if (buyUpgrade(this.getState(), def.id)) {
        this.toast(`Куплено: ${def.name}`);
        this.scene.flash('amber');
        this.caption(describeUpgrade(def));
        this.pop(this.rateEl, 'pulse');
        this.render();
      }
    });

    root.append(icon, body, button);
    return { def, root, button };
  }

  private buildSettings(): HTMLElement {
    const panel = el('section', 'panel');
    this.panels.set('settings', panel);

    panel.append(el('h2', 'panel-title', 'Обновление'));
    panel.append(el('p', 'note', `Версия ${__APP_VERSION__}, сборка ${__BUILD_ID__}`));
    this.updateStatus = el('p', 'update-status', 'Игра сама проверяет обновления каждые 5 минут.');
    this.updateButton = el('button', 'btn update-btn', 'Обновить');
    this.updateButton.type = 'button';
    this.updateButton.id = 'update';
    this.updateButton.addEventListener('click', async () => {
      this.updateButton.disabled = true;
      this.updateButton.textContent = 'Проверяю…';
      const result = await this.onUpdate();
      if (result === 'reloading') {
        this.updateButton.textContent = 'Загрузка…';
        return;
      }
      this.updateButton.disabled = false;
      this.updateButton.textContent = 'Обновить';
      this.updateStatus.textContent = result === 'latest' ? 'У вас последняя версия.' : 'Нет связи с сайтом. Попробуйте позже.';
      this.updateStatus.classList.remove('ready');
    });
    panel.append(this.updateStatus, this.updateButton);

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
      this.resetKnown();
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
      this.resetKnown();
      this.toastQueue = [];
      this.show('dump');
      this.toast('Игра начата заново');
      this.render();
    });
    panel.append(reset);
    return panel;
  }

  /** Replays a one-shot CSS animation class on `node`. */
  private pop(node: HTMLElement, cls = 'pop'): void {
    node.classList.remove(cls);
    void node.offsetWidth; // restart the animation
    node.classList.add(cls);
  }

  /** Text burned into the camera picture for a moment. */
  private caption(text: string): void {
    this.captionEl.textContent = text;
    this.captionEl.hidden = false;
    this.pop(this.captionEl, 'show');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => (this.captionEl.hidden = true), 2400);
  }

  /** Shows a notice; ones that arrive while another is up wait their turn. */
  toast(message: string): void {
    this.toastQueue.push(message);
    if (this.toastQueue.length > TOAST_QUEUE_MAX) this.toastQueue.splice(0, this.toastQueue.length - TOAST_QUEUE_MAX);
    if (this.toastEl.hidden) this.nextToast();
  }

  private nextToast(): void {
    const message = this.toastQueue.shift();
    clearTimeout(this.toastTimer);
    if (message === undefined) {
      this.toastEl.hidden = true;
      return;
    }
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastTimer = window.setTimeout(() => this.nextToast(), TOAST_MS);
  }

  /** Marks a newer build as published: a badge on Settings and a note above the button. */
  setUpdateAvailable(): void {
    if (!this.settingsBadge.hidden) return;
    this.settingsBadge.hidden = false;
    this.updateStatus.textContent = 'Вышла новая версия. Нажмите «Обновить», прогресс сохранится.';
    this.updateStatus.classList.add('ready');
    this.updateButton.classList.add('ready');
  }

  /** Every animation frame: only the camera feed. */
  frame(dt: number): void {
    const state = this.getState();
    this.scene.update(dt, { owned: state.owned, rate: ratePerSecond(state), total: state.runTrash, recycles: state.recycle.resets });
  }

  /** Runs the recycle and plays it on camera. */
  private doRecycle(): void {
    const state = this.getState();
    const gain = recycle(state);
    if (gain.lte(0)) return;
    writeSave(state);
    this.resetKnown();
    this.toastQueue = [];
    this.scene.glitch(1.4);
    this.scene.flash('amber');
    this.caption(`Переработка №${state.recycle.resets}: +${format(gain)} вторсырья`);
    this.toast(`Получено ${format(gain)} вторсырья. Доход ×${format(passiveBonus(state.recycle.total))}`);
    this.show('dump');
    this.render();
  }

  /** Announces producers, upgrades and milestones that appeared since the last check. */
  private announce(state: GameState): void {
    for (const id of state.revealed.slice(this.knownRevealed)) {
      this.toast(`Новый производитель: ${producerById(id)?.name}`);
      this.scene.glitch(0.35);
    }
    this.knownRevealed = state.revealed.length;

    for (const u of takeNewUpgrades(state)) this.toast(`Новое улучшение: ${u.name}`);

    if (!this.knownRecycleReady && canRecycle(state)) {
      this.knownRecycleReady = true;
      this.toast(state.recycle.resets === 0 ? 'Открыта переработка! Загляните во вкладку' : 'Переработка снова доступна');
      this.scene.glitch(0.5);
      this.caption('Доступна переработка');
    }

    for (const def of PRODUCERS) {
      const owned = state.owned[def.id] ?? 0;
      const reached = milestonesReached(owned);
      if (reached > (this.knownMilestones.get(def.id) ?? 0)) {
        const base = milestoneBase(state.recycle);
        this.toast(`${def.name}: ${prevMilestone(owned)} шт, доход ×${base}`);
        this.scene.flash('green');
        this.scene.burst();
        this.caption(`${def.name} ×${base}`);
        this.pop(this.rateEl, 'pulse');
        const row = this.rows.find((r) => r.def.id === def.id);
        if (row) this.pop(row.root, 'flash');
      }
      this.knownMilestones.set(def.id, reached);
    }
  }

  render(): void {
    const state = this.getState();
    this.announce(state);

    this.trashEl.textContent = format(state.trash);
    this.rateEl.textContent = `поток: +${format(ratePerSecond(state))} кг/с`;
    const now = new Date();
    this.clockEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    for (const [mode, b] of this.modeButtons) b.setAttribute('aria-pressed', String(state.buyMode === mode));

    // Producers, plus a locked card for the next one.
    const visible = this.rows.filter((r) => state.revealed.includes(r.def.id));
    const next = PRODUCERS.find((p) => !state.revealed.includes(p.id));
    syncChildren(this.list, [...visible.map((r) => r.root), ...(next ? [this.teaser] : [])]);
    if (next) {
      const need = next.baseCost.div(2);
      const p = progress(state.runTrash, need);
      this.teaserBar.textContent = `${textBar(p)} ${Math.floor(p * 100)}%`;
      this.teaserText.textContent = `Сигнал появится при ${format(need)} кг`;
    }

    for (const row of visible) {
      const owned = state.owned[row.def.id] ?? 0;
      const plan = purchasePlan(state, row.def.id);
      row.count.textContent = `×${owned}`;
      row.rate.textContent = `даёт +${format(producerRate(state, row.def.id))}/с`;
      const from = prevMilestone(owned);
      const to = nextMilestone(owned);
      row.milestone.textContent = `${textBar((owned - from) / (to - from), 8)} ${owned}/${to} → ×${milestoneBase(state.recycle)}`;
      const amount = state.buyMode === 'one' ? '' : state.buyMode === 'ten' ? ' ×10' : plan.count > 1 ? ` ×${plan.count}` : '';
      row.label.textContent = `Купить${amount}`;
      row.price.textContent = `${format(plan.cost)} кг`;
      row.button.disabled = plan.count === 0;
      // The button fills up as the player saves toward the price.
      row.button.style.setProperty('--p', String(progress(state.trash, plan.cost)));
    }

    // Upgrades shop.
    const shop = availableUpgrades(state);
    syncChildren(this.upgradeList, shop.map((u) => this.upgradeRows.get(u.id)!.root));
    this.upgradeEmpty.hidden = shop.length > 0;
    this.upgradeCount.textContent = `куплено ${state.upgrades.length}/${UPGRADES.length}`;
    let affordable = 0;
    for (const u of shop) {
      const row = this.upgradeRows.get(u.id)!;
      const can = state.trash.gte(u.cost);
      if (can) affordable++;
      row.button.disabled = !can;
      row.button.style.setProperty('--p', String(progress(state.trash, u.cost)));
    }
    this.upgradeBadge.hidden = affordable === 0;
    this.upgradeBadge.textContent = String(affordable);

    // Recycling: the tab shows up as the first recycle comes into view.
    const layer = state.recycle;
    const recycleVisible = layer.resets > 0 || state.runTrash.gte(RECYCLE_AT.div(100));
    if (recycleVisible && this.recycleTab.hidden) {
      this.recycleTab.hidden = false;
      if (layer.resets === 0) this.toast('Новая вкладка: Переработка');
    }
    this.recycleBadge.hidden = !this.recyclePanel.attention(state);
    if (!this.recyclePanel.root.hidden) this.recyclePanel.render(state);
    this.layerEl.hidden = layer.total.lte(0);
    this.layerEl.textContent = `вторсырьё: ${format(layer.points)} · бонус ×${format(passiveBonus(layer.total))}`;

    this.autoButton.hidden = !hasNode(layer, 'a1');
    this.autoButton.setAttribute('aria-pressed', String(state.autobuy));
  }
}
