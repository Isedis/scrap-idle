import { CASES, CASE_BONUS, NOTES, eventById, unwatched, type Recording } from '../game/story';
import type { GameState } from '../game/state';
import { el } from './dom';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
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

    this.voicesHead = el('h2', 'panel-title', 'КАМ-00');
    this.voices = el('div', 'j-voices');
    this.root.append(this.voicesHead, this.voices);
  }

  render(state: GameState): void {
    const story = state.story;
    const sig = JSON.stringify([story.records.map((r) => [r.seq, r.watched]), story.cases, story.notes, story.voices.length]);
    if (sig === this.shown) return;
    this.shown = sig;

    this.archiveEmpty.hidden = story.records.length > 0;
    this.archive.replaceChildren(...story.records.map((r) => this.recordRow(r)));

    this.casesMeta.textContent = `открыто ${story.cases.length}/${CASES.length} · доход ×${(1 + CASE_BONUS * story.cases.length).toFixed(2)}`;
    this.cases.replaceChildren(
      ...CASES.map((c) => {
        const open = story.cases.includes(c.id);
        const row = el('div', `j-case${open ? '' : ' locked'}`);
        row.append(el('div', 'j-case-title', `${caseNo(c.caseNo!)} · ${open ? c.title : '???'}`));
        if (open) row.append(el('div', 'j-text', c.text!));
        return row;
      }),
    );

    this.notesMeta.textContent = `${story.notes}/${NOTES.length}`;
    this.notes.replaceChildren(
      ...(story.notes === 0
        ? [el('p', 'empty', 'Пока ни одной. Смотрите, что ветер поднимает с кучи.')]
        : NOTES.slice(0, story.notes).map((n) => el('div', 'j-note', n))),
    );

    this.voicesHead.hidden = story.voices.length === 0;
    this.voices.replaceChildren(...story.voices.map((v) => el('div', 'j-voice', v)));
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
