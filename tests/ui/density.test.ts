import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, STAGE } from './harness';

// Information density (FR-42), pinned over the stylesheet and the DOM.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const root = tokens(':root');

const plain = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
const rules = [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map((x) => x.trim()),
  body: m[2],
}));

// The declarations for a selector, later rules winning.
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!rule.selectors.includes(selector)) continue;
    for (const d of rule.body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim().replace(/\s+/g, ' ');
  }
  return out;
}

// A length in rem, with tokens resolved; 0 is 0.
function rem(value: string): number {
  const token = /^var\((--[\w-]+)\)$/.exec(value);
  if (token) return rem(root[token[1]]);
  if (value === '0') return 0;
  const m = /^([\d.]+)rem$/.exec(value);
  if (!m) throw new Error(`not a rem length: ${value}`);
  return Number(m[1]);
}

const SPACING = ['padding', 'margin', 'gap', 'row-gap', 'column-gap', 'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom'];

// The operator's surfaces under the density amendment.
const DENSE = [
  '.details-panel',
  '.details-panel .details-header',
  '.details-panel .details-facts',
  '.details-panel .details-fields',
  '.details-panel .details-field',
  '.details-panel .details-comment-list',
  '.details-panel .details-comment',
  '.details-panel .details-comment-form',
  '.glance-list',
  '.glance-entry',
  '.glance-text',
  '#placement-area',
  '#map-glance',
  '#placement-list',
  '.placement-item',
  '#map-toolbar',
  '#export-panel',
  '#document-panel',
  '#role-help',
  '#compare-panel',
  '#compare-groups',
  '.compare-entry',
  '#fetch-panel',
  '#pdf-panel',
  // The surfaces added in v1.1.0: programme groups, the column picker, the
  // annotation toolbar and inspector, and the footprints in the panel.
  '.glance-group',
  '.glance-group-toggle',
  '.glance-group-list',
  '.glance-columns',
  '.glance-columns ul',
  '.glance-columns label',
  '#annotation-toolbar',
  '#annotation-tools',
  '#annotation-inspector',
  '.details-panel .details-footprints',
  '.details-panel .footprint-list',
];

describe('information density (FR-42): stylesheet', () => {
  test('the dense spacing scale is tight and the type stays legible', () => {
    expect(['--dense-1', '--dense-2', '--dense-3'].map((t) => rem(root[t]))).toEqual([0.125, 0.25, 0.5]);
    expect(rem(root['--dense-font'])).toBeGreaterThanOrEqual(0.875);
    expect(rem(root['--dense-label'])).toBeGreaterThanOrEqual(0.75);
    expect(Number(root['--dense-line'])).toBeLessThanOrEqual(1.4);
  });

  test('no gap, margin, or padding on a dense surface exceeds half a rem', () => {
    for (const selector of DENSE) {
      const d = declarations(selector);
      for (const property of SPACING) {
        if (!d[property]) continue;
        for (const part of d[property].split(' ')) expect(rem(part), `${selector} ${property}`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  test('every dense surface uses the dense scale', () => {
    for (const selector of DENSE) {
      const d = declarations(selector);
      const spacing = SPACING.filter((p) => d[p]).map((p) => d[p]);
      if (spacing.length === 0) continue;
      expect(spacing.join(' '), selector).toMatch(/var\(--dense-[123]\)|^0$/);
    }
  });

  test('the details panel lays its fields out in a grid of two columns at its width', () => {
    const fields = declarations('.details-panel .details-fields');
    const m = /^repeat\(auto-fill, minmax\(([\d.]+)rem, 1fr\)\)$/.exec(fields['grid-template-columns']);
    expect(m).not.toBeNull();
    const column = Number(m![1]);
    const gap = rem(fields.gap.split(' ')[1]);
    // The panel is 24 rem wide, less its padding on both sides.
    const width = 24 - 2 * rem(declarations('.details-panel').padding);
    expect(2 * column + gap).toBeLessThanOrEqual(width);
    expect(3 * column + 2 * gap).toBeGreaterThan(width);
    expect(declarations('.details-panel .details-field').display).toBe('flex');
    // The three facts share one row.
    expect(declarations('.details-panel .details-facts')['grid-template-columns']).toBe('repeat(3, max-content minmax(0, 1fr))');
  });

  test('the new operator surfaces set the dense type size (v1.1.0)', () => {
    for (const selector of ['.glance-columns', '#annotation-toolbar', '#annotation-inspector']) {
      expect(declarations(selector)['font-size'], selector).toBe('var(--dense-font)');
    }
    // A programme heading is one line; its entries are indented beneath it.
    expect(declarations('.glance-group-name')['white-space']).toBe('nowrap');
    expect(rem(declarations('.glance-group-list').padding.split(' ')[3])).toBeGreaterThan(0);
  });

  test('an at-a-glance entry is one line: the area beside the name', () => {
    expect(declarations('.glance-text')['flex-direction']).toBe('row');
    expect(declarations('.glance-area')['margin-left']).toBe('auto');
  });

  test('the presentation data card is the exception: no density rule applies to it', () => {
    for (const rule of rules) {
      const dense = /var\(--dense-/.test(rule.body);
      if (dense) for (const s of rule.selectors) expect(s, s).not.toContain('presentation-card');
    }
    // Its field wrappers take no part in its grid.
    expect(declarations('.presentation-card .card-field').display).toBe('contents');
    expect(rem(declarations('.presentation-card .details-title')['font-size'])).toBe(1.375);
    expect(rem(declarations('.presentation-card .card-value')['font-size'])).toBe(1);
  });
});

describe('information density (FR-42): DOM, in both themes', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
  });

  for (const theme of ['light', 'dark']) {
    test(`the panel and the card render each field as one label and one value (${theme})`, async () => {
      const select = byId<HTMLSelectElement>('select-theme');
      select.value = theme;
      select.dispatchEvent(new Event('change'));
      pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
      pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
      const fields = [...byId('details-panel').querySelectorAll('.details-fields > .details-field')];
      expect(fields).toHaveLength(5);
      expect(fields.every((f) => f.children.length === 2 && f.children[0].tagName === 'DT' && f.children[1].tagName === 'DD')).toBe(true);
      byId('tab-presentation').click();
      await flush();
      const marker = presentationMarkers()[0];
      pointer('pointerdown', marker, STAGE.left + 100, STAGE.top + 100);
      pointer('pointerup', marker, STAGE.left + 100, STAGE.top + 100);
      // The card lists the structured fields with values only; the identifier
      // is its header here, so the card has no field to list.
      const cardFields = [...byId('presentation-card').querySelectorAll('.card-fields > .card-field')];
      expect(cardFields).toHaveLength(0);
      expect(cardFields.every((f) => f.children.length === 2 && f.children[0].tagName === 'DT' && f.children[1].tagName === 'DD')).toBe(true);
      expect(document.documentElement.dataset.theme).toBe(theme);
    });
  }
});
