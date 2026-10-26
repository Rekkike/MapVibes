// Draws an OpenStreetMap render plan onto a canvas and returns the image as
// a PNG data URL: the same kind of background as an image file or a PDF page.

import { AREA_CLASSES, LAND_COLOUR, OSM_STYLE, STYLE_REFERENCE_SIDE, type PlannedShape, type RenderPlan } from './osm';

function trace(ctx: CanvasRenderingContext2D, shape: PlannedShape): void {
  ctx.beginPath();
  shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (shape.closed) ctx.closePath();
}

// The attribution, when given, is drawn into the image itself, so that it
// travels with the background into the work state and any later export.
export function renderPlanToDataUrl(plan: RenderPlan, attribution?: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = LAND_COLOUR;
  ctx.fillRect(0, 0, plan.width, plan.height);
  // Line widths and dashes are given for a 1000-pixel map; they scale with
  // the image so that the map stays legible when fitted to the stage.
  const k = Math.max(plan.width, plan.height) / STYLE_REFERENCE_SIDE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const areas = plan.shapes.filter((s) => AREA_CLASSES.includes(s.feature));
  const lines = plan.shapes.filter((s) => !AREA_CLASSES.includes(s.feature));
  // Areas first: parks, water, buildings.
  for (const shape of areas) {
    const style = OSM_STYLE[shape.feature];
    trace(ctx, shape);
    if (style.fill && shape.closed) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.stroke && style.width) {
      ctx.setLineDash([]);
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width * k;
      ctx.stroke();
    }
  }
  // Then road casings, so that crossing roads join cleanly, then all lines.
  for (const shape of lines) {
    const style = OSM_STYLE[shape.feature];
    if (!style.casing || !style.width) continue;
    trace(ctx, shape);
    ctx.setLineDash([]);
    ctx.strokeStyle = style.casing;
    ctx.lineWidth = (style.width + 2) * k;
    ctx.stroke();
  }
  for (const shape of lines) {
    const style = OSM_STYLE[shape.feature];
    if (!style.stroke || !style.width) continue;
    trace(ctx, shape);
    ctx.setLineDash((style.dash ?? []).map((d) => d * k));
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.width * k;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (attribution) {
    const size = Math.max(12, Math.round(13 * k));
    ctx.font = `${size}px system-ui, sans-serif`;
    const pad = Math.round(size * 0.4);
    const width = ctx.measureText(attribution).width + pad * 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(plan.width - width, plan.height - size - pad * 2, width, size + pad * 2);
    ctx.fillStyle = '#333333';
    ctx.textBaseline = 'bottom';
    ctx.fillText(attribution, plan.width - width + pad, plan.height - pad);
  }
  return canvas.toDataURL('image/png');
}
