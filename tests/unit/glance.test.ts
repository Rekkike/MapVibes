import { describe, expect, test } from 'vitest';
import { markersInView } from '../../src/glance';
import { panBy, zoomAt, type Viewport } from '../../src/viewport';

const stage = { width: 800, height: 600 };
const m = (id: string, x: number, y: number) => ({ id, position: { x, y } });
const all = [m('a', 0, 0), m('b', 400, 300), m('c', 1199, 799), m('d', 2000, 100), m('e', -5, 50)];

describe('viewport visibility (FR-28)', () => {
  test('at identity, the markers inside the stage are in view, edges included', () => {
    const v: Viewport = { scale: 1, x: 0, y: 0 };
    expect(markersInView(all, v, stage).map((x) => x.id)).toEqual(['a', 'b']);
    expect(markersInView([m('edge', 800, 600)], v, stage)).toHaveLength(1);
  });

  test('zooming out brings more markers into view; order is preserved', () => {
    const v: Viewport = { scale: 0.5, x: 0, y: 0 };
    expect(markersInView(all, v, stage).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('zooming in about a point keeps only the markers near it', () => {
    const v = zoomAt({ scale: 1, x: 0, y: 0 }, 4, { x: 400, y: 300 });
    expect(markersInView(all, v, stage).map((x) => x.id)).toEqual(['b']);
  });

  test('panning moves markers out of and into view', () => {
    const v = panBy({ scale: 1, x: 0, y: 0 }, -1300, 0);
    expect(markersInView(all, v, stage).map((x) => x.id)).toEqual(['d']);
    expect(markersInView(all, panBy(v, 1310, 0), stage).map((x) => x.id)).toEqual(['a', 'b', 'e']);
  });

  test('a stage without layout size shows nothing', () => {
    expect(markersInView(all, { scale: 1, x: 0, y: 0 }, { width: 0, height: 0 })).toEqual([]);
  });
});
