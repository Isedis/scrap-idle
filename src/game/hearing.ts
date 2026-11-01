/**
 * Hearing: the second thing, the one that listens. It wakes with the sorting line. The
 * plant's noise is a slider from silence to double load: louder pays more, and above
 * normal load the thing's hearing fills. Once it has heard, it comes, and nothing stops
 * the walk. At the end the plant has a minute to go silent, and silence has to hold for
 * ten seconds. A sound in those seconds, or no silence in time, costs the whole of
 * Recycling. Closed, the plant runs at normal load and the thing waits as it was: the
 * meter, the walk and the minute stand still until the player is back.
 * Texts and tone: docs/STORY.md.
 */

export type HearingPhase = 'idle' | 'walk' | 'check' | 'caught';

export interface HearingState {
  /** Plant load the player set, 0..MAX_NOISE; 1 is normal. */
  noise: number;
  /** Use the town silencer; two boilers also restore the chosen load after a check. */
  noiseAuto: boolean;
  /** Chosen load held across an automatic door check, including reloads. */
  resumeNoise: number | null;
  /** How much it has heard, 0..1. */
  meter: number;
  phase: HearingPhase;
  /** Seconds left of the walk or of the minute to go silent. */
  left: number;
  /** Length of the current walk, for how near it is. */
  walk: number;
  /** Seconds of silence held during the check. */
  held: number;
  /** Walks lived through; each one tells a little more. */
  survived: number;
  /** Times it was heard too late. */
  losses: number;
  /** What the town's silencer did at the door this time; not saved. */
  auto?: 'ok' | 'fail';
}

export const newHearing = (): HearingState => ({ noise: 1, noiseAuto: true, resumeNoise: null, meter: 0, phase: 'idle', left: 0, walk: 0, held: 0, survived: 0, losses: 0 });

/** Double load at most: double income. */
export const MAX_NOISE = 2;
/** Seconds to fill the meter at full load; half the extra load takes twice as long. */
const FILL_SECONDS = 5 * 60;
/** Seconds for a full meter to empty at normal load or below. */
const DRAIN_SECONDS = 3 * 60;
/** How long it walks, seconds. */
export const WALK_MIN = 60;
export const WALK_MAX = 2 * 60;
/** The minute to go silent… */
export const CHECK_SECONDS = 60;
/** …and the silence that has to hold. */
export const HOLD_SECONDS = 10;

/** Load the plant actually runs at: normal while the game is closed, and nothing before the line opens. */
export const effectiveNoise = (h: HearingState, open: boolean, offline = false) => (!open ? 1 : offline ? Math.min(h.noise, 1) : h.noise);

/** Income multiplier from the plant's load. */
export const noiseMult = (h: HearingState, open: boolean, offline = false) => effectiveNoise(h, open, offline);

export const setNoise = (h: HearingState, noise: number) => {
  const next = Math.min(Math.max(Number.isFinite(noise) ? noise : 1, 0), MAX_NOISE);
  // An automatic check stays quiet while the chosen load can be changed safely.
  if (h.phase === 'check' && h.noiseAuto && h.resumeNoise !== null) { h.resumeNoise = next; return; }
  // Any sound once the silence has started is heard.
  if (h.phase === 'check' && h.held > 0 && next > 0) h.phase = 'caught';
  h.noise = next;
};

export function setNoiseAutomation(h: HearingState, on: boolean): void {
  h.noiseAuto = on;
  if (!on) h.resumeNoise = null;
}

/** How near it is during the walk, 0..1; 1 from the check on. */
export function nearness(h: HearingState): number {
  if (h.phase === 'idle') return 0;
  if (h.phase === 'walk') return h.walk > 0 ? 1 - h.left / h.walk : 0;
  return 1;
}

/**
 * Runs the thing for `dt` seconds. Offline nothing moves: it does not come for someone who
 * is not there, and leaving the game does not make it forget what it heard.
 * Returns what changed, for the screen.
 */
export function hearingTick(
  h: HearingState,
  dt: number,
  open: boolean,
  offline = false,
  rand = Math.random,
  /** How fast the meter fills: the town's church bells cover the plant. */
  fill = 1,
): 'heard' | 'check' | 'survived' | 'caught' | null {
  if (!open || offline || dt <= 0 || h.phase === 'caught') return null;
  const noise = effectiveNoise(h, open, offline);
  if (h.phase === 'idle') {
    if (noise > 1) h.meter += ((noise - 1) / (MAX_NOISE - 1) / FILL_SECONDS) * dt * fill;
    else h.meter -= dt / DRAIN_SECONDS;
    // A hair under full counts as full: a sum of small steps never lands on 1 exactly.
    h.meter = h.meter > 1 - 1e-9 ? 1 : Math.max(h.meter, 0);
    if (h.meter < 1) return null;
    h.phase = 'walk';
    h.walk = WALK_MIN + (WALK_MAX - WALK_MIN) * rand();
    h.left = h.walk;
    return 'heard';
  }
  if (h.phase === 'walk') {
    h.left -= dt;
    return h.left > 0 ? null : startCheck(h);
  }
  // The check.
  if (noise > 0) {
    if (h.held > 0) {
      h.phase = 'caught';
      return 'caught';
    }
  } else {
    h.held += dt;
    if (h.held >= HOLD_SECONDS) {
      h.phase = 'idle';
      h.meter = 0;
      h.held = 0;
      h.left = 0;
      // The plant starts again at normal load, so nobody is left earning nothing by mistake.
      h.noise = 1;
      h.survived += 1;
      return 'survived';
    }
  }
  h.left -= dt;
  if (h.left > 0) return null;
  h.phase = 'caught';
  return 'caught';
}

function startCheck(h: HearingState): 'check' {
  h.phase = 'check';
  h.resumeNoise = null;
  delete h.auto;
  h.left = CHECK_SECONDS;
  h.held = 0;
  return 'check';
}

/** The minute at the door waits while the player cannot see the game, under a screen over it. */
export function holdCheck(h: HearingState, dt: number): void {
  if (h.phase === 'check' && h.held === 0) h.left = Math.min(h.left + dt, CHECK_SECONDS);
}

/** After a loss it goes back down, and the plant starts at normal load. */
export function afterLoss(h: HearingState): void {
  h.phase = 'idle';
  h.meter = 0;
  h.left = 0;
  h.held = 0;
  h.noise = 1;
  h.resumeNoise = null;
  delete h.auto;
  h.losses += 1;
}

/**
 * What is heard in the silence, one line per walk lived through, in order. Ignatyev knew
 * it: "if it went quiet, it has not gone, it is listening".
 */
export const HEARD: readonly string[] = [
  'В тишине слышно, как оно стоит за дверью будки. Оно не дышит. Оно ждёт, когда задышите вы.',
  'Оно постучало. Два раза, ровно, как в дверь. Так Игнатьев описывал стук внутри кучи.',
  'Оно повторило звук цеха. Пресс, шредер, лента. Точно, как запись. Потом повторило ваш вдох.',
  'Голосом мастера смены: «Оператор, всё в порядке, включайте». Мастер уволился в 1987-м.',
  'Оно назвало число. Столько раз вы нажимали на экран за смену. Оно считало.',
  'Шаги ушли в кучу. Куча после этого стала на сантиметр выше. Как будто кто-то лёг сверху.',
  'В тишине слышно второе дыхание. Внутри будки. Совпадает с вашим. Отстаёт на полсекунды.',
  'Оно сказало вашим голосом: «Тише». Вы ничего не говорили.',
];

/** The line heard on the latest walk lived through; repeats the last once they run out. */
export const heardLine = (survived: number) => HEARD[Math.min(Math.max(survived, 1), HEARD.length) - 1];
