import type { Decimal } from '../game/num';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Text progress bar in the terminal's own style: [██████░░░░]. */
export function textBar(fraction: number, cells = 10): string {
  const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * cells);
  return `[${'█'.repeat(filled)}${'░'.repeat(cells - filled)}]`;
}

/** How far `have` is toward `need`, 0..1. */
export function progress(have: Decimal, need: Decimal): number {
  if (need.lte(0) || have.gte(need)) return 1;
  return have.div(need).toNumber();
}

/** Puts `wanted` into `parent` in order, touching the DOM only when something changed. */
export function syncChildren(parent: HTMLElement, wanted: HTMLElement[]): void {
  if (wanted.length !== parent.children.length || wanted.some((n, i) => parent.children[i] !== n)) {
    parent.replaceChildren(...wanted);
  }
}

