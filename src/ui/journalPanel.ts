import { CASES, CASE_BONUS, NOTES, eventById, unwatched, type Recording } from '../game/story';
import type { GameState } from '../game/state';
import { ACHIEVEMENTS, achievementMult } from '../game/achievements';
import { UNIQUES, describeUnique, uniqueById } from '../game/sorting';
import { HEARD } from '../game/hearing';
import { el } from './dom';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
/** Lines of camera 00 kept on screen. */
const VOICES_SHOWN = 5;
/** Achievements shown while the grid is closed: the next goals. */
const ACH_NEXT = 4;
const caseNo = (n: number) => `ДЕЛО #${String(n).padStart(3, '0')}`;

/** The Journal tab: camera archive, case files, Ignatyev's notes and what camera 00 said. */
export class JournalPanel {
  readonly root: HTMLElement;
  private archive!: HTMLElement;
  private archiveEmpty!: HTMLElement;
  private cases!: HTMLElement;
  private casesMeta!: HTMLElement;
  private notes!: HTMLElement;
  private notesMeta!: HTMLElement;
  private voices!: HTMLElement;
  private voicesHead!: HTMLElement;
  private achievements!: HTMLElement;
  private finds!: HTMLElement;
  private findsHead!: HTMLElement;
  private findsMeta!: HTMLElement;
  private heard!: HTMLElement;
  private heardHead!: HTMLElement;
  private achMeta!: HTMLElement;
  private achToggle!: HTMLButtonElement;
  /** The full achievement grid is long: closed, only the next few goals show. */
  private achOpen = false;
  /** Signature of what is on screen, so lists rebuild only when something changed. */
  private shown = '';

  constructor(private onWatch: (rec: Recording) => void) {
    this.root = el('section', 'panel journal');
    this.build();
  }

  private build(): void {
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-title', 'Архив записей'));
    this.root.append(head);
    this.archiveEmpty = el('p', 'empty', 'Записей нет. Камера пишет всё, что движется.');
    this.archive = el('div', 'j-list');
    this.root.append(this.archiveEmpty, this.archive);

    const casesHead = el('div', 'panel-head');
    this.casesMeta = el('span', 'panel-meta');
    casesHead.append(el('h2', 'panel-title', 'Дела'), this.casesMeta);
    this.cases = el('div', 'j-list');
    this.root.append(casesHead, this.cases);

    const notesHead = el('div', 'panel-head');
    this.notesMeta = el('span', 'panel-meta');
    notesHead.append(el('h2', 'panel-title', 'Записки смотрителя'), this.notesMeta);
    this.notes = el('div', 'j-list');
    this.root.append(notesHead, this.notes);

    this.findsHead = el('div', 'panel-head');
    this.findsMeta = el('span', 'panel-meta');
    this.findsHead.append(el('h2', 'panel-title', 'Найдено при сортировке'), this.findsMeta);
    this.finds = el('div', 'j-list');
    this.root.append(this.findsHead, this.finds);

    this.heardHead = el('h2', 'panel-title', 'Тишина');
    this.heard = el('div', 'j-list');
    this.root.append(this.heardHead, this.heard);

    this.voicesHead = el('h2', 'panel-title', 'КАМ-00');
    this.voices = el('div', 'j-voices');
    this.root.append(this.voicesHead, this.voices);

    const achHead = el('div', 'panel-head');
    this.achMeta = el('span', 'panel-meta');
    achHead.append(el('h2', 'panel-title', 'Достижения'), this.achMeta);
    this.achievements = el('div', 'j-ach');
    this.achToggle = el('button', 'btn j-more');
    this.achToggle.type = 'button';
    this.achToggle.id = 'achievements-all';
    this.achToggle.addEventListener('click', () => {
      this.achOpen = !this.achOpen;
      this.shown = '';
      this.render(this.lastState!);
    });
    this.root.append(achHead, this.achievements, this.achToggle);
  }

  private lastState: GameState | null = null;

  render(state: GameState): void {
    this.lastState = state;
    const story = state.story;
    const sig = JSON.stringify([story.records.map((r) => [r.seq, r.watched]), story.cases, story.notes, story.voices.length, state.achievements.length, state.sorting.found.length, state.sorting.open, state.hearing.survived, this.achOpen]);
    if (sig === this.shown) return;
    this.shown = sig;

    this.archiveEmpty.hidden = story.records.length > 0;
    this.archive.replaceChildren(...story.records.map((r) => this.recordRow(r)));

    this.casesMeta.textContent = `открыто ${story.cases.length}/${CASES.length} · доход ×${(1 + CASE_BONUS * story.cases.length).toFixed(2)}`;
    // Only the open cases; the closed ones are a single line, not a dozen rows of ???.
    const closed = CASES.length - story.cases.length;
    this.cases.replaceChildren(
      ...CASES.filter((c) => story.cases.includes(c.id)).map((c) => {
        const row = el('div', 'j-case');
        row.append(el('div', 'j-case-title', `${caseNo(c.caseNo!)} · ${c.title}`), el('div', 'j-text', c.text!));
        return row;
      }),
      ...(closed > 0 ? [el('p', 'empty', `Не открыто: ${closed}. Дело открывается, когда смотришь новую запись камеры.`)] : []),
    );

    this.notesMeta.textContent = `${story.notes}/${NOTES.length}`;
    this.notes.replaceChildren(
      ...(story.notes === 0
        ? [el('p', 'empty', 'Пока ни одной. Смотрите, что ветер поднимает с кучи.')]
        : NOTES.slice(0, story.notes).map((n) => el('div', 'j-note', n))),
    );

    const found = state.sorting.found;
    this.findsHead.hidden = this.finds.hidden = !state.sorting.open && found.length === 0;
    this.findsMeta.textContent = `${found.length}/${UNIQUES.length}`;
    this.finds.replaceChildren(
      ...(found.length === 0
        ? [el('p', 'empty', 'Стол осмотра пока ничего не опознал.')]
        : found.map((id) => {
            const u = uniqueById(id)!;
            const row = el('div', 'j-case');
            row.append(el('div', 'j-case-title', u.name), el('div', 'j-text', u.text), el('div', 'j-find-effect', describeUnique(u)));
            return row;
          })),
    );

    // What was heard in the silence, one line for each walk lived through.
    const heard = Math.min(state.hearing.survived, HEARD.length);
    this.heardHead.hidden = this.heard.hidden = heard === 0;
    this.heard.replaceChildren(...HEARD.slice(0, heard).map((line) => el('div', 'j-note', line)));

    this.voicesHead.hidden = story.voices.length === 0;
    // The last few things camera 00 said; the rest scroll away.
    this.voices.replaceChildren(...story.voices.slice(-VOICES_SHOWN).map((v) => el('div', 'j-voice', v)));

    const earned = state.achievements;
    this.achMeta.textContent = `${earned.length}/${ACHIEVEMENTS.length} · доход ×${achievementMult(earned).toFixed(2)}`;
    // Closed: the next few goals. Open: the whole grid, unearned ones dim with what they take.
    const list = this.achOpen ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => !earned.includes(a.id)).slice(0, ACH_NEXT);
    this.achToggle.textContent = this.achOpen ? 'Свернуть' : `Все достижения (${ACHIEVEMENTS.length})`;
    this.achievements.replaceChildren(
      ...list.map((a) => {
        const got = earned.includes(a.id);
        const row = el('div', `j-ach-item${got ? ' got' : ''}`);
        row.append(el('div', 'j-ach-name', `${got ? '■' : '□'} ${a.name}`), el('div', 'j-ach-text', a.text));
        return row;
      }),
    );
  }

  private recordRow(r: Recording): HTMLElement {
    const event = eventById(r.event)!;
    const row = el('div', `j-rec${r.watched ? '' : ' new'}`);
    const body = el('div', 'j-rec-body');
    const when = `${clock(r.at)} · КАМ-01${r.away ? ' · пока вас не было' : ''}`;
    body.append(el('div', 'j-rec-when', when), el('div', 'j-rec-what', r.watched ? event.title : 'Зафиксировано движение'));
    const button = el('button', 'btn j-watch', r.watched ? 'Ещё раз' : 'Смотреть');
    button.type = 'button';
    button.addEventListener('click', () => this.onWatch(r));
    row.append(body, button);
    return row;
  }

  /** Recordings not yet watched, for the tab badge. */
  pending(state: GameState): number {
    return unwatched(state.story);
  }
}
