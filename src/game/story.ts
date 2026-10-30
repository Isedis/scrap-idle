/**
 * Act 1, "Кто-то есть на свалке": what the camera catches as the threat rises.
 * Events fire on their own and are always recorded, so a player who left the game
 * in the background finds them in the archive. Watching a story event for the first
 * time opens its case in the journal and adds a small permanent bonus.
 * Texts and tone: docs/STORY.md.
 */

/** What the scene or the terminal plays for an event. */
export type EventKind =
  | 'eyes'
  | 'bag'
  | 'lampBlink'
  | 'extra'
  | 'fridge'
  | 'cam00'
  | 'note'
  | 'driverless'
  | 'typing'
  | 'lampTurn'
  | 'breathe'
  | 'voice'
  | 'gull'
  | 'raccoon'
  | 'cat';

export interface EventDef {
  id: string;
  kind: EventKind;
  /** Lowest threat stage (see STAGES) at which it can happen. */
  stage: number;
  /** Case number in the journal; ambient events have none. */
  caseNo?: number;
  title: string;
  /** Case text, shown once the recording is watched. */
  text?: string;
  /** Producer that has to be owned for it to make sense on camera. */
  needs?: string;
  /** Mark left in the picture until the run ends. */
  trace?: 'fridge' | 'lamp';
}

export const EVENTS: readonly EventDef[] = [
  // Шорохи
  { id: 'eyes', kind: 'eyes', stage: 1, caseNo: 1, title: 'Глаза',
    text: 'Два огня у подножия кучи, 30 см над землёй. Моргают не одновременно. Еноты моргают одновременно.' },
  { id: 'bag', kind: 'bag', stage: 1, caseNo: 2, title: 'Пакет',
    text: 'Пакет поднялся с кучи и ушёл вверх. Против ветра. Медленно, как будто его несли на вытянутой руке.' },
  { id: 'lamp-blink', kind: 'lampBlink', stage: 1, caseNo: 3, title: 'Фонарь',
    text: 'Фонарь мигнул трижды. Питание в норме. В ноябре 1987-го он мигнул трижды за час до того, как пропал смотритель.' },
  // Он здесь
  { id: 'extra', kind: 'extra', stage: 2, caseNo: 4, title: 'Девятый', needs: 'collector',
    text: 'В ведомости смены восемь человек. На камере девять. Девятый без каски. Лицо в кадр не попало ни разу, хотя он всё время шёл к камере.' },
  { id: 'fridge', kind: 'fridge', stage: 2, caseNo: 5, title: 'Холодильник', trace: 'fridge',
    text: 'Холодильник «ЗИЛ», не подключён. Внутри горит свет. На полках что-то стоит. Оно не помещается в холодильник, но стоит.' },
  { id: 'cam00', kind: 'cam00', stage: 2, caseNo: 6, title: 'КАМ-00',
    text: 'Камеры 00 нет в схеме объекта. Подпись в кадре: «ЯМА». Запись с неё не сохранилась. Сохранился только таймкод: 00:00:00. Он идёт назад.' },
  { id: 'note', kind: 'note', stage: 2, caseNo: 7, title: 'Записка',
    text: 'Ветром с кучи подняло бумагу. Почерк смотрителя Игнатьева. Бумага тёплая.' },
  // Давление
  { id: 'driverless', kind: 'driverless', stage: 3, caseNo: 8, title: 'Без водителя', needs: 'truck',
    text: 'Мусоровоз без водителя разгрузился и уехал задним ходом. На лобовом стекле изнутри отпечатки ладоней. Много. Разного размера.' },
  { id: 'typing', kind: 'typing', stage: 3, caseNo: 9, title: 'Ввод',
    text: 'Терминал набрал строку сам. Клавиатура отключена от терминала с 1987 года. Кабель перерезан.' },
  { id: 'lamp-turn', kind: 'lampTurn', stage: 3, caseNo: 10, title: 'Фонарь смотрит', trace: 'lamp',
    text: 'После потери сигнала фонарь направлен в объектив. Он на болтах. Болты на месте. Кто-то хотел, чтобы его увидели. Или хотел лучше видеть нас.' },
  // Поднимается
  { id: 'breathe', kind: 'breathe', stage: 4, caseNo: 11, title: 'Дыхание',
    text: 'Объём кучи меняется с периодом 4,8 секунды. Так дышит спящий человек. Ритм совпадает с вашим.' },
  { id: 'voice', kind: 'voice', stage: 4, caseNo: 12, title: 'Голос',
    text: 'КАМ-00 вклинилась в эфир. Слова собраны из надписей на мусоре. Адресат: ОПЕРАТОР.' },
  // Тихие минуты: без страха, короткое ускорение
  { id: 'gull', kind: 'gull', stage: 0, title: 'Чайка с сосиской' },
  { id: 'raccoon', kind: 'raccoon', stage: 0, title: 'Енот в пакете' },
  { id: 'cat', kind: 'cat', stage: 0, title: 'Кот на заборе' },
];

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);
export const CASES = EVENTS.filter((e) => e.caseNo !== undefined);

/** Notes of Ignatyev, the watchman of 1979–1987: one per watched "note" recording, in order. */
export const NOTES: readonly string[] = [
  '12.03.79. Принял полигон. Ночью куча тёплая. Зимой. Сказали — гниёт. Я приложил ухо. Внутри стучит. Ровно, как в дверь.',
  'На двери будки написано: «СВЕТ НЕ ВЫКЛЮЧАТЬ». Изнутри. Будку до меня запирали снаружи.',
  'Из НИИ спрашивали, пропадает ли мусор. Я сказал — пропадает. Не сказал, что иногда возвращается. Чистый. Тёплый. Сложенный.',
  'Насчитал в смене девятерых. Нас восемь. Девятый знает, как меня зовут. Я ему не говорил.',
  'Если стало тихо — это не ушло. Это слушает. Не смотри на кучу, когда тихо. Она смотрит в ответ ровно столько же.',
  'Ноябрь. Нашёл в куче свою куртку. Я её ещё не выбрасывал. Она была застёгнута. Изнутри.',
];

/** What camera 00 says: words cut from labels on thrown-away things. */
export const PHRASES: readonly string[] = [
  'НЕ / ВЫБРАСЫВАТЬ / СОДЕРЖИМОЕ / ПОМНИТ',
  'ХРАНИТЬ / В / ТЕМНОТЕ',
  'ВСКРЫТЬ / ЗДЕСЬ',
  'ГОДЕН / ДО / СЕГОДНЯ',
  'НЕ / КАНТОВАТЬ / ВНУТРИ / ЖИВОЕ',
  'ОПЕРАТОР / ВЕРНИТЕ / ТАРУ',
  'ОСТОРОЖНО / ОТКРЫВАЕТСЯ / ИЗНУТРИ',
  'ВНИМАНИЕ / ВНУТРИ / ВЫ',
  'ВЕРХ / НИЗ / ВЕРХ / НИЗ / ВЕРХ',
  'ЗАЧЕМ / СВЕТ',
];

// ---- State -------------------------------------------------------------------

export interface Recording {
  seq: number;
  event: string;
  /** Epoch ms when it was caught. */
  at: number;
  watched: boolean;
  /** Happened while the game was closed. */
  away?: boolean;
  /** Phrase typed by the terminal or camera 00, fixed when it happened. */
  phrase?: string;
}

export interface StoryState {
  /** Story events whose recording has been watched: their cases are open. */
  cases: string[];
  /** Ignatyev's notes found so far. */
  notes: number;
  /** Phrases heard from camera 00, newest last. */
  voices: string[];
  /** The archive, newest first. */
  records: Recording[];
  /** Marks left in the picture this run. */
  traces: string[];
  /** Seconds until the next event. */
  nextIn: number;
  /** Seconds left of the short boost from watching an ambient event. */
  boost: number;
  seq: number;
}

export const newStory = (): StoryState => ({ cases: [], notes: 0, voices: [], records: [], traces: [], nextIn: 20, boost: 0, seq: 0 });

/** Every open case adds this much to all production, for good. */
export const CASE_BONUS = 0.03;
/** Watching an ambient event speeds things up this much… */
export const BOOST_MULT = 1.5;
/** …for this long. */
export const BOOST_SECONDS = 30;
const MAX_RECORDS = 20;

export function storyMult(story: StoryState): number {
  return (1 + CASE_BONUS * story.cases.length) * (story.boost > 0 ? BOOST_MULT : 1);
}

/**
 * Seconds between events at a threat stage. Rare enough that each one lands: minutes
 * apart when calm, about a minute apart at the edge. At night (00–05 local) a third
 * more often.
 */
const INTERVALS: readonly [number, number][] = [
  [300, 480],
  [180, 300],
  [120, 210],
  [90, 150],
  [60, 100],
];
export const NIGHT_FACTOR = 0.7;

export function eventInterval(stage: number, night: boolean, rand = Math.random): number {
  const [lo, hi] = INTERVALS[Math.min(stage, 4)];
  return (lo + rand() * (hi - lo)) * (night ? NIGHT_FACTOR : 1);
}

export const isNight = (date: Date) => date.getHours() < 5;

/**
 * Picks what happens next at this stage: the first story event not yet caught on
 * camera, else a repeat of a story event of this stage or an ambient one.
 */
export function pickEvent(story: StoryState, stage: number, owned: Record<string, number>, rand = Math.random): EventDef {
  const fits = (e: EventDef) => e.stage <= stage && (!e.needs || (owned[e.needs] ?? 0) > 0);
  const recorded = new Set(story.records.map((r) => r.event).concat(story.cases));
  const fresh = EVENTS.find((e) => e.caseNo !== undefined && fits(e) && !recorded.has(e.id));
  if (fresh) return fresh;
  const pool = EVENTS.filter((e) => fits(e) && (e.caseNo === undefined || e.stage === stage));
  return pool[Math.floor(rand() * pool.length)] ?? EVENTS.find((e) => e.id === 'gull')!;
}

/** Puts an event into the archive and leaves its trace. */
export function record(story: StoryState, event: EventDef, at: number, opts: { away?: boolean; rand?: () => number } = {}): Recording {
  const rand = opts.rand ?? Math.random;
  const rec: Recording = { seq: ++story.seq, event: event.id, at, watched: false };
  if (opts.away) rec.away = true;
  if (event.kind === 'typing' || event.kind === 'voice') rec.phrase = PHRASES[Math.floor(rand() * PHRASES.length)];
  story.records.unshift(rec);
  story.records.length = Math.min(story.records.length, MAX_RECORDS);
  if (event.trace && !story.traces.includes(event.trace)) story.traces.push(event.trace);
  return rec;
}

export interface WatchResult {
  /** The case opened by this watch, if it is the first. */
  opened?: EventDef;
  /** Ignatyev's note found in this recording. */
  note?: string;
  /** Phrase heard in this recording. */
  phrase?: string;
  boosted?: boolean;
}

/** Marks a recording watched and hands out what it reveals. */
export function watch(story: StoryState, seq: number): WatchResult {
  const rec = story.records.find((r) => r.seq === seq);
  const event = rec && eventById(rec.event);
  if (!rec || !event) return {};
  const first = !rec.watched;
  rec.watched = true;
  const out: WatchResult = {};
  if (!first) return out;
  if (event.caseNo !== undefined && !story.cases.includes(event.id)) {
    story.cases.push(event.id);
    out.opened = event;
  }
  if (event.kind === 'note' && story.notes < NOTES.length) out.note = NOTES[story.notes++];
  if (rec.phrase) {
    out.phrase = rec.phrase;
    if (!story.voices.includes(rec.phrase)) story.voices.push(rec.phrase);
  }
  if (event.caseNo === undefined) {
    story.boost = BOOST_SECONDS;
    out.boosted = true;
  }
  return out;
}

export const unwatched = (story: StoryState) => story.records.filter((r) => !r.watched).length;
