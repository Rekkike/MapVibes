// Item details (FR-7, FR-10, FR-15, FR-35, FR-37). The details panel (in the
// Information and Map segments) shows the complete item data, editable; the
// presentation data card (view-only) is content-first: it repeats nothing the
// marker or its header already shows, puts the note and the comments first,
// and lists the structured fields in a compact grid below. Both are built
// from one model of the item.

import { drawSymbol, symbolClasses, type MarkerSymbol } from './symbols';
import type { RowColour } from './dataset';

export interface DetailField {
  key: string;
  label: string;
  value: string;
  // How the value is edited in the panel: free text, the area combobox, or
  // the status list.
  kind: 'text' | 'area' | 'status';
}

export interface DetailComment {
  id: string;
  // The ISO 8601 timestamp and the date as shown.
  date: string;
  dateText: string;
  text: string;
  // The last edit, if any, as an ISO 8601 timestamp and as shown.
  edited?: string;
  editedText?: string;
}

export interface DetailModel {
  rowId: string;
  // The number as shown (FR-17).
  number: string;
  name: string;
  colour: RowColour;
  colourName: string;
  symbol: MarkerSymbol;
  symbolName: string;
  fields: DetailField[];
  comments: DetailComment[];
  // For the card (FR-37): the value of the note column ('' when none), and
  // the structured fields with values, in a fixed order of their roles.
  note: string;
  cardFields: Array<{ key: string; label: string; value: string }>;
  // The annotations linked to the item as its footprints (FR-48), each by
  // name, with its area where it can be measured honestly (FR-49), else null.
  footprints: DetailFootprint[];
  // For the panel (FR-7 as amended in v1.6.0): each assigned year series as
  // one group of its columns, and the Economics action's label when the item
  // has economics (FR-64).
  seriesGroups: DetailSeriesGroup[];
  economics: string | null;
}

export interface DetailSeriesGroup {
  role: string;
  label: string;
  keys: string[];
  open: boolean;
}

export interface DetailFootprint {
  id: string;
  name: string;
  area: string | null;
}

export interface DetailLabels {
  number: string;
  colour: string;
  symbol: string;
  comments: string;
  noComments: string;
  close: string;
  empty: string;
  // The label of an entry's remove button; {date} is replaced.
  removeComment: string;
  // The label of an entry's edit button; {date} is replaced.
  editComment: string;
  edit: string;
  save: string;
  cancel: string;
  footprints: string;
  // The activities import action's label (FR-76), or null on the card.
  importActivities: string | null;

}

export interface DetailHandlers {
  close(): void;
  // The series groups' opening and closing, and the Economics action.
  toggleSeries?(role: string, open: boolean): void;
  openEconomics?(opener: HTMLElement): void;
  // The activities import (FR-76), present only when the details are
  // editable (never on the viewer's card).
  importActivities?(opener: HTMLElement): void;
  // Present only when the details are editable.
  edit?: {
    renderField(field: DetailField): HTMLElement;
    removeComment(id: string): void;
    // Changes an entry's text (FR-15 as amended in v1.3.0).
    editComment(id: string, text: string): void;
    // The controls that append a comment, below the entries.
    commentForm(): HTMLElement;
  };
}

// The footprints as a short list; nothing when the item has none.
function footprintList(model: DetailModel, heading: string, className: string): HTMLElement | null {
  if (model.footprints.length === 0) return null;
  const section = el('section', className);
  section.appendChild(el('h3', 'details-subheading', heading));
  const list = el('ul', 'footprint-list');
  for (const footprint of model.footprints) {
    const li = el('li', 'footprint');
    li.dataset.annotationId = footprint.id;
    li.appendChild(el('span', 'footprint-name', footprint.name));
    if (footprint.area !== null) li.appendChild(el('span', 'footprint-area', footprint.area));
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

// The edit date of an edited comment, beside its creation date (FR-15).
function editedMark(comment: DetailComment): HTMLElement {
  const mark = el('time', 'details-comment-edited', comment.editedText);
  mark.setAttribute('datetime', comment.edited!);
  return mark;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderDetails(container: HTMLElement, model: DetailModel, labels: DetailLabels, handlers: DetailHandlers): void {
  container.replaceChildren();
  container.dataset.rowId = model.rowId;
  const header = el('div', 'details-header');
  const badge = el('span', `marker-badge marker-${model.colour} ${symbolClasses(model.symbol)} details-badge`);
  drawSymbol(badge, model.symbol, model.number);
  const title = el('h2', 'details-title', model.name);
  title.id = `${container.id}-title`;
  container.setAttribute('aria-labelledby', title.id);
  const close = el('button', 'details-close icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', labels.close);
  close.title = labels.close;
  close.addEventListener('click', () => handlers.close());
  header.append(badge, title, close);

  const facts = el('dl', 'details-facts');
  const fact = (label: string, value: string, cls: string) => {
    const dt = el('dt', undefined, label);
    const dd = el('dd', cls, value);
    facts.append(dt, dd);
  };
  fact(labels.number, model.number, 'details-number');
  fact(labels.colour, model.colourName, 'details-colour');
  fact(labels.symbol, model.symbolName, 'details-symbol');

  const fields = el('dl', 'details-fields');
  // A series' columns go into its group, placed where its first column
  // would be; the year values stay editable inside it.
  const groupOf = new Map<string, DetailSeriesGroup>();
  for (const group of model.seriesGroups) for (const key of group.keys) groupOf.set(key, group);
  const groupLists = new Map<DetailSeriesGroup, HTMLElement>();
  for (const field of model.fields) {
    const group = groupOf.get(field.key);
    let target: HTMLElement = fields;
    if (group) {
      let inner = groupLists.get(group);
      if (!inner) {
        const wrapper = el('div', 'details-field details-series');
        wrapper.dataset.role = group.role;
        const box = el('details', 'details-series-group');
        box.open = group.open;
        box.addEventListener('toggle', () => handlers.toggleSeries?.(group.role, box.open));
        box.appendChild(el('summary', 'details-series-summary', group.label));
        inner = el('dl', 'details-series-fields');
        box.appendChild(inner);
        wrapper.appendChild(box);
        fields.appendChild(wrapper);
        groupLists.set(group, inner);
      }
      target = inner;
    }
    const dt = el('dt', 'details-label', field.label);
    const dd = el('dd', 'details-value');
    dd.dataset.header = field.key;
    if (handlers.edit) {
      dd.appendChild(handlers.edit.renderField(field));
    } else {
      dd.textContent = field.value === '' ? labels.empty : field.value;
      if (field.value === '') dd.classList.add('is-empty');
    }
    // Each field in its own wrapper, so that the panel can lay the fields out
    // in a grid (FR-42); on the presentation card the wrapper takes no part
    // in the layout.
    const wrapper = el('div', 'details-field');
    wrapper.append(dt, dd);
    target.appendChild(wrapper);
  }
  if (model.economics !== null && handlers.openEconomics) {
    const open = handlers.openEconomics;
    const action = el('button', 'details-economics', model.economics);
    action.type = 'button';
    action.addEventListener('click', () => open(action));
    const wrapper = el('div', 'details-field details-economics-row');
    wrapper.appendChild(action);
    fields.appendChild(wrapper);
  }
  if (labels.importActivities !== null && handlers.importActivities) {
    const open = handlers.importActivities;
    const action = el('button', 'details-economics', labels.importActivities);
    action.type = 'button';
    action.addEventListener('click', () => open(action));
    const wrapper = el('div', 'details-field details-economics-row');
    wrapper.appendChild(action);
    fields.appendChild(wrapper);
  }

  const commentsSection = el('section', 'details-comments');
  const commentsHeading = el('h3', 'details-subheading', labels.comments);
  const list = el('ul', 'details-comment-list');
  for (const comment of model.comments) {
    const li = el('li', 'details-comment');
    li.dataset.commentId = comment.id;
    const time = el('time', 'details-comment-date', comment.dateText);
    time.setAttribute('datetime', comment.date);
    const text = el('p', 'details-comment-text', comment.text);
    li.append(time);
    if (comment.editedText) li.appendChild(editedMark(comment));
    li.appendChild(text);
    if (handlers.edit) {
      const edit = handlers.edit;
      const editButton = el('button', 'details-comment-edit', labels.edit);
      editButton.type = 'button';
      editButton.setAttribute('aria-label', labels.editComment.replace('{date}', comment.dateText));
      // Editing happens in place: the text becomes a field with Save and
      // Cancel.
      editButton.addEventListener('click', () => {
        const field = el('textarea', 'details-comment-editor');
        field.rows = 3;
        field.value = comment.text;
        field.setAttribute('aria-label', labels.editComment.replace('{date}', comment.dateText));
        const save = el('button', 'details-comment-save', labels.save);
        save.type = 'button';
        const cancel = el('button', 'details-comment-cancel', labels.cancel);
        cancel.type = 'button';
        const form = el('div', 'details-comment-edit-form');
        form.append(field, save, cancel);
        save.addEventListener('click', () => edit.editComment(comment.id, field.value));
        cancel.addEventListener('click', () => {
          form.replaceWith(text);
          editButton.hidden = false;
          editButton.focus();
        });
        field.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            edit.editComment(comment.id, field.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel.click();
          }
        });
        text.replaceWith(form);
        editButton.hidden = true;
        field.focus();
      });
      const remove = el('button', 'details-comment-remove icon-button', '×');
      remove.type = 'button';
      const label = labels.removeComment.replace('{date}', comment.dateText);
      remove.setAttribute('aria-label', label);
      remove.title = label;
      remove.addEventListener('click', () => edit.removeComment(comment.id));
      li.append(editButton, remove);
    }
    list.appendChild(li);
  }
  if (model.comments.length === 0) list.appendChild(el('li', 'details-no-comments notice', labels.noComments));
  commentsSection.append(commentsHeading, list);
  if (handlers.edit) commentsSection.appendChild(handlers.edit.commentForm());

  container.append(header, facts, fields);
  const footprints = footprintList(model, labels.footprints, 'details-footprints');
  if (footprints) container.appendChild(footprints);
  container.appendChild(commentsSection);
}

// The presentation data card (FR-35, FR-37 as amended in v1.1.0): the name in
// the header; the note and the comments first, as the headliners; then the
// structured fields in a compact aligned grid. No number, colour, or symbol
// lines (the marker shows them) and no line repeating the name; the item's
// footprints last (FR-48); sections without content are left out.
export function renderCard(
  container: HTMLElement,
  model: DetailModel,
  labels: { comments: string; close: string; fields: string; footprints: string; noData: string },
  close: () => void,
  // The Economics action (FR-64), for an item that has economics.
  economics: { label: string; open: (opener: HTMLElement) => void } | null = null,
): void {
  container.replaceChildren();
  container.dataset.rowId = model.rowId;
  const header = el('div', 'details-header card-header');
  const title = el('h2', 'details-title', model.name);
  title.id = `${container.id}-title`;
  container.setAttribute('aria-labelledby', title.id);
  const closeButton = el('button', 'details-close icon-button', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', labels.close);
  closeButton.title = labels.close;
  closeButton.addEventListener('click', () => close());
  header.append(title, closeButton);
  container.appendChild(header);

  const headliners = el('div', 'card-headliners');
  if (model.note.trim() !== '') headliners.appendChild(el('p', 'card-note', model.note.trim()));
  if (model.comments.length > 0) {
    const section = el('section', 'details-comments card-comments');
    section.setAttribute('aria-label', labels.comments);
    const list = el('ul', 'details-comment-list');
    for (const comment of model.comments) {
      const li = el('li', 'details-comment');
      li.dataset.commentId = comment.id;
      const time = el('time', 'details-comment-date', comment.dateText);
      time.setAttribute('datetime', comment.date);
      li.append(time);
      if (comment.editedText) li.appendChild(editedMark(comment));
      li.appendChild(el('p', 'details-comment-text', comment.text));
      list.appendChild(li);
    }
    section.appendChild(list);
    headliners.appendChild(section);
  }
  if (headliners.childElementCount > 0) container.appendChild(headliners);

  if (model.cardFields.length > 0) {
    const grid = el('dl', 'card-fields');
    grid.setAttribute('aria-label', labels.fields);
    for (const field of model.cardFields) {
      const wrapper = el('div', 'card-field');
      // A chosen field without a value says so (FR-62).
      const dd = field.value === '' ? el('dd', 'card-value is-empty', '–') : el('dd', 'card-value', field.value);
      if (field.value === '') dd.setAttribute('aria-label', labels.noData);
      dd.dataset.header = field.key;
      wrapper.append(el('dt', 'card-label', field.label), dd);
      grid.appendChild(wrapper);
    }
    container.appendChild(grid);
  }
  const footprints = footprintList(model, labels.footprints, 'card-footprints');
  if (footprints) container.appendChild(footprints);
  if (economics) {
    const action = el('button', 'card-economics', economics.label);
    action.type = 'button';
    action.addEventListener('click', () => economics.open(action));
    container.appendChild(action);
  }
}
