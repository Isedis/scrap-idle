import { format } from '../game/num';
import {
  FRACS,
  FRAC_NAMES,
  FRAC_SHORT,
  RANKS,
  RECIPES,
  RECIPE_BRANCHES,
  SORT_AT,
  sortNeed,
  STATIONS,
  UNIQUES,
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
  inspectSeconds,
  levelCost,
  levelsOf,
  lineRates,
  moveStation,
  placeStation,
  press,
  priceText,
  queueSize,
  runLine,
  slotCount,
  sortingIncome,
  stationById,
  stationOpen,
  threatSpeed,
  type Frac,
  type LevelKind,
  type RecipeDef,
  type StationId,
} from '../game/sorting';
import { canResort, ratePerSecond, resortGain, resortShares, type GameState } from '../game/state';
import { el, progress, textBar } from './dom';

const pct = (x: number) => `${Math.round(x * 100)}%`;

interface RecipeRow {
  def: RecipeDef;
  root: HTMLElement;
  button: HTMLButtonElement;
}

/** The Sorting view on the Layers tab: the line, the inspection table, recipes and resorting. */
export class SortingPanel {
  readonly root: HTMLElement;
  private closed!: HTMLElement;
  private closedBar!: HTMLElement;
  private body!: HTMLElement;
  private meta!: HTMLElement;
  private fracCells = new Map<Frac, { amount: HTMLElement; rate: HTMLElement }>();
  private tails!: HTMLElement;
  private scheme!: HTMLElement;
  private slots!: HTMLElement;
  private slotsFor = '';
  private queue!: HTMLElement;
  private inspectBar!: HTMLElement;
  private inspectNote!: HTMLElement;
  private lastFind!: HTMLElement;
  private recipeRows: RecipeRow[] = [];
  private alloyBox!: HTMLElement;
  private alloyButton!: HTMLButtonElement;
  private resortButton!: HTMLButtonElement;
  private resortNote!: HTMLElement;
  private rankRows: HTMLElement[] = [];
  private armed = 0;
  /** Numbers that change every frame inside the slot cards. */
  private slotUpdaters: ((s: GameState) => void)[] = [];

  constructor(
    private getState: () => GameState,
    private onResort: () => void,
    private onChange: (message?: string) => void,
  ) {
    this.root = el('section', 'panel sorting');
    this.build();
  }

  private build(): void {
    // Before the line opens: what it takes.
    this.closed = el('div', 'r-door s-closed');
    this.closedBar = el('div', 'r-bar');
    this.closed.append(
      el('div', 'r-door-name', 'Сортировка'),
      el('div', 'r-door-text', `Линия запустится, когда за один цикл переработки будет заработано ${format(SORT_AT)} вторсырья.`),
      this.closedBar,
    );

    this.body = el('div', 's-body');
    const head = el('div', 'panel-head');
    this.meta = el('span', 'panel-meta');
    head.append(el('h2', 'panel-title', 'Сортировка'), this.meta);

    const fracs = el('div', 's-fracs');
    for (const f of FRACS) {
      const cell = el('div', `s-frac f-${f}`);
      const amount = el('div', 's-frac-amount');
      const rate = el('div', 's-frac-rate');
      cell.append(el('div', 's-frac-name', FRAC_NAMES[f]), amount, rate);
      fracs.append(cell);
      this.fracCells.set(f, { amount, rate });
    }
    this.tails = el('div', 's-tails');

    const lineHead = el('div', 'panel-head');
    lineHead.append(el('h2', 'panel-title', 'Линия'), el('span', 'panel-meta', 'порядок важен'));
    this.scheme = el('div', 's-scheme');
    this.slots = el('div', 's-slots');

    this.body.append(head, fracs, this.tails, lineHead, this.scheme, this.slots, this.buildTable(), this.buildRecipes(), this.buildResort());
    this.root.append(this.closed, this.body);
  }

  private buildTable(): HTMLElement {
    const box = el('div', 's-table');
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Стол осмотра'));
    this.queue = el('div', 's-queue');
    this.inspectBar = el('div', 'r-bar');
    this.inspectNote = el('div', 'a-text');
    this.lastFind = el('div', 's-last');
    this.lastFind.hidden = true;
    box.append(head, this.queue, this.inspectBar, this.inspectNote, this.lastFind);
    return box;
  }

  private buildRecipes(): HTMLElement {
    const box = el('div', 's-recipes');
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Рецепты'), el('span', 'panel-meta', 'платятся фракциями'));
    box.append(head);
    for (const branch of RECIPE_BRANCHES) {
      const list = el('div', 'r-branch');
      list.append(el('div', 'r-branch-title', branch.name));
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

  private buildResort(): HTMLElement {
    const box = el('div', 'r-action s-resort');
    this.resortNote = el('div', 'r-note');
    this.resortButton = el('button', 'btn r-go', 'Пересортировать');
    this.resortButton.type = 'button';
    this.resortButton.id = 'resort';
    this.resortButton.addEventListener('click', () => this.press());
    box.append(
      el('div', 'r-title', 'Пересортировка'),
      el('div', 'r-keeps', 'Сгорает вся переработка: вторсырьё, дерево, бесконечные узлы, скрипты. Остаются: линия, фракции, рецепты, находки. Разряды возвращают удобства.'),
      this.resortNote,
      this.resortButton,
    );
    const ranks = el('div', 's-ranks');
    ranks.append(el('div', 'r-branch-title', 'Разряды'));
    for (const r of RANKS) {
      const row = el('div', 's-rank');
      row.append(el('span', 's-rank-at', `${r.at}`), el('span', '', r.text));
      ranks.append(row);
      this.rankRows.push(row);
    }
    const wrap = el('div', 's-resort-wrap');
    wrap.append(box, ranks);
    return wrap;
  }

  /** Two taps, like recycling: the first arms the button for three seconds. */
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

  /** Slot cards: rebuilt when the line or the open stations change. */
  private buildSlots(state: GameState): void {
    const so = state.sorting;
    const n = slotCount(so);
    this.slotUpdaters = [];
    const cards: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      const id = so.line[i] ?? null;
      const card = el('div', `s-slot${id ? '' : ' empty'}`);
      const head = el('div', 's-slot-head');
      head.append(el('span', 's-slot-no', `#${i + 1}`));
      if (!id) {
        head.append(el('span', 's-slot-name', 'пусто'));
        card.append(head);
      } else {
        const def = stationById(id)!;
        head.append(el('span', 's-slot-name', def.name));
        const moves = el('div', 's-moves');
        const button = (text: string, label: string, action: () => boolean) => {
          const b = el('button', 'mode s-move', text);
          b.type = 'button';
          b.setAttribute('aria-label', label);
          b.addEventListener('click', () => {
            if (action()) this.onChange();
          });
          moves.append(b);
          return b;
        };
        button('▲', 'Выше', () => moveStation(this.getState().sorting, i, -1)).disabled = i === 0;
        button('▼', 'Ниже', () => moveStation(this.getState().sorting, i, 1)).disabled = i === n - 1;
        button('✕', 'Снять со слота', () => placeStation(this.getState().sorting, i, null));
        head.append(moves);
        const what = el('div', 'a-text');
        const levels = el('div', 's-levels');
        const kinds: [LevelKind, string][] =
          id === 'briquetter' ? [['speed', 'Пресс']] : id === 'crusher' ? [['purity', 'Помол']] : [['speed', 'Скорость'], ['purity', 'Чистота']];
        for (const [kind, label] of kinds) {
          const b = el('button', 'buy s-level');
          b.type = 'button';
          b.id = `level-${id}-${kind}`;
          const price = el('span', 'buy-price');
          const lbl = el('span', 'buy-label');
          b.append(lbl, price);
          b.addEventListener('click', () => {
            if (buyLevel(this.getState().sorting, id, kind)) this.onChange();
          });
          levels.append(b);
          this.slotUpdaters.push((s) => {
            const lv = levelsOf(s.sorting, id)[kind];
            const cost = levelCost(lv, kind);
            const have = s.sorting.fractions[def.pays];
            lbl.textContent = `${label} ${lv}`;
            price.textContent = `${format(cost)} ${FRAC_SHORT[def.pays]}`;
            b.disabled = have.lt(cost);
            b.style.setProperty('--p', String(progress(have, cost)));
          });
        }
        this.slotUpdaters.push((s) => {
          const lv = levelsOf(s.sorting, id);
          const slot = runLine(s.sorting.line.slice(0, n), s.sorting.levels).slots[i];
          what.textContent = def.frac
            ? `ловит ${pct(capture(lv.speed))} ${FRAC_SHORT[def.frac]} · портит ${pct(impurity(lv.purity))} чужого · берёт ${pct(slot.caught)} ленты`
            : id === 'briquetter'
              ? `выход станций выше ×${press(lv.speed).toFixed(1)}`
              : `перемалывает ${pct(crush(lv.purity))} того, что прошло`;
        });
        card.append(head, what, levels);
      }
      // What else could stand here.
      const free = STATIONS.filter((d) => stationOpen(so, d) && !so.line.slice(0, n).includes(d.id));
      if (free.length > 0) {
        const chips = el('div', 'a-chips');
        for (const d of free) {
          const b = el('button', 'chip', `${id ? '⇄ ' : '+ '}${d.name}`);
          b.type = 'button';
          b.addEventListener('click', () => {
            if (placeStation(this.getState().sorting, i, d.id as StationId)) this.onChange();
          });
          chips.append(b);
        }
        card.append(chips);
      }
      cards.push(card);
    }
    this.slots.replaceChildren(...cards);
  }

  render(state: GameState): void {
    const so = state.sorting;
    this.closed.hidden = so.open;
    this.body.hidden = !so.open;
    if (!so.open) {
      const p = progress(state.recycle.total, SORT_AT);
      this.closedBar.textContent = `${textBar(p)} ${format(state.recycle.total)} / ${format(SORT_AT)}`;
      return;
    }
    this.meta.textContent = `пересортировок ${so.sorts} · доход ×${format(sortingIncome(so))}`;

    const rates = lineRates(so, ratePerSecond(state));
    for (const f of FRACS) {
      const cell = this.fracCells.get(f)!;
      cell.amount.textContent = format(so.fractions[f].floor());
      cell.rate.textContent = `+${format(rates[f])}/с`;
    }
    const n = slotCount(so);
    const line = so.line.slice(0, n);
    const { tails } = runLine(line, so.levels);
    this.tails.textContent = `хвосты ${pct(tails)} → угроза растёт ×${threatSpeed(so).toFixed(2)}`;
    this.tails.classList.toggle('bad', tails > 0.5);
    this.scheme.textContent = `КУЧА ▶ ${line.map((id) => `[${id ? short(id) : '··'}]`).join(' ▶ ')} ▶ ХВОСТЫ`;

    const sig = `${n}|${line.join()}|${so.recipes.join()}`;
    if (sig !== this.slotsFor) {
      this.slotsFor = sig;
      this.buildSlots(state);
    }
    for (const update of this.slotUpdaters) update(state);

    // Inspection table.
    const size = queueSize(so);
    this.queue.textContent = `очередь ${'▣'.repeat(Math.min(so.queue, size))}${'□'.repeat(Math.max(size - so.queue, 0))} · найдено ${so.found.length}/${UNIQUES.length}`;
    this.inspectBar.textContent = so.queue > 0 ? `осмотр ${textBar(so.progress)} ${Math.floor(so.progress * 100)}%` : 'стол пуст, ждём неопознанное с ленты';
    this.inspectNote.textContent = `один предмет — ${Math.round(inspectSeconds(so))} с. Не поместился на стол — уходит обратно в кучу.`;

    // Recipes.
    for (const row of this.recipeRows) {
      const owned = hasRecipe(so, row.def.id);
      const open = !row.def.requires || hasRecipe(so, row.def.requires);
      row.root.classList.toggle('owned', owned);
      row.root.classList.toggle('closed', !owned && !open);
      row.button.textContent = owned ? 'Есть' : priceText(row.def.cost, format);
      row.button.disabled = !canBuyRecipe(so, row.def);
    }
    this.alloyBox.hidden = !alloysOpen(so);
    if (alloysOpen(so)) {
      const cost = alloyCost(so.alloys);
      this.alloyButton.textContent = `ур. ${so.alloys} · по ${format(cost)} каждой`;
      this.alloyButton.disabled = FRACS.some((f) => so.fractions[f].lt(cost));
    }

    // Resorting.
    const ready = canResort(state);
    this.resortButton.disabled = !ready;
    if (ready) {
      const gain = resortGain(state);
      const shares = resortShares(state);
      const split = FRACS.filter((f) => shares[f] > 0)
        .map((f) => `${format(gain.mul(shares[f]).floor())} ${FRAC_SHORT[f]}`)
        .join(' · ');
      this.resortNote.textContent = `+${format(gain)} фракций: ${split}. Доход ×2 навсегда.`;
    } else {
      const need = sortNeed(so.sorts);
      this.resortNote.textContent = `нужно ${format(need)} вторсырья за цикл · сейчас ${format(state.recycle.total)} ${textBar(progress(state.recycle.total, need), 8)}`;
      if (this.armed) this.disarm();
    }
    const next = RANKS.find((r) => r.at > so.sorts);
    RANKS.forEach((r, i) => {
      this.rankRows[i].classList.toggle('got', so.sorts >= r.at);
      this.rankRows[i].classList.toggle('next', r === next);
    });
  }

  /** Something to spend on right now, for the tab badge. */
  attention(state: GameState): boolean {
    const so = state.sorting;
    return so.open && (canResort(state) || RECIPES.some((r) => canBuyRecipe(so, r)));
  }

  /** Shows what the table found last. */
  showFind(text: string, scary: boolean): void {
    this.lastFind.hidden = false;
    this.lastFind.textContent = text;
    this.lastFind.classList.toggle('bad', scary);
  }
}

/** Two-letter label of a station for the line scheme. */
function short(id: StationId): string {
  return { optic: 'ОП', magnet: 'МГ', sieve: 'СТ', blower: 'ВЗ', briquetter: 'БР', crusher: 'ДР' }[id];
}
