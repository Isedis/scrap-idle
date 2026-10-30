import '@fontsource-variable/jetbrains-mono';
import './style.css';
import { format } from './game/num';
import { advance, newGame, revealProducers, type GameState } from './game/state';
import { applyOffline, readSave, writeSave } from './game/save';
import { App } from './ui/app';
import { CHECK_EVERY_MS, findNewBuild, reloadInto } from './update';

const AUTOSAVE_MS = 10_000;
const RENDER_MS = 100;
/** Away longer than this, the player gets a "while you were gone" note. */
const OFFLINE_NOTE_SECONDS = 60;

let state: GameState = readSave() ?? newGame();
const before = state.trash;
const away = applyOffline(state);
revealProducers(state);

const app = new App(
  document.getElementById('app')!,
  () => state,
  (next) => (state = next),
);
app.render();
if (away >= OFFLINE_NOTE_SECONDS) {
  app.toast(`Пока вас не было, собрано ${format(state.trash.sub(before))} кг`);
}

let lastRender = 0;
function frame(): void {
  const now = Date.now();
  // A hidden tab pauses frames; the gap is simulated exactly on return.
  const dt = (now - state.lastTick) / 1000;
  advance(state, dt);
  state.lastTick = now;
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
async function checkForUpdate(): Promise<void> {
  if (!import.meta.env.PROD) return;
  const build = await findNewBuild(__BUILD_ID__, (url) => fetch(url, { cache: 'no-store' }));
  if (build) {
    app.offerUpdate(() => {
      writeSave(state);
      reloadInto(build);
    });
  }
}
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
