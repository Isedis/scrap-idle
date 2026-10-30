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
  lightUp,
  loseShift,
  depthOf,
  automationOpen,
  resort,
  type ScriptNote,
  type BuyMode,
  type GameState,
} from '../game/state';
import { exportSave, importSave, wipeSave, writeSave } from '../game/save';
import { ICONS } from './icons';
import { el, progress, syncChildren, textBar } from './dom';
export { textBar } from './dom';
import { Scene } from './scene';
import { RecyclePanel } from './recyclePanel';
import { JournalPanel } from './journalPanel';
import { TracksPanel } from './tracksPanel';
import { AutomationPanel } from './automationPanel';
import { SortingPanel } from './sortingPanel';
import { Intro, SORTING_INTRO } from './intro';
import { RANKS, describeUnique, uniqueById, FRAC_NAMES } from '../game/sorting';
import { FAIL_LINES } from '../game/scripts';
import { checkAchievements, ACH_BONUS } from '../game/achievements';
import { COMPACT_MILESTONE, type TrackDef } from '../game/infinite';
import { Dread } from './dread';
import { eventById, unwatched, watch, type EventKind, type Recording } from '../game/story';
import { RECYCLE_AT, hasNode, milestoneBase, passiveBonus } from '../game/layers';
import { STAGES, formatDepth, stageIndex, threatActive } from '../game/threat';

/** How long the floodlight button must be held. */
const HOLD_MS = 1500;
/** How long the lost-shift screen stays up before the run starts over. */
const LOST_MS = 4500;
/** What the terminal says as the threat climbs into each stage. */
const STAGE_NOTES = [
  '',
  'В куче что-то шевелится',
  'Он здесь. На камере кто-то лишний',
  'Давление растёт, доход падает. Включите прожектор',
  'ОНО ПОДНИМАЕТСЯ. СВЕТ!',
];

type Tab = 'dump' | 'upgrades' | 'recycle' | 'auto' | 'journal' | 'settings';

/** Seconds a terminal-only event stays on screen. */
const CAM00_SECONDS = 1.6;
const TYPE_MS_PER_CHAR = 70;

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
  private threatEl!: HTMLElement;
  private threatBar!: HTMLElement;
  private depthEl!: HTMLElement;
  private lightButton!: HTMLButtonElement;
  private lostEl!: HTMLElement;
  private knownStage = 0;
  private losing = false;
  private journalPanel!: JournalPanel;
  private tracksPanel!: TracksPanel;
  private automationPanel!: AutomationPanel;
  private sortingPanel!: SortingPanel;
  private intro = new Intro();
  /** Which layer the Layers tab shows. */
  private layerView: 'recycle' | 'sorting' = 'recycle';
  private layerSwitch!: HTMLElement;
  private layerButtons = new Map<'recycle' | 'sorting', HTMLButtonElement>();
  private knownSortOpen = false;
  private autoTab!: HTMLButtonElement;
  private autoBadge!: HTMLElement;
  private journalBadge!: HTMLElement;
  private feedLabel!: HTMLElement;
  private motionEl!: HTMLElement;
  private playbackEl!: HTMLElement;
  private paperEl!: HTMLElement;
  private consoleEl!: HTMLElement;
  private typingTimer = 0;
  /** Live events on screen right now, by kind, with the recording a tap would catch. */
  private live = new Map<EventKind, Recording>();
  private replaying = false;
  private dread!: Dread;
  private sharpButton!: HTMLButtonElement;
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
    this.knownStage = stageIndex(state.threat.level);
    this.knownSortOpen = state.sorting.open;
  }

  private build(): void {
    const header = el('header', 'top');
    header.append(el('div', 'brand', `scrap_idle v${__APP_VERSION__}`));
    this.trashEl = el('div', 'trash', '0');
    const unit = el('div', 'trash-unit', 'кг мусора в системе');
    this.rateEl = el('div', 'rate', 'поток: +0 кг/с');
    this.layerEl = el('div', 'layer-line');
    this.layerEl.hidden = true;
    // Lines camera 00 types into the terminal on its own.
    this.consoleEl = el('div', 'console');
    this.consoleEl.hidden = true;
    this.consoleEl.addEventListener('click', () => this.catchLive('typing') || this.catchLive('voice'));
    header.append(this.trashEl, unit, this.rateEl, this.layerEl, this.buildThreat(), this.consoleEl);

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

    this.sortingPanel = new SortingPanel(
      this.getState,
      () => this.doResort(false),
      (message) => {
        if (message) {
          this.toast(message);
          this.scene.flash('amber');
        }
        this.render();
      },
      () => this.intro.show(SORTING_INTRO),
    );
    this.layerSwitch = el('div', 'modes s-switch');
    this.layerSwitch.setAttribute('role', 'group');
    this.layerSwitch.setAttribute('aria-label', 'Слой');
    this.layerSwitch.hidden = true;
    for (const [view, label] of [['recycle', 'Переработка'], ['sorting', 'Сортировка']] as const) {
      const b = el('button', 'mode', label);
      b.type = 'button';
      b.id = `layer-${view}`;
      b.addEventListener('click', () => {
        this.layerView = view;
        this.show('recycle');
        this.render();
      });
      this.layerButtons.set(view, b);
      this.layerSwitch.append(b);
    }

    const main = el('main', 'panels');
    this.journalPanel = new JournalPanel((rec) => this.watchRecord(rec, false));
    this.panels.set('journal', this.journalPanel.root);

    this.automationPanel = new AutomationPanel(this.getState, (message) => {
      if (message) {
        this.toast(message);
        this.scene.flash('amber');
      }
      this.render();
    });
    this.panels.set('auto', this.automationPanel.root);

    main.append(
      this.buildDump(),
      this.buildUpgrades(),
      this.recyclePanel.root,
      this.sortingPanel.root,
      this.automationPanel.root,
      this.journalPanel.root,
      this.buildSettings(),
    );

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
    const journalTab = this.tabButton('journal', 'Журнал', ICONS.journal);
    this.journalBadge = el('span', 'badge');
    this.journalBadge.hidden = true;
    journalTab.append(this.journalBadge);
    this.autoTab = this.tabButton('auto', 'Автоматика', ICONS.auto);
    this.autoBadge = el('span', 'badge', '!');
    this.autoBadge.hidden = true;
    this.autoTab.append(this.autoBadge);
    this.autoTab.hidden = true;
    nav.append(this.tabButton('dump', 'Свалка', ICONS.heap), upgradesTab, this.recycleTab, this.autoTab, journalTab, settingsTab);

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;

    this.lostEl = el('div', 'lost');
    this.lostEl.hidden = true;
    this.lostEl.setAttribute('role', 'alert');

    this.root.append(header, main, nav, this.toastEl, this.lostEl, this.intro.root);
    this.dread = new Dread(this.root, main, (line) => this.typeLine(line));
    this.sharpButton.setAttribute('aria-pressed', String(this.dread.sharp));
    this.sharpButton.textContent = this.dread.sharp ? 'Резкие моменты: вкл' : 'Резкие моменты: выкл';
    this.show('dump');
  }

  /** Threat bar, depth of the thing, and the floodlight, pinned in the header. */
  private buildThreat(): HTMLElement {
    this.threatEl = el('div', 'threat');
    this.threatEl.hidden = true;
    const text = el('div', 'threat-text');
    this.threatBar = el('div', 'threat-bar');
    this.depthEl = el('div', 'threat-depth');
    text.append(this.threatBar, this.depthEl);

    this.lightButton = el('button', 'light', 'Прожектор');
    this.lightButton.type = 'button';
    this.lightButton.id = 'light';
    this.lightButton.setAttribute('aria-label', 'Прожектор: удерживайте, чтобы отогнать угрозу');
    let started = 0;
    let raf = 0;
    const tick = () => {
      const p = Math.min((performance.now() - started) / HOLD_MS, 1);
      this.lightButton.style.setProperty('--hold', String(p));
      if (p >= 1) {
        stop();
        this.switchOnLight();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = (e: Event) => {
      e.preventDefault();
      if (started) return;
      started = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      started = 0;
      cancelAnimationFrame(raf);
      this.lightButton.style.setProperty('--hold', '0');
    };
    this.lightButton.addEventListener('pointerdown', start);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) this.lightButton.addEventListener(ev, stop);
    this.lightButton.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e);
    });
    this.lightButton.addEventListener('keyup', stop);
    this.lightButton.addEventListener('contextmenu', (e) => e.preventDefault());

    this.threatEl.append(text, this.lightButton);
    return this.threatEl;
  }

  private switchOnLight(): void {
    if (this.losing) return;
    const state = this.getState();
    const was = state.threat.level;
    lightUp(state);
    this.scene.floodlight();
    this.knownStage = 0;
    if (was >= 0.5) this.caption('Свет. Оно отступило');
  }

  /** The thing reached the edge: black screen, camera 00, then the run starts over. */
  private loseRun(): void {
    if (this.losing) return;
    this.losing = true;
    this.scene.glitch(2);
    const lines = ['КАМ-00', 'СИГНАЛ ПОТЕРЯН', 'СМЕНА ПОТЕРЯНА'];
    this.lostEl.replaceChildren(...lines.map((l, i) => el('div', `lost-line l${i}`, l)));
    this.lostEl.hidden = false;
    window.setTimeout(() => {
      const state = this.getState();
      loseShift(state);
      writeSave(state);
      this.resetKnown();
      this.toastQueue = [];
      this.lostEl.hidden = true;
      this.losing = false;
      this.show('dump');
      this.toast('Смена потеряна. Оно забрало всё, что собрано за заход');
      this.render();
    }, LOST_MS);
  }

  private buildFeed(): HTMLElement {
    const feed = el('div', 'feed');
    const canvas = el('canvas', 'feed-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    this.feedLabel = el('div', 'feed-label', 'КАМ-01 · СВАЛКА');
    this.feedLabel.addEventListener('click', () => this.catchLive('cam00'));
    const rec = el('div', 'feed-rec', 'REC');
    this.clockEl = el('div', 'feed-clock', '00:00:00');
    this.captionEl = el('div', 'feed-caption');
    this.captionEl.hidden = true;
    this.motionEl = el('button', 'feed-motion');
    (this.motionEl as HTMLButtonElement).type = 'button';
    this.motionEl.hidden = true;
    this.motionEl.addEventListener('click', () => this.show('journal'));
    this.playbackEl = el('div', 'feed-playback');
    this.playbackEl.hidden = true;
    this.paperEl = el('div', 'feed-paper');
    this.paperEl.hidden = true;
    this.paperEl.addEventListener('click', () => (this.paperEl.hidden = true));
    feed.append(canvas, this.feedLabel, rec, this.clockEl, this.captionEl, this.motionEl, this.playbackEl, this.paperEl);
    this.scene = new Scene(canvas);
    // A tap on something moving catches it live.
    canvas.addEventListener('pointerdown', (e) => {
      const box = canvas.getBoundingClientRect();
      const kind = this.scene.hit(e.clientX - box.left, e.clientY - box.top);
      if (kind) this.catchLive(kind);
    });
    canvas.removeAttribute('aria-hidden');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Камера наблюдения: двор свалки');
    return feed;
  }

  // ---- Camera events -----------------------------------------------------------

  /** A new recording from the scheduler: play it live; a tap while it plays catches it. */
  onEvent(rec: Recording): void {
    const event = eventById(rec.event);
    if (!event || this.losing) return;
    const seconds = this.playKind(event.kind, rec.phrase, false);
    this.live.set(event.kind, rec);
    window.setTimeout(() => {
      if (this.live.get(event.kind) === rec) this.live.delete(event.kind);
    }, seconds * 1000);
    this.render();
  }

  /** Plays an event on camera or in the terminal. Returns how long it lasts, in seconds. */
  private playKind(kind: EventKind, phrase: string | undefined, replay: boolean): number {
    if (kind === 'cam00') {
      this.feedLabel.textContent = 'КАМ-00 · ЯМА';
      this.feedLabel.classList.add('cam00');
      this.scene.glitch(0.3);
      window.setTimeout(() => {
        this.feedLabel.textContent = 'КАМ-01 · СВАЛКА';
        this.feedLabel.classList.remove('cam00');
      }, CAM00_SECONDS * 1000);
      return CAM00_SECONDS;
    }
    if (kind === 'typing' || kind === 'voice') {
      const text = phrase ?? '';
      this.typeLine(text);
      if (kind === 'voice') this.scene.glitch(0.6);
      return (text.length * TYPE_MS_PER_CHAR) / 1000 + 1.5;
    }
    this.scene.playEvent(kind, replay);
    const seconds: Partial<Record<EventKind, number>> = { lampTurn: 2.5, lampBlink: 3, eyes: 4.5, fridge: 5, gull: 5, bag: 6, note: 6, raccoon: 6, extra: 7, cat: 7, breathe: 8, driverless: 9 };
    return seconds[kind] ?? 5;
  }

  /** Back after a long absence: the terminal says how long, as if it was counting. */
  greet(seconds: number): void {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    this.typeLine(`ВАС НЕ БЫЛО ${h > 0 ? `${h} Ч ` : ''}${m} МИН. МЫ СЧИТАЛИ.`);
  }

  /** The terminal types a line on its own, letter by letter. */
  private typeLine(text: string): void {
    clearInterval(this.typingTimer);
    this.consoleEl.hidden = false;
    this.consoleEl.textContent = '> ';
    let i = 0;
    this.typingTimer = window.setInterval(() => {
      this.consoleEl.textContent = `> ${text.slice(0, ++i)}`;
      if (i >= text.length) clearInterval(this.typingTimer);
    }, TYPE_MS_PER_CHAR);
  }

  /** A tap landed on a live event: it counts as watched right away. */
  private catchLive(kind: EventKind): boolean {
    const rec = this.live.get(kind);
    if (!rec || rec.watched) return false;
    this.live.delete(kind);
    this.caption('Зафиксировано оператором');
    this.applyWatch(rec);
    return true;
  }

  /** Plays a recording from the archive on the camera, then reveals what it shows. */
  private watchRecord(rec: Recording, live: boolean): void {
    const event = eventById(rec.event);
    if (!event || this.replaying || this.losing) return;
    if (live) {
      this.applyWatch(rec);
      return;
    }
    this.show('dump');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.replaying = true;
    const d = new Date(rec.at);
    const p2 = (n: number) => String(n).padStart(2, '0');
    this.playbackEl.textContent = `◀◀ ЗАПИСЬ ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    this.playbackEl.hidden = false;
    this.scene.glitch(0.4);
    const seconds = this.playKind(event.kind, rec.phrase, true);
    window.setTimeout(() => {
      this.playbackEl.hidden = true;
      this.replaying = false;
      this.applyWatch(rec);
    }, seconds * 1000 + 300);
  }

  private applyWatch(rec: Recording): void {
    const event = eventById(rec.event)!;
    const result = watch(this.getState().story, rec.seq);
    if (result.opened) {
      const no = String(result.opened.caseNo).padStart(3, '0');
      this.toast(`Дело #${no} открыто: ${result.opened.title}. Доход +3%`);
      this.pop(this.rateEl, 'pulse');
    }
    if (result.note) {
      this.paperEl.textContent = result.note;
      this.paperEl.hidden = false;
      window.setTimeout(() => (this.paperEl.hidden = true), 9000);
    }
    if (result.boosted) this.toast(`${event.title}: ускорение ×1.5 на 30 с`);
    writeSave(this.getState());
    this.render();
  }

  private tabButton(tab: Tab, label: string, icon: string): HTMLButtonElement {
    const b = el('button', 'tab');
    b.type = 'button';
    b.id = `tab-${tab}`;
    b.innerHTML = icon;
    b.append(el('span', '', label));
    // Switch on touch-down: a finger that drifts a little would turn the tap into a scroll and lose the click.
    b.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.show(tab);
    });
    b.addEventListener('click', () => this.show(tab));
    this.tabs.set(tab, b);
    return b;
  }

  private show(tab: Tab): void {
    for (const [t, panel] of this.panels) panel.hidden = t !== tab;
    for (const [t, b] of this.tabs) b.setAttribute('aria-current', t === tab ? 'page' : 'false');
    // The Layers tab shows one layer at a time, with the switch on top.
    const sorting = tab === 'recycle' && this.layerView === 'sorting';
    this.sortingPanel.root.hidden = !sorting;
    if (sorting) this.recyclePanel.root.hidden = true;
    const visible = sorting ? this.sortingPanel.root : this.recyclePanel.root;
    if (this.layerSwitch.parentElement !== visible) visible.prepend(this.layerSwitch);
    for (const [view, b] of this.layerButtons) b.setAttribute('aria-pressed', String(view === this.layerView));
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
    this.tracksPanel = new TracksPanel(this.getState, (def) => this.onTrack(def));
    panel.append(this.upgradeEmpty, this.upgradeList, this.tracksPanel.root);
    return panel;
  }

  /** An endless upgrade was bought; every few Compaction levels the thing comes up closer. */
  private onTrack(def: TrackDef): void {
    const state = this.getState();
    this.scene.flash('amber');
    this.pop(this.rateEl, 'pulse');
    if (def.id === 'compact' && state.compacted % COMPACT_MILESTONE === 0) {
      this.typeLine(`УПЛОТНЕНИЕ ×${state.compacted}. ОБЪЕКТ ПОДНЯЛСЯ. ГЛУБИНА ${formatDepth(depthOf(state)).toUpperCase()}`);
      this.scene.glitch(0.8);
      this.toast('Куча осела. То, что под ней, стало ближе');
    } else {
      this.caption(`${def.name}: ур. ${state.tracks[def.id]}`);
    }
    this.render();
  }

  /** Lighter than a manual recycle: no tab switch, a short note. */
  autoRecycle(): void {
    const state = this.getState();
    const gain = recycle(state);
    if (gain.lte(0)) return;
    writeSave(state);
    this.resetKnown();
    this.scene.glitch(0.4);
    this.toast(`Автопереработка №${state.recycle.resets}: +${format(gain)} вторсырья`);
    this.automationPanel.note(`recycle: №${state.recycle.resets}, +${format(gain)} ВС`);
    this.render();
  }

  /** The switch to Sorting shows up as the line comes into view; then the tab is called Layers. */
  private renderSorting(state: GameState): void {
    const so = state.sorting;
    const near = so.open || state.recycle.total.gte(1e4);
    if (near && this.layerSwitch.hidden) {
      this.layerSwitch.hidden = false;
      this.recycleTab.querySelector('span:not(.badge)')!.textContent = 'Слои';
    }
    if (so.open && !this.knownSortOpen) {
      this.knownSortOpen = true;
      this.toast('Сортировочная линия запущена. Вкладка «Слои» → «Сортировка»');
      if (!introSeen()) {
        markIntroSeen();
        this.intro.show(SORTING_INTRO);
      }
      this.typeLine('ЛЕНТА ПОШЛА. ХВОСТЫ УХОДЯТ ОБРАТНО В КУЧУ. ОНО ИХ ЖДЁТ');
      this.scene.glitch(0.8);
    }
    this.drainFinds(state);
    // The first look at the running line comes with a walk-through.
    if (so.open && !this.sortingPanel.root.hidden && !introSeen()) {
      markIntroSeen();
      this.intro.show(SORTING_INTRO);
    }
    if (!this.sortingPanel.root.hidden) this.sortingPanel.render(state);
  }

  /** What the inspection table turned up since the last look. */
  private drainFinds(state: GameState): void {
    const news = state.sorting.news.splice(0);
    if (news.length === 0) return;
    const uniques = news.filter((n) => n.kind === 'unique');
    // Many at once (back from a long absence): one note, the journal has the rest.
    if (uniques.length > 2) this.toast(`Стол осмотра: уникальных находок ${uniques.length}. Они в журнале`);
    for (const n of news) {
      if (n.kind === 'unique') {
        const u = uniqueById(n.id)!;
        if (uniques.length <= 2) this.toast(`Находка: ${u.name}. ${describeUnique(u)}`);
        this.sortingPanel.showFind(`${u.name}: ${u.text} (${describeUnique(u)})`, false);
        this.caption(u.name);
      } else if (n.kind === 'anomaly') {
        if (this.losing) continue;
        this.typeLine(n.line);
        this.scene.glitch(1.2);
        this.sortingPanel.camera.anomaly();
        this.pop(this.threatEl, 'alarm');
        this.sortingPanel.showFind('Стол осмотра: предмет не опознан. Угроза +15%', true);
      } else {
        this.sortingPanel.showFind(`Тюк: +${format(n.amount)} ${FRAC_NAMES[n.frac].toLowerCase()}`, false);
      }
    }
  }

  /** Burns Recycling for fractions. The auto-sorter does it without the drama. */
  private doResort(auto: boolean): void {
    const state = this.getState();
    const before = state.sorting.sorts;
    const gain = resort(state);
    if (gain.lte(0)) return;
    writeSave(state);
    this.resetKnown();
    this.toastQueue = [];
    this.scene.glitch(auto ? 0.6 : 2);
    this.scene.flash('amber');
    if (!auto) this.typeLine(`ПЕРЕСОРТИРОВКА №${state.sorting.sorts}. ПЕРЕРАБОТКА СОЖЖЕНА. КУЧА ПОМНИТ`);
    this.toast(`Пересортировка №${state.sorting.sorts}: +${format(gain)} фракций, доход ×2`);
    for (const r of RANKS.filter((x) => x.at > before && x.at <= state.sorting.sorts)) this.toast(`Разряд ${r.at}: ${r.text}`);
    if (auto) this.automationPanel.note(`sort: №${state.sorting.sorts}, +${format(gain)} фракций`);
    this.render();
  }

  autoSort(): void {
    this.doResort(true);
  }

  /** What the scripts did this frame: the log, and the floodlight on camera. */
  onScripts(notes: readonly ScriptNote[]): void {
    const state = this.getState();
    this.automationPanel.log(notes, state);
    for (const n of notes) {
      if (n.script !== 'light' || this.losing) continue;
      if (n.failed) {
        this.typeLine(FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)]);
        this.scene.glitch(1.2);
        this.pop(this.threatEl, 'alarm');
        this.toast('Автопрожектор не включился. Держите свет сами!');
      } else {
        this.scene.floodlight();
        this.knownStage = 0;
        this.caption('Автопрожектор: свет');
      }
    }
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

    panel.append(el('h2', 'panel-title', 'Страх'));
    panel.append(el('p', 'note', 'Вспышки, разрывы экрана и лицо на последней стадии угрозы. Выключите, если мерцание вам вредно.'));
    this.sharpButton = el('button', 'btn', 'Резкие моменты: вкл');
    this.sharpButton.type = 'button';
    this.sharpButton.id = 'sharp';
    this.sharpButton.addEventListener('click', () => {
      this.dread.setSharp(!this.dread.sharp);
      this.sharpButton.setAttribute('aria-pressed', String(this.dread.sharp));
      this.sharpButton.textContent = this.dread.sharp ? 'Резкие моменты: вкл' : 'Резкие моменты: выкл';
    });
    panel.append(this.sharpButton);

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
    if (!this.losing) this.dread.update(dt, stageIndex(state.threat.level));
    if (!this.sortingPanel.root.hidden) this.sortingPanel.frame(dt, state);
    this.scene.update(dt, {
      owned: state.owned,
      rate: ratePerSecond(state),
      total: state.runTrash,
      recycles: state.recycle.resets,
      threat: state.threat.level,
      traces: state.story.traces,
    });
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

    const earned = checkAchievements(state, depthOf(state));
    if (earned.length > 3) {
      this.toast(`Достижения: +${earned.length} (доход +${Math.round(earned.length * ACH_BONUS * 100)}%)`);
    } else {
      for (const a of earned) this.toast(`Достижение: ${a.name} (+${Math.round(ACH_BONUS * 100)}%)`);
    }

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
    this.tracksPanel.render(state);
    affordable += this.tracksPanel.affordable(state);
    this.upgradeBadge.hidden = affordable === 0;
    this.upgradeBadge.textContent = String(affordable);

    // Recycling: the tab shows up as the first recycle comes into view.
    const layer = state.recycle;
    const recycleVisible = layer.resets > 0 || state.runTrash.gte(RECYCLE_AT.div(100));
    if (recycleVisible && this.recycleTab.hidden) {
      this.recycleTab.hidden = false;
      if (layer.resets === 0) this.toast('Новая вкладка: Переработка');
    }
    this.recycleBadge.hidden = !this.recyclePanel.attention(state) && !this.sortingPanel.attention(state);
    if (this.autoTab.hidden && automationOpen(state)) {
      this.autoTab.hidden = false;
      this.toast('Новая вкладка: Автоматика');
    }
    this.autoBadge.hidden = !this.automationPanel.attention(state);
    this.renderSorting(state);
    if (!this.automationPanel.root.hidden) this.automationPanel.render(state);
    if (!this.recyclePanel.root.hidden) this.recyclePanel.render(state);
    if (!this.journalPanel.root.hidden) this.journalPanel.render(state);
    const pending = unwatched(state.story);
    this.journalBadge.hidden = pending === 0;
    this.journalBadge.textContent = String(pending);
    this.motionEl.hidden = pending === 0 || this.replaying;
    this.motionEl.textContent = `● движение · ${pending}`;
    this.layerEl.hidden = layer.total.lte(0);
    this.layerEl.textContent = `вторсырьё: ${format(layer.points)} · бонус ×${format(passiveBonus(layer.total))}`;

    this.autoButton.hidden = !hasNode(layer, 'a1');
    this.autoButton.setAttribute('aria-pressed', String(state.autobuy));

    this.renderThreat(state);
  }

  private renderThreat(state: GameState): void {
    const level = state.threat.level;
    const active = threatActive(state.runTrash) || level > 0 || state.threat.losses > 0;
    if (active && this.threatEl.hidden) {
      this.threatEl.hidden = false;
      // The first time anything stirs, say what to do about it.
      if (state.threat.losses === 0 && state.recycle.resets === 0) {
        this.toast('В куче что-то есть. Удерживайте «Прожектор», чтобы отогнать');
      }
    }
    const stage = stageIndex(level);
    if (stage > this.knownStage) {
      this.toast(STAGE_NOTES[stage]);
      if (stage >= 2) this.scene.glitch(0.4);
      if (stage >= 3) this.pop(this.threatEl, 'alarm');
    }
    this.knownStage = stage;
    this.threatBar.textContent = `угроза ${textBar(level, 10)} ${Math.floor(level * 100)}%`;
    this.depthEl.textContent = `${STAGES[stage].name.toUpperCase()} · объект на глубине ${formatDepth(depthOf(state))} ▼`;
    this.root.dataset.threat = String(stage);
    // The light button begs as it gets worse.
    this.lightButton.textContent = stage >= 4 ? 'СВЕТ!!' : stage >= 3 ? 'Свет!' : 'Прожектор';
    if (level >= 1) this.loseRun();
  }
}

/** Whether the Sorting walk-through was shown on this device; a convenience, so local storage is enough. */
const INTRO_KEY = 'scrap-idle-intro-sorting';

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return true;
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Without storage it simply shows again next time.
  }
}
