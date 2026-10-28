import { describe, expect, test } from 'vitest';
import { en, format, sv } from '../../src/i18n';

// Count grammar (v1.3.0): {name:one|other} chooses the singular for exactly
// one, in both languages.
describe('count grammar', () => {
  test('the singular for one, the plural otherwise, the value itself as before', () => {
    expect(format('{n} {n:item|items}', { n: 1 })).toBe('1 item');
    expect(format('{n} {n:item|items}', { n: 0 })).toBe('0 items');
    expect(format('{n} {n:item|items}', { n: 2 })).toBe('2 items');
    expect(format('{n} {n:item|items}', { n: '1' })).toBe('1 item');
    expect(format('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(format('{n:one|}', { n: 3 })).toBe('');
  });

  test('the counted messages read correctly at one in both languages', () => {
    expect(format(en.exportComments, { comments: 1 })).toBe('1 comment with its date');
    expect(format(en.exportComments, { comments: 2 })).toBe('2 comments with their dates');
    expect(format(sv.exportComments, { comments: 1 })).toBe('1 kommentar med sitt datum');
    expect(format(en.exportRemoved, { removed: 1 })).toBe('1 row removed from the list');
    expect(format(sv.exportRemoved, { removed: 1 })).toBe('1 rad som tagits bort ur listan');
    expect(format(en.listGroupCount, { count: 1 })).toBe('1 item');
    expect(format(en.documentTable, { items: 1, columns: 1, pages: 1 })).toBe('a table of the 1 shown item with 1 column, on 1 page');
    expect(format(sv.documentTable, { items: 1, columns: 1, pages: 1 })).toBe('en tabell över det 1 visade objektet med 1 kolumn, på 1 sida');
    expect(format(en.compareAdopted, { count: 1 })).toBe('1 marker position was adopted from the file. It is an unsaved change.');
    expect(format(sv.exportExcluded, { excluded: 1 })).toBe('1 objekt som är avstängt för presentationen');
    expect(format(sv.exportExcluded, { excluded: 3 })).toBe('3 objekt som är avstängda för presentationen');
  });

  test('no message with a count is left in a plural-only form', () => {
    // A count placeholder directly followed by a plural noun must offer a
    // singular too.
    for (const table of [en, sv]) {
      for (const [key, value] of Object.entries(table)) {
        expect(/\{(count|items|comments|removed|excluded|placed|hidden|annotations|markers|outside|pages)\} (items|comments|rows|markers|columns|annotations|values|pages|slides|kommentarer|rader|markörer|kolumner|markeringar|värden|sidor|bilder)\b/.test(value), key).toBe(false);
      }
    }
  });
});
