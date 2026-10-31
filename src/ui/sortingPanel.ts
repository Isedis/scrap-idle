import { D, format, type Decimal } from '../game/num';
import {
  FRACS,
  FRAC_LETTER,
  FRAC_NAMES,
  RANKS,
  RECIPES,
  RECIPE_BRANCHES,
  SORT_AT,
  STATIONS,
  STREAM,
  UNIQUES,
  UNKNOWN_EVERY,
  alloyCost,
  alloysOpen,
  buyAlloy,
  buyLevel,
  buyRecipe,
  canBuyRecipe,
  capture,
  crush,
  hasRecipe,
  impurity,
  flowPerSecond,
  fractionsIncome,
  inspectSeconds,
  levelCost,
  MAX_LEVEL,
  levelsOf,
  lineRates,
  moveStation,
  placeStation,
  press,
  priceText,
  queueSize,
  runLine,
  slotCount,
  sortNeed,
  sortingIncome,
  stationById,
  stationOpen,
  tailsOf,
  threatSpeed,
  type Frac,
  type LevelKind,
  type RecipeDef,
  type StationId,
} from '../game/sorting';
import { sortingAdvice } from '../game/advice';
import { BeltCam } from './beltCam';
import { canResort, ratePerSecond, scriptOwned, resortGain, resortShares, type GameState } from '../game/state';
import { Fold } from './fold';
import { el, progress, textBar } from './dom';

type View = 'line' | 'table' | 'recipes' | 'reset';

/** Characters on one stretch of belt. */
const BELT_CELLS = 14;
/** The belt moves one cell this often, in ms. */
const BELT_STEP_MS = 220;
/** Letters a station's bin keeps on show. */
const BIN_CELLS = 10;
/** Share of belt cells that carry something, so the gaps make the motion readable. */
const BELT_DENSITY = 0.55;

/** One stretch of belt, as letters riding along. */
interface Belt {
  el: HTMLElement;
  cells: string[];
  /** What rides on this stretch: shares of the stream, with '?' for unidentified. */
  mix: Record<string, number>;
}

/** A station's bin: the letters it took, and a mark when it spoiled something. */
interface Bin {
  el: HTMLElement;
  cells: string[];
  frac?: Frac;
  /** Chance per step to catch, and to spoil, scaled from the line math. */
  catchChance: number;
  spoilChance: number;
}

/** Picks a letter from a mix, or a gap. */
function draw(mix: Record<string, number>): string {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (Math.random() > BELT_DENSITY * Math.min(1, total / 0.9 + 0.15)) return '·';
  let r = Math.random() * total;
  for (const [letter, w] of Object.entries(mix)) {
    r -= w;
    if (r <= 0) return letter;
  }
  return '·';
}

const letters = (shares: Record<Frac, number>): Record<string, number> =>
  Object.fromEntries(FRACS.map((f) => [FRAC_LETTER[f], shares[f]]));

/** A share as a percent, with a decimal once it is small, so every level shows a change. */
const share = (x: number) => (x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);

/** What one level of a station's upgrade means, as shown on its button. */
function levelEffect(id: StationId, kind: LevelKind, level: number): string {
  if (id === 'briquetter') return `×${press(level).toFixed(1)}`;
  if (id === 'crusher') return share(crush(level));
  return kind === 'speed' ? share(capture(level)) : `брак ${share(impurity(level))}`;
}

interface RecipeRow {
  def: RecipeDef;
  root: HTMLElement;
  button: HTMLButtonElement;
}

/** The Sorting view on the Layers tab, in four parts: the line, the table, recipes, the reset. */
export class SortingPanel {
  /** Recipe branches that fold away once bought out. */
  private recipeFolds: { fold: Fold; ids: string[] }[] = [];
  readonly root: HTMLElement;
  /** Camera 02 over the belt, on top of every part of the tab. */
  readonly camera = new BeltCam();
  private view: View = 'line';
  private views = new Map<View, HTMLElement>();
  private viewButtons = new Map<View, HTMLButtonElement>();
  private closed!: HTMLElement;
  private closedBar!: HTMLElement;
  private body!: HTMLElement;
  private now!: HTMLElement;
  private meta!: HTMLElement;
  private fracCells = new Map<Frac, { amount: HTMLElement; rate: HTMLElement }>();
  private income!: HTMLElement;
  // Line.
  private lineList!: HTMLElement;
  private lineFor = '';
  private belts: Belt[] = [];
  private bins: Bin[] = [];
  private beltAt = 0;
  private tails!: HTMLElement;
  private slotUpdaters: ((s: GameState, rate: Decimal) => void)[] = [];
  // Table.
  private queue!: HTMLElement;
  private inspectBar!: HTMLElement;
  private inspectNote!: HTMLElement;
  private foundNote!: HTMLElement;
  private lastFind!: HTMLElement;
  // Recipes.
  private recipeRows: RecipeRow[] = [];
  private alloyBox!: HTMLElement;
  private alloyButton!: HTMLButtonElement;
  // Reset.
  private resortButton!: HTMLButtonElement;
  private resortGainEl!: HTMLElement;
  private resortNeed!: HTMLElement;
  private rankRows: HTMLElement[] = [];
  private armed = 0;

  constructor(
    private getState: () => GameState,
    private onResort: () => void,
    private onChange: (message?: string) => void,
    private onHelp: () => void,
  ) {
    this.root = el('section', 'panel sorting');
    this.build();
  }

  private build(): void {
    this.closed = el('div', 'r-door s-closed');
    this.closedBar = el('div', 'r-bar');
    this.closed.append(
      el('div', 'r-door-name', 'Сортировка'),
      el('div', 'r-door-text', `Второй слой. Сортировочная линия разбирает мусор на пластик, металл, стекло и бумагу. Запустится, когда за один цикл переработки будет заработано ${format(SORT_AT)} вторсырья.`),
      this.closedBar,
    );

    this.body = el('div', 's-body');
    const head = el('div', 'panel-head');
    this.meta = el('span', 'panel-meta');
    const help = el('button', 'mode s-help', '?');
    help.type = 'button';
    help.id = 'sorting-help';
    help.setAttribute('aria-label', 'Как устроена сортировка');
    help.addEventListener('click', () => this.onHelp());
    const titles = el('div', 's-titles');
    titles.append(el('h2', 'panel-title', 'Сортировка'), this.meta);
    head.append(titles, help);
    this.now = el('div', 's-now');

    const fracs = el('div', 's-fracs');
    for (const f of FRACS) {
      const cell = el('div', 's-frac');
      const amount = el('div', 's-frac-amount');
      const rate = el('div', 's-frac-rate');
      cell.append(el('div', 's-frac-name', `${FRAC_LETTER[f]} · ${FRAC_NAMES[f]}`), amount, rate);
      fracs.append(cell);
      this.fracCells.set(f, { amount, rate });
    }

    const tabs = el('div', 'modes s-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Раздел сортировки');
    for (const [view, label] of [['line', 'Линия'], ['table', 'Стол'], ['recipes', 'Рецепты'], ['reset', 'Сброс']] as const) {
      const b = el('button', 'mode', label);
      b.type = 'button';
      b.id = `sort-view-${view}`;
      b.addEventListener('click', () => {
        this.view = view;
        this.render(this.getState());
      });
      this.viewButtons.set(view, b);
      tabs.append(b);
    }

    this.views.set('line', this.buildLine());
    this.views.set('table', this.buildTable());
    this.views.set('recipes', this.buildRecipes());
    this.views.set('reset', this.buildReset());
    this.income = el('div', 's-income');
    this.body.append(this.camera.root, head, this.now, fracs, this.income, tabs, ...this.views.values());
    this.root.append(this.closed, this.body);
  }

  /** A one-line answer to "what is this for", on top of each part. */
  private why(text: string): HTMLElement {
    return el('p', 's-why', text);
  }

  private buildLine(): HTMLElement {
    const box = el('div', 's-view');
    this.lineList = el('div', 's-line');
    this.tails = el('div', 's-tails');
    box.append(
      this.why('С кучи по ленте едет мусор. Каждая станция снимает свои буквы — это фракции, новая валюта. Что доехало до конца, падает обратно в кучу и кормит его.'),
      this.lineList,
      this.tails,
    );
    return box;
  }

  private buildTable(): HTMLElement {
    const box = el('div', 's-view');
    this.queue = el('div', 's-queue');
    this.inspectBar = el('div', 'r-bar');
    this.inspectNote = el('div', 'a-text');
    this.foundNote = el('div', 'a-text');
    this.lastFind = el('div', 's-last');
    this.lastFind.hidden = true;
    box.append(
      this.why(`Раз в ${Math.round(UNKNOWN_EVERY / 60 * 10) / 10} минуты на ленте попадается «?» — неопознанное. Стол осматривает по одному: обычно это тюк фракций, иногда — уникальная находка с вечным бонусом (чем дальше, тем реже). Изредка — то, чего на ленте быть не должно.`),
      this.queue,
      this.inspectBar,
      this.inspectNote,
      this.lastFind,
      this.foundNote,
    );
    return box;
  }

  private buildRecipes(): HTMLElement {
    const box = el('div', 's-view s-recipes');
    box.append(this.why('Рецепты — постоянные улучшения. Платятся фракциями и никогда не сгорают, даже при пересортировке.'));
    for (const branch of RECIPE_BRANCHES) {
      const list = el('div', 'r-branch');
      const fold = new Fold(list, branch.name, `recipes:${branch.id}`);
      this.recipeFolds.push({ fold, ids: RECIPES.filter((r) => r.branch === branch.id).map((r) => r.id) });
      list.append(fold.head);
      const defs = RECIPES.filter((r) => r.branch === branch.id);
      defs.forEach((def, i) => {
        const root = el('div', 'r-node');
        root.append(el('span', 'r-twig', i === defs.length - 1 ? '└─' : '├─'));
        const body = el('div', 'r-node-body');
        body.append(el('div', 'r-node-name', def.name), el('div', 'r-node-text', def.text));
        const button = el('button', 'buy r-node-buy s-price');
        button.type = 'button';
        button.id = `recipe-${def.id}`;
        button.addEventListener('click', () => {
          if (buyRecipe(this.getState().sorting, def.id)) this.onChange(`Рецепт: ${def.name}`);
        });
        root.append(body, button);
        list.append(root);
        this.recipeRows.push({ def, root, button });
      });
      box.append(list);
    }
    this.alloyBox = el('div', 'r-branch');
    const root = el('div', 'r-node');
    const body = el('div', 'r-node-body');
    body.append(el('div', 'r-node-name', 'Сплав'), el('div', 'r-node-text', 'Поток на ленту ×1.5 за уровень, без предела'));
    this.alloyButton = el('button', 'buy r-node-buy s-price');
    this.alloyButton.type = 'button';
    this.alloyButton.id = 'alloy';
    this.alloyButton.addEventListener('click', () => {
      if (buyAlloy(this.getState().sorting)) this.onChange(`Сплав: ур. ${this.getState().sorting.alloys}`);
    });
    root.append(el('span', 'r-twig', '└─'), body, this.alloyButton);
    this.alloyBox.append(el('div', 'r-branch-title', 'Бесконечное'), root);
    box.append(this.alloyBox);
    return box;
  }

  private buildReset(): HTMLElement {
    const box = el('div', 's-view');
    box.append(this.why('Пересортировка — большой сброс. Сжигаешь всю переработку и получаешь силу, которая остаётся навсегда.'));
    const deal = el('div', 's-deal');
    const lose = el('div', 's-deal-col lose');
    lose.append(el('div', 's-deal-title', 'Сгорит'), ...['вторсырьё', 'дерево переработки', 'бесконечные узлы', 'скрипты автоматики', 'текущий заход'].map((t) => el('div', '', `✕ ${t}`)));
    const get = el('div', 's-deal-col get');
    this.resortGainEl = el('div', '');
    get.append(el('div', 's-deal-title', 'Получишь'), this.resortGainEl, el('div', '', '+ весь доход ×2 навсегда'), el('div', '', '+ новый разряд'));
    deal.append(lose, get);
    const keep = el('div', 'a-text', 'Не сгорят: линия, фракции, рецепты, находки, достижения.');
    this.resortNeed = el('div', 'r-bar');
    this.resortButton = el('button', 'btn r-go', 'Пересортировать');
    this.resortButton.type = 'button';
    this.resortButton.id = 'resort';
    this.resortButton.addEventListener('click', () => this.press());

    const ranks = el('div', 's-ranks');
    ranks.append(el('div', 'r-branch-title', 'Разряды'), el('div', 'a-text', 'Чем больше пересортировок, тем больше переживает сброс.'));
    for (const r of RANKS) {
      const row = el('div', 's-rank');
      row.append(el('span', 's-rank-at', `${r.at}`), el('span', '', r.text));
      ranks.append(row);
      this.rankRows.push(row);
    }
    box.append(deal, keep, this.resortNeed, this.resortButton, ranks);
    return box;
  }

  /** Two taps: the first arms the button for three seconds. */
  private press(): void {
    if (!canResort(this.getState())) return;
    if (!this.armed) {
      this.resortButton.textContent = 'Нажмите ещё раз: сжечь переработку';
      this.resortButton.classList.add('armed');
      this.armed = window.setTimeout(() => this.disarm(), 3000);
      return;
    }
    this.disarm();
    this.onResort();
  }

  private disarm(): void {
    clearTimeout(this.armed);
    this.armed = 0;
    this.resortButton.textContent = 'Пересортировать';
    this.resortButton.classList.remove('armed');
  }

  private belt(mix: Record<string, number>, cls = ''): Belt {
    const cells = Array.from({ length: BELT_CELLS }, () => draw(mix));
    const b: Belt = { el: el('div', `s-belt ${cls}`), cells, mix };
    this.belts.push(b);
    return b;
  }

  /** The line top to bottom: heap, belt, station, belt, station… and the tails. */
  private buildLineList(state: GameState): void {
    const so = state.sorting;
    const n = slotCount(so);
    const line = so.line.slice(0, n);
    const result = runLine(line, so.levels);
    this.belts = [];
    this.bins = [];
    this.slotUpdaters = [];
    const parts: HTMLElement[] = [];

    parts.push(el('div', 's-heap', '▼ КУЧА · «?» сразу уходит на стол осмотра'));
    parts.push(this.belt({ ...letters(STREAM), '?': 0.1 }).el);

    for (let i = 0; i < n; i++) {
      const id = line[i] ?? null;
      parts.push(this.stationCard(state, i, id, result.slots[i]));
      const after = result.slots[i]?.after ?? STREAM;
      parts.push(this.belt(letters(after), i === n - 1 ? 'last' : '').el);
    }
    parts.push(el('div', 's-heap bad', '▼ ОБРАТНО В КУЧУ'));
    // Hold the old height until the new list has laid out, or the page shrinks for a moment
    // under the finger and the browser scrolls it.
    this.lineList.style.minHeight = `${this.lineList.offsetHeight}px`;
    this.lineList.replaceChildren(...parts);
    window.setTimeout(() => (this.lineList.style.minHeight = ''), 500);
  }

  private stationCard(state: GameState, i: number, id: StationId | null, slot: { caught: number; spoiled: number } | undefined): HTMLElement {
    const so = state.sorting;
    const n = slotCount(so);
    const card = el('div', `s-slot${id ? '' : ' vacant'}`);
    const head = el('div', 's-slot-head');
    head.append(el('span', 's-slot-no', `${i + 1}`));
    const free = STATIONS.filter((d) => stationOpen(so, d) && !so.line.slice(0, n).includes(d.id));
    const chips = (label: string) => {
      const box = el('div', 's-swap');
      box.append(el('div', 'a-label', label));
      const row = el('div', 'a-chips');
      for (const d of free) {
        const b = el('button', 'chip', d.frac ? `${d.name} · ${FRAC_LETTER[d.frac]}` : d.name);
        b.type = 'button';
        b.addEventListener('click', () => {
          if (placeStation(this.getState().sorting, i, d.id)) this.onChange();
        });
        row.append(b);
      }
      box.append(row);
      return box;
    };

    if (!id) {
      head.append(el('span', 's-slot-name', 'Пустое место'));
      card.append(head);
      if (free.length) card.append(chips('Поставить сюда:'));
      return card;
    }

    const def = stationById(id)!;
    head.append(el('span', 's-slot-name', def.frac ? `${def.name} · ловит ${FRAC_LETTER[def.frac]}` : def.name));
    const moves = el('div', 's-moves');
    const move = (text: string, label: string, action: () => boolean, disabled: boolean) => {
      const b = el('button', 'mode s-move', text);
      b.type = 'button';
      b.disabled = disabled;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        if (action()) this.onChange();
      });
      moves.append(b);
    };
    move('▲', 'Поднять выше', () => moveStation(this.getState().sorting, i, -1), i === 0);
    move('▼', 'Опустить ниже', () => moveStation(this.getState().sorting, i, 1), i === n - 1);
    move('✕', 'Убрать с ленты', () => placeStation(this.getState().sorting, i, null), false);
    head.append(moves);

    // The bin shows what the station takes off the belt, live.
    const lv = levelsOf(so, id);
    const binEl = el('div', 's-bin');
    const bin: Bin = {
      el: binEl,
      cells: [],
      frac: def.frac,
      catchChance: def.frac ? Math.min(0.9, (slot?.caught ?? 0) * 2.2) : 0,
      spoilChance: Math.min(0.5, (slot?.spoiled ?? 0) * 1.2),
    };
    this.bins.push(bin);

    const what = el('div', 's-what');
    const levels = el('div', 's-levels');
    const kinds: [LevelKind, string][] =
      id === 'briquetter' ? [['speed', 'Сильнее']] : id === 'crusher' ? [['purity', 'Мельче']] : [['speed', 'Быстрее'], ['purity', 'Чище']];
    for (const [kind, label] of kinds) {
      const b = el('button', 'buy s-level');
      b.type = 'button';
      b.id = `level-${id}-${kind}`;
      const lbl = el('span', 'buy-label');
      const change = el('span', 's-level-hint');
      const gain = el('span', 's-level-gain');
      const price = el('span', 'buy-price');
      b.append(lbl, change, gain, price);
      b.addEventListener('click', () => {
        if (buyLevel(this.getState().sorting, id, kind)) this.onChange();
      });
      levels.append(b);
      this.slotUpdaters.push((s, rate) => {
        const so = s.sorting;
        const lvNow = levelsOf(so, id);
        const level = lvNow[kind];
        const cost = levelCost(level, kind);
        const have = so.fractions[def.pays];
        // At the top the button says so and stays out of the way.
        if (level >= MAX_LEVEL) {
          lbl.textContent = `${label} · макс`;
          change.textContent = levelEffect(id, kind, level);
          gain.textContent = '';
          price.textContent = 'МАКС';
          b.disabled = true;
          b.classList.add('maxed');
          b.style.setProperty('--p', '1');
          return;
        }
        lbl.textContent = `${label} · ур. ${level}/${MAX_LEVEL}`;
        change.textContent = `${levelEffect(id, kind, level)} → ${levelEffect(id, kind, level + 1)}`;
        // What the next level adds to the whole line, per minute, and to the tails.
        const next = { ...so, levels: { ...so.levels, [id]: { ...lvNow, [kind]: level + 1 } } };
        const sum = (r: Record<Frac, Decimal>) => FRACS.reduce((a, f) => a.add(r[f]), D(0));
        const more = sum(lineRates(next, rate)).sub(sum(lineRates(so, rate))).mul(60);
        const tailsDrop = tailsOf(so) - tailsOf(next);
        gain.textContent = more.gt(0.01)
          ? `+${format(more)}/мин`
          : tailsDrop > 0.0005
            ? `хвосты −${(tailsDrop * 100).toFixed(1)}%`
            : 'станциям ниже';
        price.textContent = `${format(cost)} ${FRAC_LETTER[def.pays]}`;
        b.disabled = have.lt(cost);
        b.style.setProperty('--p', String(progress(have, cost)));
      });
    }
    what.textContent = def.frac
      ? `Забирает ${share(capture(lv.speed))} букв «${FRAC_LETTER[def.frac]}». Сбивает в брак ${share(impurity(lv.purity))} чужих — станциям ниже их уже не достанется.`
      : id === 'briquetter'
        ? `Прессует всё, что поймали станции выше: их выход ×${press(lv.speed).toFixed(1)}. Ставь ниже тех, кого хочешь усилить.`
        : `Перемалывает ${share(crush(lv.purity))} того, что едет мимо: меньше уходит в кучу. Станциям ниже достаётся меньше — ставь последней.`;
    card.append(head, what, ...(def.frac ? [binEl] : []), levels);
    if (free.length) card.append(chips('Заменить на:'));
    return card;
  }

  /** Moves the letters along. Called from render, so it runs only while the line is on screen. */
  private animate(): void {
    const now = performance.now();
    if (now - this.beltAt < BELT_STEP_MS) return;
    this.beltAt = now;
    for (const b of this.belts) {
      b.cells.pop();
      b.cells.unshift(draw(b.mix));
      b.el.textContent = `${b.cells.join(' ')} ▶`;
    }
    for (const bin of this.bins) {
      if (bin.frac && Math.random() < bin.catchChance) bin.cells.push(FRAC_LETTER[bin.frac]);
      else if (Math.random() < bin.spoilChance) bin.cells.push('✕');
      else continue;
      if (bin.cells.length > BIN_CELLS) bin.cells.shift();
      bin.el.textContent = `⇐ ${bin.cells.join(' ')}`;
    }
  }

  render(state: GameState): void {
    for (const { fold, ids } of this.recipeFolds) fold.update(ids.filter((id) => state.sorting.recipes.includes(id)).length, ids.length);
    const so = state.sorting;
    this.closed.hidden = so.open;
    this.body.hidden = !so.open;
    if (!so.open) {
      const p = progress(state.recycle.total, SORT_AT);
      this.closedBar.textContent = `${textBar(p)} ${format(state.recycle.total)} / ${format(SORT_AT)}`;
      return;
    }
    this.now.textContent = sortingAdvice(state);
    this.meta.textContent = `пересортировок ${so.sorts} · доход ×${format(sortingIncome(so))}`;
    const rates = lineRates(so, ratePerSecond(state));
    for (const f of FRACS) {
      const cell = this.fracCells.get(f)!;
      cell.amount.textContent = format(so.fractions[f].floor());
      cell.rate.textContent = `+${format(rates[f].mul(60))}/мин`;
    }

    this.income.textContent = `Всего фракций за игру: ${format(so.total.floor())} → весь доход ×${format(fractionsIncome(so.total))}. Каждая новая поднимает доход, даже если её потратить.`;
    for (const [view, el] of this.views) el.hidden = view !== this.view;
    const marks: Record<View, boolean> = {
      line: so.line.slice(0, slotCount(so)).some((id) => !id),
      table: false,
      recipes: RECIPES.some((r) => canBuyRecipe(so, r)),
      reset: canResort(state),
    };
    for (const [view, b] of this.viewButtons) {
      b.setAttribute('aria-pressed', String(view === this.view));
      b.classList.toggle('marked', marks[view]);
    }

    if (this.view === 'line') this.renderLine(state);
    else if (this.view === 'table') this.renderTable(state);
    else if (this.view === 'recipes') this.renderRecipes(state);
    else this.renderReset(state);
  }

  private renderLine(state: GameState): void {
    const so = state.sorting;
    const n = slotCount(so);
    const sig = `${n}|${so.line.slice(0, n).join()}|${so.recipes.join()}|${JSON.stringify(so.levels)}`;
    // The list is rebuilt under the finger that just bought a level: the page must not move.
    // Its belts fill in a moment later, so the scroll goes back only once everything is in.
    let keep: { y: number; focused?: string } | null = null;
    if (sig !== this.lineFor) {
      this.lineFor = sig;
      keep = { y: window.scrollY, focused: document.activeElement?.id };
      this.buildLineList(state);
    }
    const rate = ratePerSecond(state);
    for (const update of this.slotUpdaters) update(state, rate);
    this.animate();
    if (keep) {
      window.scrollTo(0, keep.y);
      if (keep.focused) document.getElementById(keep.focused)?.focus({ preventScroll: true });
    }
    const { tails } = runLine(so.line.slice(0, n), so.levels);
    this.tails.textContent = `${Math.round(tails * 100)}% мусора уходит обратно в кучу — угроза растёт в ${threatSpeed(so).toFixed(2)} раза быстрее.`;
    this.tails.classList.toggle('bad', tails > 0.5);
  }

  private renderTable(state: GameState): void {
    const so = state.sorting;
    const size = queueSize(so);
    this.queue.textContent = `стол: ${Array.from({ length: size }, (_, i) => (i < so.queue ? '[?]' : '[ ]')).join(' ')}`;
    this.inspectBar.textContent = so.queue > 0 ? `осмотр ${textBar(so.progress)} ${Math.floor(so.progress * 100)}%` : 'стол пуст — ждём «?» с ленты';
    this.inspectNote.textContent = `Один осмотр — ${Math.round(inspectSeconds(so))} с. Мест на столе: ${size}. Если стол полон, «?» падает обратно в кучу.`;
    this.foundNote.textContent = `Уникальных находок: ${so.found.length} из ${UNIQUES.length}. Все они — в Журнале.`;
  }

  private renderRecipes(state: GameState): void {
    const so = state.sorting;
    for (const row of this.recipeRows) {
      const owned = hasRecipe(so, row.def.id);
      const open = !row.def.requires || hasRecipe(so, row.def.requires);
      row.root.classList.toggle('owned', owned);
      row.root.classList.toggle('closed', !owned && !open);
      row.button.textContent = owned ? 'Есть' : priceText(row.def.cost, format, FRAC_LETTER);
      row.button.disabled = !canBuyRecipe(so, row.def);
    }
    this.alloyBox.hidden = !alloysOpen(so);
    if (alloysOpen(so)) {
      const cost = alloyCost(so.alloys);
      this.alloyButton.textContent = `ур. ${so.alloys} · по ${format(cost)} каждой`;
      this.alloyButton.disabled = FRACS.some((f) => so.fractions[f].lt(cost));
    }
  }

  private renderReset(state: GameState): void {
    const so = state.sorting;
    const ready = canResort(state);
    const need = sortNeed(so.sorts);
    this.resortButton.disabled = !ready;
    if (!ready && this.armed) this.disarm();
    const gain = resortGain(state);
    const shares = resortShares(state);
    this.resortGainEl.textContent = ready
      ? `+ ${format(gain)} фракций: ${FRACS.filter((f) => shares[f] > 0)
          .map((f) => `${format(gain.mul(shares[f]).floor())} ${FRAC_LETTER[f]}`)
          .join(', ')}`
      : '+ фракции (чем больше вторсырья за цикл, тем больше)';
    this.resortNeed.textContent = ready
      ? 'Готово. Можно пересортировать.'
      : `Нужно ${format(need)} вторсырья за цикл: ${textBar(progress(state.recycle.total, need), 8)} ${format(state.recycle.total)}`;
    const next = RANKS.find((r) => r.at > so.sorts);
    RANKS.forEach((r, i) => {
      this.rankRows[i].classList.toggle('got', so.sorts >= r.at);
      this.rankRows[i].classList.toggle('next', r === next);
    });
  }

  /** Every animation frame while the tab is on screen: the camera. */
  frame(dt: number, state: GameState): void {
    const so = state.sorting;
    if (!so.open) return;
    this.camera.update(dt, {
      line: so.line.slice(0, slotCount(so)),
      levels: so.levels,
      flow: flowPerSecond(so, ratePerSecond(state)).toNumber(),
      queue: so.queue,
      queueSize: queueSize(so),
      threat: state.threat.level,
    });
  }

  /** Something to do right now, for the tab badge. */
  /** What on this layer is worth the player's attention, for the badge: a resort the auto-sorter will not do, recipes to buy. */
  attention(state: GameState): string[] {
    const so = state.sorting;
    if (!so.open) return [];
    const auto = state.scripts.sortOn && scriptOwned(state, 'sort');
    return [...(canResort(state) && !auto ? ['resort'] : []), ...RECIPES.filter((r) => canBuyRecipe(so, r)).map((r) => `recipe:${r.id}`)];
  }

  /** Shows what the table found last. */
  showFind(text: string, scary: boolean): void {
    this.lastFind.hidden = false;
    this.lastFind.textContent = text;
    this.lastFind.classList.toggle('bad', scary);
  }
}
