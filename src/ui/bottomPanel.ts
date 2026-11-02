import {
  ABOVE_SCRIPTS,
  AUTO_OPEN,
  CONTAINERS,
  EPOCHS,
  EQUIPMENT,
  OBJECT_WORK,
  activeObject,
  objectReady,
  objectUnlocked,
  pressure,
  borerCost,
  buyBorer,
  buyEquipment,
  depthTarget,
  findMultiplier,
  supplyRate,
  DIG_SCRAP,
  DIG_NONFERROUS,
  savingGoal,
  savingGoals,
  buySavingGoal,
  type SavingGoal,
  showcaseScore,
  ITEMS,
  RARITIES,
  RARITY_NAMES,
  TOOLS,
  buyAboveScript,
  buyAuto,
  buyTool,
  canOpen,
  containerById,
  digRate,
  epochItems,
  fallPerMinute,
  melt,
  meltCost,
  openOne,
  rarityOdds,
  setPower,
  toolCost,
  umeOpen,
  type ContainerId,
  type ItemDef,
  type Opening,
  type Rarity,
} from '../game/bottom';
import { D, format, type Decimal } from '../game/num';
import { scriptById, type ScriptId } from '../game/scripts';
import type { GameState } from '../game/state';
import { el } from './dom';
import { Fold } from './fold';
import { PitCam } from './pitCam';

/** Colours of the rarities, for the frame flash; the rest is in the stylesheet. */
const RARITY_COLOR: Record<Rarity, string> = {
  dust: '#7f9a86',
  scrap: '#9fe8a8',
  nonferrous: '#6fd6e0',
  antique: '#ffbf47',
  relic: '#ff8a4c',
  anomaly: '#ff4d6d',
};

/** Width of a card on the strip, with its gap, in px. */
const CARD = 92;
/** Cards on the strip before the one it stops on. */
const LEAD = 26;
const SPIN_MS = 2600;

/**
 * The bottom of the pit, on the Layers tab: camera 09, the currencies, the strip that
 * runs when a container is opened, the containers Ignatyev has dug out, his tools, the
 * melting ladder up to the УМЕ, the scripts that run the world above, and the collection.
 */
export class BottomPanel {
  readonly root: HTMLElement;
  readonly camera = new PitCam();
  private meta!: HTMLElement;
  private operation!: HTMLElement;
  private progress!: HTMLProgressElement;
  private target!: HTMLElement;
  private targetReward!: HTMLElement;
  private siteStatus!: HTMLElement;
  private routeControls!: HTMLElement;
  private siteSelect!: HTMLSelectElement;
  private siteLaunch!: HTMLButtonElement;
  private benchControls!: HTMLElement;
  private reveal!: HTMLElement;
  private revealUntil = 0;
  private supply!: HTMLElement;
  private equipmentUpdaters: ((s: GameState) => void)[] = [];
  private money = new Map<Rarity, HTMLElement>();
  private ume!: HTMLElement;
  private strip!: HTMLElement;
  private stripWindow!: HTMLElement;
  private result!: HTMLElement;
  private spinning = 0;
  private reelVisible = false;
  private reelObserver: IntersectionObserver | null = null;
  private activeAuto: { opening: Opening; count: number } | null = null;
  private savingSelect!: HTMLSelectElement;
  private savingNote!: HTMLElement;
  private savingBuy!: HTMLButtonElement;
  private savingSignature = '';
  private playingAuto = false;
  private nextAutoAt = 0;
  private pendingAuto: { count: number; best: Opening | null } = { count: 0, best: null };
  private bottomIdentity: GameState['bottom'] | null = null;
  private caseArt!: HTMLElement;
  private caseName!: HTMLElement;
  private caseMode!: HTMLElement;
  private caseNote!: HTMLElement;
  private crates = new Map<ContainerId, { row: HTMLElement; count: HTMLElement; one: HTMLButtonElement; all: HTMLButtonElement }>();
  private updaters: ((s: GameState) => void)[] = [];
  private finds!: HTMLElement;
  private shownFinds = '';
  private collection!: HTMLElement;
  private shownCollection = '';

  constructor(
    private getState: () => GameState,
    private onChange: (message?: string, loud?: boolean) => void,
  ) {
    this.root = el('section', 'panel bottom');
    this.build();
  }

  private build(): void {
    const head = el('div', 'panel-head');
    this.meta = el('span', 'panel-meta');
    head.append(el('h2', 'panel-title', 'Дно ямы'), this.meta);

    this.operation = el('div', 'b-operation');
    this.target = el('div', 'b-target');
    this.targetReward = el('div', 'b-target-reward');
    this.progress = el('progress', 'b-depth-progress');
    this.progress.max = 1;
    this.progress.setAttribute('aria-label', 'Продвижение к следующему пласту');
    this.siteStatus = el('div', 'b-site-status');
    this.routeControls = el('div', 'b-routes');
    for (const [id, label] of [['auto', 'АВТО'], ['depth', 'В ГЛУБИНУ'], ['site', 'К ОБЪЕКТУ'], ['seam', 'К ЖИЛЕ']] as const) {
      const button = el('button', 'btn b-route', label);
      button.type = 'button';
      button.dataset.route = id;
      button.addEventListener('click', () => {
        const b = this.getState().bottom;
        b.route = id;
        if (id === 'site') b.siteId = this.siteSelect.value as typeof b.siteId;
        this.onChange();
      });
      this.routeControls.append(button);
    }
    this.siteSelect = el('select', 'b-site-select');
    this.siteSelect.setAttribute('aria-label', 'Объект раскопки');
    this.siteSelect.addEventListener('change', () => {
      const b = this.getState().bottom;
      b.siteId = this.siteSelect.value as typeof b.siteId;
      b.route = 'site';
      this.onChange();
    });
    this.siteLaunch = el('button', 'btn b-site-launch');
    this.siteLaunch.type = 'button';
    this.siteLaunch.addEventListener('click', () => {
      const b = this.getState().bottom;
      const id = (['hoist', 'bench', 'borer'] as const).find((key) => objectReady(b, key) && !(key === 'borer' ? b.equipment.borer > 0 : b.equipment[key]));
      if (!id) return;
      if (id === 'borer' ? buyBorer(b) : buyEquipment(b, id)) this.onChange('purchase');
    });
    this.benchControls = el('div', 'b-bench-controls');
    for (const [mode, label] of [['scrap', 'ЛОМ'], ['nonferrous', 'ЦВЕТМЕТ']] as const) {
      const button = el('button', 'btn b-bench-mode', label);
      button.type = 'button';
      button.dataset.mode = mode;
      button.addEventListener('click', () => { this.getState().bottom.benchMode = mode; this.onChange(); });
      this.benchControls.append(button);
    }
    this.reveal = el('div', 'b-ume-reveal');
    this.operation.append(el('div', 'b-operation-label', '> РАСКОПКИ'), this.target, this.progress, this.targetReward, this.siteStatus, this.routeControls, this.siteSelect, this.siteLaunch, this.benchControls, this.reveal);
    const supplyDetails = el('details', 'b-supply');
    supplyDetails.append(el('summary', '', 'Снабжение с поверхности'));
    this.supply = el('p', 's-why');
    supplyDetails.append(this.supply);

    const wallet = el('div', 'b-money');
    for (const r of RARITIES) {
      const cell = el('div', `b-coin r-${r}`);
      const value = el('span', 'b-coin-value', '0');
      cell.append(el('span', 'b-coin-name', RARITY_NAMES[r]), value);
      this.money.set(r, value);
      wallet.append(cell);
    }
    const ume = el('div', 'b-coin b-ume');
    ume.id = 'bottom-ume';
    this.ume = el('span', 'b-coin-value', '0');
    ume.append(el('span', 'b-coin-name', 'УМЕ'), this.ume);
    wallet.append(ume);

    const openingHead = el('div', 'b-opening-head');
    this.caseArt = el('pre', 'b-case-art', '[ --- ]');
    this.caseArt.setAttribute('aria-hidden', 'true');
    const openingText = el('div', 'b-case-text');
    this.caseMode = el('div', 'b-case-mode', 'ВСКРЫТИЕ');
    this.caseName = el('div', 'b-case-name', 'Ожидаем контейнер');
    this.caseNote = el('div', 'b-case-note', 'Награда появится здесь');
    openingText.append(this.caseMode, this.caseName, this.caseNote);
    openingHead.append(this.caseArt, openingText);

    // The strip: a window with a marker; the cards run under it and stop on the find.
    this.stripWindow = el('div', 'b-reel');
    this.strip = el('div', 'b-strip');
    this.stripWindow.append(this.strip, el('div', 'b-marker'));
    // Before the first opening: blank cards, so it reads as a strip.
    this.strip.replaceChildren(...Array.from({ length: 6 }, () => el('div', 'b-card b-card-blank', '?')));
    this.result = el('div', 'b-result', 'Игнатьев копает. Выкопанное вскрываете вы.');

    const crates = el('div', 'b-list');
    for (const c of CONTAINERS) {
      const row = el('div', 'b-row');
      const text = el('div', 'b-row-text');
      const count = el('span', 'b-row-count');
      const title = el('div', 'b-row-title');
      title.append(el('span', '', c.name), count);
      text.append(title, el('div', 'b-row-sub', c.cost ? `вскрыть: ${c.cost} · ${RARITY_NAMES[c.costIn].toLowerCase()}` : 'вскрыть: бесплатно'));
      const one = el('button', 'btn b-open', 'Вскрыть');
      one.type = 'button';
      one.id = `open-${c.id}`;
      one.addEventListener('click', () => this.openWithStrip(c.id));
      const all = el('button', 'btn b-open b-all', 'Все');
      all.type = 'button';
      all.addEventListener('click', () => this.openAll(c.id));
      row.append(text, one, all);
      crates.append(row);
      this.crates.set(c.id, { row, count, one, all });
    }

    this.finds = el('div', 'b-finds');
    const saving = el('div', 'b-saving');
    const savingLabel = el('label', 'b-saving-label', 'Копить на улучшение');
    this.savingSelect = el('select', 'b-saving-select');
    this.savingSelect.id = 'bottom-saving';
    savingLabel.htmlFor = this.savingSelect.id;
    this.savingNote = el('div', 'b-saving-note');
    this.savingBuy = el('button', 'btn b-saving-buy', 'Купить цель');
    this.savingBuy.type = 'button';
    this.savingBuy.addEventListener('click', () => {
      if (buySavingGoal(this.getState().bottom)) this.onChange('purchase');
    });
    this.savingSelect.addEventListener('change', () => {
      this.getState().bottom.saving = this.savingSelect.value || null;
      this.pauseAutoPresentation();
      this.onChange();
    });
    saving.append(savingLabel, this.savingSelect, this.savingNote, this.savingBuy);

    const equipment = el('div', 'b-list b-equipment');
    for (const e of EQUIPMENT) {
      const row = this.buyRow(e.name, e.text,
        (s) => s.bottom.equipment[e.id] ? null : { cost: D(e.cost), costIn: e.costIn,
          level: s.bottom.dug < e.depth ? `после ${format(D(e.depth))} т` : !objectReady(s.bottom, e.id) ? `откопать ${format(D(Math.floor(s.bottom.objectWork[e.id])))} / ${OBJECT_WORK[e.id]} т` : 'готов к запуску' },
        () => buyEquipment(this.getState().bottom, e.id) && e.name, 'Работает');
      row.id = `bottom-${e.id}`;
      equipment.append(row);
      this.equipmentUpdaters.push((s) => {
        if (!objectReady(s.bottom, e.id)) row.querySelector('button')!.disabled = true;
      });
    }
    const borer = el('div', 'b-row');
    borer.id = 'bottom-borer';
    const borerText = el('div', 'b-row-text');
    const borerTitle = el('div', 'b-row-title', 'Проходчик');
    const borerSub = el('div', 'b-row-sub');
    const borerButton = el('button', 'btn b-buy');
    borerButton.type = 'button';
    borerButton.addEventListener('click', () => { if (buyBorer(this.getState().bottom)) this.onChange(); });
    borerText.append(borerTitle, borerSub);
    borer.append(borerText, borerButton);
    equipment.append(borer);
    this.equipmentUpdaters.push((s) => {
      const b = s.bottom;
      borerTitle.textContent = `Проходчик · ур. ${b.equipment.borer}`;
      borer.hidden = !b.firstUmeGranted;
      borerSub.textContent = b.equipment.borer > 0 ? '×1,5 к раскопке за уровень · жила: 1 аномалия / 20 т' : objectReady(b, 'borer') ? 'Корпус освобождён · можно запустить' : `Откопать корпус: ${format(D(Math.floor(b.objectWork.borer)))} / 600 т`;
      borerButton.textContent = `${format(borerCost(b))} УМЕ`;
      borerButton.disabled = !umeOpen(b) || (b.equipment.borer === 0 && !objectReady(b, 'borer')) || b.ume.lt(borerCost(b));
    });

    const tools = el('div', 'b-list');
    for (const t of TOOLS) {
      tools.append(
        this.buyRow(
          t.name,
          t.text,
          (s) => {
            const lv = s.bottom.tools[t.id];
            return lv >= t.max ? null : { cost: toolCost(t, lv), costIn: t.costIn, level: `ур. ${lv}/${t.max}` };
          },
          () => buyTool(this.getState().bottom, t.id) && `${t.name}: ур. ${this.getState().bottom.tools[t.id]}`,
        ),
      );
    }
    tools.append(
      this.buyRow(
        'Автовскрытие',
        '',
        (s) => {
          const next = AUTO_OPEN[s.bottom.auto];
          return next ? { cost: D(next.cost), costIn: next.costIn, level: next.name } : null;
        },
        () => buyAuto(this.getState().bottom) && `Автовскрытие: ${AUTO_OPEN[this.getState().bottom.auto - 1].name.toLowerCase()}`,
      ),
    );

    const ladder = el('div', 'b-list');
    for (const r of RARITIES) ladder.append(this.meltRow(r));

    const above = el('div', 'b-list');
    for (const sc of ABOVE_SCRIPTS) {
      const def = scriptById(sc.id as ScriptId)!;
      above.append(
        this.buyRow(
          def.title,
          def.text,
          (s) => (s.bottom.scripts.includes(sc.id) ? null : { cost: D(sc.cost), costIn: sc.costIn, level: '' }),
          () => buyAboveScript(this.getState().bottom, sc.id) && `Наверху поставлен скрипт: ${def.title}`,
          'Стоит',
        ),
      );
    }

    this.collection = el('div', 'b-collection');

    const section = (title: string) => {
      const h = el('div', 'panel-head');
      h.append(el('h2', 'panel-title', title));
      return h;
    };
    this.root.append(
      this.camera.root,
      head,
      this.operation,
      supplyDetails,
      wallet,
      openingHead,
      this.stripWindow,
      this.result,
      crates,
      this.finds,
      saving,
      section('Оборудование'),
      equipment,
      section('Инструменты Игнатьева'),
      tools,
      section('Переплавка'),
      ladder,
      section('Наверху'),
      el('p', 's-why', 'Скрипты для заново начатой игры наверху.'),
      above,
      section('Коллекция'),
      this.collection,
    );
  }

  /** A row with a name, a line under it and a buy button; `offer` null means bought out. */
  private buyRow(
    name: string,
    text: string,
    offer: (s: GameState) => { cost: Decimal; costIn: Rarity; level: string } | null,
    buy: () => string | false,
    doneLabel = 'Макс',
  ): HTMLElement {
    const row = el('div', 'b-row');
    const body = el('div', 'b-row-text');
    const sub = el('div', 'b-row-sub', text);
    const level = el('span', 'b-row-count');
    const title = el('div', 'b-row-title');
    title.append(el('span', '', name), level);
    body.append(title, sub);
    const button = el('button', 'btn b-buy');
    button.type = 'button';
    button.addEventListener('click', () => {
      const message = buy();
      if (message) this.onChange(message);
    });
    row.append(body, button);
    this.updaters.push((s) => {
      const o = offer(s);
      if (!o) {
        level.textContent = '';
        button.textContent = doneLabel;
        button.disabled = true;
        row.classList.add('done');
        return;
      }
      row.classList.remove('done');
      level.textContent = o.level;
      button.textContent = `${format(o.cost)} · ${RARITY_NAMES[o.costIn].toLowerCase()}`;
      button.className = `btn b-buy r-${o.costIn}`;
      button.disabled = s.bottom.money[o.costIn].lt(o.cost);
    });
    return row;
  }

  /** One step of the ladder: this currency into the next, one at a time or all of it. */
  private meltRow(from: Rarity): HTMLElement {
    const i = RARITIES.indexOf(from);
    const to = i + 1 < RARITIES.length ? RARITY_NAMES[RARITIES[i + 1]] : 'УМЕ';
    const row = el('div', 'b-row');
    const body = el('div', 'b-row-text');
    const title = el('div', 'b-row-title');
    const sub = el('div', 'b-row-sub');
    title.append(el('span', `r-${from}`, RARITY_NAMES[from]), el('span', 'b-row-count', `→ ${to}`));
    body.append(title, sub);
    const one = el('button', 'btn b-open', '×1');
    one.type = 'button';
    const all = el('button', 'btn b-open b-all', 'Всё');
    all.type = 'button';
    const go = (times: number) => {
      const b = this.getState().bottom;
      const n = melt(b, from, times);
      if (n > 0) this.onChange(from === 'anomaly' ? `УМЕ +${n}` : 'melt', from === 'anomaly');
    };
    one.addEventListener('click', () => go(1));
    all.addEventListener('click', () => go(1e9));
    row.append(body, one, all);
    this.updaters.push((s) => {
      const b = s.bottom;
      row.hidden = from === 'anomaly' && !b.firstUmeGranted;
      const per = meltCost(b, from);
      const locked = from === 'anomaly' && !umeOpen(b);
      sub.textContent = locked ? `${per} → 1, только на глубине «Не люди»` : `${per} → 1`;
      const can = !locked && b.money[from].gte(per);
      one.disabled = !can;
      all.disabled = !can;
    });
    return row;
  }

  /** Manual openings take priority over the automatic presentation. */
  private openWithStrip(id: ContainerId): void {
    if (this.spinning && !this.playingAuto) return;
    const opening = openOne(this.getState().bottom, id, Math.random);
    if (opening) this.playOpening(opening, false, 1);
  }

  /** Present an actual paid opening; animation never opens or pays a container again. */
  private playOpening(opening: Opening, automatic: boolean, count: number): void {
    clearTimeout(this.spinning);
    this.playingAuto = automatic;
    this.activeAuto = automatic ? { opening, count } : null;
    const b = this.getState().bottom;
    const id = opening.container;
    const odds = rarityOdds(b, id);
    const reached = EPOCHS.filter((e) => b.dug >= e.depth).map((e) => e.id);
    const filler = (): ItemDef => {
      const total = odds.reduce((x, y) => x + y, 0);
      let r = Math.random() * total;
      let rarity: Rarity = 'dust';
      for (let k = 0; k < RARITIES.length; k++) {
        r -= odds[k];
        if (r < 0) { rarity = RARITIES[k]; break; }
      }
      const pool = ITEMS.filter((it) => it.rarity === rarity && reached.includes(it.epoch));
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const cards = [...Array.from({ length: LEAD }, filler), opening.item, ...Array.from({ length: 4 }, filler)];
    this.strip.replaceChildren(...cards.map((it) => this.card(it, b.found[it.id] ?? 0)));
    this.stripWindow.className = 'b-reel';
    this.strip.style.transition = 'none';
    this.strip.style.transform = 'translateX(0)';
    const width = this.stripWindow.clientWidth || 358;
    const target = -(LEAD * CARD + CARD / 2 - width / 2) + (Math.random() - 0.5) * (CARD * 0.6);
    const art: Record<ContainerId, string> = {
      sack: '  ___  \n /###\\ \n \\___/ ', crate: '+-----+\n| X X |\n+-----+',
      suitcase: '  ___  \n[|___|]\n[=====]', safe: '+-----+\n| (x) |\n+-----+', coffin: ' /---\\ \n|  +  |\n \\___/ ',
    };
    this.caseArt.textContent = art[id];
    this.caseArt.classList.add('is-opening');
    this.caseName.textContent = containerById(id)!.name;
    this.caseMode.textContent = automatic ? 'АВТОВСКРЫТИЕ' : 'РУЧНОЕ ВСКРЫТИЕ';
    this.caseNote.textContent = count > 1 ? `Лучшее из партии: ${format(D(count))} вскрытий` : 'Вскрываем…';
    this.result.classList.remove('b-prize-rare');
    const previous = this.result.querySelector('.b-prize-label');
    if (previous) previous.textContent = 'ПРЕДЫДУЩАЯ НАГРАДА';
    void this.strip.offsetWidth;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = automatic ? 1400 : SPIN_MS;
    this.strip.style.transition = reduce ? 'none' : `transform ${duration}ms cubic-bezier(0.12, 0.7, 0.1, 1)`;
    this.strip.style.transform = `translateX(${target}px)`;
    const identity = b;
    this.spinning = window.setTimeout(() => {
      this.spinning = 0;
      if (this.getState().bottom !== identity) return;
      this.landed(opening, automatic, count);
    }, reduce ? 0 : duration + 100);
    this.render(this.getState());
  }

  private landed(o: Opening, automatic: boolean, count: number): void {
    this.playingAuto = false;
    this.activeAuto = null;
    this.caseArt.classList.remove('is-opening');
    const r = o.item.rarity;
    const rare = RARITIES.indexOf(r) >= 3;
    this.stripWindow.className = `b-reel r-${r}${rare ? ' b-reel-rare' : ''}`;
    this.result.className = `b-result r-${r}${rare ? ' b-prize-rare' : ''}`;
    const name = el('div', 'b-prize-name', o.item.name);
    const label = el('div', 'b-prize-label', `${o.fresh ? 'НОВАЯ НАХОДКА · ' : ''}${RARITY_NAMES[r].toUpperCase()}`);
    const amount = el('div', 'b-prize-amount', `+${format(o.amount)} ${RARITY_NAMES[r].toLowerCase()}`);
    const detail = el('div', 'b-prize-detail', o.item.text);
    this.result.replaceChildren(label, name, amount, detail);
    this.caseNote.textContent = count > 1 ? `Партия ${format(D(count))} · показана лучшая находка` : 'Награда получена';
    this.nextAutoAt = performance.now() + (rare ? 3500 : 1200);
    if (rare) this.camera.find(RARITY_COLOR[r]);
    // Automatic results stay inside the panel, without sounds or notification spam.
    this.onChange(!automatic && RARITIES.indexOf(r) >= 4 ? `${RARITY_NAMES[r]}: ${o.item.name}` : undefined, !automatic);
  }

  /** Opens every container of a kind the money allows, without the strip; says what came out. */
  private openAll(id: ContainerId): void {
    if (this.spinning && !this.playingAuto) return;
    clearTimeout(this.spinning);
    this.spinning = 0;
    this.playingAuto = false;
    this.activeAuto = null;
    const b = this.getState().bottom;
    const got: Partial<Record<Rarity, Decimal>> = {};
    let n = 0;
    let fresh = 0;
    let best: Opening | null = null;
    for (; n < 500 && canOpen(b, id); n++) {
      const o = openOne(b, id, Math.random)!;
      got[o.item.rarity] = (got[o.item.rarity] ?? D(0)).add(o.amount);
      if (o.fresh) fresh++;
      if (!best || RARITIES.indexOf(o.item.rarity) > RARITIES.indexOf(best.item.rarity)) best = o;
    }
    if (n === 0) return;
    const parts = RARITIES.filter((r) => got[r]).map((r) => `${RARITY_NAMES[r].toLowerCase()} +${format(got[r]!)}`);
    this.result.textContent = `Вскрыто ${n}: ${parts.join(', ')}${fresh ? ` · новых находок: ${fresh}` : ''}`;
    this.result.className = `b-result r-${best!.item.rarity}`;
    if (RARITIES.indexOf(best!.item.rarity) >= 3) this.camera.find(RARITY_COLOR[best!.item.rarity]);
    this.nextAutoAt = performance.now() + 3500;
    this.onChange();
  }

  private card(it: ItemDef, seen: number): HTMLElement {
    const c = el('div', `b-card r-${it.rarity}`);
    c.append(el('span', 'b-card-rarity', RARITY_NAMES[it.rarity]), el('span', 'b-card-name', seen ? it.name : '???'));
    return c;
  }

  render(state: GameState): void {
    const b = state.bottom;
    if (this.bottomIdentity !== b) {
      clearTimeout(this.spinning);
      this.spinning = 0;
      this.playingAuto = false;
      this.pendingAuto = { count: 0, best: null };
      this.activeAuto = null;
      this.bottomIdentity = b;
      this.caseMode.textContent = b.auto > 0 ? 'АВТОВСКРЫТИЕ' : 'ВСКРЫТИЕ';
      this.caseName.textContent = 'Ожидаем контейнер';
      this.caseNote.textContent = 'Награда появится здесь';
      this.caseArt.textContent = '[ --- ]';
      this.caseArt.classList.remove('is-opening');
      this.result.className = 'b-result';
      this.result.textContent = 'Игнатьев копает. Выкопанное вскрывается здесь.';
    }
    const target = depthTarget(b);
    const current = [...EPOCHS].reverse().find((e) => b.dug >= e.depth)!;
    this.meta.textContent = current.name;
    this.target.textContent = `${target.name} · ${format(D(Math.floor(b.dug)))} / ${format(D(target.to))} т`;
    this.progress.value = Math.max(0, Math.min(1, (b.dug - target.from) / (target.to - target.from)));
    this.progress.setAttribute('aria-valuetext', `${Math.round(this.progress.value * 100)}% до пласта «${target.name}»`);
    this.targetReward.textContent = `Откроется: ${target.reward.toLowerCase()}`;
    const fall = fallPerMinute(b.above, state.city.development);
    const site = activeObject(b);
    const objects = (['hoist', 'bench', 'borer'] as const).filter((id) => objectUnlocked(b, id) && !objectReady(b, id));
    const names = { hoist: 'Подъёмник', bench: 'Разборочный стол', borer: 'Проходчик' };
    const focus = site ?? objects[0];
    const ready = (['hoist', 'bench', 'borer'] as const).find((id) => objectReady(b, id) && !(id === 'borer' ? b.equipment.borer > 0 : b.equipment[id]));
    this.siteStatus.textContent = focus ? `${names[focus]} [${'█'.repeat(Math.floor(10 * b.objectWork[focus] / OBJECT_WORK[focus]))}${'░'.repeat(10 - Math.floor(10 * b.objectWork[focus] / OBJECT_WORK[focus]))}] ${Math.floor(b.objectWork[focus])}/${OBJECT_WORK[focus]} т`
      : ready ? `${names[ready]} освобождён · готов к запуску` : '';
    this.siteSelect.replaceChildren(...objects.map((id) => new Option(names[id], id)));
    if (objects.length && objects.includes(b.siteId)) this.siteSelect.value = b.siteId;
    this.siteSelect.hidden = objects.length < 2;
    this.siteLaunch.hidden = !ready;
    if (ready) {
      const cost = ready === 'borer' ? borerCost(b) : D(ready === 'hoist' ? 40 : 12);
      const currency = ready === 'borer' ? 'УМЕ' : ready === 'hoist' ? 'лома' : 'цветмета';
      this.siteLaunch.textContent = `ЗАПУСТИТЬ ${names[ready].toUpperCase()} · ${format(cost)} ${currency}`;
      this.siteLaunch.disabled = ready === 'borer' ? b.ume.lt(cost) : b.money[ready === 'hoist' ? 'scrap' : 'nonferrous'].lt(cost);
    }
    this.routeControls.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const route = button.dataset.route;
      button.hidden = route === 'site' ? objects.length === 0 : route === 'seam' && b.equipment.borer === 0;
      button.classList.toggle('active', route === b.route);
    });
    this.benchControls.hidden = !b.equipment.bench;
    this.benchControls.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.classList.toggle('active', button.dataset.mode === b.benchMode));
    if (b.firstUmeGranted && !b.firstUmePresented) {
      this.reveal.textContent = 'НЕИЗВЕСТНАЯ ЕДИНИЦА → УМЕ ×1';
      this.revealUntil = performance.now() + 4500;
      b.firstUmePresented = true;
      this.camera.find('#e6bf69');
    }
    this.reveal.hidden = performance.now() >= this.revealUntil;
    this.supply.textContent = `Сверху ${fall.toFixed(1)} т/мин → разбор до ${supplyRate(b)} т/мин. `
      + `В запасе ${format(D(b.heap))} т. Из тонны: 1 труха${b.equipment.bench ? b.benchMode === 'scrap' ? ' и 0,25 лома' : ' и 0,12 цветмета' : ''}. `
      + `Раскопки ${digRate(b, fall).toFixed(1)} т/мин${pressure(b, fall) > 1 ? ` · напор сверху ×${pressure(b, fall).toFixed(2)}` : ''}; с тонны +${DIG_SCRAP} лома и +${DIG_NONFERROUS} цветмета. `
      + (findMultiplier(b) > 1 ? `Добыча находок ×${findMultiplier(b).toFixed(1)}.` : 'Мусор сверху не уменьшает достигнутую глубину.');
    for (const r of RARITIES) this.money.get(r)!.textContent = format(b.money[r].floor());
    this.ume.textContent = format(b.ume);
    document.getElementById('bottom-ume')!.hidden = !b.firstUmeGranted;
    this.renderSaving(state);
    for (const c of CONTAINERS) {
      const view = this.crates.get(c.id)!;
      const n = b.stock[c.id];
      view.count.textContent = `×${n}`;
      view.row.classList.toggle('none', n === 0);
      const can = canOpen(b, c.id) && (!this.spinning || this.playingAuto);
      view.one.disabled = !can;
      view.all.disabled = !can;
    }
    for (const u of this.updaters) u(state);
    for (const u of this.equipmentUpdaters) u(state);
    // The last finds the automatic opening made, when it runs.
    const sig = b.recent.map((o) => o.item.id + b.opened).join();
    if (sig !== this.shownFinds && !this.spinning && this.reelVisible) {
      this.shownFinds = sig;
      this.finds.replaceChildren(
        ...b.recent.slice(0, 5).map((o) => el('div', `b-find r-${o.item.rarity}`, `${o.fresh ? 'новое · ' : ''}${o.item.name} +${format(o.amount)}`)),
      );
    }
    this.renderCollection(state);
  }

  private goalName(goal: SavingGoal): string {
    return goal.id.startsWith('script:') ? `Скрипт: ${scriptById(goal.id.slice(7))!.title}` : goal.name;
  }

  private renderSaving(state: GameState): void {
    const b = state.bottom, goals = savingGoals(b);
    const signature = JSON.stringify(goals.map((g) => [g.id, g.cost.toString(), g.unlocked]));
    // Do not replace native iPhone select options while the player is choosing a goal.
    if (signature !== this.savingSignature && document.activeElement !== this.savingSelect) {
      this.savingSignature = signature;
      this.savingSelect.replaceChildren(new Option('Без резерва', ''), ...goals.map((g) =>
        new Option(`${this.goalName(g)} · ${format(g.cost)} ${g.costIn === 'ume' ? 'УМЕ' : RARITY_NAMES[g.costIn].toLowerCase()}${g.unlocked ? '' : ' · позже'}`, g.id)));
    }
    if (document.activeElement !== this.savingSelect) this.savingSelect.value = b.saving ?? '';
    const goal = savingGoal(b);
    this.savingBuy.hidden = !goal;
    if (!goal) {
      this.savingNote.textContent = 'Выберите покупку: автовскрытие будет использовать только избыток ресурсов.';
      return;
    }
    const money = goal.costIn === 'ume' ? b.ume : b.money[goal.costIn];
    const currency = goal.costIn === 'ume' ? 'УМЕ' : RARITY_NAMES[goal.costIn].toLowerCase();
    this.savingNote.textContent = `${format(money.min(goal.cost).floor())} / ${format(goal.cost)} ${currency} отложено. Автовскрытие тратит только избыток.`;
    this.savingBuy.textContent = goal.unlocked ? `Купить: ${this.goalName(goal)}` : 'Покупка откроется глубже';
    this.savingBuy.disabled = !goal.unlocked || money.lt(goal.cost);
  }

  private pauseAutoPresentation(): void {
    if (!this.playingAuto || !this.activeAuto) return;
    clearTimeout(this.spinning);
    this.spinning = 0;
    const { opening, count } = this.activeAuto;
    this.pendingAuto.count += count;
    if (!this.pendingAuto.best || showcaseScore(opening) >= showcaseScore(this.pendingAuto.best)) this.pendingAuto.best = opening;
    this.activeAuto = null;
    this.playingAuto = false;
    this.caseArt.classList.remove('is-opening');
    this.strip.style.transition = 'none';
  }

  private folds = new Map<string, Fold>();

  /** Finds by epoch: names once found, ??? until then; the set's bonus and how far down it lies. */
  private renderCollection(state: GameState): void {
    const b = state.bottom;
    const sig = JSON.stringify([b.found, Math.floor(b.dug / 100)]);
    if (sig === this.shownCollection) return;
    this.shownCollection = sig;
    const groups = EPOCHS.map((e) => {
      const group = el('div', 'r-branch b-epoch');
      let fold = this.folds.get(e.id);
      if (!fold) {
        fold = new Fold(group, e.name, `bottom-${e.id}`);
        this.folds.set(e.id, fold);
      }
      const items = epochItems(e.id);
      const have = items.filter((i) => b.found[i.id]).length;
      const power = setPower(b, e.id);
      const reached = b.dug >= e.depth;
      const note = !reached
        ? `Глубже: откроется на ${format(D(e.depth))} т (сейчас ${format(D(Math.floor(b.dug)))} т)`
        : power
          ? `Набор собран: ${e.bonus}${power > 1 ? ` · повторы ×${power.toFixed(2)}` : ''}`
          : `Набор: ${e.bonus}`;
      const list = el('div', 'b-items');
      for (const it of items) {
        const n = b.found[it.id] ?? 0;
        const row = el('div', `b-item r-${it.rarity}${n ? '' : ' unseen'}`);
        row.append(el('span', 'b-item-name', n ? it.name : `??? · ${RARITY_NAMES[it.rarity].toLowerCase()}`), el('span', 'b-item-count', n ? `×${n}` : ''));
        if (n) row.title = it.text;
        list.append(row);
      }
      // The fold keeps the group's own children; rebuild them under its head.
      group.replaceChildren(fold.head, el('div', `b-set${power ? ' done' : ''}`, note), list);
      fold.update(have, items.length);
      return group;
    });
    this.collection.replaceChildren(...groups);
  }

  /** Every frame while the view is on screen: the camera. */
  frame(dt: number, state: GameState): void {
    const b = state.bottom;
    if (this.bottomIdentity !== b) this.render(state);
    if (!this.reelObserver) {
      this.reelObserver = new IntersectionObserver((entries) => {
        this.reelVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.25;
        if (!this.reelVisible) this.pauseAutoPresentation();
      }, { root: this.root.closest('.panels'), threshold: [0, 0.25] });
      this.reelObserver.observe(this.stripWindow);
    }
    const focused = this.root.querySelector<HTMLElement>('.b-saving :focus, .b-list :focus');
    let shopping = false;
    if (focused) {
      const control = focused.getBoundingClientRect();
      const viewport = this.root.closest('.panels')!.getBoundingClientRect();
      // Safari keeps a closed native select focused even after scrolling away from it.
      shopping = control.bottom > viewport.top && control.top < viewport.bottom;
    }
    if (shopping || !this.reelVisible) this.pauseAutoPresentation();
    if (b.autoFeed.count > 0 && b.autoFeed.best) {
      this.pendingAuto.count += b.autoFeed.count;
      if (!this.pendingAuto.best || showcaseScore(b.autoFeed.best) >= showcaseScore(this.pendingAuto.best)) this.pendingAuto.best = b.autoFeed.best;
      b.autoFeed = { count: 0, best: null };
    }
    if (!this.spinning && this.pendingAuto.best && performance.now() >= this.nextAutoAt && !document.hidden && this.reelVisible && !shopping) {
      const { best, count } = this.pendingAuto;
      this.pendingAuto = { count: 0, best: null };
      this.playOpening(best, true, count);
    }
    this.camera.update(dt, {
      heap: b.heap,
      fall: fallPerMinute(b.above, state.city.development),
      dig: digRate(b, fallPerMinute(b.above, state.city.development)),
      equipment: b.equipment,
      auto: b.auto,
      depth: b.dug,
      work: b.route === 'seam' && b.equipment.borer > 0 ? 'seam' : activeObject(b) ? 'site' : 'depth',
      benchMode: b.benchMode,
      object: (() => {
        const id = activeObject(b)
          ?? (['hoist', 'bench', 'borer'] as const).find((key) => objectReady(b, key) && !(key === 'borer' ? b.equipment.borer > 0 : b.equipment[key]))
          ?? (['hoist', 'bench', 'borer'] as const).find((key) => !objectUnlocked(b, key) && b.dug >= (key === 'hoist' ? 250 : key === 'bench' ? 3750 : 10250) && !(key === 'borer' ? b.equipment.borer > 0 : b.equipment[key]));
        return id ? { id, progress: b.objectWork[id] / OBJECT_WORK[id] } : null;
      })(),
      stock: CONTAINERS.map((c) => b.stock[c.id]),
    });
  }

  /** The tab's badge: containers waiting that can be opened. */
  attention(state: GameState): string[] {
    const b = state.bottom;
    if (!b.open) return [];
    return CONTAINERS.filter((c) => canOpen(b, c.id)).map((c) => `open:${c.id}`);
  }
}

