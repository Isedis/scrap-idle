import { CASES, CASE_BONUS, NOTES, PHRASES, PLANT_KINDS, eventById, unwatched, type EventDef, type Recording } from '../game/story';
import type { GameState } from '../game/state';
import { ACHIEVEMENTS, achievementMult } from '../game/achievements';
import { UNIQUES, describeUnique, uniqueById } from '../game/sorting';
import { HEARD } from '../game/hearing';
import { STAGES } from '../game/threat';
import { producerById } from '../game/producers';
import { el } from './dom';
import { JournalMonitor } from './journalMonitor';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const caseNo = (n: number) => `#${String(n).padStart(3, '0')}`;
/** Watched recordings shown under the new ones before "show all". */
const WATCHED_SHOWN = 5;

type View = 'records' | 'cases' | 'clues' | 'ach';
const VIEWS: [View, string][] = [
  ['records', 'Записи'],
  ['cases', 'Дела'],
  ['clues', 'Улики'],
  ['ach', 'Достижения'],
];

/** The story in chapters: which camera tells it and what opens it. */
const CHAPTERS: { title: string; cam: string; plant: boolean }[] = [
  { title: 'Глава 1 · Кто-то есть на свалке', cam: 'КАМ-01', plant: false },
  { title: 'Глава 2 · Тот, кто слушает', cam: 'КАМ-03', plant: true },
];

const camOf = (e: EventDef) => (PLANT_KINDS.includes(e.kind) ? 'КАМ-03' : e.kind === 'typing' || e.kind === 'voice' ? 'ТЕРМИНАЛ' : 'КАМ-01');

/**
 * The Journal tab: a review desk on top, then four parts. Recordings to watch, the cases
 * they open by chapter, the clues gathered (notes, camera 00, the silence, finds), and
 * achievements. Each part marks what is new since it was last looked at.
 */
export class JournalPanel {
  readonly root: HTMLElement;
  readonly monitor = new JournalMonitor();
  private view: View = 'records';
  private buttons = new Map<View, HTMLButtonElement>();
  private marks = new Map<View, HTMLElement>();
  private views = new Map<View, HTMLElement>();
  private recordsMeta!: HTMLElement;
  private playAll!: HTMLButtonElement;
  private records!: HTMLElement;
  private moreRecords!: HTMLButtonElement;
  private allRecords = false;
  private casesMeta!: HTMLElement;
  private cases!: HTMLElement;
  private clues!: HTMLElement;
  private achMeta!: HTMLElement;
  private achievements!: HTMLElement;
  /** Open case cards. */
  private openCases = new Set<string>();
  private openFinds = new Set<string>();
  /** What each part held when last looked at, so the rest counts as new. */
  private seen: Record<Exclude<View, 'records'>, number> | null = null;
  /** Playing every new recording in a row. */
  private queue = false;
  /** Signature of what is on screen, so lists rebuild only when something changed. */
  private shown = '';
  private lastState: GameState | null = null;

  constructor(private onWatch: (rec: Recording) => void) {
    this.root = el('section', 'panel journal');
    this.build();
  }

  private build(): void {
    const tabs = el('div', 'modes s-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Раздел журнала');
    for (const [view, label] of VIEWS) {
      const b = el('button', 'mode', label);
      b.type = 'button';
      b.id = `journal-${view}`;
      const mark = el('span', 'j-tab-mark');
      mark.hidden = true;
      b.append(mark);
      b.addEventListener('click', () => {
        this.view = view;
        this.shown = '';
        this.render(this.lastState!);
      });
      this.buttons.set(view, b);
      this.marks.set(view, mark);
      tabs.append(b);
    }
    this.root.append(this.monitor.root, tabs);

    // Recordings.
    const records = el('div', 'j-view');
    const head = el('div', 'panel-head');
    this.recordsMeta = el('span', 'panel-meta');
    head.append(el('h2', 'panel-title', 'Архив камер'), this.recordsMeta);
    this.playAll = el('button', 'btn j-play-all');
    this.playAll.type = 'button';
    this.playAll.addEventListener('click', () => {
      this.queue = true;
      this.next();
    });
    this.records = el('div', 'j-list');
    this.moreRecords = el('button', 'btn j-more');
    this.moreRecords.type = 'button';
    this.moreRecords.addEventListener('click', () => {
      this.allRecords = !this.allRecords;
      this.shown = '';
      this.render(this.lastState!);
    });
    records.append(head, this.playAll, this.records, this.moreRecords);
    this.views.set('records', records);

    // Cases.
    const cases = el('div', 'j-view');
    const casesHead = el('div', 'panel-head');
    this.casesMeta = el('span', 'panel-meta');
    casesHead.append(el('h2', 'panel-title', 'Дела'), this.casesMeta);
    this.cases = el('div', 'j-chapters');
    cases.append(casesHead, el('p', 's-why', 'Дело открывается, когда смотришь запись, где оно случилось. Каждое открытое дело — +3% к доходу навсегда.'), this.cases);
    this.views.set('cases', cases);

    // Clues.
    this.clues = el('div', 'j-view');
    this.views.set('clues', this.clues);

    // Achievements.
    const ach = el('div', 'j-view');
    const achHead = el('div', 'panel-head');
    this.achMeta = el('span', 'panel-meta');
    achHead.append(el('h2', 'panel-title', 'Достижения'), this.achMeta);
    this.achievements = el('div', 'j-ach');
    ach.append(achHead, this.achievements);
    this.views.set('ach', ach);

    this.root.append(...this.views.values());
  }

  /** How much each part holds, to tell what is new. */
  private counts(state: GameState): Record<Exclude<View, 'records'>, number> {
    const story = state.story;
    return {
      cases: story.cases.length,
      clues: story.notes + story.voices.length + Math.min(state.hearing.survived, HEARD.length) + state.sorting.found.length,
      ach: state.achievements.length,
    };
  }

  render(state: GameState): void {
    this.lastState = state;
    const story = state.story;
    const counts = this.counts(state);
    // Whatever was there when the journal was first opened counts as seen.
    this.seen ??= { ...counts };
    if (this.view !== 'records') this.seen[this.view] = counts[this.view];
    const fresh = unwatched(story);
    for (const [view, mark] of this.marks) {
      const n = view === 'records' ? fresh : counts[view] - this.seen[view];
      mark.hidden = n <= 0;
      mark.textContent = String(n);
    }
    for (const [view, b] of this.buttons) b.setAttribute('aria-pressed', String(view === this.view));
    for (const [view, part] of this.views) part.hidden = view !== this.view;

    const sig = JSON.stringify([
      this.view,
      story.records.map((r) => [r.seq, r.watched]),
      story.cases,
      story.notes,
      story.voices.length,
      state.achievements.length,
      state.sorting.found.length,
      state.sorting.open,
      state.hearing.survived,
      this.allRecords,
      this.monitor.busy,
      [...this.openCases],
      [...this.openFinds],
    ]);
    if (sig === this.shown) return;
    this.shown = sig;
    if (this.view === 'records') this.renderRecords(state);
    else if (this.view === 'cases') this.renderCases(state);
    else if (this.view === 'clues') this.renderClues(state);
    else this.renderAch(state);
  }

  // ---- Recordings ----------------------------------------------------------------------

  private renderRecords(state: GameState): void {
    const records = state.story.records;
    const fresh = records.filter((r) => !r.watched);
    const watched = records.filter((r) => r.watched);
    this.recordsMeta.textContent = `${records.length} записей · новых ${fresh.length}`;
    this.playAll.hidden = fresh.length < 2;
    this.playAll.disabled = this.monitor.busy;
    this.playAll.textContent = `▶ Смотреть все новые (${fresh.length})`;
    const shown = this.allRecords ? watched : watched.slice(0, WATCHED_SHOWN);
    this.records.replaceChildren(
      ...(records.length === 0 ? [el('p', 'empty', 'Записей нет. Камеры пишут всё, что движется.')] : []),
      ...fresh.map((r) => this.recordRow(r)),
      ...(fresh.length && shown.length ? [el('div', 'j-sub', 'Просмотренные')] : []),
      ...shown.map((r) => this.recordRow(r)),
    );
    this.moreRecords.hidden = watched.length <= WATCHED_SHOWN;
    this.moreRecords.textContent = this.allRecords ? 'Свернуть' : `Показать все просмотренные (${watched.length})`;
  }

  private recordRow(r: Recording): HTMLElement {
    const event = eventById(r.event)!;
    const row = el('button', `j-rec${r.watched ? '' : ' new'}`);
    row.type = 'button';
    row.disabled = this.monitor.busy;
    const when = `${clock(r.at)} · ${camOf(event)}${r.away ? ' · без вас' : ''}`;
    const what = r.watched ? `${event.title}${event.caseNo !== undefined ? ` · дело ${caseNo(event.caseNo)}` : ''}` : 'Зафиксировано движение';
    const body = el('span', 'j-rec-body');
    body.append(el('span', 'j-rec-when', when), el('span', 'j-rec-what', what));
    row.append(body, el('span', 'j-rec-play', '▶'));
    row.addEventListener('click', () => {
      this.queue = false;
      this.onWatch(r);
    });
    return row;
  }

  /** A recording finished: with "watch all new", the next one starts. */
  watched(): void {
    if (this.queue) window.setTimeout(() => this.next(), 600);
    this.shown = '';
  }

  private next(): void {
    const state = this.lastState;
    if (!state || this.monitor.busy) return;
    // Oldest first, as it happened.
    const rec = [...state.story.records].reverse().find((r) => !r.watched);
    if (!rec) {
      this.queue = false;
      return;
    }
    this.onWatch(rec);
  }

  // ---- Cases ---------------------------------------------------------------------------

  private renderCases(state: GameState): void {
    const story = state.story;
    this.casesMeta.textContent = `${story.cases.length}/${CASES.length} · доход ×${(1 + CASE_BONUS * story.cases.length).toFixed(2)}`;
    this.cases.replaceChildren(
      ...CHAPTERS.map((ch) => {
        const box = el('div', 'j-chapter');
        const list = CASES.filter((c) => !!c.plant === ch.plant);
        const open = list.filter((c) => story.cases.includes(c.id)).length;
        const locked = ch.plant && !state.sorting.open;
        const head = el('div', 'j-chapter-head');
        head.append(el('span', 'j-chapter-title', locked ? `${ch.title.split(' · ')[0]} · ???` : ch.title), el('span', 'panel-meta', locked ? 'откроется с сортировкой' : `${open}/${list.length} · ${ch.cam}`));
        box.append(head);
        if (!locked) box.append(...list.map((c) => this.caseRow(c, state)));
        return box;
      }),
    );
  }

  private caseRow(c: EventDef, state: GameState): HTMLElement {
    const open = state.story.cases.includes(c.id);
    if (!open) {
      // Where and when to expect it.
      const need = c.needs ? `, когда есть ${producerById(c.needs)?.name ?? c.needs}` : '';
      const row = el('div', 'j-case locked');
      const where = camOf(c) === 'ТЕРМИНАЛ' ? 'в терминале' : `на ${camOf(c)}`;
      row.append(el('div', 'j-case-title', `${caseNo(c.caseNo!)} · ???`), el('div', 'j-case-hint', `ждать ${where} · угроза «${STAGES[c.stage].name}»${need}`));
      return row;
    }
    const expanded = this.openCases.has(c.id);
    const row = el('div', `j-case${expanded ? ' open' : ''}`);
    const title = el('button', 'j-case-toggle');
    title.type = 'button';
    title.setAttribute('aria-expanded', String(expanded));
    title.append(el('span', 'j-case-title', `${caseNo(c.caseNo!)} · ${c.title}`), el('span', 'j-chev', expanded ? '▾' : '▸'));
    title.addEventListener('click', () => {
      if (expanded) this.openCases.delete(c.id);
      else this.openCases.add(c.id);
      this.render(this.lastState!);
    });
    row.append(title);
    if (expanded) {
      row.append(el('div', 'j-text', c.text!));
      // The recording, if it is still in the archive.
      const rec = state.story.records.find((r) => r.event === c.id);
      if (rec) {
        const again = el('button', 'btn j-again', '▶ Пересмотреть запись');
        again.type = 'button';
        again.disabled = this.monitor.busy;
        again.addEventListener('click', () => this.onWatch(rec));
        row.append(again);
      }
    }
    return row;
  }

  // ---- Clues ---------------------------------------------------------------------------

  private renderClues(state: GameState): void {
    const story = state.story;
    const part = (title: string, meta: string, ...body: HTMLElement[]) => {
      const head = el('div', 'panel-head');
      head.append(el('h2', 'panel-title', title), el('span', 'panel-meta', meta));
      const box = el('div', 'j-clue');
      box.append(head, ...body);
      return box;
    };
    const out: HTMLElement[] = [];
    out.push(
      part(
        'Записки смотрителя',
        `${story.notes}/${NOTES.length}`,
        ...(story.notes === 0
          ? [el('p', 'empty', 'Пока ни одной. Ветер иногда поднимает бумагу с кучи: смотрите такие записи.')]
          : NOTES.slice(0, story.notes).map((n) => el('div', 'j-note', n))),
      ),
    );
    out.push(
      part(
        'КАМ-00 · что сказала яма',
        `${story.voices.length}/${PHRASES.length}`,
        ...(story.voices.length === 0
          ? [el('p', 'empty', 'Пока молчит. Терминал иногда печатает сам.')]
          : story.voices.map((v) => el('div', 'j-voice', v))),
      ),
    );
    const heard = Math.min(state.hearing.survived, HEARD.length);
    if (state.sorting.open) {
      out.push(
        part(
          'Тишина · что слышно у двери',
          `${heard}/${HEARD.length}`,
          ...(heard === 0
            ? [el('p', 'empty', 'Ничего. Переживите его поход, и в тишине что-нибудь будет слышно.')]
            : HEARD.slice(0, heard).map((line) => el('div', 'j-heard', line))),
        ),
      );
    }
    const found = state.sorting.found;
    if (state.sorting.open || found.length > 0) {
      out.push(
        part(
          'Находки со стола осмотра',
          `${found.length}/${UNIQUES.length}`,
          ...(found.length === 0
            ? [el('p', 'empty', 'Стол осмотра пока ничего не опознал.')]
            : found.map((id) => this.findRow(id))),
        ),
      );
    }
    this.clues.replaceChildren(...out);
  }

  private findRow(id: string): HTMLElement {
    const u = uniqueById(id)!;
    const open = this.openFinds.has(id);
    const row = el('div', `j-case${open ? ' open' : ''}`);
    const title = el('button', 'j-case-toggle');
    title.type = 'button';
    title.setAttribute('aria-expanded', String(open));
    const name = el('span', 'j-find-name');
    name.append(el('span', 'j-case-title', u.name), el('span', 'j-find-effect', describeUnique(u)));
    title.append(name, el('span', 'j-chev', open ? '▾' : '▸'));
    title.addEventListener('click', () => {
      if (open) this.openFinds.delete(id);
      else this.openFinds.add(id);
      this.render(this.lastState!);
    });
    row.append(title);
    if (open) row.append(el('div', 'j-text', u.text));
    return row;
  }

  // ---- Achievements --------------------------------------------------------------------

  private renderAch(state: GameState): void {
    const earned = state.achievements;
    this.achMeta.textContent = `${earned.length}/${ACHIEVEMENTS.length} · доход ×${achievementMult(earned).toFixed(2)}`;
    // Earned first, then the rest dim with what they take.
    const list = [...ACHIEVEMENTS.filter((a) => earned.includes(a.id)), ...ACHIEVEMENTS.filter((a) => !earned.includes(a.id))];
    this.achievements.replaceChildren(
      ...list.map((a) => {
        const got = earned.includes(a.id);
        const row = el('div', `j-ach-item${got ? ' got' : ''}`);
        row.append(el('div', 'j-ach-name', `${got ? '■' : '□'} ${a.name}`), el('div', 'j-ach-text', a.text));
        return row;
      }),
    );
  }

  /** Recordings not yet watched, for the tab badge. */
  pending(state: GameState): number {
    return unwatched(state.story);
  }
}
