import '@fontsource-variable/jetbrains-mono';
import './style.css';
import { format } from './game/num';
import { advance, newGame, revealProducers, type GameState } from './game/state';
import { applyOffline, readSave, writeSave } from './game/save';
import { App } from './ui/app';

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
});
window.addEventListener('pagehide', () => writeSave(state));
