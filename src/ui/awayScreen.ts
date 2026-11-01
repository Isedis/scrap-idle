import { format } from '../game/num';
import { uniqueById } from '../game/sorting';
import type { AwayReport } from '../game/away';
import { el } from './dom';

/** A shift receipt: gross production, automated work and balances are kept distinct. */
export class AwayScreen {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private rows: HTMLElement;
  private button: HTMLButtonElement;
  private onClose: () => void = () => {};

  constructor() {
    this.root = el('div', 'intro away');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'away-title');
    const box = el('div', 'intro-box away-receipt');
    this.title = el('div', 'intro-title');
    this.title.id = 'away-title';
    this.rows = el('div', 'away-rows');
    this.button = el('button', 'btn intro-next', 'К работе');
    this.button.type = 'button';
    this.button.id = 'away-ok';
    this.button.addEventListener('click', () => { this.root.hidden = true; this.onClose(); });
    box.append(el('div', 'away-eyebrow', 'УТИЛЬ-ОС / ОТЧЁТ СМЕНЫ'), this.title, this.rows, this.button);
    this.root.append(box);
  }

  show(r: AwayReport, capped: number | null, onClose: () => void, goal = ''): void {
    this.onClose = onClose;
    const h = Math.floor(r.seconds / 3600), m = Math.floor((r.seconds % 3600) / 60);
    this.title.textContent = `> ВАС НЕ БЫЛО ${h ? `${h} Ч ` : ''}${m} МИН`;
    const row = (label: string, value: string, cls = '') => {
      const line = el('div', `away-row ${cls}`);
      line.append(el('span', 'away-label', label), el('span', 'away-value', value));
      return line;
    };
    const section = (title: string) => {
      const block = el('section', 'away-section'); block.append(el('h3', 'away-section-title', title)); return block;
    };
    const received = section('01 / ПОЛУЧЕНО');
    received.append(row('Произведено мусора', `+${format(r.trash)} кг`, 'away-primary'));
    if (r.automation.recycled.gt(0)) received.append(row('Вторсырья за переработки', `+${format(r.automation.recycled)} ВС`));
    if (r.fractions.gt(0)) received.append(row('Фракций', `+${format(r.fractions.floor())}`));
    if (r.finds.length) received.append(row('Уникальных находок', String(r.finds.length)));
    received.append(el('p', 'away-explain', 'Получено за отсутствие, включая потраченное автоматикой.'));

    const work = section('02 / СДЕЛАНО АВТОМАТИКОЙ');
    if (r.automation.purchases) {
      if (r.automation.producers) work.append(row('Куплено производителей', `+${r.automation.producers}`));
      if (r.automation.upgrades) work.append(row('Куплено улучшений', `+${r.automation.upgrades}`));
      work.append(row('Всего операций закупки', String(r.automation.purchases)));
    }
    if (r.automation.recycles) work.append(row('Переработок', String(r.automation.recycles)));
    if (r.automation.resorts) work.append(row('Пересортировок', String(r.automation.resorts)));
    if (!r.automation.purchases && !r.automation.recycles && !r.automation.resorts) work.append(el('p', 'away-explain', 'Автоматических покупок и сбросов не было.'));

    const now = section('03 / СЕЙЧАС');
    now.append(row('На руках', `${format(r.balance.trash)} кг`), row('Доход', `+${format(r.income)} кг/с`));
    const danger = r.hearing === 'idle' ? `Угроза ${Math.round(r.threat * 100)}%${r.threat >= 0.7 ? ' — включите свет' : ''}`
      : r.hearing === 'walk' ? 'Слух: идёт к будке' : r.hearing === 'check' ? 'Слух: у двери — шум на 0' : 'Слух: вас услышали';
    now.append(el('p', `away-condition ${r.threat >= 0.7 || r.hearing !== 'idle' ? 'bad' : ''}`, danger));
    if (goal && r.hearing === 'idle') now.append(el('p', 'away-goal', `Дальше: ${goal}`));

    const details = el('details', 'away-details');
    details.append(el('summary', '', 'Расходы, остатки и записи'));
    const body = el('div', 'away-detail-body');
    body.append(row('Мусор на автопокупки', `${format(r.automation.spentTrash)} кг`),
      row('Вторсырьё на автопокупки', `${format(r.automation.spentRecycled)} ВС`),
      row('Фракции на автопокупки', format(r.automation.spentFractions)),
      row('Вторсырьё на руках', `${format(r.balance.recycled)} ВС`), row('Фракции на руках', format(r.balance.fractions.floor())));
    body.append(el('p', 'away-explain', 'Остатки включают запасы до ухода. При перерождениях ресурсы сбрасывались по правилам слоя.'));
    if (r.recordings) body.append(row('Записей камеры', String(r.recordings)));
    if (r.bales) body.append(row('Тюков со стола осмотра', String(r.bales)));
    if (r.finds.length) body.append(el('p', 'away-explain', r.finds.slice(0, 3).map(id => `«${uniqueById(id)?.name ?? id}»`).join(', ') + (r.finds.length > 3 ? ` и ещё ${r.finds.length - 3}.` : '.') + ' Подробности — в журнале.'));
    details.append(body);
    const lines: HTMLElement[] = [received, work, now, details];
    if (capped !== null) lines.unshift(el('p', 'away-limit', `Учтено ${Math.round(capped / 3600)} ч — достигнут офлайн-лимит.`));
    this.rows.replaceChildren(...lines);
    this.rows.parentElement!.scrollTop = 0;
    this.root.hidden = false;
    this.button.focus({ preventScroll: true });
  }
}
