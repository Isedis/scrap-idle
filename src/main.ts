import '@fontsource-variable/jetbrains-mono';
import './style.css';
import { format } from './game/num';
import { advance, autoRecycleDue, autoSortDue, newGame, revealProducers, runScripts, storyTick, type GameState } from './game/state';
import { applyOffline, readSave, writeSave } from './game/save';
import { AWAY_SCREEN_SECONDS, awayReport, awaySnapshot, type AwayReport } from './game/away';
import { App } from './ui/app';
import { holdCheck } from './game/hearing';
import { CHECK_EVERY_MS, latestBuild, reloadInto } from './update';

const AUTOSAVE_MS = 10_000;
const RENDER_MS = 100;
/** Away longer than this, the player gets a "while you were gone" note. */
const OFFLINE_NOTE_SECONDS = 60;

/** A gap between frames longer than this means the game was in the background: it counts as closed. */
const BACKGROUND_GAP_SECONDS = 5;

let state: GameState = readSave() ?? newGame();
const before = awaySnapshot(state);
const awayRaw = secondsSince(state.lastTick);
const away = applyOffline(state);
revealProducers(state);
// The report is read before the first render, which takes the inspection table's news.
const awayFirst = awayReport(before, state, away);

const app = new App(
  document.getElementById('app')!,
  () => state,
  (next) => (state = next),
);
app.render();
welcomeBack(away, awayFirst, awayRaw);

function secondsSince(ms: number): number {
  return Math.max(0, (Date.now() - ms) / 1000);
}

/**
 * Tells the player what happened while the game was closed or in the background: a short
 * absence gets a notice, a long one the away screen.
 */
function welcomeBack(seconds: number, report: AwayReport, raw: number): void {
  if (seconds < OFFLINE_NOTE_SECONDS) return;
  if (seconds < AWAY_SCREEN_SECONDS) {
    app.toast(`Пока вас не было, собрано ${format(report.trash)} кг`);
    return;
  }
  // The offline limit cut the absence short: say so, the tree can lengthen it.
  const capped = raw > seconds + 60 ? seconds : null;
  app.showAway(report, capped, () => {
    // Once something has stirred, a long absence does not go unnoticed.
    if (seconds >= 30 * 60 && state.story.records.length > 0) app.greet(seconds);
  });
}

let lastRender = 0;
function frame(): void {
  const now = Date.now();
  let dt = (now - state.lastTick) / 1000;
  if (dt > BACKGROUND_GAP_SECONDS) {
    // The phone paused the game in the background: that time runs as if it was closed,
    // so the threat climbs slowly and stops short of the edge.
    const snapshot = awaySnapshot(state);
    const raw = secondsSince(state.lastTick);
    const seconds = applyOffline(state, now);
    welcomeBack(seconds, awayReport(snapshot, state, seconds), raw);
    dt = 0;
  } else {
    // The minute at the door starts once the player can see it, not under the away screen.
    if (app.covered()) holdCheck(state.hearing, dt);
    advance(state, dt);
    state.lastTick = now;
  }

  const event = storyTick(state, dt);
  if (event) app.onEvent(event);

  const notes = runScripts(state, dt);
  if (notes.length > 0) app.onScripts(notes);

  if (autoRecycleDue(state)) app.autoRecycle();
  if (autoSortDue(state)) app.autoSort();

  app.frame(dt);
  if (now - lastRender >= RENDER_MS) {
    lastRender = now;
    app.render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => writeSave(state), AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writeSave(state);
  else checkForUpdate();
});
window.addEventListener('pagehide', () => writeSave(state));

// A copy opened from the home screen can run for days; look for newer builds.
const fetchBuild = () => latestBuild((url) => fetch(url, { cache: 'no-store' }));

async function checkForUpdate(): Promise<void> {
  if (!import.meta.env.PROD) return;
  const build = await fetchBuild();
  if (build && build !== __BUILD_ID__) app.setUpdateAvailable();
}

// The Settings button: save, then load the newest build if there is one.
app.onUpdate = async () => {
  writeSave(state);
  const build = import.meta.env.PROD ? await fetchBuild() : __BUILD_ID__;
  if (build === null) return 'offline';
  if (build === __BUILD_ID__) return 'latest';
  reloadInto(build);
  return 'reloading';
};
checkForUpdate();
setInterval(checkForUpdate, CHECK_EVERY_MS);

// iOS Safari ignores user-scalable=no; block its pinch and double-tap zoom directly.
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    // Buttons keep every tap (fast repeated buying), and touch-action already stops zoom on them.
    const control = (e.target as Element | null)?.closest?.('button, input, textarea');
    if (!control && now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
