import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, importExampleWorkbook, loadExampleBackground, mountApp, pointer, STAGE } from './harness';

// The fitted view of the 1200 by 800 example background on the 800 by 600
// stage: scale 2/3, the image 33.3 pixels from the top. Stage points are
// converted to image coordinates with these.
const SCALE = 2 / 3;
const TOP = (600 - 800 * SCALE) / 2;
const img = (x: number, y: number) => [x / SCALE, (y - TOP) / SCALE];

function stage(): HTMLElement {
  return byId('map-stage');
}

function at(type: string, x: number, y: number): void {
  pointer(type, stage(), STAGE.left + x, STAGE.top + y);
}

function drag(from: [number, number], to: [number, number], steps = 3): void {
  at('pointerdown', ...from);
  for (let i = 1; i <= steps; i++) at('pointermove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  at('pointerup', ...to);
}

function click(x: number, y: number): void {
  at('pointerdown', x, y);
  at('pointerup', x, y);
}

function tool(name: string): void {
  document.querySelector<HTMLButtonElement>(`#annotation-tools [data-tool="${name}"]`)!.click();
}

function groups(id = 'map-annotations'): SVGGElement[] {
  return [...byId(id).querySelectorAll<SVGGElement>('g.annotation:not(.draft)')];
}

function key(k: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

describe('annotation drawing (FR-47)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
    byId('tab-map').click();
    await loadExampleBackground();
  });

  test('the toolbar offers the tools and the style controls; Select is active', () => {
    expect([...document.querySelectorAll('#annotation-tools .annotation-tool')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Select', 'true'],
      ['Rectangle', 'false'],
      ['Circle', 'false'],
      ['Polygon', 'false'],
      ['Line', 'false'],
    ]);
    expect([...byId<HTMLSelectElement>('annotation-colour').options].map((o) => o.textContent)).toEqual(['Green', 'Blue', 'Yellow', 'Red']);
    expect([...byId<HTMLSelectElement>('annotation-outline').options].map((o) => o.textContent)).toEqual(['Black', 'White']);
    expect([...byId<HTMLSelectElement>('annotation-line-style').options].map((o) => o.textContent)).toEqual(['Solid', 'Dotted', 'Dashed']);
    expect(byId('annotation-fill-value').textContent).toBe('30 %');
    expect(byId('annotation-hint').textContent).toBe('Choose a tool to draw on the map.');
  });

  test('a rectangle is drawn by dragging, in image coordinates, with the current style; drawing does not pan', () => {
    const before = byId('map-content').style.transform;
    tool('rectangle');
    expect(stage().dataset.tool).toBe('rectangle');
    expect(byId('annotation-hint').textContent).toBe('Drag on the map to draw a rectangle.');
    drag([100, 100], [300, 250]);
    expect(byId('map-content').style.transform).toBe(before);
    const [g] = groups();
    // The new annotation is selected.
    expect(g.getAttribute('class')).toBe('annotation annotation-rectangle colour-blue outline-black style-solid selected');
    const rect = g.querySelector('rect')!;
    const [x, y] = img(100, 100);
    const [x2, y2] = img(300, 250);
    expect(near(Number(rect.getAttribute('x')), x)).toBe(true);
    expect(near(Number(rect.getAttribute('y')), y)).toBe(true);
    expect(near(Number(rect.getAttribute('width')), x2 - x)).toBe(true);
    expect(near(Number(rect.getAttribute('height')), y2 - y)).toBe(true);
    expect(rect.getAttribute('fill-opacity')).toBe('0.3');
    expect(rect.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    // After drawing, the tool returns to Select; the work has changed.
    expect(document.querySelector('#annotation-tools [data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('a circle is drawn from its centre', () => {
    tool('circle');
    drag([400, 300], [460, 300]);
    const circle = groups()[0].querySelector('circle')!;
    const [cx, cy] = img(400, 300);
    expect(near(Number(circle.getAttribute('cx')), cx)).toBe(true);
    expect(near(Number(circle.getAttribute('cy')), cy)).toBe(true);
    expect(near(Number(circle.getAttribute('r')), 60 / SCALE)).toBe(true);
  });

  test('a tiny drag draws nothing', () => {
    tool('rectangle');
    drag([100, 100], [102, 140]);
    expect(groups()).toHaveLength(0);
  });

  test('the style controls set the colour, fill opacity, outline, and line style of what is drawn next', () => {
    const colour = byId<HTMLSelectElement>('annotation-colour');
    colour.value = 'red';
    colour.dispatchEvent(new Event('change'));
    const fill = byId<HTMLInputElement>('annotation-fill');
    fill.value = '60';
    fill.dispatchEvent(new Event('input'));
    const outline = byId<HTMLSelectElement>('annotation-outline');
    outline.value = 'white';
    outline.dispatchEvent(new Event('change'));
    const line = byId<HTMLSelectElement>('annotation-line-style');
    line.value = 'dashed';
    line.dispatchEvent(new Event('change'));
    expect(byId('annotation-fill-value').textContent).toBe('60 %');
    tool('rectangle');
    drag([100, 100], [200, 200]);
    tool('line');
    click(300, 100);
    click(400, 150);
    click(400, 150);
    const [shape, path] = groups();
    expect(shape.getAttribute('class')).toBe('annotation annotation-rectangle colour-red outline-white style-dashed');
    expect(shape.querySelector('rect')!.getAttribute('fill-opacity')).toBe('0.6');
    expect(path.getAttribute('class')).toBe('annotation annotation-line colour-red outline-white style-dashed selected');
    // A line is its colour over a casing in the outline colour, both dashed.
    expect([...path.querySelectorAll('polyline')].map((p) => [p.getAttribute('class'), p.getAttribute('stroke-dasharray')])).toEqual([
      ['annotation-casing', '10 7'],
      ['annotation-stroke', '10 7'],
    ]);
  });

  test('a polygon: a press at each corner, closed by a press near its first corner', () => {
    tool('polygon');
    click(100, 100);
    click(300, 100);
    // Before closing, the drawing shows as a preview with the snap ring.
    expect(byId('map-annotations').querySelector('.annotation-snap')).not.toBeNull();
    click(300, 300);
    click(105, 104);
    const polygon = groups()[0].querySelector('polygon')!;
    expect(polygon.getAttribute('points')!.split(' ')).toHaveLength(3);
    expect(byId('map-annotations').querySelector('.annotation-snap')).toBeNull();
  });

  test('a polygon drawn freehand by dragging, closed with Enter', () => {
    tool('polygon');
    drag([100, 100], [300, 100], 10);
    drag([300, 100], [300, 300], 10);
    key('Enter');
    const points = groups()[0].querySelector('polygon')!.getAttribute('points')!.split(' ');
    expect(points.length).toBeGreaterThan(10);
  });

  test('a line: points pressed in turn, finished on its last point; dotted', () => {
    const line = byId<HTMLSelectElement>('annotation-line-style');
    line.value = 'dotted';
    line.dispatchEvent(new Event('change'));
    tool('line');
    click(100, 500);
    click(300, 450);
    click(500, 500);
    click(502, 499);
    const g = groups()[0];
    expect(g.querySelectorAll('polyline')[1].getAttribute('points')!.split(' ')).toHaveLength(3);
    expect(g.querySelector('polyline')!.getAttribute('stroke-dasharray')).toBe('0 7');
  });

  test('Escape cancels a drawing; nothing is left', () => {
    tool('polygon');
    click(100, 100);
    click(300, 100);
    key('Escape');
    expect(byId('map-annotations').children).toHaveLength(0);
    expect(groups()).toHaveLength(0);
  });

  test('the Presentation stage shows the annotations view-only', async () => {
    tool('rectangle');
    drag([100, 100], [300, 250]);
    byId('tab-presentation').click();
    await flush();
    expect(groups('presentation-annotations')).toHaveLength(1);
    expect(document.getElementById('presentation-annotation-labels')).not.toBeNull();
    // No drawing tools exist there.
    expect(byId('segment-presentation').querySelector('#annotation-toolbar')).toBeNull();
    pointer('pointerdown', byId('presentation-stage'), STAGE.left + 400, STAGE.top + 400);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 400, STAGE.top + 400);
    expect(groups('presentation-annotations')).toHaveLength(1);
  });

  test('leaving the Map segment returns to Select', () => {
    tool('polygon');
    byId('tab-information').click();
    byId('tab-map').click();
    expect(document.querySelector('#annotation-tools [data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  test('the toolbar follows the language and the colour labels', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('annotation-heading').textContent).toBe('Rita');
    expect(document.querySelector('#annotation-tools [data-tool="polygon"]')!.textContent).toBe('Polygon');
    expect(byId('annotation-hint').textContent).toBe('Välj ett verktyg för att rita på kartan.');
    byId('tab-information').click();
    const label = document.querySelector<HTMLInputElement>('#colour-label-list input[data-colour="blue"]')!;
    label.value = 'Planerat';
    label.dispatchEvent(new Event('change'));
    expect([...byId<HTMLSelectElement>('annotation-colour').options].map((o) => o.textContent)[1]).toBe('Planerat');
  });
});

describe('annotation drawing without a background', () => {
  test('the drawing tools are disabled and say why', async () => {
    await mountApp();
    byId('tab-map').click();
    expect(document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="rectangle"]')!.disabled).toBe(true);
    expect(byId('annotation-hint').textContent).toBe('Load a background to annotate.');
  });
});

describe('annotation rendering in both themes (FR-47)', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return css.slice(start, css.indexOf('}', start));
  };

  test('the outline colours are black and white in both themes', () => {
    for (const theme of [':root', "html[data-theme='dark']"]) {
      expect(block(theme)).toContain('--outline-black: #000000;');
      expect(block(theme)).toContain('--outline-white: #ffffff;');
    }
  });

  test('fills and lines use the item colours; outlines keep their width at every zoom', () => {
    for (const c of ['green', 'blue', 'yellow', 'red']) {
      expect(css).toContain(`.annotation.colour-${c} .annotation-shape { fill: var(--marker-${c}); }`);
      expect(css).toContain(`.annotation.colour-${c} .annotation-stroke { stroke: var(--marker-${c}); }`);
    }
    expect(css).toMatch(/\.annotation-layer \{[^}]*pointer-events: none;/);
  });

  test('labels read with black-on-white or white-on-black contrast', () => {
    expect(css).toMatch(/\.annotation-label\.outline-white \{[^}]*background: var\(--outline-white\);[^}]*color: var\(--outline-black\);/);
    expect(css).toMatch(/\.annotation-label\.outline-black \{[^}]*background: var\(--outline-black\);[^}]*color: var\(--outline-white\);/);
  });
});
