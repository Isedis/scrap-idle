import {
  ARCHIVE_PAGES,
  DISTRICTS,
  LETTERS,
  REFORM_SORTS,
  TYPE_NAMES,
  TYPE_TEXT,
  annex,
  annexCost,
  bordersLandfill,
  canAnnex,
  cityEffects,
  districtById,
  peopleLeft,
  strength,
} from '../game/city';
import { format } from '../game/num';
import { canReform, reformGainOf, type GameState } from '../game/state';
import { el } from './dom';
import { TownCam } from './townCam';
import { TownPlan } from './townPlan';

/** Letters shown before "show all". */
const LETTERS_SHOWN = 3;

/**
 * The Town view on the Layers tab: camera 08 over Glukhovo, the plan where districts are
 * picked and annexed, what the town gives, the letters it writes as it goes, and the
 * reform that burns nearly everything for hectares.
 */
export class CityPanel {
  readonly root: HTMLElement;
  readonly camera = new TownCam();
  private plan: TownPlan;
  private meta!: HTMLElement;
  private people!: HTMLElement;
  private cardTitle!: HTMLElement;
  private cardText!: HTMLElement;
  private cardButton!: HTMLButtonElement;
  private card!: HTMLElement;
  private effects!: HTMLElement;
  private letters!: HTMLElement;
  private moreLetters!: HTMLButtonElement;
  private allLetters = false;
  private reformText!: HTMLElement;
  private reformButton!: HTMLButtonElement;
  private armed = 0;
  private shown = '';

  constructor(
    private getState: () => GameState,
    private onAnnex: (id: string) => void,
    private onReform: () => void,
  ) {
    this.root = el('section', 'panel city');
    this.plan = new TownPlan(() => this.render(this.getState()));
    this.build();
  }

  private build(): void {
    const head = el('div', 'panel-head');
    this.meta = el('span', 'panel-meta');
    head.append(el('h2', 'panel-title', 'Глухово'), this.meta);
    this.people = el('div', 'c-people');
    this.card = el('div', 'c-card');
    this.cardTitle = el('div', 'c-card-title');
    this.cardText = el('div', 'c-card-text');
    this.cardButton = el('button', 'btn c-annex');
    this.cardButton.type = 'button';
    this.cardButton.addEventListener('click', () => {
      const id = this.plan.selected;
      if (annex(this.getState().city, id)) this.onAnnex(id);
    });
    this.card.append(this.cardTitle, this.cardText, this.cardButton);
    this.effects = el('div', 'c-effects');

    const lettersHead = el('div', 'panel-head');
    lettersHead.append(el('h2', 'panel-title', 'Письма в горсовет'));
    this.letters = el('div', 'j-list');
    this.moreLetters = el('button', 'btn j-more');
    this.moreLetters.type = 'button';
    this.moreLetters.addEventListener('click', () => {
      this.allLetters = !this.allLetters;
      this.shown = '';
      this.render(this.getState());
    });

    const reformHead = el('div', 'panel-head');
    reformHead.append(el('h2', 'panel-title', 'Реформа'));
    const reform = el('div', 'c-reform');
    this.reformText = el('div', 'c-card-text');
    this.reformButton = el('button', 'btn c-reform-go', 'Провести реформу');
    this.reformButton.type = 'button';
    this.reformButton.id = 'reform';
    this.reformButton.addEventListener('click', () => this.pressReform());
    reform.append(
      this.reformText,
      el('div', 'c-keeps', 'Сгорает: мусор, производители, улучшения, переработка и дерево, сортировка и линия, автоматика.'),
      el('div', 'c-keeps', 'Остаются: город, достижения, находки со стола, журнал.'),
      this.reformButton,
    );

    this.root.append(
      this.camera.root,
      head,
      el('p', 's-why', 'Город отдаёт кварталы под полигон. Присоединять можно только те, что граничат со свалкой; каждый следующий дороже. Квартал сильнее рядом со своими.'),
      this.people,
      this.plan.root,
      this.card,
      this.effects,
      lettersHead,
      this.letters,
      this.moreLetters,
      reformHead,
      reform,
    );
  }

  private pressReform(): void {
    if (!canReform(this.getState())) return;
    if (!this.armed) {
      this.reformButton.textContent = 'Нажмите ещё раз: город заберёт всё';
      this.reformButton.classList.add('armed');
      this.armed = window.setTimeout(() => this.disarm(), 3000);
      return;
    }
    this.disarm();
    this.onReform();
  }

  private disarm(): void {
    clearTimeout(this.armed);
    this.armed = 0;
    this.reformButton.textContent = 'Провести реформу';
    this.reformButton.classList.remove('armed');
  }

  render(state: GameState): void {
    const city = state.city;
    this.meta.textContent = `кварталов ${city.owned.length - 1}/${DISTRICTS.length - 1} · ${format(city.points)} га`;
    this.people.textContent = `жителей: ${peopleLeft(city).toLocaleString('ru-RU')}`;

    // The picked district.
    const d = districtById(this.plan.selected)!;
    const owned = city.owned.includes(d.id);
    const cluster = owned && d.type !== 'dump' && d.type !== 'pit' ? strength(city, d.id) : 1;
    this.cardTitle.textContent = `${d.name} · ${TYPE_NAMES[d.type]}`;
    this.cardText.textContent = `${TYPE_TEXT[d.type]}${cluster > 1 ? ` · соседи своего типа: сила ×${cluster.toFixed(2)}` : ''}${d.people ? ` · жителей ${d.people}` : ''}`;
    this.card.dataset.state = owned ? 'owned' : bordersLandfill(city, d.id) ? 'next' : 'far';
    const cost = annexCost(city, d.id);
    this.cardButton.hidden = owned;
    this.cardButton.disabled = !canAnnex(city, d.id);
    this.cardButton.textContent = bordersLandfill(city, d.id) ? `Присоединить · ${format(cost)} га` : 'Не граничит со свалкой';
    if (owned) this.cardText.textContent += d.type === 'dump' ? '' : ' · уже под свалкой';

    const fx = cityEffects(city);
    const parts = [
      `доход ×${format(fx.income)}`,
      `вторсырьё ×${format(fx.recycled)}`,
      `фракции ×${format(fx.fractions)}`,
      fx.schools ? `скрипты сразу: ${Math.min(fx.schools * 2, 5)}` : '',
      fx.silencerFail < 1 ? `глушитель: отказ ${Math.round(fx.silencerFail * 100)}%` : '',
      fx.church ? 'автопрожектор сразу' : '',
      fx.darkPeak ? `тьма +${fx.darkPeak.toFixed(1)}` : '',
      fx.keepFractions ? `фракций переживает реформу: ${Math.round(fx.keepFractions * 100)}%` : '',
      fx.startPoints.gt(0) ? `старт: ${format(fx.startPoints)} ВС` : '',
    ].filter(Boolean);
    this.effects.textContent = `Город даёт: ${parts.join(' · ')}`;

    const gain = reformGainOf(state);
    const ready = canReform(state);
    this.reformText.textContent = ready
      ? `За этот цикл: +${format(gain)} га.`
      : `Нужно ${REFORM_SORTS} пересортировок за цикл, сейчас ${state.sorting.sorts}.`;
    this.reformButton.disabled = !ready;

    // Letters and the archive change only when a district is taken.
    const sig = JSON.stringify([city.owned.length, city.owned.includes('archive'), this.allLetters]);
    if (sig === this.shown) return;
    this.shown = sig;
    const got = LETTERS.slice(0, Math.max(0, city.owned.length - 1)).reverse();
    const pages = city.owned.includes('archive') ? ARCHIVE_PAGES.map((p) => el('div', 'j-note', p)) : [];
    const shownLetters = this.allLetters ? got : got.slice(0, LETTERS_SHOWN);
    this.letters.replaceChildren(
      ...(got.length === 0 ? [el('p', 'empty', 'Пока город молчит.')] : shownLetters.map((l) => el('div', 'c-letter', l))),
      ...pages,
    );
    this.moreLetters.hidden = got.length <= LETTERS_SHOWN;
    this.moreLetters.textContent = this.allLetters ? 'Свернуть' : `Все письма (${got.length})`;
  }

  /** Every frame while the view is on screen: the camera and the plan. */
  frame(dt: number, state: GameState): void {
    const city = state.city;
    this.camera.update(dt, { taken: (city.owned.length - 1) / (DISTRICTS.length - 1), pit: city.owned.includes('pit') });
    this.plan.draw(dt, city);
  }

  /** The tab's badge: a district can be annexed or a reform is ready. */
  attention(state: GameState): string[] {
    const city = state.city;
    if (!city.open) return [];
    const can = DISTRICTS.filter((d) => canAnnex(city, d.id)).map((d) => `annex:${d.id}`);
    return [...(canReform(state) ? ['reform'] : []), ...can];
  }
}
