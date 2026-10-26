import { describe, expect, test } from 'vitest';
import { addComment, commentsOf, formatCommentDate, isCommentDate, removeComment, restoreComments, type CommentStore } from '../../src/comments';
import { makeRow } from '../../src/dataset';

const NOW = new Date(2024, 2, 7, 9, 5);

describe('comment storage (FR-15)', () => {
  test('entries are appended in order, each with its date and the text as entered', () => {
    const store: CommentStore = new Map();
    const row = makeRow({ a: '1' });
    addComment(store, row, 'First entry', NOW);
    addComment(store, row, '  Second\nentry  ', new Date(2024, 2, 8, 14, 30));
    const list = commentsOf(store, row);
    expect(list.map((c) => c.text)).toEqual(['First entry', 'Second\nentry']);
    expect(list[0].date).toBe(NOW.toISOString());
    expect(new Set(list.map((c) => c.id)).size).toBe(2);
  });

  test('an entry without text is not added', () => {
    const store: CommentStore = new Map();
    const row = makeRow({});
    expect(addComment(store, row, '   ', NOW)).toBeNull();
    expect(commentsOf(store, row)).toEqual([]);
    expect(store.size).toBe(0);
  });

  test('comments belong to their item', () => {
    const store: CommentStore = new Map();
    const a = makeRow({});
    const b = makeRow({});
    addComment(store, a, 'On a', NOW);
    expect(commentsOf(store, b)).toEqual([]);
    expect(commentsOf(store, a)).toHaveLength(1);
  });

  test('entries are removed by identifier; removing the last one empties the item', () => {
    const store: CommentStore = new Map();
    const row = makeRow({});
    const first = addComment(store, row, 'One', NOW)!;
    const second = addComment(store, row, 'Two', NOW)!;
    expect(removeComment(store, row, first.id)).toBe(true);
    expect(commentsOf(store, row).map((c) => c.text)).toEqual(['Two']);
    expect(removeComment(store, row, first.id)).toBe(false);
    expect(removeComment(store, row, second.id)).toBe(true);
    expect(store.has(row)).toBe(false);
  });

  test('stored entries are restored with fresh identifiers', () => {
    const restored = restoreComments([
      { date: '2024-03-07T08:05:00.000Z', text: 'A' },
      { date: '2024-03-08T08:05:00.000Z', text: 'B' },
    ]);
    expect(restored.map((c) => [c.date, c.text])).toEqual([
      ['2024-03-07T08:05:00.000Z', 'A'],
      ['2024-03-08T08:05:00.000Z', 'B'],
    ]);
    expect(restored[0].id).not.toBe(restored[1].id);
  });

  test('a stored date must be a readable timestamp', () => {
    expect(isCommentDate('2024-03-07T08:05:00.000Z')).toBe(true);
    expect(isCommentDate('2024-03-07')).toBe(false);
    expect(isCommentDate('2024-13-45T99:99:00Z')).toBe(false);
    expect(isCommentDate(20240307)).toBe(false);
  });

  test('the date is shown as year-month-day and local time of day', () => {
    expect(formatCommentDate(NOW.toISOString())).toBe('2024-03-07 09:05');
    expect(formatCommentDate('not a date')).toBe('not a date');
  });
});
