import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Presentation design bar (FR-37) and details typography (FR-7), pinned by
// assertions over the stylesheet.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = tokens(':root');
const dark = tokens("html[data-theme='dark']");

// The declarations of every rule (outside media queries) whose selector list
// names the selector, later rules winning.
function declarations(selector: string): Record<string, string> {
  const withoutMedia = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
  const out: Record<string, string> = {};
  for (const m of withoutMedia.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim().replace(/\s+/g, ' ');
  }
  return out;
}

function rem(value: string | undefined): number {
  // A size token resolves to its value in the token block.
  const token = /^var\((--[\w-]+)\)$/.exec(value ?? '');
  if (token) value = light[token[1]];
  const m = /^([\d.]+)rem$/.exec(value ?? '');
  if (!m) throw new Error(`not a rem size: ${value}`);
  return Number(m[1]);
}

function ms(value: string): number {
  const m = /^(\d+)ms$/.exec(value);
  if (!m) throw new Error(`not a duration: ${value}`);
  return Number(m[1]);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('presentation data card legibility (FR-37)', () => {
  const card = declarations('.presentation-card');

  test('the card is opaque: its own panel colour, never the map behind it', () => {
    expect(card.background).toBe('var(--panel)');
    expect(card.color).toBe('var(--fg)');
    expect(card.opacity).toBe('1');
    expect(card['backdrop-filter']).toBeUndefined();
    for (const theme of [light, dark]) expect(theme['--panel']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('its text keeps at least 4.5:1 contrast in both themes, whatever the background', () => {
    // The card's text sits on the card's own opaque colour, so the contrast
    // does not depend on the background image (also checked in a browser
    // over light and dark backgrounds; see the changelog).
    for (const theme of [light, dark]) {
      expect(contrast(theme['--fg'], theme['--panel'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme['--muted'], theme['--panel'])).toBeGreaterThanOrEqual(4.5);
    }
    // Labels, dates, and empty values use the muted colour; nothing else.
    for (const selector of ['.details-label', '.details-comment-date', '.details-value.is-empty']) {
      expect(declarations(selector).color).toBe('var(--muted)');
    }
  });

  test('the card stays within the stage and scrolls when its content is long', () => {
    expect(card.position).toBe('absolute');
    expect(card['max-height']).toBe('calc(100% - 2 * var(--space-3))');
    expect(card.overflow).toBe('auto');
  });
});

describe('projection typography (FR-37) and details typography (FR-7)', () => {
  test('the card is sized for reading at a distance', () => {
    expect(rem(declarations('.presentation-card .details-title')['font-size'])).toBeGreaterThanOrEqual(1.75);
    expect(rem(declarations('.presentation-card .details-value')['font-size'])).toBeGreaterThanOrEqual(1.25);
    expect(rem(declarations('.presentation-card .details-label')['font-size'])).toBeGreaterThanOrEqual(1);
    expect(rem(declarations('.presentation-card .details-comment-text')['font-size'])).toBeGreaterThanOrEqual(1.125);
    expect(rem(declarations('.presentation-card')['font-size'])).toBeGreaterThanOrEqual(1.125);
  });

  test('the Presentation segment text is larger than the editing segments', () => {
    expect(rem(declarations('#segment-presentation')['font-size'])).toBeGreaterThanOrEqual(1.125);
    expect(rem(declarations('#segment-presentation .glance-entry')['font-size'])).toBeGreaterThan(rem(declarations('.glance-entry')['font-size']));
    expect(rem(declarations('#segment-presentation .legend')['font-size'])).toBeGreaterThanOrEqual(1);
  });

  test('the details panel has a clear hierarchy: title, values, labels', () => {
    // The panel's dense sizes (FR-42) override the shared ones.
    const title = rem(declarations('.details-panel .details-title')['font-size']);
    const body = rem(declarations('.details-panel')['font-size']);
    const label = rem(declarations('.details-panel .details-label')['font-size']);
    expect(title).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(label);
    expect(label).toBeGreaterThanOrEqual(0.75);
    expect(declarations('.details-panel').background).toBe('var(--panel)');
    expect(declarations('.details-value')['overflow-wrap']).toBe('anywhere');
  });
});

describe('motion (FR-36, FR-37)', () => {
  test('the card enters and leaves with a short fade and lift', () => {
    const open = declarations('.presentation-card');
    const closed = declarations(".presentation-card[data-state='closed']");
    expect(closed.opacity).toBe('0');
    expect(closed.visibility).toBe('hidden');
    expect(closed['pointer-events']).toBe('none');
    expect(closed.transform).toMatch(/translateY\(.+\)/);
    expect(open.transform).toBe('none');
    for (const rule of [open, closed]) {
      expect(rule.transition).toContain('opacity var(--motion-quick)');
      expect(rule.transition).toContain('transform var(--motion-quick)');
    }
    // Hidden only once the exit has played.
    expect(closed.transition).toContain('visibility 0s linear var(--motion-quick)');
    expect(ms(light['--motion-quick'])).toBeGreaterThanOrEqual(100);
    expect(ms(light['--motion-quick'])).toBeLessThanOrEqual(250);
  });

  test('programmatic view changes ease on both stages; markers move with the background', () => {
    for (const selector of ['.stage.easing #map-content', '.stage.easing #presentation-content', '.stage.easing .marker']) {
      const t = declarations(selector).transition;
      expect(t, selector).toContain('transform var(--motion-view)');
    }
    expect(declarations('.stage.easing .marker').transition).toContain('left var(--motion-view)');
    expect(declarations('.stage.easing .marker').transition).toContain('top var(--motion-view)');
    expect(ms(light['--motion-view'])).toBeGreaterThanOrEqual(150);
    expect(ms(light['--motion-view'])).toBeLessThanOrEqual(400);
  });

  test('all motion is switched off for users who ask for reduced motion', () => {
    const media = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
    expect(media).not.toBeNull();
    for (const selector of ['.stage.easing #map-content', '.stage.easing #presentation-content', '.stage.easing .marker', '.presentation-card']) {
      expect(media![1]).toContain(selector);
    }
    expect(media![1]).toContain('transition: none');
  });
});
