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
  footprints: string;
}

export interface DetailHandlers {
  close(): void;
  // Present only when the details are editable.
  edit?: {
    renderField(field: DetailField): HTMLElement;
    removeComment(id: string): void;
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
  for (const field of model.fields) {
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
    li.append(time, text);
    if (handlers.edit) {
      const edit = handlers.edit;
      const remove = el('button', 'details-comment-remove icon-button', '×');
      remove.type = 'button';
      const label = labels.removeComment.replace('{date}', comment.dateText);
      remove.setAttribute('aria-label', label);
      remove.title = label;
      remove.addEventListener('click', () => edit.removeComment(comment.id));
      li.appendChild(remove);
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
export function renderCard(container: HTMLElement, model: DetailModel, labels: { comments: string; close: string; fields: string; footprints: string }, close: () => void): void {
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
      li.append(time, el('p', 'details-comment-text', comment.text));
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
      const dd = el('dd', 'card-value', field.value);
      dd.dataset.header = field.key;
      wrapper.append(el('dt', 'card-label', field.label), dd);
      grid.appendChild(wrapper);
    }
    container.appendChild(grid);
  }
  const footprints = footprintList(model, labels.footprints, 'card-footprints');
  if (footprints) container.appendChild(footprints);
}
