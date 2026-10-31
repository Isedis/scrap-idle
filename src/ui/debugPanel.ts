import { DEBUG_ACTIONS } from '../game/debug';
import { deserialize, startPreview, writeSave } from '../game/save';
import type { GameState } from '../game/state';
import type { App } from './app';
import { el } from './dom';

const DEBUG_KEY = 'scrap-idle-debug';

/** Saves from tests/fixtures, fetched only when the debug panel asks for one. */
const FIXTURES = import.meta.glob('../../tests/fixtures/*.json', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

const FIXTURE_NAMES: Record<string, string> = {
  start: 'Начало',
  'recycle-ready': 'Переработка готова',
  'recycle-tree': 'Дерево переработки',
  sorting: 'Сортировка',
  'hearing-walk': 'Слух идёт',
  city: 'Город открыт',
  'city-late': 'Город почти весь',
  bottom: 'Дно ямы',
};

/** The strip across the top while a preview runs, with the way back. */
function showPreviewBar(): void {
  if (document.querySelector('.dbg-preview')) return;
  const bar = el('div', 'dbg-preview');
  const back = el('button', 'btn dbg-btn', 'Вернуться к своей игре');
  back.type = 'button';
  back.addEventListener('click', () => location.reload());
  bar.append(el('span', '', 'ПРЕДПРОСМОТР · прогресс не сохраняется'), back);
  document.body.append(bar);
}

/** ?debug turns the panel on and keeps it on (the home-screen copy drops the query); ?debug=0 turns it off. */
export function debugOn(): boolean {
  const q = new URLSearchParams(location.search).get('debug');
  try {
    if (q === '0') localStorage.removeItem(DEBUG_KEY);
    else if (q !== null) localStorage.setItem(DEBUG_KEY, '1');
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return q !== null && q !== '0';
  }
}

/** A small «DBG» button in the corner; it opens shortcuts and the fixture saves. */
export function mountDebug(app: App, getState: () => GameState): void {
  const toggle = el('button', 'dbg-toggle', 'DBG');
  toggle.type = 'button';
  const panel = el('div', 'dbg-panel');
  panel.hidden = true;
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));

  const grid = el('div', 'dbg-grid');
  for (const a of DEBUG_ACTIONS) {
    const b = el('button', 'btn dbg-btn', a.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      const s = getState();
      a.run(s);
      writeSave(s);
      app.render();
    });
    grid.append(b);
  }

  const saves = el('div', 'dbg-grid');
  const byId = new Map(Object.entries(FIXTURES).map(([path, load]) => [path.split('/').pop()!.replace('.json', ''), load]));
  const order = [...Object.keys(FIXTURE_NAMES).filter((id) => byId.has(id)), ...[...byId.keys()].filter((id) => !(id in FIXTURE_NAMES))];
  for (const id of order) {
    const load = byId.get(id)!;
    const b = el('button', 'btn dbg-btn', FIXTURE_NAMES[id] ?? id);
    b.type = 'button';
    b.addEventListener('click', async () => {
      const state = deserialize(await load());
      if (!state) return;
      // A look, not a swap: the player's save stays as it was, nothing is written until reload.
      startPreview();
      app.loadState(state, `Предпросмотр: ${FIXTURE_NAMES[id] ?? id}`);
      showPreviewBar();
      panel.hidden = true;
      // The bottom of the pit is what one comes to look at: open it straight away.
      if (id === 'bottom') {
        document.getElementById('tab-recycle')?.click();
        document.getElementById('layer-bottom')?.click();
      }
    });
    saves.append(b);
  }

  const off = el('button', 'btn dbg-btn', 'Выключить отладку');
  off.type = 'button';
  off.addEventListener('click', () => {
    try {
      localStorage.removeItem(DEBUG_KEY);
    } catch {
      /* nothing to forget */
    }
    toggle.remove();
    panel.remove();
  });

  panel.append(el('div', 'dbg-head', 'Отладка (меняет игру)'), grid, el('div', 'dbg-head', 'Посмотреть сохранение (твоя игра не тронется)'), saves, off);
  document.body.append(toggle, panel);
}
