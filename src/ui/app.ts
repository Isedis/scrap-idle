import { format } from '../game/num';
import { PRODUCERS, milestonesReached, nextMilestone, prevMilestone, producerById, type ProducerDef } from '../game/producers';
import { UPGRADES, describeUpgrade, type UpgradeDef } from '../game/upgrades';
import {
  availableUpgrades,
  buy,
  buyUpgrade,
  buyAllUpgrades,
  newGame,
  producerRate,
  purchasePlan,
  ratePerSecond,
  takeNewUpgrades,
  canRecycle,
  recycle,
  lightUp,
  loseShift,
  loseToHearing,
  depthOf,
  darkPeakOf,
  incomeBreakdown,
  milestoneUnits,
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
import { Sound } from './sound';
import { AwayScreen } from './awayScreen';
import type { AwayReport } from '../game/away';
import { WorkshopCam } from './workshopCam';
import { bundle } from './toasts';
import { RANKS, describeUnique, uniqueById, FRAC_NAMES } from '../game/sorting';
import { FAIL_LINES } from '../game/scripts';
import { checkAchievements, ACH_BONUS } from '../game/achievements';
import { COMPACT_MILESTONE, type TrackDef } from '../game/infinite';
import { Dread } from './dread';
import { HearingBar } from './hearingBar';
import { hunt } from './lurker';
import { heardLine, nearness, setNoise, type HearingPhase } from '../game/hearing';
import { PLANT_KINDS, eventById, unwatched, watch, type EventKind, type Recording } from '../game/story';
import { RECYCLE_AT, hasNode, holdMs, milestoneBase, passiveBonus } from '../game/layers';
import { STAGES, stageIndex, threatActive, threatMult } from '../game/threat';

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
/** The one that listens took Recycling: the black screen holds a little longer. */
const HEARD_MS = 6000;
/** "It left": the line heard in the silence stays this long unless tapped away. */
const LEFT_MS = 9000;
/** Lines the terminal types while it walks. */
const HUNT_LINES = [
  'КАМ-03: ДВИЖЕНИЕ В ЦЕХУ. ИСТОЧНИК НЕ ОПРЕДЕЛЁН',
  'ДАТЧИК ДВЕРИ ЦЕХА: ОТКРЫТО. ЗАКРЫТО. ОТКРЫТО',
  'ВЕС НА ЛЕНТЕ: 212 КГ. ЛЕНТА СТОИТ',
  'ОНО ИДЁТ НА ЗВУК',
  'ШАГИ НЕ СОВПАДАЮТ С ЭХОМ',
  'ОПЕРАТОР, СТАНЬТЕ ТИШЕ',
  'ДАТЧИК ДВИЖЕНИЯ: КОРИДОР К БУДКЕ',
];
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
/** Each extra line of a bundled notice stays up this much longer. */
const TOAST_LINE_MS = 900;
const TOAST_QUEUE_MAX = 12;

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
  private stageEl!: HTMLElement;
  private buyAllButton!: HTMLButtonElement;
  private toastSoon = false;
  private incomeEl!: HTMLElement;
  private lightButton!: HTMLButtonElement;
  private lostEl!: HTMLElement;
  private knownStage = 0;
  private losing = false;
  private journalPanel!: JournalPanel;
  private tracksPanel!: TracksPanel;
  private automationPanel!: AutomationPanel;
  private sortingPanel!: SortingPanel;
  private intro = new Intro();
  readonly sound = new Sound();
  private awayScreen = new AwayScreen();
  /** Camera 05 over the workshop, on the Upgrades tab. */
  private workshop = new WorkshopCam();
  /** Which layer the Layers tab shows. */
  private layerView: 'recycle' | 'sorting' = 'recycle';
  private layerSwitch!: HTMLElement;
  private layerButtons = new Map<'recycle' | 'sorting', HTMLButtonElement>();
  private knownSortOpen = false;
  /** Red marks on the tabs whose defence needs the player. */
  private dangerMarks = new Map<'dump' | 'plant', HTMLElement>();
  /** What the Layers badge called for that the player has already seen on the tab. */
  private layersSeen = new Set<string>();
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
  private hearingBar!: HearingBar;
  private alertEl!: HTMLButtonElement;
  /** Where the warning in the header sends the player. */
  private dangerAt: 'dump' | 'plant' | null = null;
  /** The warning last shown, so each new one is announced once. */
  private knownDanger = '';
  /** Phase of the one that listens the screen last showed. */
  private knownPhase: HearingPhase = 'idle';
  /** Seconds to the next footstep, breath, terminal line and flicker while it walks. */
  private huntClocks = { step: 1, breath: 3, say: 8, flicker: 2, near: 1.5 };
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
    for (const def of PRODUCERS) this.knownMilestones.set(def.id, milestonesReached(milestoneUnits(state, def.id)));
    this.knownRecycleReady = canRecycle(state);
    this.knownStage = stageIndex(state.threat.level);
    this.knownSortOpen = state.sorting.open;
    this.knownPhase = state.hearing.phase === 'caught' ? 'check' : state.hearing.phase;
  }

  private build(): void {
    const header = el('header', 'top');
    // The amount and its unit on one line, the flow and Recycled material on the next: the
    // header stays on every tab, so it is kept to what the player watches all the time.
    // The amount and the flow are one button: it opens where the income comes from.
    const figures = el('button', 'figures');
    figures.type = 'button';
    figures.id = 'income';
    figures.setAttribute('aria-expanded', 'false');
    const amount = el('div', 'amount');
    this.trashEl = el('span', 'trash', '0');
    amount.append(this.trashEl, el('span', 'trash-unit', 'кг'));
    const flows = el('div', 'flows');
    this.rateEl = el('span', 'rate', '+0 кг/с');
    this.layerEl = el('span', 'layer-line');
    this.layerEl.hidden = true;
    flows.append(this.rateEl, this.layerEl);
    figures.append(amount, flows);
    this.incomeEl = el('div', 'income-panel');
    this.incomeEl.hidden = true;
    figures.addEventListener('click', () => {
      // The header grows with the breakdown: a notice under it would slide over the floodlight.
      this.toastQueue = [];
      this.nextToast();
      this.incomeEl.hidden = !this.incomeEl.hidden;
      figures.setAttribute('aria-expanded', String(!this.incomeEl.hidden));
      this.render();
    });
    // Lines camera 00 types into the terminal on its own.
    this.consoleEl = el('div', 'console');
    this.consoleEl.hidden = true;
    this.consoleEl.addEventListener('click', () => this.catchLive('typing') || this.catchLive('voice'));
    this.hearingBar = new HearingBar((noise) => {
      setNoise(this.getState().hearing, noise);
      this.render();
    });
    // The floodlight and the noise live on their own tabs, by their cameras: in the header
    // only a warning, which says where to go when one of them needs the player.
    this.alertEl = el('button', 'alert');
    this.alertEl.type = 'button';
    this.alertEl.hidden = true;
    this.alertEl.addEventListener('click', () => this.goToDanger());
    header.append(figures, this.incomeEl, this.alertEl, this.consoleEl);

    this.recyclePanel = new RecyclePanel(
      this.getState,
      () => this.doRecycle(),
      (node) => {
        this.toast(`Дерево: ${node.name}`);
        this.sound.click();
        this.scene.flash('amber');
        this.caption(node.text);
        this.pop(this.rateEl, 'pulse');
        this.render();
      },
    );
    this.panels.set('recycle', this.recyclePanel.root);
    this.recyclePanel.camera.root.after(this.hearingBar.root);
    // A tap on camera 03 while something happens there catches it, like on camera 01.
    this.recyclePanel.camera.root.addEventListener('click', () => {
      const kind = this.recyclePanel.camera.live;
      if (kind) this.catchLive(kind);
    });

    this.sortingPanel = new SortingPanel(
      this.getState,
      () => this.doResort(false),
      (message) => {
        if (message) {
          this.sound.click();
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
        this.sound.click();
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
    const dumpTab = this.tabButton('dump', 'Свалка', ICONS.heap);
    // A red mark on the tab whose defence needs the player, on the other side from the amber one.
    for (const [tab, at] of [[dumpTab, 'dump'], [this.recycleTab, 'plant']] as const) {
      const mark = el('span', 'badge danger', '⚠');
      mark.hidden = true;
      tab.append(mark);
      this.dangerMarks.set(at, mark);
    }
    nav.append(dumpTab, upgradesTab, this.recycleTab, this.autoTab, journalTab, settingsTab);

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.hidden = true;
    // A tap clears the notice; whatever waited behind it comes next.
    this.toastEl.addEventListener('click', () => this.nextToast());

    this.lostEl = el('div', 'lost');
    this.lostEl.hidden = true;
    this.lostEl.setAttribute('role', 'alert');

    this.root.append(header, main, nav, this.toastEl, this.hearingBar.hush, this.lostEl, this.intro.root, this.awayScreen.root);
    // Every camera can fold away to a thin strip; one choice for all of them.
    for (const feed of this.root.querySelectorAll<HTMLElement>('.feed')) this.addCameraFold(feed);
    this.setCamerasFolded(camerasFolded());
    this.dread = new Dread(this.root, main, (line) => this.typeLine(line), this.sound);
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
    this.stageEl = el('div', 'threat-stage');
    text.append(this.threatBar, this.stageEl);

    this.lightButton = el('button', 'light', 'Прожектор');
    this.lightButton.type = 'button';
    this.lightButton.id = 'light';
    this.lightButton.setAttribute('aria-label', 'Прожектор: удерживайте, чтобы отогнать угрозу');
    let started = 0;
    let raf = 0;
    const tick = () => {
      const p = Math.min((performance.now() - started) / holdMs(this.getState().recycle), 1);
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
    this.sound.relay();
    this.scene.floodlight();
    this.knownStage = 0;
    if (was >= 0.5) this.caption('Свет. Оно отступило');
  }

  /** The thing reached the edge: black screen, camera 00, then the run starts over. */
  private loseRun(): void {
    if (this.losing) return;
    this.losing = true;
    this.sound.lost();
    this.glitch(2);
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
    if (PLANT_KINDS.includes(kind)) {
      if (kind === 'plantEcho' && !this.recyclePanel.root.hidden) this.sound.echo();
      return this.recyclePanel.camera.playEvent(kind);
    }
    if (kind === 'cam00') {
      this.feedLabel.textContent = 'КАМ-00 · ЯМА';
      this.feedLabel.classList.add('cam00');
      this.glitch(0.3);
      window.setTimeout(() => {
        this.feedLabel.textContent = 'КАМ-01 · СВАЛКА';
        this.feedLabel.classList.remove('cam00');
      }, CAM00_SECONDS * 1000);
      return CAM00_SECONDS;
    }
    if (kind === 'typing' || kind === 'voice') {
      const text = phrase ?? '';
      this.typeLine(text);
      if (kind === 'voice') this.glitch(0.6);
      return (text.length * TYPE_MS_PER_CHAR) / 1000 + 1.5;
    }
    this.scene.playEvent(kind, replay);
    const seconds: Partial<Record<EventKind, number>> = { lampTurn: 2.5, lampBlink: 3, eyes: 4.5, fridge: 5, gull: 5, bag: 6, note: 6, raccoon: 7, extra: 7, cat: 7, breathe: 8, driverless: 9 };
    return seconds[kind] ?? 5;
  }

  /** Back after a long absence: the terminal says how long, as if it was counting. */
  greet(seconds: number): void {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    this.typeLine(`ВАС НЕ БЫЛО ${h > 0 ? `${h} Ч ` : ''}${m} МИН. МЫ СЧИТАЛИ.`);
  }

  /** The screen after a long absence; `then` runs once it is closed. */
  /** A screen covers the game: the away report or a walk-through. */
  covered(): boolean {
    return !this.awayScreen.root.hidden || !this.intro.root.hidden;
  }

  showAway(report: AwayReport, capped: number | null, then: () => void): void {
    this.awayScreen.show(report, capped, then);
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
    const d = new Date(rec.at);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const mark = `◀◀ ЗАПИСЬ ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    this.replaying = true;
    let seconds: number;
    if (PLANT_KINDS.includes(event.kind)) {
      // Camera 03's recordings play on camera 03.
      this.layerView = 'recycle';
      this.show('recycle');
      this.recyclePanel.camera.root.scrollIntoView({ block: 'center', behavior: 'smooth' });
      seconds = this.recyclePanel.camera.playEvent(event.kind, mark);
      if (event.kind === 'plantEcho') this.sound.echo();
    } else {
      this.show('dump');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.playbackEl.textContent = mark;
      this.playbackEl.hidden = false;
      this.glitch(0.4);
      seconds = this.playKind(event.kind, rec.phrase, true);
    }
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
    panel.append(this.buildFeed(), this.buildThreat());

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
        this.sound.click();
        this.pop(button);
        if (before === 0) {
          // The first unit shows up on camera: make an entrance.
          this.glitch(0.6);
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
    this.buyAllButton = el('button', 'btn buy-all');
    this.buyAllButton.type = 'button';
    this.buyAllButton.id = 'buy-all';
    this.buyAllButton.hidden = true;
    this.buyAllButton.addEventListener('click', () => {
      const bought = buyAllUpgrades(this.getState());
      if (bought.length === 0) return;
      this.sound.click();
      for (const u of bought) this.toast(`Куплено: ${u.name}`);
      this.scene.flash('amber');
      this.workshop.bought();
      this.pop(this.rateEl, 'pulse');
      this.render();
    });
    head.append(this.upgradeCount, this.buyAllButton);
    panel.append(this.workshop.root, head);

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
    this.sound.click();
    this.scene.flash('amber');
    this.workshop.bought();
    this.pop(this.rateEl, 'pulse');
    if (def.id === 'compact' && state.compacted % COMPACT_MILESTONE === 0) {
      this.typeLine(`УПЛОТНЕНИЕ ×${state.compacted}. ТО, ЧТО ВНИЗУ, ПОДНЯЛОСЬ БЛИЖЕ`);
      this.glitch(0.8);
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
    this.glitch(0.4);
    this.toast(`Автопереработка №${state.recycle.resets}: +${format(gain)} вторсырья`);
    this.recyclePanel.camera.slam();
    this.sound.press();
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
      this.glitch(0.8);
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
        this.sound.chime();
      } else if (n.kind === 'anomaly') {
        if (this.losing) continue;
        this.typeLine(n.line);
        this.glitch(1.2);
        this.sortingPanel.camera.anomaly();
        this.sound.whisper();
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
    this.glitch(auto ? 0.6 : 2);
    this.sound.press();
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
        this.glitch(1.2);
        this.pop(this.threatEl, 'alarm');
        this.toast('Автопрожектор не включился. Держите свет сами!');
        this.automationPanel.camera.failed();
        this.sound.fail();
      } else {
        this.sound.relay();
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
        this.sound.click();
        this.toast(`Куплено: ${def.name}`);
        this.workshop.bought();
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

    panel.append(el('h2', 'panel-title', 'Звук'));
    panel.append(el('p', 'note', 'Музыка, которая темнеет с угрозой, свет, помехи и то, что шепчет. Звук включается с первым касанием в игре.'));
    const volumeRow = el('label', 'volume');
    const volumeValue = el('span', 'volume-value');
    const volume = el('input', 'volume-range');
    volume.type = 'range';
    volume.id = 'volume';
    volume.min = '0';
    volume.max = '100';
    volume.step = '5';
    volume.value = String(Math.round(this.sound.level * 100));
    volume.setAttribute('aria-label', 'Громкость');
    const showVolume = () => (volumeValue.textContent = volume.value === '0' ? 'выкл' : `${volume.value}%`);
    showVolume();
    volume.addEventListener('input', () => {
      this.sound.setVolume(Number(volume.value) / 100);
      showVolume();
    });
    // A tick on release, so the level can be heard.
    volume.addEventListener('change', () => this.sound.click());
    volumeRow.append(el('span', '', 'Громкость'), volume, volumeValue);
    const musicButton = el('button', 'btn');
    musicButton.type = 'button';
    musicButton.id = 'music';
    const showMusic = () => {
      musicButton.textContent = this.sound.musicPlaying ? 'Музыка: вкл' : 'Музыка: выкл';
      musicButton.setAttribute('aria-pressed', String(this.sound.musicPlaying));
    };
    showMusic();
    musicButton.addEventListener('click', () => {
      this.sound.setMusic(!this.sound.musicPlaying);
      showMusic();
    });
    panel.append(volumeRow, musicButton);

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
    // Shown after the current action, so notices from one burst (a bulk purchase) come as one.
    if (this.toastEl.hidden && !this.toastSoon) {
      this.toastSoon = true;
      queueMicrotask(() => {
        this.toastSoon = false;
        if (this.toastEl.hidden) this.nextToast();
      });
    }
  }

  /** Shows everything that waited as one notice, the same kinds of news folded together. */
  private nextToast(): void {
    const lines = bundle(this.toastQueue.splice(0));
    clearTimeout(this.toastTimer);
    if (lines.length === 0) {
      this.toastEl.hidden = true;
      return;
    }
    this.toastEl.replaceChildren(...lines.map((l) => el('div', 'toast-line', l)));
    // Just under the header: the threat and the floodlight must stay in sight and in reach.
    const header = this.root.querySelector('header');
    this.toastEl.style.top = `${Math.round(header?.getBoundingClientRect().bottom ?? 0) + 6}px`;
    this.toastEl.hidden = false;
    this.toastTimer = window.setTimeout(() => this.nextToast(), TOAST_MS + TOAST_LINE_MS * (lines.length - 1));
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
    if (!this.losing) this.huntFrame(dt, state);
    // Folded cameras draw nothing, which also spares the battery.
    if (this.root.dataset.cams === 'off') return;
    if (!this.sortingPanel.root.hidden) this.sortingPanel.frame(dt, state);
    if (!this.recyclePanel.root.hidden) this.recyclePanel.frame(dt, state);
    if (!this.automationPanel.root.hidden) this.automationPanel.frame(dt, state);
    if (!this.panels.get('upgrades')!.hidden) {
      this.workshop.update(dt, {
        bought: state.upgrades.length,
        total: UPGRADES.length,
        compact: state.tracks.compact ?? 0,
        bulk: state.tracks.bulk ?? 0,
        dark: state.tracks.dark ?? 0,
        threat: state.threat.level,
      });
    }
    this.scene.update(dt, {
      owned: state.owned,
      rate: ratePerSecond(state),
      total: state.runTrash,
      recycles: state.recycle.resets,
      threat: state.threat.level,
      traces: state.story.traces,
    });
  }

  /** Interference on camera 01, heard as static when it is more than a flicker. */
  private glitch(seconds: number): void {
    this.scene.glitch(seconds);
    if (seconds >= 0.5) this.sound.static(seconds);
  }

  /** A button on a camera that folds every camera to a strip, or opens them again. */
  private addCameraFold(feed: HTMLElement): void {
    const b = el('button', 'feed-fold');
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setCamerasFolded(this.root.dataset.cams !== 'off');
    });
    feed.append(b);
  }

  private setCamerasFolded(folded: boolean): void {
    this.root.dataset.cams = folded ? 'off' : 'on';
    for (const b of this.root.querySelectorAll<HTMLElement>('.feed-fold')) {
      b.textContent = folded ? '▾ камера' : '▴';
      b.setAttribute('aria-label', folded ? 'Показать камеры' : 'Свернуть камеры');
    }
    saveCamerasFolded(folded);
  }

  /** Runs the recycle and plays it on cameras 01 and 03. */
  private doRecycle(): void {
    const state = this.getState();
    const gain = recycle(state);
    if (gain.lte(0)) return;
    writeSave(state);
    this.resetKnown();
    this.toastQueue = [];
    this.glitch(1.4);
    this.scene.flash('amber');
    this.recyclePanel.camera.slam();
    this.sound.press();
    this.caption(`Переработка №${state.recycle.resets}: +${format(gain)} вторсырья`);
    this.toast(`Получено ${format(gain)} вторсырья. Доход ×${format(passiveBonus(state.recycle.total))}`);
    // The player stays on the tab: the press comes down on camera 03, and the tree is right there to spend on.
    this.render();
  }

  /** Announces producers, upgrades and milestones that appeared since the last check. */
  private announce(state: GameState): void {
    for (const id of state.revealed.slice(this.knownRevealed)) {
      this.toast(`Новый производитель: ${producerById(id)?.name}`);
      this.glitch(0.35);
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
      this.glitch(0.5);
      this.caption('Доступна переработка');
    }

    for (const def of PRODUCERS) {
      const units = milestoneUnits(state, def.id);
      const reached = milestonesReached(units);
      if (reached > (this.knownMilestones.get(def.id) ?? 0)) {
        const base = milestoneBase(state.recycle);
        this.toast(`${def.name}: ${prevMilestone(units)} шт, доход ×${base}`);
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
    this.rateEl.textContent = `+${format(ratePerSecond(state))} кг/с`;
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
      // Bulk counts extra units toward milestones: shown as owned + head start.
      const units = milestoneUnits(state, row.def.id);
      const head = units - owned;
      const from = prevMilestone(units);
      const to = nextMilestone(units);
      row.milestone.textContent = `${textBar((units - from) / (to - from), 8)} ${owned}${head > 0 ? `+${head}` : ''}/${to} → ×${milestoneBase(state.recycle)}`;
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
    // How many the button buys in a row, cheapest first, with the trash on hand.
    let left = state.trash;
    let inRow = 0;
    for (const u of [...shop].sort((a, b) => a.cost.cmp(b.cost))) {
      if (left.lt(u.cost)) break;
      left = left.sub(u.cost);
      inRow++;
    }
    this.buyAllButton.hidden = inRow < 2;
    this.buyAllButton.textContent = `Купить ${inRow} подряд`;
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
    // The badge calls for what is new since the player last looked at the tab.
    const calls = [...this.recyclePanel.attention(state), ...this.sortingPanel.attention(state)];
    const looking = !this.recyclePanel.root.hidden || !this.sortingPanel.root.hidden;
    this.layersSeen = new Set(calls.filter((c) => looking || this.layersSeen.has(c)));
    this.recycleBadge.hidden = calls.every((c) => this.layersSeen.has(c));
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
    this.layerEl.textContent = `${format(layer.points)} ВС · ×${format(passiveBonus(layer.total))}`;

    this.autoButton.hidden = !hasNode(layer, 'a1');
    this.autoButton.setAttribute('aria-pressed', String(state.autobuy));

    this.renderThreat(state);
    this.renderHearing(state);
    this.renderAlert(state);
    this.sound.setThreat(state.threat.level);
    if (!this.incomeEl.hidden) this.renderIncome(state);
  }

  /** Where the income comes from: the producers' own output and every multiplier on top. */
  private renderIncome(state: GameState): void {
    const { base, parts } = incomeBreakdown(state);
    const row = (mult: string, label: string, note: string, cls = '') => {
      const r = el('div', `income-row ${cls}`);
      r.append(el('span', 'income-mult', mult), el('span', 'income-label', label), el('span', 'income-note', note));
      return r;
    };
    this.incomeEl.replaceChildren(
      row(`${format(base)}`, 'Производители', 'кг/с без бонусов'),
      // Small multipliers keep two decimals: ×1.03 from a case should not read as ×1.0.
      ...parts.map((p) => row(`×${p.mult.lt(10) ? p.mult.toNumber().toFixed(2) : format(p.mult)}`, p.label, p.note, p.mult.lt(1) ? 'loss' : '')),
      row(`${format(ratePerSecond(state))}`, 'Итого', 'кг/с', 'total'),
    );
  }

  /** The plant's noise in the header, and what the one that listens is doing. */
  private renderHearing(state: GameState): void {
    const h = state.hearing;
    const open = state.sorting.open;
    if (open && !noiseToldOf()) {
      markNoiseTold();
      this.toast('Новое: шум цеха, во вкладке «Слои» под камерой цеха. Выше 100% — больше дохода. Но что-то слушает');
    }
    this.hearingBar.render(h, open);
    // The plant is heard only in the plant, on its own tab: elsewhere its din would never stop.
    this.sound.setPlant(open && !this.recyclePanel.root.hidden ? h.noise : 0);
    const was = this.knownPhase;
    this.knownPhase = h.phase;
    if (h.phase === was) return;
    if (h.phase === 'walk') {
      this.sound.heard();
      this.glitch(1.2);
      this.pop(this.hearingBar.root, 'alarm');
      this.typeLine('КАМ-03: ОНО УСЛЫШАЛО ЦЕХ');
      this.toast('ОНО УСЛЫШАЛО. Идёт к будке, остановить нельзя. Когда подойдёт: шум на 0 и ни звука 10 секунд');
      navigator.vibrate?.([200, 80, 200]);
    } else if (h.phase === 'check') {
      this.sound.step(1);
      this.glitch(0.8);
      this.pop(this.hearingBar.root, 'alarm');
      this.typeLine('ОНО У ДВЕРИ');
      this.toast('ОНО У ДВЕРИ. Минута: опустите шум до 0 и не трогайте 10 секунд');
      navigator.vibrate?.([300, 100, 300]);
    } else if (h.phase === 'caught') {
      this.loseToListener();
    } else if (h.phase === 'idle' && was === 'check') {
      this.itLeft(h.survived);
    }
  }

  /**
   * The warning in the header: what needs the player now and where, the most urgent
   * first. Hidden on the tab that already has what is needed.
   */
  private renderAlert(state: GameState): void {
    const h = state.hearing;
    const level = state.threat.level;
    const pct = (x: number) => `${Math.floor(x * 100)}%`;
    type Danger = { key: string; at: 'dump' | 'plant'; text: string };
    // Most urgent first.
    const dangers: (Danger | false)[] = [
      h.phase === 'check' && { key: 'check', at: 'plant', text: `ОНО У ДВЕРИ · 0:${pad2(Math.max(0, Math.ceil(h.left)))} · шум на 0 → Цех` },
      level >= 0.9 && { key: 'edge', at: 'dump', text: `Угроза ${pct(level)}! Прожектор → Свалка` },
      h.phase === 'walk' && { key: 'walk', at: 'plant', text: `ОНО ИДЁТ · ${Math.floor(Math.ceil(h.left) / 60)}:${pad2(Math.ceil(h.left) % 60)} · готовьте тишину → Цех` },
      level >= 0.7 && { key: 'threat', at: 'dump', text: `Угроза ${pct(level)} · прожектор → Свалка` },
      h.phase === 'idle' && h.meter >= 0.7 && { key: 'heard', at: 'plant', text: `Оно слушает ${pct(h.meter)} · убавьте шум → Цех` },
    ];
    // The tabs themselves show where the trouble is, whichever tab is open.
    for (const [at, mark] of this.dangerMarks) {
      const on = dangers.some((x) => x && x.at === at);
      mark.hidden = !on;
      this.tabs.get(at === 'dump' ? 'dump' : 'recycle')!.classList.toggle('danger', on);
    }
    const onDump = !this.panels.get('dump')!.hidden;
    const onPlant = !this.recyclePanel.root.hidden;
    // The tab on screen already shows its own danger: the warning points to the other one.
    const d = dangers.find((x): x is Danger => !!x && !(x.at === 'dump' ? onDump : onPlant));
    this.dangerAt = d ? d.at : null;
    this.alertEl.hidden = !d;
    if (!d) {
      this.knownDanger = '';
      return;
    }
    this.alertEl.textContent = `⚠ ${d.text}`;
    // A new kind of danger is announced once, wherever the player is.
    if (d.key !== this.knownDanger) {
      this.pop(this.alertEl, 'alarm');
      navigator.vibrate?.(120);
    }
    this.knownDanger = d.key;
  }

  /** The warning was tapped: straight to the floodlight or to the noise. */
  private goToDanger(): void {
    if (this.dangerAt === 'dump') {
      this.show('dump');
      this.threatEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (this.dangerAt === 'plant') {
      this.layerView = 'recycle';
      this.show('recycle');
      // The camera in the middle of the screen: the slider sits just under it.
      this.recyclePanel.camera.root.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    this.render();
  }

  /** Every frame while it walks or waits at the door: steps, breath, music coming apart, the screen. */
  private huntFrame(dt: number, state: GameState): void {
    const h = state.hearing;
    const near = h.phase === 'walk' ? nearness(h) : h.phase === 'check' ? 1 : 0;
    const holding = h.phase === 'check' && h.held > 0;
    hunt.near = near;
    this.sound.setHunt(near);
    this.sound.hush(holding);
    this.root.style.setProperty('--near', near.toFixed(3));
    if (h.phase === 'walk' || h.phase === 'check') this.root.dataset.hunt = holding ? 'hold' : h.phase;
    else delete this.root.dataset.hunt;
    if (near === 0) return;

    const c = this.huntClocks;
    for (const k of Object.keys(c) as (keyof typeof c)[]) c[k] -= dt;
    if (h.phase === 'walk') {
      if (c.step <= 0) {
        // Every 4 seconds at first, nearly every second at the end.
        c.step = (4 - 3.1 * near) * (0.85 + Math.random() * 0.3);
        this.sound.step(near);
        this.scene.glitch(0.08 + 0.15 * near);
        const main = this.root.querySelector('main');
        main?.classList.add('hunt-step');
        window.setTimeout(() => main?.classList.remove('hunt-step'), 140);
      }
      if (near > 0.5 && c.breath <= 0) {
        c.breath = 7 - 3 * near;
        this.sound.breath(near);
      }
      if (c.say <= 0) {
        c.say = 40 - 25 * near;
        this.typeLine(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]);
      }
      if (c.flicker <= 0) {
        c.flicker = (6 - 4.8 * near) * (0.6 + Math.random() * 0.8);
        this.dread.flicker();
      }
    } else if (holding) {
      // Silence: only it, right by the door.
      if (c.breath <= 0) {
        c.breath = 3.2;
        this.sound.breath(1, true);
      }
      if (c.near <= 0) {
        c.near = 1.6 + Math.random() * 1.6;
        this.sound.near();
      }
    } else {
      // At the door, waiting: breathing and the screen breaking, no more steps.
      if (c.breath <= 0) {
        c.breath = 3.5;
        this.sound.breath(1);
      }
      if (c.flicker <= 0) {
        c.flicker = 0.8 + Math.random();
        this.dread.flicker();
      }
    }
  }

  /** It heard: the black screen, then Recycling is gone. */
  private loseToListener(): void {
    if (this.losing) return;
    this.losing = true;
    hunt.near = 0;
    this.sound.hush(false);
    this.sound.setHunt(0);
    this.sound.heard();
    this.dread.scare();
    this.glitch(2);
    delete this.root.dataset.hunt;
    const lines = ['КАМ-03', 'ОНО УСЛЫШАЛО', 'ПЕРЕРАБОТКА ПОТЕРЯНА'];
    this.lostEl.replaceChildren(...lines.map((l, i) => el('div', `lost-line l${i}`, l)));
    this.lostEl.hidden = false;
    window.setTimeout(() => {
      const state = this.getState();
      loseToHearing(state);
      writeSave(state);
      this.resetKnown();
      this.toastQueue = [];
      this.lostEl.hidden = true;
      this.losing = false;
      this.show('dump');
      this.toast('Оно забрало свалку, улучшения и всю переработку. Сортировка осталась');
      this.render();
    }, HEARD_MS);
  }

  /** The silence held: it leaves, and what was heard in it is written down. */
  private itLeft(survived: number): void {
    this.sound.hush(false);
    const line = heardLine(survived);
    const box = el('div', 'lost left');
    box.setAttribute('role', 'status');
    box.append(el('div', 'lost-line l0', 'КАМ-03'), el('div', 'lost-line l1', 'ОНО УШЛО'), el('div', 'lost-line l2 heard-line', line));
    const close = () => {
      clearTimeout(timer);
      box.remove();
    };
    const timer = window.setTimeout(close, LEFT_MS);
    box.addEventListener('click', close);
    this.root.append(box);
    writeSave(this.getState());
    this.toast('Оно ушло. Услышанное записано в журнал');
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
      if (stage >= 2) this.glitch(0.4);
      if (stage >= 3) {
        this.pop(this.threatEl, 'alarm');
        this.sound.alarm();
      }
    }
    this.knownStage = stage;
    this.threatBar.textContent = `угроза ${textBar(level, 10)} ${Math.floor(level * 100)}%`;
    // How the dark changes income right now: the reason to wait before the light, or not to.
    const dark = threatMult(level, darkPeakOf(state));
    this.stageEl.textContent = `${STAGES[stage].name.toUpperCase()} · тьма ×${dark.toFixed(2)}`;
    this.stageEl.classList.toggle('gain', dark > 1.005);
    this.stageEl.classList.toggle('loss', dark < 0.995);
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

/** Whether the cameras are folded on this device: a display preference, so local storage is enough. */
const CAMS_KEY = 'scrap-idle-cams';

function camerasFolded(): boolean {
  try {
    return localStorage.getItem(CAMS_KEY) === 'off';
  } catch {
    return false;
  }
}

function saveCamerasFolded(folded: boolean): void {
  try {
    localStorage.setItem(CAMS_KEY, folded ? 'off' : 'on');
  } catch {
    // Without storage the cameras simply open again next time.
  }
}

/** Whether the plant's noise was introduced on this device; a convenience, so local storage is enough. */
const NOISE_KEY = 'scrap-idle-intro-noise';

function noiseToldOf(): boolean {
  try {
    return localStorage.getItem(NOISE_KEY) === '1';
  } catch {
    return true;
  }
}

function markNoiseTold(): void {
  try {
    localStorage.setItem(NOISE_KEY, '1');
  } catch {
    // Without storage it is simply told again next time.
  }
}
