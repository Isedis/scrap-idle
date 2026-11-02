import { expect, it } from 'vitest';
import { discoveredTracks } from '../src/ui/tracksPanel';
import { buyTrack, newGame, visibleTracks } from '../src/game/state';
import { D } from '../src/game/num';

it('keeps discovered tracks visible after a reset without bypassing run requirements', () => {
  const s = newGame();
  expect(discoveredTracks(s)).toEqual([]);
  s.totalTrash = D('1e30');
  s.trash = D('1e30');
  expect(discoveredTracks(s)).toHaveLength(3);
  expect(visibleTracks(s)).toEqual([]);
  expect(buyTrack(s, 'compact')).toBe(false);
  s.runTrash = D('1e9');
  expect(buyTrack(s, 'compact')).toBe(true);
  expect(buyTrack(s, 'bulk')).toBe(false);
  expect(discoveredTracks(s)).toHaveLength(3);
});
