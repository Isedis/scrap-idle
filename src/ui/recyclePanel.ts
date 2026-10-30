import { format, type Decimal } from '../game/num';
import { BRANCHES, LAYERS, NODES, RECYCLE_AT, canBuyNode, hasNode, isNodeOpen, nextGainAt, passiveBonus, recycleGain, type NodeDef } from '../game/layers';
import { buyNode, canRecycle, type GameState } from '../game/state';
import { el, progress, textBar } from './dom';

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
  private action!: HTMLElement;
  private actionTitle!: HTMLElement;
  private actionBar!: HTMLElement;
  private actionNote!: HTMLElement;
  private button!: HTMLButtonElement;
  private nodeRows: NodeRow[] = [];
  private armed = 0;

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
    this.root.append(head);

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
      group.append(el('div', 'r-branch-title', label));
      const nodes = NODES.filter((n) => n.branch === branch);
      nodes.forEach((def, i) => {
        const row = this.buildNode(def, i === nodes.length - 1);
        this.nodeRows.push(row);
        group.append(row.root);
      });
      this.root.append(group);
    }

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
    const layer = state.recycle;
    const lines: string[] = [];
    lines.push(`вторсырьё: ${format(layer.points)}`);
    if (layer.total.gt(0)) lines.push(`заработано всего: ${format(layer.total)} → доход ×${format(passiveBonus(layer.total))}`);
    lines.push(`переработок: ${layer.resets}${layer.bestSeconds !== null ? ` · лучший заход ${mmss(layer.bestSeconds)}` : ''}`);
    lines.push(`текущий заход: ${mmss(state.runSeconds)}`);
    this.stats.replaceChildren(...lines.map((l) => el('div', '', l)));

    const gain = recycleGain(state.runTrash);
    const ready = gain.gt(0);
    this.action.classList.toggle('ready', ready);
    this.button.disabled = !ready;
    if (!ready) {
      const p = progress(state.runTrash, RECYCLE_AT);
      this.actionTitle.textContent = layer.resets === 0 ? 'До первой переработки' : 'До переработки';
      this.actionBar.textContent = `${textBar(p, 16)} ${Math.floor(p * 100)}%`;
      this.actionNote.textContent = `${format(state.runTrash)} / ${format(RECYCLE_AT)} кг за заход`;
    } else {
      const next: Decimal = nextGainAt(state.runTrash);
      this.actionTitle.textContent = `Переработать сейчас: +${format(gain)} вторсырья`;
      this.actionBar.textContent = `${textBar(progress(state.runTrash, next), 16)} до +${format(gain.add(1))}`;
      this.actionNote.textContent = `следующая единица при ${format(next)} кг`;
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

  /** Whether the tab deserves a badge: recycling is ready or a node is affordable. */
  attention(state: GameState): boolean {
    return canRecycle(state) || NODES.some((n) => canBuyNode(state.recycle, n));
  }
}
