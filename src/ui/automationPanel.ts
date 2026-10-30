import { format } from '../game/num';
import { PRODUCERS } from '../game/producers';
import { TRACKS } from '../game/infinite';
import {
  LIGHT_LEVELS,
  PHANTOM_LINES,
  RECYCLE_MINUTES,
  SORT_MINUTES,
  SORT_SHARES,
  type SortMode,
  SCRIPTS,
  UPGRADE_SHARES,
  reliabilityCost,
  scriptById,
  speedCost,
  type RecycleMode,
  type ScriptDef,
  type ScriptId,
} from '../game/scripts';
import {
  AUTO_FACTORS,
  autoRecycleAt,
  buyReliability,
  buySpeed,
  installScript,
  lightFailChance,
  resortGain,
  scriptOffered,
  scriptOwned,
  scriptTick,
  type BuyMode,
  type GameState,
  type ScriptNote,
} from '../game/state';
import { nodeById } from '../game/layers';
import { recipeById } from '../game/sorting';
import { stageIndex } from '../game/threat';
import { el, progress } from './dom';

const LOG_MAX = 40;
/** Purchases are gathered and written as one line per script this often. */
const FLUSH_MS = 2000;
/** A line names at most this many things bought, then says how many more. */
const LINE_ITEMS = 3;
/** Chance per written batch, by threat stage, of a line no script wrote. */
const PHANTOM_CHANCE = [0, 0, 0.02, 0.05, 0.1];

const pad2 = (n: number) => String(n).padStart(2, '0');
const stamp = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Card {
  def: ScriptDef;
  root: HTMLElement;
  toggle: HTMLButtonElement;
  settings: HTMLElement;
  locked: HTMLElement;
  lockedNote: HTMLElement;
  install: HTMLButtonElement;
}

interface LogLine {
  text: string;
  times: number;
  row: HTMLElement;
  phantom: boolean;
}

/** Whether a script is switched on, and how to flip it. */
const SWITCHES: Record<ScriptId, [(s: GameState) => boolean, (s: GameState, on: boolean) => void]> = {
  producers: [(s) => s.autobuy, (s, on) => (s.autobuy = on)],
  upgrades: [(s) => s.scripts.upgradesOn, (s, on) => (s.scripts.upgradesOn = on)],
  endless: [(s) => s.scripts.endlessOn, (s, on) => (s.scripts.endlessOn = on)],
  recycle: [(s) => s.autoRecycle.on, (s, on) => (s.autoRecycle.on = on)],
  light: [(s) => s.scripts.lightOn, (s, on) => (s.scripts.lightOn = on)],
  sort: [(s) => s.scripts.sortOn, (s, on) => (s.scripts.sortOn = on)],
};

/** The Automation tab: scripts with their switches and settings, and the log of what they did. */
export class AutomationPanel {
  readonly root: HTMLElement;
  private cards: Card[] = [];
  /** Refresh pressed states and numbers on every render. */
  private updaters: ((s: GameState) => void)[] = [];
  private speedMeta!: HTMLElement;
  private speedButton!: HTMLButtonElement;
  private speedPrice!: HTMLElement;
  private chips!: HTMLElement;
  private chipsFor = '';
  private logList!: HTMLElement;
  private logEmpty!: HTMLElement;
  private lines: LogLine[] = [];
  /** Purchases since the last flush: per script, what and how many times. */
  private pending = new Map<ScriptId, Map<string, number>>();
  private flushedAt = 0;

  constructor(
    private getState: () => GameState,
    private onChange: (message?: string) => void,
  ) {
    this.root = el('section', 'panel automation');
    this.build();
  }

  private build(): void {
    const head = el('div', 'panel-head');
    this.speedMeta = el('span', 'panel-meta');
    head.append(el('h2', 'panel-title', 'Автоматика'), this.speedMeta);

    const speed = el('div', 'a-speed');
    const speedText = el('div', 'a-speed-text');
    speedText.append(el('div', 'a-title', 'Разгон скриптов'), el('div', 'a-text', 'Скрипты покупок срабатывают на 50% чаще за уровень.'));
    this.speedButton = el('button', 'buy');
    this.speedButton.type = 'button';
    this.speedButton.id = 'script-speed';
    this.speedPrice = el('span', 'buy-price');
    this.speedButton.append(el('span', 'buy-label', 'Разгон'), this.speedPrice);
    this.speedButton.addEventListener('click', () => {
      if (buySpeed(this.getState())) this.onChange(`Разгон скриптов: ур. ${this.getState().scripts.speed}`);
    });
    speed.append(speedText, this.speedButton);

    const list = el('div', 'a-cards');
    for (const def of SCRIPTS) {
      const card = this.buildCard(def);
      this.cards.push(card);
      list.append(card.root);
    }

    const logHead = el('div', 'panel-head');
    logHead.append(el('h2', 'panel-title', 'Журнал скриптов'));
    this.logEmpty = el('p', 'empty', 'Пока тихо. Здесь видно всё, что скрипты делают без вас.');
    this.logList = el('div', 'a-log');
    this.logList.setAttribute('aria-live', 'off');

    this.root.append(head, speed, list, logHead, this.logEmpty, this.logList);
  }

  private buildCard(def: ScriptDef): Card {
    const root = el('div', 'a-card');
    const head = el('div', 'a-head');
    const names = el('div', 'a-names');
    names.append(el('span', 'a-name', def.name), el('span', 'a-title', def.title));
    const toggle = el('button', 'mode auto a-toggle');
    toggle.type = 'button';
    toggle.id = `script-${def.id}`;
    const [isOn, setOn] = SWITCHES[def.id];
    toggle.addEventListener('click', () => {
      const s = this.getState();
      setOn(s, !isOn(s));
      this.onChange();
    });
    head.append(names, toggle);

    const settings = el('div', 'a-settings');
    this.buildSettings(def.id, settings);

    const locked = el('div', 'a-locked');
    const lockedNote = el('div', 'a-text');
    const install = el('button', 'btn a-install');
    install.type = 'button';
    install.id = `install-${def.id}`;
    install.addEventListener('click', () => {
      if (installScript(this.getState(), def.id)) this.onChange(`Установлен скрипт ${def.name}`);
    });
    locked.append(lockedNote, install);

    root.append(head, el('div', 'a-text', def.text), settings, locked);
    return { def, root, toggle, settings, locked, lockedNote, install };
  }

  /** A row of mutually exclusive choices, like the buy-amount switch. */
  private choice<T>(label: string, options: readonly [T, string][], get: (s: GameState) => T, set: (s: GameState, v: T) => void): HTMLElement {
    const row = el('div', 'a-row');
    const group = el('div', 'modes');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const buttons = options.map(([value, text]) => {
      const b = el('button', 'mode', text);
      b.type = 'button';
      b.addEventListener('click', () => {
        set(this.getState(), value);
        this.onChange();
      });
      group.append(b);
      return [value, b] as const;
    });
    this.updaters.push((s) => {
      for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(get(s) === value));
    });
    row.append(el('div', 'a-label', label), group);
    return row;
  }

  private buildSettings(id: ScriptId, box: HTMLElement): void {
    switch (id) {
      case 'producers': {
        const modes: [BuyMode, string][] = [['one', '×1'], ['ten', '×10'], ['max', 'Макс']];
        box.append(this.choice('Сколько за раз', modes, (s) => s.scripts.producerMode, (s, v) => (s.scripts.producerMode = v)));
        const row = el('div', 'a-row');
        this.chips = el('div', 'a-chips');
        row.append(el('div', 'a-label', 'Что покупать'), this.chips);
        box.append(row);
        break;
      }
      case 'upgrades': {
        const shares = UPGRADE_SHARES.map((v) => [v, pct(v)] as [number, string]);
        box.append(this.choice('Если цена не больше доли мусора', shares, (s) => s.scripts.upgradesShare, (s, v) => (s.scripts.upgradesShare = v)));
        break;
      }
      case 'endless': {
        const row = el('div', 'a-row');
        const chips = el('div', 'a-chips');
        for (const t of TRACKS) {
          const b = el('button', 'chip', t.name);
          b.type = 'button';
          b.addEventListener('click', () => {
            const sc = this.getState().scripts;
            sc.endlessOff = sc.endlessOff.includes(t.id) ? sc.endlessOff.filter((x) => x !== t.id) : [...sc.endlessOff, t.id];
            this.onChange();
          });
          this.updaters.push((s) => b.setAttribute('aria-pressed', String(!s.scripts.endlessOff.includes(t.id))));
          chips.append(b);
        }
        row.append(el('div', 'a-label', 'Что покупать'), chips);
        box.append(row);
        break;
      }
      case 'recycle': {
        const modes: [RecycleMode, string][] = [['gain', 'Награда'], ['time', 'Время'], ['peak', 'Пик']];
        box.append(this.choice('Когда перерабатывать', modes, (s) => s.scripts.recycleMode, (s, v) => (s.scripts.recycleMode = v)));
        const factors = this.choice('Награда от всего вторсырья', AUTO_FACTORS.map((f) => [f, `×${f}`] as [number, string]), (s) => s.autoRecycle.factor, (s, v) => (s.autoRecycle.factor = v));
        const minutes = this.choice('Длина захода', RECYCLE_MINUTES.map((m) => [m, m >= 60 ? `${m / 60} ч` : `${m} мин`] as [number, string]), (s) => s.scripts.recycleMinutes, (s, v) => (s.scripts.recycleMinutes = v));
        const note = el('div', 'a-note');
        this.updaters.push((s) => {
          const mode = s.scripts.recycleMode;
          factors.hidden = mode !== 'gain';
          minutes.hidden = mode !== 'time';
          note.textContent =
            mode === 'gain'
              ? `сработает при награде от ${format(autoRecycleAt(s))}`
              : mode === 'time'
                ? `сработает через ${s.scripts.recycleMinutes} мин захода`
                : 'сработает, когда вторсырьё в секунду перестанет расти';
        });
        box.append(factors, minutes, note);
        break;
      }
      case 'sort': {
        const modes: [SortMode, string][] = [['share', 'Награда'], ['time', 'Время']];
        box.append(this.choice('Когда пересортировывать', modes, (s) => s.scripts.sortMode, (s, v) => (s.scripts.sortMode = v)));
        const shares = this.choice('Фракций от всех за игру', SORT_SHARES.map((v) => [v, pct(v)] as [number, string]), (s) => s.scripts.sortShare, (s, v) => (s.scripts.sortShare = v));
        const minutes = this.choice('Длина цикла', SORT_MINUTES.map((m) => [m, m >= 60 ? `${m / 60} ч` : `${m} мин`] as [number, string]), (s) => s.scripts.sortMinutes, (s, v) => (s.scripts.sortMinutes = v));
        const note = el('div', 'a-note');
        this.updaters.push((s) => {
          const mode = s.scripts.sortMode;
          shares.hidden = mode !== 'share';
          minutes.hidden = mode !== 'time';
          note.textContent =
            mode === 'share'
              ? `сработает при награде от ${format(s.sorting.total.mul(s.scripts.sortShare).max(1))} (сейчас ${format(resortGain(s))})`
              : `сработает через ${s.scripts.sortMinutes} мин цикла`;
        });
        box.append(shares, minutes, note);
        break;
      }
      case 'light': {
        const levels = LIGHT_LEVELS.map((v) => [v, pct(v)] as [number, string]);
        box.append(this.choice('Включать на угрозе', levels, (s) => s.scripts.lightAt, (s, v) => (s.scripts.lightAt = v)));
        const row = el('div', 'a-speed');
        const info = el('div', 'a-speed-text');
        const chance = el('div', 'a-title');
        const failures = el('div', 'a-text');
        info.append(chance, failures);
        const button = el('button', 'buy');
        button.type = 'button';
        button.id = 'script-reliability';
        const price = el('span', 'buy-price');
        button.append(el('span', 'buy-label', 'Надёжность'), price);
        button.addEventListener('click', () => {
          if (buyReliability(this.getState())) this.onChange(`Надёжность прожектора: ур. ${this.getState().scripts.reliability}`);
        });
        this.updaters.push((s) => {
          const sc = s.scripts;
          chance.textContent = `Шанс отказа ${(lightFailChance(s) * 100).toFixed(1)}% · ур. ${sc.reliability}`;
          failures.textContent = sc.failures > 0 ? `Отказов: ${sc.failures}. Чем ближе объект, тем чаще.` : 'Чем ближе объект, тем чаще отказы.';
          const cost = reliabilityCost(sc.reliability);
          price.textContent = `${format(cost)} ВС`;
          button.disabled = s.recycle.points.lt(cost);
          button.style.setProperty('--p', String(progress(s.recycle.points, cost)));
        });
        row.append(info, button);
        box.append(row);
        break;
      }
    }
  }

  /** Producer switches follow what is revealed this run. */
  private syncChips(state: GameState): void {
    const sig = state.revealed.join();
    if (sig === this.chipsFor) return;
    this.chipsFor = sig;
    this.chips.replaceChildren(
      ...PRODUCERS.filter((p) => state.revealed.includes(p.id)).map((p) => {
        const b = el('button', 'chip', p.name);
        b.type = 'button';
        b.dataset.id = p.id;
        b.addEventListener('click', () => {
          const sc = this.getState().scripts;
          sc.producerOff = sc.producerOff.includes(p.id) ? sc.producerOff.filter((x) => x !== p.id) : [...sc.producerOff, p.id];
          this.onChange();
        });
        return b;
      }),
    );
  }

  render(state: GameState): void {
    const sc = state.scripts;
    this.speedMeta.textContent = `такт ${scriptTick(state).toFixed(2)} с`;
    const cost = speedCost(sc.speed);
    this.speedPrice.textContent = `ур. ${sc.speed} · ${format(cost)} ВС`;
    this.speedButton.disabled = state.recycle.points.lt(cost);
    this.speedButton.style.setProperty('--p', String(progress(state.recycle.points, cost)));

    this.syncChips(state);
    for (const b of this.chips.children) {
      (b as HTMLElement).setAttribute('aria-pressed', String(!sc.producerOff.includes((b as HTMLElement).dataset.id!)));
    }

    for (const card of this.cards) {
      // The sorter stays out of sight until the line opens.
      card.root.hidden = card.def.recipe !== undefined && !state.sorting.open;
      const owned = scriptOwned(state, card.def.id);
      card.root.classList.toggle('off', !owned);
      card.toggle.hidden = !owned;
      card.settings.hidden = !owned;
      card.locked.hidden = owned;
      if (owned) {
        const on = SWITCHES[card.def.id][0](state);
        card.toggle.textContent = on ? 'Вкл' : 'Выкл';
        card.toggle.setAttribute('aria-pressed', String(on));
        continue;
      }
      if (card.def.recipe) {
        card.lockedNote.textContent = `Ставится рецептом сортировки «${recipeById(card.def.recipe)!.name}».`;
        card.install.hidden = true;
      } else if (card.def.node) {
        card.lockedNote.textContent = `Ставится узлом дерева переработки «${nodeById(card.def.node)!.name}».`;
        card.install.hidden = true;
      } else if (!scriptOffered(state, card.def.id)) {
        card.lockedNote.textContent = `Откроется ${card.def.hint}.`;
        card.install.hidden = true;
      } else {
        const price = card.def.cost!;
        card.lockedNote.textContent = '';
        card.install.hidden = false;
        card.install.textContent = `Установить · ${format(price)} ВС`;
        card.install.disabled = state.recycle.points.lt(price);
      }
    }
    for (const update of this.updaters) update(state);
  }

  /** A script could be installed right now, for the tab badge. */
  attention(state: GameState): boolean {
    return SCRIPTS.some((d) => d.cost && !scriptOwned(state, d.id) && scriptOffered(state, d.id) && state.recycle.points.gte(d.cost));
  }

  /** Writes what the scripts did; repeats of the last line fold into a counter. */
  log(notes: readonly ScriptNote[], state: GameState): void {
    for (const n of notes) {
      if (n.script === 'light') {
        this.write(`${scriptById(n.script)!.name}: ${n.text}`, false, n.failed === true);
        continue;
      }
      const bought = this.pending.get(n.script) ?? new Map<string, number>();
      bought.set(n.text, (bought.get(n.text) ?? 0) + 1);
      this.pending.set(n.script, bought);
    }
    const now = Date.now();
    if (now - this.flushedAt < FLUSH_MS || this.pending.size === 0) return;
    this.flushedAt = now;
    for (const [id, bought] of this.pending) {
      const items = [...bought].map(([what, n]) => (n > 1 ? `${what} ×${n}` : what));
      const more = items.length > LINE_ITEMS ? ` и ещё ${items.length - LINE_ITEMS}` : '';
      this.write(`${scriptById(id)!.name}: ${items.slice(0, LINE_ITEMS).join(', ')}${more}`, false, false);
    }
    this.pending.clear();
    if (Math.random() < PHANTOM_CHANCE[stageIndex(state.threat.level)]) {
      this.write(PHANTOM_LINES[Math.floor(Math.random() * PHANTOM_LINES.length)], true, false);
    }
  }

  /** One line from outside the scripts' own tick, such as an automatic recycle. */
  note(text: string): void {
    this.write(text, false, false);
  }

  private write(text: string, phantom: boolean, failed: boolean): void {
    const last = this.lines[0];
    if (last && last.text === text && !phantom) {
      last.times += 1;
      last.row.lastElementChild!.textContent = ` ×${last.times}`;
      last.row.firstElementChild!.textContent = `[${stamp()}] ${text}`;
      return;
    }
    const row = el('div', `a-line${phantom ? ' phantom' : ''}${failed ? ' failed' : ''}`);
    row.append(el('span', '', `[${stamp()}] ${text}`), el('span', 'a-times'));
    this.lines.unshift({ text, times: 1, row, phantom });
    this.logList.prepend(row);
    while (this.lines.length > LOG_MAX) this.lines.pop()!.row.remove();
    this.logEmpty.hidden = true;
  }
}
