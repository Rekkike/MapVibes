// Comments (FR-15): entries of plain text with a date, appended to an item in
// the details panel and removable there. They belong to the item, so they
// follow it through sorting, filtering, and renumbering.

import type { RowData } from './dataset';

export interface ItemComment {
  // Identifies the entry within the session; not stored in the work state.
  id: string;
  // The moment the entry was added, as an ISO 8601 timestamp.
  date: string;
  text: string;
}

export type CommentStore = Map<RowData, ItemComment[]>;

let nextId = 1;

function newId(): string {
  return `comment-${nextId++}`;
}

// The text is kept as entered, apart from surrounding white space; an entry
// with no text is not added.
export function addComment(store: CommentStore, row: RowData, text: string, now: Date = new Date()): ItemComment | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const comment: ItemComment = { id: newId(), date: now.toISOString(), text: trimmed };
  store.set(row, [...(store.get(row) ?? []), comment]);
  return comment;
}

export function removeComment(store: CommentStore, row: RowData, id: string): boolean {
  const list = store.get(row);
  if (!list || !list.some((c) => c.id === id)) return false;
  const rest = list.filter((c) => c.id !== id);
  if (rest.length === 0) store.delete(row);
  else store.set(row, rest);
  return true;
}

export function commentsOf(store: CommentStore, row: RowData): readonly ItemComment[] {
  return store.get(row) ?? [];
}

// Restores stored entries (from a work-state file) with fresh identifiers.
export function restoreComments(entries: ReadonlyArray<{ date: string; text: string }>): ItemComment[] {
  return entries.map((e) => ({ id: newId(), date: e.date, text: e.text }));
}

// A stored date must be a timestamp that a date can be read from.
export function isCommentDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// The date as shown: year-month-day and the time of day in local time, the
// same in every language.
export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
