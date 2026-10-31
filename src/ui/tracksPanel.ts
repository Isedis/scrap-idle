import { D, format } from '../game/num';
import { BULK_HEAD_START, COMPACT_MULT, DARK_GROWTH, TRACKS, trackCost, type TrackDef } from '../game/infinite';
import { buyTrack, trackLevel, visibleTracks, type GameState } from '../game/state';
import { el, progress } from './dom';

interface Row {
  def: TrackDef;
  root: HTMLElement;
  level: HTMLElement;
  now: HTMLElement;
  button: HTMLButtonElement;
  price: HTMLElement;
}

/** What a track gives at a level, for the card. */
function current(def: TrackDef, level: number): string {
  switch (def.id) {
    case 'compact':
      return `сейчас ×${format(D(COMPACT_MULT).pow(level))}`;
    case 'bulk':
      return `сейчас пороги на ${BULK_HEAD_START * level} шт. ближе`;
    case 'dark':
      return `бонус в темноте ×${(DARK_GROWTH ** level).toFixed(2)}`;
  }
}

/** Endless upgrades at the bottom of the Upgrades tab. */
export class TracksPanel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private rows: Row[] = [];

  constructor(private getState: () => GameState, private onBuy: (def: TrackDef) => void) {
    this.root = el('div', 'tracks');
    this.root.hidden = true;
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Бесконечные'), el('span', 'panel-meta', 'без предела, сгорают с заходом'));
    this.list = el('div', 'producers');
    this.root.append(head, this.list);
    for (const def of TRACKS) this.rows.push(this.buildRow(def));
  }

  private buildRow(def: TrackDef): Row {
    const root = el('div', 'producer upgrade track');
    const body = el('div', 'p-body');
    const head = el('div', 'p-head');
    const level = el('span', 'p-count');
    head.append(el('span', 'p-name', def.name), level);
    const now = el('div', 'p-rate');
    body.append(head, el('div', 'p-effect', def.text), now, el('div', 'p-flavor', def.flavor));
    const icon = el('div', 'p-icon', '∞');
    const button = el('button', 'buy');
    button.type = 'button';
    button.id = `track-${def.id}`;
    const price = el('span', 'buy-price');
    button.append(el('span', 'buy-label', 'Купить'), price);
    button.addEventListener('click', () => {
      if (buyTrack(this.getState(), def.id)) this.onBuy(def);
    });
    root.append(icon, body, button);
    return { def, root, level, now, button, price };
  }

  render(state: GameState): void {
    const shown = visibleTracks(state);
    this.root.hidden = shown.length === 0;
    if (this.root.hidden) return;
    const wanted = this.rows.filter((r) => shown.includes(r.def)).map((r) => r.root);
    if (wanted.length !== this.list.children.length) this.list.replaceChildren(...wanted);
    for (const row of this.rows) {
      const level = trackLevel(state, row.def.id);
      const cost = trackCost(row.def, level);
      row.level.textContent = `ур. ${level}`;
      row.now.textContent = current(row.def, level);
      row.price.textContent = `${format(cost)} кг`;
      row.button.disabled = state.trash.lt(cost);
      row.button.style.setProperty('--p', String(progress(state.trash, cost)));
    }
  }

  /** Whether any endless upgrade is affordable right now, for the tab badge. */
  affordable(state: GameState): number {
    return visibleTracks(state).filter((t) => state.trash.gte(trackCost(t, trackLevel(state, t.id)))).length;
  }
}
