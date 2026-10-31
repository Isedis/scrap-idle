import { format, type Decimal } from '../game/num';
import { BRANCHES, LAYERS, NODES, RECYCLE_AT, REPEATS, canBuyNode, hasNode, isNodeOpen, nextGainAt, passiveBonus, repeatCost, type NodeDef, type RepeatDef } from '../game/layers';
import { recycleAdvice } from '../game/advice';
import { PlantCam, type PlantView } from './plantCam';
import { CorridorCam, type CorridorView } from './corridorCam';
import { nearness } from '../game/hearing';
import { recycleMult, scriptOwned, buyNode, buyRepeat, canRecycle, currentGain, repeatsOpen, type GameState } from '../game/state';
import { el, progress, textBar } from './dom';
import { Fold } from './fold';

interface NodeRow {
  def: NodeDef;
  root: HTMLElement;
  button: HTMLButtonElement;
}

/** m:ss, or a dash for a run of unknown length. */
const mmss = (s: number) => (s < 0 ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** The Recycling tab: what a recycle gives now, the button, and the tree. */
export class RecyclePanel {
  readonly root: HTMLElement;
  private stats!: HTMLElement;
  private now!: HTMLElement;
  /** Camera 03 over the plant. */
  readonly camera = new PlantCam();
  /** Camera 07 in the corridor to the booth: on screen instead of 03 while the one that listens is out. */
  readonly corridor = new CorridorCam();
  /** Where the tab's camera sits: 03, or 07 while it walks. */
  readonly camSlot = el('div', 'cam-slot');
  private action!: HTMLElement;
  private actionTitle!: HTMLElement;
  private actionBar!: HTMLElement;
  private actionNote!: HTMLElement;
  private button!: HTMLButtonElement;
  private nodeRows: NodeRow[] = [];
  /** Tree branches that fold away once bought out. */
  private folds: { fold: Fold; ids: string[] }[] = [];
  private armed = 0;
  private repeatsBox!: HTMLElement;
  private repeatsLocked!: HTMLElement;
  private repeatRows: { def: RepeatDef; level: HTMLElement; button: HTMLButtonElement }[] = [];

  constructor(
    private getState: () => GameState,
    private onRecycle: () => void,
    private onNode: (def: NodeDef) => void,
  ) {
    this.root = el('section', 'panel recycle');
    this.build();
  }

  private build(): void {
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Переработка'));
    this.now = el('div', 's-now');
    this.corridor.root.hidden = true;
    this.camSlot.append(this.camera.root, this.corridor.root);
    this.root.append(
      this.camSlot,
      head,
      el('p', 's-why', 'Сдаёшь весь мусор и производителей — получаешь вторсырьё. Оно навсегда усиливает доход и тратится на дерево ниже.'),
      this.now,
    );

    this.stats = el('div', 'r-stats');
    this.root.append(this.stats);

    this.action = el('div', 'r-action');
    this.actionTitle = el('div', 'r-title');
    this.actionBar = el('div', 'r-bar');
    this.actionNote = el('div', 'r-note');
    this.button = el('button', 'btn r-go', 'Переработать');
    this.button.type = 'button';
    this.button.id = 'recycle';
    this.button.addEventListener('click', () => this.press());
    const keeps = el('div', 'r-keeps');
    keeps.append(
      el('div', '', 'Начнутся заново: мусор, производители, улучшения.'),
      el('div', '', 'Останутся: вторсырьё и всё дерево ниже.'),
    );
    this.action.append(this.actionTitle, this.actionBar, this.actionNote, this.button, keeps);
    this.root.append(this.action);

    this.root.append(el('h2', 'panel-title', 'Дерево переработки'));
    for (const [branch, label] of BRANCHES) {
      const group = el('div', 'r-branch');
      const fold = new Fold(group, label, `tree:${branch}`);
      this.folds.push({ fold, ids: NODES.filter((n) => n.branch === branch).map((n) => n.id) });
      group.append(fold.head);
      const nodes = NODES.filter((n) => n.branch === branch);
      nodes.forEach((def, i) => {
        const row = this.buildNode(def, i === nodes.length - 1);
        this.nodeRows.push(row);
        group.append(row.root);
      });
      this.root.append(group);
    }

    this.root.append(this.buildRepeats());

    // The next layers, shown as closed doors.
    this.root.append(el('h2', 'panel-title', 'Дальше'));
    for (const layer of LAYERS.filter((l) => !l.playable)) {
      const door = el('div', 'r-door');
      const first = layer === LAYERS.find((l) => !l.playable);
      door.append(el('div', 'r-door-name', first ? layer.name : '???'), el('div', 'r-door-text', first ? `${layer.teaser}. Откроется в одном из следующих обновлений.` : 'Сигнал не распознан.'));
      this.root.append(door);
    }
  }

  private buildNode(def: NodeDef, last: boolean): NodeRow {
    const root = el('div', 'r-node');
    root.append(el('span', 'r-twig', last ? '└─' : '├─'));
    const body = el('div', 'r-node-body');
    body.append(el('div', 'r-node-name', def.name), el('div', 'r-node-text', def.text));
    const button = el('button', 'buy r-node-buy');
    button.type = 'button';
    button.id = `node-${def.id}`;
    button.addEventListener('click', () => {
      if (buyNode(this.getState(), def.id)) this.onNode(def);
    });
    root.append(body, button);
    return { def, root, button };
  }

  /** Endless nodes after the tree: bought again and again with Recycled material. */
  private buildRepeats(): HTMLElement {
    this.repeatsBox = el('div', 'r-branch');
    this.repeatsBox.append(el('div', 'r-branch-title', 'Бесконечное'));
    this.repeatsLocked = el('div', 'r-note', 'Откроется, когда куплено всё дерево.');
    this.repeatsBox.append(this.repeatsLocked);
    REPEATS.forEach((def, i) => {
      const root = el('div', 'r-node');
      root.append(el('span', 'r-twig', i === REPEATS.length - 1 ? '└─' : '├─'));
      const body = el('div', 'r-node-body');
      const name = el('div', 'r-node-name', def.name);
      const level = el('span', 'p-count');
      name.append(' ', level);
      body.append(name, el('div', 'r-node-text', def.text));
      const button = el('button', 'buy r-node-buy');
      button.type = 'button';
      button.id = `repeat-${def.id}`;
      button.addEventListener('click', () => {
        if (buyRepeat(this.getState(), def.id)) this.onNode({ id: def.id, branch: 'production', name: def.name, text: def.text, cost: repeatCost(def, 0) });
      });
      root.append(body, button);
      this.repeatRows.push({ def, level, button });
      this.repeatsBox.append(root);
    });
    return this.repeatsBox;
  }

  /** Two taps: the first arms the button for three seconds, the second recycles. */
  private press(): void {
    if (!canRecycle(this.getState())) return;
    if (!this.armed) {
      this.button.textContent = 'Нажмите ещё раз для переработки';
      this.button.classList.add('armed');
      this.armed = window.setTimeout(() => this.disarm(), 3000);
      return;
    }
    this.disarm();
    this.onRecycle();
  }

  private disarm(): void {
    clearTimeout(this.armed);
    this.armed = 0;
    this.button.textContent = 'Переработать';
    this.button.classList.remove('armed');
  }

  render(state: GameState): void {
    for (const { fold, ids } of this.folds) fold.update(ids.filter((id) => state.recycle.nodes.includes(id)).length, ids.length);
    this.now.textContent = recycleAdvice(state);
    const layer = state.recycle;
    const lines: string[] = [];
    lines.push(`вторсырьё: ${format(layer.points)}`);
    if (layer.total.gt(0)) lines.push(`заработано всего: ${format(layer.total)} → доход ×${format(passiveBonus(layer.total))}`);
    lines.push(`переработок: ${layer.resets}${layer.bestSeconds !== null ? ` · лучший заход ${mmss(layer.bestSeconds)}` : ''}`);
    lines.push(`текущий заход: ${mmss(state.runSeconds)}`);
    this.stats.replaceChildren(...lines.map((l) => el('div', '', l)));

    const gain = currentGain(state);
    const ready = gain.gt(0);
    this.action.classList.toggle('ready', ready);
    this.button.disabled = !ready;
    if (!ready) {
      const p = progress(state.runTrash, RECYCLE_AT);
      this.actionTitle.textContent = layer.resets === 0 ? 'До первой переработки' : 'До переработки';
      this.actionBar.textContent = `${textBar(p, 16)} ${Math.floor(p * 100)}%`;
      this.actionNote.textContent = `${format(state.runTrash)} / ${format(RECYCLE_AT)} кг за заход`;
    } else {
      const next: Decimal = nextGainAt(state.runTrash, recycleMult(state));
      this.actionTitle.textContent = `Переработать сейчас: +${format(gain)} вторсырья`;
      this.actionBar.textContent = `${textBar(progress(state.runTrash, next), 16)} до +${format(gain.add(1))}`;
      this.actionNote.textContent = `следующая единица при ${format(next)} кг`;
    }

    // Endless nodes.
    const open = repeatsOpen(state);
    this.repeatsLocked.hidden = open;
    for (const r of this.repeatRows) {
      const level = layer.repeats[r.def.id] ?? 0;
      const cost = repeatCost(r.def, level);
      r.level.textContent = `ур. ${level}`;
      r.button.disabled = !open || layer.points.lt(cost);
      r.button.textContent = open ? `${format(cost)} ВС` : 'Закрыто';
      r.button.style.setProperty('--p', String(open ? progress(layer.points, cost) : 0));
    }

    for (const row of this.nodeRows) {
      const owned = hasNode(layer, row.def.id);
      const open = isNodeOpen(layer, row.def);
      row.root.classList.toggle('owned', owned);
      row.root.classList.toggle('closed', !owned && !open);
      row.button.disabled = !canBuyNode(layer, row.def);
      row.button.textContent = owned ? 'Есть' : open ? `${format(row.def.cost)} ВС` : 'Закрыто';
      row.button.style.setProperty('--p', String(owned ? 0 : progress(layer.points, row.def.cost)));
    }
  }

  /**
   * What on this tab is worth the player's attention, for the badge: a recycle that at least
   * doubles the material earned so far (the first one always), unless the auto-recycler does
   * it anyway, and tree nodes that can be bought. Endless nodes are always affordable
   * sooner or later, so they never call.
   */
  attention(state: GameState): string[] {
    const layer = state.recycle;
    const auto = state.autoRecycle.on && scriptOwned(state, 'recycle');
    const worth = canRecycle(state) && !auto && (layer.resets === 0 || currentGain(state).gte(layer.total));
    return [...(worth ? ['recycle'] : []), ...NODES.filter((n) => canBuyNode(layer, n)).map((n) => `node:${n.id}`)];
  }

  /** Every animation frame while the tab is on screen: the camera. */
  frame(dt: number, state: GameState): void {
    const h = state.hearing;
    const out = h.phase === 'walk' || h.phase === 'check' || this.corridor.leaving;
    // The tab switches to the corridor while it is out there, and back to the plant after.
    if (this.corridor.root.hidden === out) {
      this.corridor.root.hidden = !out;
      this.camera.root.hidden = out;
      (out ? this.corridor : this.camera).glitch(0.6);
    }
    if (out) this.corridor.update(dt, corridorView(state));
    else this.camera.update(dt, plantView(state));
  }
}

/** What camera 03 shows of the game; the journal's monitor uses it too. */
export function plantView(state: GameState): PlantView {
  const run = state.runTrash.add(1).log10().toNumber();
  return {
    progress: canRecycle(state) ? 1 : Math.min(run / RECYCLE_AT.log10().toNumber(), 0.99),
    pointsLog: state.recycle.points.add(1).log10().toNumber(),
    nodes: state.recycle.nodes,
    allNodes: NODES.map((n) => n.id),
    threat: state.threat.level,
    noise: state.sorting.open ? state.hearing.noise : 1,
    loud: state.sorting.open,
  };
}

/** What camera 07 shows of the one that listens. */
export function corridorView(state: GameState): CorridorView {
  const h = state.hearing;
  return { phase: h.phase, near: nearness(h), held: h.held };
}
