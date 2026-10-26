// Item details (FR-7, FR-10, FR-15, FR-35). One renderer serves the details
// panel (editable, in the Information and Map segments) and the presentation
// data card (view-only): both show the same complete item data.

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
  number: number;
  name: string;
  colour: RowColour;
  colourName: string;
  symbol: MarkerSymbol;
  symbolName: string;
  fields: DetailField[];
  comments: DetailComment[];
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
  drawSymbol(badge, model.symbol, String(model.number));
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
  fact(labels.number, String(model.number), 'details-number');
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
    fields.append(dt, dd);
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

  container.append(header, facts, fields, commentsSection);
}
