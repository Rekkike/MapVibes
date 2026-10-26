import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE } from './harness';

// The content-first presentation card (FR-37 as amended in v1.1.0), pinned
// over the DOM and the stylesheet.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n|,\\s*)${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

function card(): HTMLElement {
  return byId('presentation-card');
}

function open(index: number): void {
  const marker = presentationMarkers()[index];
  const x = STAGE.left + parseFloat(marker.style.left);
  const y = STAGE.top + parseFloat(marker.style.top);
  pointer('pointerdown', marker, x, y);
  pointer('pointerup', marker, x, y);
}

async function setup(theme: 'light' | 'dark'): Promise<void> {
  await mountApp();
  const select = byId<HTMLSelectElement>('select-theme');
  select.value = theme;
  select.dispatchEvent(new Event('change'));
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
    [4, 760, 500],
  ]);
  byId('tab-information').click();
  setRole('Note', 'note');
  setRole('Group', 'area');
  setRole('Start', 'start');
  setRole('End', 'end');
  // A comment on A-01.
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
  byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!.value = 'The reason to click.';
  byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
  byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
  byId('tab-presentation').click();
  await flush();
}

for (const theme of ['light', 'dark'] as const) {
  describe(`content-first card (FR-37), ${theme} theme`, () => {
    beforeEach(async () => {
      await setup(theme);
    });

    test('it repeats nothing the marker or its header shows', () => {
      open(0);
      expect(card().querySelector('.details-badge')).toBeNull();
      expect(card().querySelector('.details-facts')).toBeNull();
      const text = card().textContent ?? '';
      for (const word of ['Number', 'Colour', 'Symbol', 'Green', 'Circle']) expect(text, word).not.toContain(word);
      // The name (here the identifier, as no name is given) appears once, in
      // the header.
      expect(card().querySelector('.details-title')!.textContent).toBe('A-01');
      expect(text.split('A-01').length - 1).toBe(1);
    });

    test('the note and the comments come first; the structured fields follow in a grid', () => {
      open(0);
      const order = [...card().children].map((c) => c.className);
      expect(order).toEqual(['details-header card-header', 'card-headliners', 'card-fields']);
      const headliners = [...card().querySelector('.card-headliners')!.children].map((c) => c.className);
      expect(headliners).toEqual(['card-note', 'details-comments card-comments']);
      expect(card().querySelector('.card-note')!.textContent).toBe('Alpha item');
      expect([...card().querySelectorAll('.card-fields .card-field')].map((f) => [f.querySelector('dt')!.textContent, f.querySelector('dd')!.textContent])).toEqual([
        ['Group', 'North'],
        ['Start', '2024-01-05'],
        ['End', '2024-02-01'],
      ]);
    });

    test('sections without content are left out', () => {
      // A-05: a note, no comments, no area, no start or end.
      open(2);
      expect([...card().children].map((c) => c.className)).toEqual(['details-header card-header', 'card-headliners']);
      expect([...card().querySelector('.card-headliners')!.children].map((c) => c.className)).toEqual(['card-note']);
    });
  });
}

describe('content-first card (FR-37): stylesheet', () => {
  test('the grid aligns labels and values in two columns', () => {
    expect(rule('.presentation-card .card-fields')).toMatch(/display: grid;/);
    expect(rule('.presentation-card .card-fields')).toMatch(/grid-template-columns: max-content minmax\(0, 1fr\);/);
    expect(rule('.presentation-card .card-field')).toMatch(/display: contents;/);
  });

  test('the type scale is compact with a 16 pixel floor', () => {
    const size = (selector: string) => Number(/font-size: ([\d.]+)rem;/.exec(rule(selector))![1]);
    expect(size('.presentation-card .details-title')).toBeLessThanOrEqual(1.5);
    for (const selector of ['.presentation-card', '.presentation-card .card-note', '.presentation-card .card-label', '.presentation-card .card-value', '.presentation-card .details-comment-text']) {
      expect(size(selector), selector).toBeGreaterThanOrEqual(1);
    }
  });

  test('the card stays opaque, so its contrast holds over any background', () => {
    expect(rule('.presentation-card')).toMatch(/background: var\(--panel\);/);
    expect(rule('.presentation-card')).toMatch(/opacity: 1;/);
  });
});
