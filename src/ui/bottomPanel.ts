import {
  ABOVE_SCRIPTS,
  AUTO_OPEN,
  CONTAINERS,
  EPOCHS,
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
  private money = new Map<Rarity, HTMLElement>();
  private ume!: HTMLElement;
  private strip!: HTMLElement;
  private stripWindow!: HTMLElement;
  private result!: HTMLElement;
  private spinning = 0;
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

    const wallet = el('div', 'b-money');
    for (const r of RARITIES) {
      const cell = el('div', `b-coin r-${r}`);
      const value = el('span', 'b-coin-value', '0');
      cell.append(el('span', 'b-coin-name', RARITY_NAMES[r]), value);
      this.money.set(r, value);
      wallet.append(cell);
    }
    const ume = el('div', 'b-coin b-ume');
    this.ume = el('span', 'b-coin-value', '0');
    ume.append(el('span', 'b-coin-name', 'УМЕ'), this.ume);
    wallet.append(ume);

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
      el('p', 's-why', 'Игнатьев разбирает гору, которую сыплет сверху весь ваш мусор, и выкапывает тару. Вскрываете вы: что внутри, решает случай. Находки платят валютой своей редкости.'),
      wallet,
      this.stripWindow,
      this.result,
      crates,
      this.finds,
      section('Инструменты Игнатьева'),
      tools,
      section('Переплавка'),
      el('p', 's-why', 'Низшее переплавляется в высшее. Вершина — УМЕ, ультра мусорная единица: она плавится только там, где лежат вещи не людей.'),
      ladder,
      section('Наверху'),
      el('p', 's-why', 'После спуска свалка, цех, линия и город начались заново. Скрипты для них ставятся отсюда, по одному.'),
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
      const per = meltCost(b, from);
      const locked = from === 'anomaly' && !umeOpen(b);
      sub.textContent = locked ? `${per} → 1, только на глубине «Не люди»` : `${per} → 1`;
      const can = !locked && b.money[from].gte(per);
      one.disabled = !can;
      all.disabled = !can;
    });
    return row;
  }

  /** Opens one container and runs the strip to what was inside. */
  private openWithStrip(id: ContainerId): void {
    if (this.spinning) return;
    const s = this.getState();
    const b = s.bottom;
    // The strip shows what this container could hold, at its odds.
    const odds = rarityOdds(b, id);
    const opening = openOne(b, id, Math.random);
    if (!opening) return;
    const filler = (): ItemDef => {
      const total = odds.reduce((x, y) => x + y, 0);
      let r = Math.random() * total;
      let rarity: Rarity = 'dust';
      for (let k = 0; k < RARITIES.length; k++) {
        r -= odds[k];
        if (r < 0) {
          rarity = RARITIES[k];
          break;
        }
      }
      const pool = ITEMS.filter((it) => it.rarity === rarity);
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const cards = [...Array.from({ length: LEAD }, filler), opening.item, ...Array.from({ length: 4 }, filler)];
    this.strip.replaceChildren(...cards.map((it) => this.card(it, b.found[it.id] ?? 0)));
    this.strip.style.transition = 'none';
    this.strip.style.transform = 'translateX(0)';
    const width = this.stripWindow.clientWidth || 358;
    const target = -(LEAD * CARD + CARD / 2 - width / 2) + (Math.random() - 0.5) * (CARD * 0.6);
    this.result.textContent = `${containerById(id)!.name}: вскрываем…`;
    this.result.className = 'b-result';
    void this.strip.offsetWidth;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.strip.style.transition = reduce ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)`;
    this.strip.style.transform = `translateX(${target}px)`;
    this.spinning = window.setTimeout(() => this.landed(opening), reduce ? 0 : SPIN_MS + 100);
    this.render(s);
  }

  private landed(o: Opening): void {
    this.spinning = 0;
    const r = o.item.rarity;
    this.result.textContent = `${o.fresh ? 'НОВОЕ · ' : ''}${o.item.name} — ${o.item.text} +${format(o.amount)} · ${RARITY_NAMES[r].toLowerCase()}`;
    this.result.className = `b-result r-${r}`;
    if (RARITIES.indexOf(r) >= 3) this.camera.find(RARITY_COLOR[r]);
    this.onChange(RARITIES.indexOf(r) >= 4 ? `${RARITY_NAMES[r]}: ${o.item.name}` : undefined, true);
  }

  /** Opens every container of a kind the money allows, without the strip; says what came out. */
  private openAll(id: ContainerId): void {
    if (this.spinning) return;
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
    this.onChange();
  }

  private card(it: ItemDef, seen: number): HTMLElement {
    const c = el('div', `b-card r-${it.rarity}`);
    c.append(el('span', 'b-card-rarity', RARITY_NAMES[it.rarity]), el('span', 'b-card-name', seen ? it.name : '???'));
    return c;
  }

  render(state: GameState): void {
    const b = state.bottom;
    this.meta.textContent = `вглубь ${format(D(Math.floor(b.dug)))} т · гора ${format(D(Math.floor(b.heap)))} т · сверху ${fallPerMinute(b.above).toFixed(1)} т/мин`;
    for (const r of RARITIES) this.money.get(r)!.textContent = format(b.money[r].floor());
    this.ume.textContent = format(b.ume);
    for (const c of CONTAINERS) {
      const view = this.crates.get(c.id)!;
      const n = b.stock[c.id];
      view.count.textContent = `×${n}`;
      view.row.classList.toggle('none', n === 0);
      const can = canOpen(b, c.id) && !this.spinning;
      view.one.disabled = !can;
      view.all.disabled = !can;
    }
    for (const u of this.updaters) u(state);
    // The last finds the automatic opening made, when it runs.
    const sig = b.recent.map((o) => o.item.id + b.opened).join();
    if (sig !== this.shownFinds && !this.spinning) {
      this.shownFinds = sig;
      this.finds.replaceChildren(
        ...b.recent.slice(0, 5).map((o) => el('div', `b-find r-${o.item.rarity}`, `${o.fresh ? 'новое · ' : ''}${o.item.name} +${format(o.amount)}`)),
      );
    }
    this.renderCollection(state);
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
    this.camera.update(dt, {
      heap: b.heap,
      fall: fallPerMinute(b.above),
      dig: b.heap > 0.01 ? digRate(b) : 0,
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

