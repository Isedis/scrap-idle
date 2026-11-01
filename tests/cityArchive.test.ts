import { describe, expect, it } from 'vitest';
import { cityArchive, rememberCity, DISTRICTS, LETTERS, ARCHIVE_PAGES } from '../src/game/city';
import { newGame, descend } from '../src/game/state';
import { serialize, deserialize } from '../src/game/save';

describe('city archive', () => {
  it('reveals only earned letters and gates the founding documents', () => {
    const s = newGame();
    expect(cityArchive(s.city, s.story)).toEqual({ letters: [], pages: [] });
    s.city.owned.push('archive');
    const archive = cityArchive(s.city, s.story);
    expect(archive.letters).toEqual([{ number: 1, text: LETTERS[0] }]);
    expect(archive.pages).toEqual(ARCHIVE_PAGES);
  });
  it('keeps the earned archive through descent and save round trips', () => {
    const s = newGame(); s.city.open = true;
    s.city.owned = DISTRICTS.map(d => d.id);
    rememberCity(s.story, s.city);
    expect(descend(s)).toBe(true);
    expect(s.city.owned).toEqual(['dump']);
    const restored = deserialize(serialize(s))!;
    expect(cityArchive(restored.city, restored.story).letters.length).toBe(LETTERS.length);
    expect(cityArchive(restored.city, restored.story).pages).toEqual(ARCHIVE_PAGES);
  });
  it('migrates v14 from the owned town, and restores earned documents for prior descents', () => {
    const s = newGame(); s.city.owned.push('archive');
    const old = JSON.parse(serialize(s)); old.v = 14;
    delete old.story.cityLetters; delete old.story.cityDocuments;
    const migrated = deserialize(JSON.stringify(old))!;
    expect(migrated.story.cityLetters).toBe(1);
    expect(migrated.story.cityDocuments).toBe(true);
    old.layers.bottom.open = true; old.layers.city.owned = ['dump'];
    const descended = deserialize(JSON.stringify(old))!;
    expect(descended.story.cityLetters).toBe(LETTERS.length);
    expect(descended.story.cityDocuments).toBe(true);
    expect(JSON.parse(serialize(descended)).v).toBe(16);
  });
});
