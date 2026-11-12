import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// The token system (FR-29 as amended in v1.17.0): the values are those of the
// direction of record (docs/redesign/mockup.html), every pair the rule allows
// meets the raised bar in both themes, and every colour, size, spacing,
// radius, and layer in the stylesheet is drawn from the tokens.

const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
const mockup = readFileSync(join(process.cwd(), 'docs', 'redesign', 'mockup.html'), 'utf8');

function block(source: string, start: string): Record<string, string> {
  const from = source.indexOf(start);
  const body = source.slice(source.indexOf('{', from) + 1, source.indexOf('}', from));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const light = block(css, ':root {');
const dark = block(css, "html[data-theme='dark'] {");
const mockLight = block(mockup, ':root {');
const mockDark = block(mockup, ':root[data-theme="dark"] {');

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The stylesheet without its comments and without the two token blocks.
const rulesText = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/:root\s*\{[^}]*\}/, '')
  .replace(/html\[data-theme='dark'\]\s*\{[^}]*\}/, '');
const declarations = [...rulesText.matchAll(/(?:^|[\s;{])([\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
  property: m[1],
  value: m[2].trim().replace(/\s+/g, ' '),
}));

// The names of the stylesheet's tokens beside the mockup's.
const NAMES: Array<[string, string]> = [
  ['--bg', '--bg'],
  ['--panel', '--surface'],
  ['--surface-2', '--surface-2'],
  ['--fg', '--ink'],
  ['--muted', '--ink-2'],
  ['--border', '--line'],
  ['--control-line', '--control-line'],
  ['--accent', '--accent'],
  ['--on-accent', '--on-accent'],
  ['--accent-soft', '--accent-soft'],
  ['--marker-green', '--st-green'],
  ['--marker-blue', '--st-blue'],
  ['--marker-yellow', '--st-yellow'],
  ['--marker-red', '--st-red'],
  ['--marker-neutral', '--st-neutral'],
  ['--marker-text', '--st-on'],
  ['--marker-text-on-yellow', '--st-on-yellow'],
  ['--marker-ring', '--st-ring'],
  ['--marker-on-neutral', '--st-on'],
  ['--stage-bg', '--surface-2'],
  ['--input-bg', '--surface'],
];

const THEMES: Array<[string, Record<string, string>, Record<string, string>]> = [
  ['light', light, mockLight],
  ['dark', dark, mockDark],
];

describe('the token values (FR-29 as amended in v1.17.0)', () => {
  test('every colour is the value of the direction of record, in both themes', () => {
    for (const [name, theme, mock] of THEMES) {
      for (const [ours, theirs] of NAMES) {
        expect(theme[ours], `${name} ${ours}`).toBe(mock[theirs]);
      }
    }
  });

  test('the derived error and warning colours are recorded', () => {
    expect([light['--error'], light['--warning'], dark['--error'], dark['--warning']]).toEqual(['#a02020', '#774700', '#e49292', '#f0b45a']);
  });

  test('the six type sizes, the spacing scale, the radii, and the layers', () => {
    expect([12, 13, 14, 16, 20, 28].map((n) => light[`--text-${n}`])).toEqual(['0.75rem', '0.8125rem', '0.875rem', '1rem', '1.25rem', '1.75rem']);
    expect([2, 4, 8, 12, 16, 24, 32].map((n) => light[`--space-${n}`])).toEqual(['0.125rem', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem']);
    expect([light['--radius'], light['--radius-sm'], light['--radius-pill']]).toEqual(['8px', '4px', '999px']);
    // The layers name the stacking order, lowest first.
    const layers = Object.entries(light).filter(([k]) => k.startsWith('--layer-'));
    expect(layers.map(([k]) => k)).toEqual([
      '--layer-under',
      '--layer-raised',
      '--layer-selected',
      '--layer-dragging',
      '--layer-schedule',
      '--layer-card',
      '--layer-panel',
      '--layer-sheet',
      '--layer-inspector',
      '--layer-overlay',
      '--layer-dialog',
    ]);
    const values = layers.map(([, v]) => Number(v));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('the contrast of every token pair (FR-29 as amended in v1.17.0)', () => {
  // Text: 7:1. The primary text on every ground; the secondary text, the
  // selection colour as text, the error, and the warning on the ground, the
  // surface, and the input ground.
  const TEXT: Array<[string, string[]]> = [
    ['--fg', ['--bg', '--panel', '--surface-2', '--stage-bg', '--input-bg', '--accent-soft']],
    ['--muted', ['--bg', '--panel', '--input-bg']],
    ['--accent', ['--bg', '--panel', '--input-bg']],
    ['--error', ['--bg', '--panel', '--input-bg']],
    ['--warning', ['--bg', '--panel', '--input-bg']],
    ['--on-accent', ['--accent']],
  ];

  test('text meets 7:1 on every ground the rule allows, in both themes', () => {
    for (const [name, theme] of THEMES) {
      for (const [text, grounds] of TEXT) {
        for (const ground of grounds) {
          expect(contrast(theme[text], theme[ground]), `${name} ${text} on ${ground}`).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  test('control borders and focus rings meet 3:1 on every ground, in both themes', () => {
    for (const [name, theme] of THEMES) {
      for (const line of ['--control-line', '--accent']) {
        for (const ground of ['--bg', '--panel', '--surface-2', '--stage-bg', '--input-bg', '--accent-soft']) {
          expect(contrast(theme[line], theme[ground]), `${name} ${line} on ${ground}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  test('marker numbers keep their 4.5:1 floor, in both themes', () => {
    for (const [name, theme] of THEMES) {
      for (const colour of ['green', 'blue', 'red']) {
        expect(contrast(theme['--marker-text'], theme[`--marker-${colour}`]), `${name} ${colour}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(theme['--marker-text-on-yellow'], theme['--marker-yellow']), `${name} yellow`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme['--marker-on-neutral'], theme['--marker-neutral']), `${name} neutral`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The owner's ruling: the mockup's values stand although these four
  // combinations measure below 7:1; they are forbidden, not corrected.
  const FORBIDDEN_TEXT = ['--muted', '--accent'];
  const FORBIDDEN_GROUNDS = ['--surface-2', '--accent-soft', '--stage-bg'];

  test('the forbidden pairs measure below 7:1, which is why they are forbidden', () => {
    for (const [name, theme] of THEMES) {
      for (const text of FORBIDDEN_TEXT) {
        for (const ground of ['--surface-2', '--accent-soft']) {
          const ratio = contrast(theme[text], theme[ground]);
          expect(ratio, `${name} ${text} on ${ground}`).toBeLessThan(7);
          expect(ratio, `${name} ${text} on ${ground}`).toBeGreaterThanOrEqual(6.4);
        }
      }
    }
  });

  test('no rule sets secondary or selection-coloured text on a forbidden ground', () => {
    const rules = [...rulesText.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const [, selector, body] of rules) {
      const ground = FORBIDDEN_GROUNDS.find((g) => new RegExp(`background(-color)?:\\s*var\\(${g}\\)`).test(body));
      if (!ground) {
        continue;
      }
      for (const text of FORBIDDEN_TEXT) {
        expect(new RegExp(`(^|[\\s;])color:\\s*var\\(${text}\\)`).test(body), `${selector.trim()}: ${text} on ${ground}`).toBe(false);
      }
    }
  });
});

describe('everything is drawn from the tokens (FR-29 as amended in v1.17.0)', () => {
  test('no colour literal outside the two token blocks', () => {
    expect(rulesText.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(rulesText.match(/\b(rgba?|hsla?)\(/g)).toBeNull();
  });

  test('both themes are complete: every colour token of one is defined in the other', () => {
    const colour = (v: string) => /^#|rgba?\(/.test(v) || /rgba?\(/.test(v);
    const lightColours = Object.keys(light).filter((k) => colour(light[k]));
    expect(lightColours.length).toBeGreaterThan(20);
    for (const token of lightColours) {
      expect(dark[token], token).toBeDefined();
    }
    for (const token of Object.keys(dark)) {
      expect(light[token], token).toBeDefined();
    }
  });

  // The recorded exception: the schedule's smallest labels keep their sizes
  // until the layout pass re-rules the schedule's geometry.
  const SMALL = ['0.6rem', '0.625rem', '0.6875rem'];

  test('every font size is one of the six, the recorded exception aside', () => {
    const sizes = declarations.filter((d) => d.property === 'font-size').map((d) => d.value);
    expect(sizes.length).toBeGreaterThan(90);
    const allowed = /^(var\(--text-(12|13|14|16|20|28)\)|inherit|var\(--label-size, var\(--text-14\)\)|var\(--timeline-badge-font, var\(--text-13\)\))$/;
    const others = sizes.filter((v) => !allowed.test(v));
    expect(others.sort()).toEqual(['0.625rem', '0.6875rem', '0.6875rem', '0.6875rem', '0.6rem']);
    const badge = declarations.filter((d) => d.property === '--timeline-badge-font').map((d) => d.value);
    expect(badge).toEqual(['0.6875rem', '0.6875rem']);
    for (const v of [...others, ...badge]) {
      expect(SMALL).toContain(v);
    }
    // The font shorthand only inherits.
    expect(declarations.filter((d) => d.property === 'font').every((d) => d.value === 'inherit')).toBe(true);
  });

  test('every padding, margin, and gap is drawn from the spacing scale', () => {
    const spacing = declarations.filter((d) => /^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/.test(d.property));
    expect(spacing.length).toBeGreaterThan(350);
    const step = String.raw`var\(--space-(2|4|8|12|16|24|32)\)`;
    const part = new RegExp(`^(0|auto|inherit|${step}|calc\\(-1 \\* ${step}\\)|calc\\(-1 \\* var\\(--hairline\\)\\))$`);
    // Named dimensions and the one relative padding, each used where listed
    // and nowhere else.
    const DIMENSIONS: Record<string, number> = {
      'padding-right: var(--timeline-gutter, 0px)': 2,
      'padding-right: var(--timeline-control-room)': 1,
      'margin-left: calc(var(--timeline-point-size) / -2)': 1,
      'padding-right: calc(min(var(--details-width), 100vw - var(--space-32)) + var(--space-32))': 1,
      // The annotation label's padding follows its own size, which scales
      // with the map.
      'padding: 0 0.3em': 1,
    };
    const seen: Record<string, number> = {};
    for (const d of spacing) {
      const parts = d.value.match(/(?:[^\s()]+|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))+/g) ?? [];
      if (parts.every((p) => part.test(p))) {
        continue;
      }
      const key = `${d.property}: ${d.value}`;
      seen[key] = (seen[key] ?? 0) + 1;
    }
    expect(seen).toEqual(DIMENSIONS);
  });

  test('every radius is one of the two or the pill', () => {
    const radii = declarations.filter((d) => /^border(-[a-z]+)*-radius$/.test(d.property));
    expect(radii.length).toBeGreaterThan(60);
    for (const d of radii) {
      for (const p of d.value.split(' ')) {
        expect(['0', 'var(--radius)', 'var(--radius-sm)', 'var(--radius-pill)'], `${d.property}: ${d.value}`).toContain(p);
      }
    }
  });

  test('every z-index is a named layer', () => {
    const layers = declarations.filter((d) => d.property === 'z-index');
    expect(layers.length).toBeGreaterThan(10);
    for (const d of layers) {
      expect(d.value).toMatch(/^var\(--layer-[a-z]+\)$/);
      expect(light[d.value.slice(4, -1)], d.value).toBeDefined();
    }
  });
});

describe('the selection hue and its shape cue (FR-29 as amended in v1.17.0)', () => {
  test('a selected, pressed, or current state that wears the selection colour carries a fill, a ring, or an outline', () => {
    const rules = [...rulesText.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const states = /\[aria-selected='true'\]|\[aria-pressed='true'\]|\[data-selected='true'\]|\.selected\b|\.highlighted\b|\[data-role\]/;
    let checked = 0;
    for (const [, selector, body] of rules) {
      if (!states.test(selector) || !/var\(--accent\)/.test(body)) {
        continue;
      }
      checked += 1;
      const cue = /background(-color)?:\s*var\(--accent\)|box-shadow:[^;]*var\(--accent\)|outline:[^;]*var\(--accent\)|stroke:\s*var\(--accent\)/.test(body);
      expect(cue, selector.trim()).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  test('the native controls take the selection colour', () => {
    expect(rulesText).toMatch(/body \{[^}]*accent-color: var\(--accent\);/);
  });
});
