// At-a-glance panel (FR-28): the items whose markers are currently inside
// the visible part of a stage.

import { imageToScreen, type Point, type Size, type Viewport } from './viewport';

// The markers whose position lies within the stage at the given viewport
// (edges included), in their given order.
export function markersInView<T extends { position: Point }>(markers: T[], viewport: Viewport, stage: Size): T[] {
  if (stage.width <= 0 || stage.height <= 0) return [];
  return markers.filter((m) => {
    const p = imageToScreen(viewport, m.position);
    return p.x >= 0 && p.y >= 0 && p.x <= stage.width && p.y <= stage.height;
  });
}
