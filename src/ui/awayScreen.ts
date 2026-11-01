import { format } from '../game/num';
import { uniqueById } from '../game/sorting';
import type { AwayReport } from '../game/away';
import { el } from './dom';

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Finds named on the screen; the rest are counted. */
const FINDS_SHOWN = 3;

/** The terminal screen a player comes back to after a long absence. */
export class AwayScreen {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private rows: HTMLElement;
  private onClose: () => void = () => {};

  constructor() {
    this.root = el('div', 'intro away');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const box = el('div', 'intro-box');
    this.title = el('div', 'intro-title');
    this.rows = el('div', 'away-rows');
    const ok = el('button', 'btn intro-next', 'К работе');
    ok.type = 'button';
    ok.id = 'away-ok';
    ok.addEventListener('click', () => {
      this.root.hidden = true;
      this.onClose();
    });
    box.append(this.title, this.rows, ok);
    this.root.append(box);
  }

  /** `capped` is the offline limit when the absence ran past it. */
  show(r: AwayReport, capped: number | null, onClose: () => void): void {
    this.onClose = onClose;
    const h = Math.floor(r.seconds / 3600);
    const m = Math.floor((r.seconds % 3600) / 60);
    this.title.textContent = `> ВАС НЕ БЫЛО ${h > 0 ? `${h} Ч ` : ''}${m} МИН`;
    const row = (label: string, value: string, note = '', cls = '') => {
      const line = el('div', `away-row ${cls}`);
      line.append(el('span', 'away-label', label), el('span', 'away-value', value));
      if (note) line.append(el('span', 'away-note', note));
      return line;
    };
    const lines: HTMLElement[] = [row('собрано', `+${format(r.trash)} кг`, r.automation.purchases || r.automation.recycles || r.automation.resorts ? 'включая потраченное на покупки и сбросы' : 'офлайн-бонусы учтены')];
    if (r.automation.purchases > 0) lines.push(row('автопокупок', String(r.automation.purchases)));
    if (r.automation.recycles > 0) lines.push(row('переработок', String(r.automation.recycles)));
    if (r.automation.resorts > 0) lines.push(row('пересортировок', String(r.automation.resorts)));
    if (capped !== null) lines.push(row('копилось', `${Math.round(capped / 3600)} ч`, 'дольше не копится — дерево «Офлайн» продлит'));
    if (r.threatRose) {
      const pct = Math.round(r.threat * 100);
      lines.push(row('угроза', `${pct}%`, r.threat >= 0.7 ? 'поднялась — включите свет' : 'поднялась, пока никто не смотрел', r.threat >= 0.7 ? 'bad' : ''));
    }
    if (r.recordings > 0) lines.push(row('камера записала', `${r.recordings} ${plural(r.recordings, 'движение', 'движения', 'движений')}`, 'смотрите в журнале'));
    if (r.finds.length > 0) {
      const names = r.finds.slice(0, FINDS_SHOWN).map((id) => `«${uniqueById(id)!.name}»`).join(', ');
      const more = r.finds.length > FINDS_SHOWN ? ` и ещё ${r.finds.length - FINDS_SHOWN}` : '';
      lines.push(row('находки', String(r.finds.length), `${names}${more} — в журнале`));
    }
    if (r.bales > 0) lines.push(row('тюков с ленты', String(r.bales)));
    if (r.fractions.gt(0)) lines.push(row('получено фракций', `+${format(r.fractions.floor())} фракций`));
    this.rows.replaceChildren(...lines);
    this.root.hidden = false;
  }
}
