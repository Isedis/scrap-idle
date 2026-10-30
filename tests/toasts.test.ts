import { describe, expect, it } from 'vitest';
import { bundle } from '../src/ui/toasts';

describe('bundled notices', () => {
  it('one notice stays as it is', () => {
    expect(bundle(['Куплено: Сачок'])).toEqual(['Куплено: Сачок']);
  });

  it('news of the same kind shares a line', () => {
    expect(bundle(['Новое улучшение: Сачок', 'Новое улучшение: Тачка', 'Достижение: Бригада (+1%)'])).toEqual([
      'Новое улучшение: Сачок, Тачка',
      'Достижение: Бригада (+1%)',
    ]);
  });

  it('a notice without a kind stands alone, and repeats fold away', () => {
    expect(bundle(['Куча осела. То, что под ней, стало ближе', 'Куча осела. То, что под ней, стало ближе'])).toEqual([
      'Куча осела. То, что под ней, стало ближе',
    ]);
  });

  it('a long list of one kind names the first few and counts the rest', () => {
    expect(bundle(['Новое улучшение: А', 'Новое улучшение: Б', 'Новое улучшение: В', 'Новое улучшение: Г', 'Новое улучшение: Д'])).toEqual([
      'Новое улучшение: А, Б, В и ещё 2',
    ]);
  });

  it('too many kinds end with a count of the rest', () => {
    expect(bundle(['А: 1', 'Б: 2', 'В: 3', 'Г: 4', 'Д: 5'])).toEqual(['А: 1', 'Б: 2', 'и ещё 3']);
  });

  it('nothing waiting, nothing to show', () => {
    expect(bundle([])).toEqual([]);
  });
});
