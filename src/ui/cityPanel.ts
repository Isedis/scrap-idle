import { ResetPreview } from './resetPreview';
import {
  DISTRICTS,
  CITY_OPEN_SORTS,
  REFORM_SORTS,
  STREETS,
  TOWN_PEOPLE,
  TYPE_NAMES,
  TYPE_TEXT,
  annex,
  annexCost,
  canAnnex,
  cityEffects,
  districtById,
  peopleLeft,
  pitReady,
  streetsOwned,
  visible,
  strength,
  cityArchive,
} from '../game/city';
import { format } from '../game/num';
import { canReform, reformGainOf, type GameState } from '../game/state';
import { el, textBar } from './dom';
import { TownCam } from './townCam';
import { TownPlan } from './townPlan';

/**
 * The Town view on the Layers tab: camera 08 over Glukhovo, the plan where districts are
 * picked and annexed, what the town gives, the letters it writes as it goes, and the
 * reform that burns nearly everything for hectares.
 */
export class CityPanel {
  private preview = new ResetPreview();
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
  private archiveLink!: HTMLButtonElement;
  private reformSummary!: HTMLElement;
  private neighbours!: HTMLElement;
  private cameraDetails!: HTMLDetailsElement;
  private reformText!: HTMLElement;
  private reformButton!: HTMLButtonElement;
  private armed = 0;
  private descent!: HTMLElement;
  private descentButton!: HTMLButtonElement;
  private descendArmed = 0;
  private locked!: HTMLElement;
  private lockedText!: HTMLElement;
  private lockedBar!: HTMLElement;
  private openPart!: HTMLElement;

  constructor(
    private getState: () => GameState,
    private onAnnex: (id: string) => void,
    private onReform: () => void,
    private onDescend: () => void,
    private onArchive: () => void,
  ) {
    this.root = el('section', 'panel city');
    this.plan = new TownPlan(() => {
      this.render(this.getState());
      this.card.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
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
    this.neighbours = el('div', 'c-neighbours');
    this.card.append(this.cardTitle, this.cardText, this.neighbours, this.cardButton);
    this.effects = el('div', 'c-effects');

    this.archiveLink = el('button', 'btn c-archive-link');
    this.archiveLink.type = 'button';
    this.archiveLink.id = 'city-archive';
    this.archiveLink.addEventListener('click', this.onArchive);

    const reformDetails = el('details', 'c-reform-details');
    this.reformSummary = el('summary', 'c-reform-summary');
    reformDetails.append(this.reformSummary);
    const reform = el('div', 'c-reform');
    this.reformText = el('div', 'c-card-text');
    this.reformButton = el('button', 'btn c-reform-go', 'Провести реформу');
    this.reformButton.type = 'button';
    this.reformButton.id = 'reform';
    this.reformButton.addEventListener('click', () => this.pressReform());
    reform.append(
      this.reformText,
      el('div', 'c-keeps classic-reset', 'Сгорает: мусор, производители, улучшения, переработка и дерево, сортировка и линия, автоматика.'),
      el('div', 'c-keeps classic-reset', 'Остаются: город, достижения, находки со стола, журнал.'),
      this.preview.root,
      this.reformButton,
    );

    // Before the town opens: the plan behind glass, and how far there is to go.
    this.locked = el('div', 'c-locked');
    this.lockedText = el('div', 'c-card-text');
    this.lockedBar = el('div', 'c-locked-bar');
    this.locked.append(el('div', 'c-card-title', 'Город закрыт'), this.lockedText, this.lockedBar);
    this.openPart = el('div', 'c-open');
    // Once the pit is the landfill's: the way down.
    this.descent = el('div', 'c-reform c-descent');
    this.descentButton = el('button', 'btn c-reform-go', 'Спуститься');
    this.descentButton.type = 'button';
    this.descentButton.id = 'descend';
    this.descentButton.addEventListener('click', () => this.pressDescend());
    this.descent.append(
      el('div', 'c-card-title', 'Под ямой'),
      el('div', 'c-card-text', 'Внизу ещё одна свалка, и на ней кто-то копает. Спуск сбрасывает всё наверху, город тоже: останутся находки со стола, достижения и журнал.'),
      this.descentButton,
    );
    this.descent.hidden = true;
    reformDetails.append(reform);
    const effectDetails = el('details', 'c-effect-details');
    effectDetails.append(el('summary', '', 'Все бонусы города'), this.effects);
    this.cameraDetails = el('details', 'c-camera-details');
    this.cameraDetails.append(el('summary', '', 'КАМ-08 · посмотреть город'), this.camera.root);
    this.openPart.append(this.card, this.descent, reformDetails, effectDetails, this.archiveLink, this.cameraDetails);
    this.root.append(
      head,
      el('p', 'c-plan-hint', 'Выберите квартал на границе свалки'),
      this.locked,
      this.people,
      this.plan.root,
      this.openPart,
    );
  }

  private pressDescend(): void {
    if (!this.descendArmed) {
      this.descentButton.textContent = 'Нажмите ещё раз: спуститься';
      this.descentButton.classList.add('armed');
      this.descendArmed = window.setTimeout(() => {
        this.descendArmed = 0;
        this.descentButton.textContent = 'Спуститься';
        this.descentButton.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(this.descendArmed);
    this.descendArmed = 0;
    this.descentButton.textContent = 'Спуститься';
    this.descentButton.classList.remove('armed');
    this.onDescend();
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
    this.preview.render(state, 'city');
    const city = state.city;
    this.locked.hidden = city.open;
    this.openPart.hidden = !city.open;
    this.plan.root.classList.toggle('closed', !city.open);
    if (!city.open) {
      const n = state.sorting.sorts;
      this.lockedText.textContent = `Горсовет покажет город после ${CITY_OPEN_SORTS} пересортировок. Сейчас: ${n} из ${CITY_OPEN_SORTS}.`;
      this.lockedBar.textContent = textBar(n / CITY_OPEN_SORTS, 18);
    }
    this.meta.textContent = `${format(city.points)} га`;
    this.people.textContent = `Под свалкой ${streetsOwned(city)}/${STREETS} кварталов · жителей ${peopleLeft(city).toLocaleString('ru-RU')}`;

    // The picked district.
    const d = districtById(this.plan.selected)!;
    const owned = city.owned.includes(d.id);
    const cluster = d.type !== 'dump' && d.type !== 'pit' && d.type !== 'school' ? strength(city, d.id) : 1;
    const seen = visible(city, d.id) || d.type === 'pit';
    const cost = annexCost(city, d.id);
    this.neighbours.hidden = !seen || cluster <= 1;
    this.neighbours.textContent = `${owned ? 'Сила квартала' : 'Сила после присоединения'} ×${cluster.toFixed(2)} · соседи своего типа`;
    this.cardButton.hidden = owned;
    this.cardButton.disabled = !canAnnex(city, d.id);
    if (!seen) {
      // Fog: nobody from the landfill has been there; what it is stays unknown.
      this.cardTitle.textContent = '? · в тумане';
      this.cardText.textContent = 'Отсюда не видно, что там. Присоедините соседний квартал — туман отступит.';
      this.card.dataset.state = 'far';
      this.cardButton.textContent = 'В тумане';
    } else {
      this.cardTitle.textContent = `${d.name} · ${TYPE_NAMES[d.type]}`;
      this.cardText.textContent = `${TYPE_TEXT[d.type]}${d.people ? ` · жителей ${d.people}` : ''}`;
      this.card.dataset.state = owned ? 'owned' : visible(city, d.id) ? 'next' : 'far';
      if (d.type === 'pit' && !pitReady(city)) this.cardButton.textContent = `Нужен весь город · ${streetsOwned(city)}/${STREETS}`;
      else this.cardButton.textContent = visible(city, d.id) ? `Присоединить · ${format(cost)} га` : 'Не граничит со свалкой';
      if (owned) this.cardText.textContent += d.type === 'dump' ? '' : d.type === 'pit' ? ' · спуск на дно ямы открыт' : ' · уже под свалкой';
    }

    const fx = cityEffects(city);
    const parts = [
      `доход ×${format(fx.income)}`,
      `вторсырьё ×${format(fx.recycled)}`,
      `фракции ×${format(fx.fractions)}`,
      fx.schools ? `скрипты сразу: ${Math.min(fx.schools * 2, 5)}` : '',
      fx.silencerFail < 1 ? `глушитель: отказ ${Math.round(fx.silencerFail * 100)}%` : '',
      fx.hearingFill < 1 ? `слух копится ×${fx.hearingFill.toFixed(2)}` : '',
      fx.threatSpeed < 1 ? `угроза растёт ×${fx.threatSpeed.toFixed(2)}` : '',
      fx.offline > 1 ? `офлайн ×${fx.offline.toFixed(2)}` : '',
      fx.hectares > 1 ? `гектары с реформы ×${fx.hectares.toFixed(2)}` : '',
      fx.annexDiscount < 1 ? `кварталы ×${fx.annexDiscount.toFixed(2)}` : '',
      fx.darkPeak ? `тьма +${fx.darkPeak.toFixed(1)}` : '',
      fx.keepFractions ? `фракций переживает реформу: ${Math.round(fx.keepFractions * 100)}%` : '',
      fx.startPoints.gt(0) ? `старт: ${format(fx.startPoints)} ВС` : '',
    ].filter(Boolean);
    this.effects.textContent = `Город даёт: ${parts.join(' · ')}`;

    const gain = reformGainOf(state);
    const ready = canReform(state);
    this.reformText.textContent = ready
      ? `За этот цикл: +${format(gain)} га.`
      : `Нужно ${REFORM_SORTS} пересортировок, сейчас ${state.sorting.sorts}.`;
    this.reformSummary.textContent = ready ? `Реформа: +${format(gain)} га · условия` : `До реформы: ${state.sorting.sorts}/${REFORM_SORTS} пересортировок`;
    this.reformSummary.classList.toggle('ready', ready);
    const archive = cityArchive(city, state.story);
    this.archiveLink.textContent = `Письма Глухово → архив (${archive.letters.length})`;
    this.reformButton.disabled = !ready;
    this.descent.hidden = !city.owned.includes('pit');

  }

  /** Every frame while the view is on screen: the camera and the plan. */
  frame(dt: number, state: GameState): void {
    const city = state.city;
    if (this.cameraDetails.open) this.camera.update(dt, { owned: city.owned, selected: this.plan.selected, people: peopleLeft(city) / TOWN_PEOPLE });
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
