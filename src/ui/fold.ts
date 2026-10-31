import { el } from './dom';

/**
 * A branch of upgrades that folds to its title and how much of it is bought. A branch
 * bought out folds on its own; a tap opens or folds it, and that choice is kept on the
 * device and wins over the default.
 */

const FOLD_KEY = 'scrap-idle-folds';

function readFolds(): Record<string, boolean> {
  try {
    const data = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeFolds(folds: Record<string, boolean>): void {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(folds));
  } catch {
    // Without storage a branch simply opens again next time.
  }
}

export class Fold {
  readonly head: HTMLButtonElement;
  private meta: HTMLElement;
  private done = 0;
  private total = 0;

  constructor(
    private group: HTMLElement,
    title: string,
    private key: string,
  ) {
    this.head = el('button', 'r-branch-title r-fold');
    this.head.type = 'button';
    this.meta = el('span', 'r-fold-meta');
    this.head.append(el('span', '', title), this.meta);
    this.head.addEventListener('click', () => {
      const folds = readFolds();
      folds[this.key] = !this.folded(folds);
      writeFolds(folds);
      this.apply();
    });
  }

  private folded(folds = readFolds()): boolean {
    return folds[this.key] ?? (this.total > 0 && this.done >= this.total);
  }

  /** How much of the branch is bought; folds a finished branch unless the player opened it. */
  update(done: number, total: number): void {
    if (done === this.done && total === this.total) return;
    this.done = done;
    this.total = total;
    this.apply();
  }

  private apply(): void {
    const folded = this.folded();
    this.group.classList.toggle('folded', folded);
    this.head.setAttribute('aria-expanded', String(!folded));
    this.meta.textContent = `${this.done}/${this.total} ${folded ? '▸' : '▾'}`;
  }
}
