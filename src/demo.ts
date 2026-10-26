// Full-test demo (FR-41). The demo is example data: generic, fictional
// fixtures from example-data, bundled into the build only as the demo's data
// and loaded through the application's normal paths (the spreadsheet import,
// which reads the demo list as CSV text, the saved column preset, the .osm
// background). Nothing here is used by the
// application's logic for any other data.
//
// The scenario file adds what the list cannot hold: the preset (with the
// area and status vocabularies), the status-to-symbol toggle, and per item its
// colour, marker position (as fractions of the background's width and
// height, so that it does not depend on the rendered size), manually chosen
// symbol, and comments. Version 2 (v1.1.0) adds the colour labels, the
// at-a-glance columns, and the annotations (their points also as fractions,
// a footprint linked by the identifier value of its item).

import listText from '../example-data/demo.csv?raw';
import scenarioJson from '../example-data/demo-scenario.json';
import mapText from '../example-data/example-map.osm?raw';
import { COLOURS, type RowColour } from './dataset';
import { parsePresets, type ColumnPreset } from './presets';
import { isSymbol, type MarkerSymbol } from './symbols';
import { isCommentDate } from './comments';
import { ANNOTATION_KINDS, LINE_STYLES, OUTLINES, type AnnotationKind, type LineStyle, type Outline } from './annotations';

export const DEMO_MAP_TEXT: string = mapText;

export interface DemoItem {
  // The value of the identifier column.
  item: string;
  colour: RowColour;
  position: [number, number] | null;
  symbol: MarkerSymbol | null;
  comments: Array<{ date: string; text: string }>;
}

export interface DemoAnnotation {
  kind: AnnotationKind;
  points: Array<[number, number]>;
  colour: RowColour;
  fillOpacity: number;
  outline: Outline;
  lineStyle: LineStyle;
  label: string;
  // The identifier value of the item it is the footprint of, or null.
  link: string | null;
}

export interface DemoScenario {
  preset: ColumnPreset;
  symbolsFromStatus: boolean;
  colourLabels: Partial<Record<RowColour, string>>;
  glanceColumns: string[];
  items: DemoItem[];
  annotations: DemoAnnotation[];
}

type Json = Record<string, unknown>;

function fraction(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

// Validates the scenario; a fixture that does not hold is a build defect, so
// it throws rather than loading part of the demo.
export function parseDemoScenario(raw: unknown): DemoScenario {
  const fail = (what: string): never => {
    throw new Error(`demo scenario: ${what}`);
  };
  if (typeof raw !== 'object' || raw === null) return fail('not an object');
  const o = raw as Json;
  if (o.format !== 'mapvibes-demo' || o.version !== 2) fail('format');
  const presets = parsePresets([o.preset]);
  if (presets === null || presets.length !== 1) return fail('preset');
  const preset = presets[0];
  if (preset.roles.identifier === undefined) fail('the preset assigns no identifier');
  if (typeof o.symbolsFromStatus !== 'boolean') fail('symbolsFromStatus');
  if (!Array.isArray(o.items)) return fail('items');
  const items = o.items.map((entry, i): DemoItem => {
    const it = entry as Json;
    if (typeof it.item !== 'string' || it.item === '') fail(`items[${i}].item`);
    if (!COLOURS.includes(it.colour as RowColour)) fail(`items[${i}].colour`);
    const position = it.position;
    if (position !== null && !(Array.isArray(position) && position.length === 2 && position.every(fraction))) fail(`items[${i}].position`);
    if (it.symbol !== null && !isSymbol(it.symbol)) fail(`items[${i}].symbol`);
    if (!Array.isArray(it.comments)) fail(`items[${i}].comments`);
    const comments = (it.comments as Json[]).map((c, j) => {
      if (!isCommentDate(c.date) || typeof c.text !== 'string' || c.text.trim() === '') fail(`items[${i}].comments[${j}]`);
      return { date: c.date as string, text: c.text as string };
    });
    return {
      item: it.item as string,
      colour: it.colour as RowColour,
      position: position === null ? null : [(position as number[])[0], (position as number[])[1]],
      symbol: (it.symbol as MarkerSymbol | null) ?? null,
      comments,
    };
  });
  if (new Set(items.map((i) => i.item)).size !== items.length) fail('repeated items');
  const labels = o.colourLabels;
  if (typeof labels !== 'object' || labels === null) return fail('colourLabels');
  const colourLabels: Partial<Record<RowColour, string>> = {};
  for (const [colour, label] of Object.entries(labels as Json)) {
    if (!COLOURS.includes(colour as RowColour) || typeof label !== 'string' || label.trim() === '') fail(`colourLabels.${colour}`);
    colourLabels[colour as RowColour] = label as string;
  }
  const glance = o.glanceColumns;
  if (!Array.isArray(glance) || glance.some((h) => !preset.headers.includes(h as string))) return fail('glanceColumns');
  if (!Array.isArray(o.annotations)) return fail('annotations');
  const annotations = o.annotations.map((entry, i): DemoAnnotation => {
    const a = entry as Json;
    const kind = a.kind as AnnotationKind;
    if (!ANNOTATION_KINDS.includes(kind)) fail(`annotations[${i}].kind`);
    const points = a.points;
    const count = Array.isArray(points) ? points.length : 0;
    const counted = kind === 'rectangle' || kind === 'circle' ? count === 2 : count >= (kind === 'polygon' ? 3 : 2);
    if (!counted || !(points as unknown[]).every((p) => Array.isArray(p) && p.length === 2 && p.every(fraction))) fail(`annotations[${i}].points`);
    if (!COLOURS.includes(a.colour as RowColour)) fail(`annotations[${i}].colour`);
    if (!(typeof a.fillOpacity === 'number' && a.fillOpacity >= 0 && a.fillOpacity <= 1)) fail(`annotations[${i}].fillOpacity`);
    if (!OUTLINES.includes(a.outline as Outline)) fail(`annotations[${i}].outline`);
    if (!LINE_STYLES.includes(a.lineStyle as LineStyle)) fail(`annotations[${i}].lineStyle`);
    if (typeof a.label !== 'string') fail(`annotations[${i}].label`);
    if (a.link !== null && !items.some((it) => it.item === a.link)) fail(`annotations[${i}].link`);
    return {
      kind,
      points: (points as number[][]).map((p) => [p[0], p[1]]),
      colour: a.colour as RowColour,
      fillOpacity: a.fillOpacity as number,
      outline: a.outline as Outline,
      lineStyle: a.lineStyle as LineStyle,
      label: a.label as string,
      link: (a.link as string | null) ?? null,
    };
  });
  return { preset, symbolsFromStatus: o.symbolsFromStatus as boolean, colourLabels, glanceColumns: glance as string[], items, annotations };
}

export function demoScenario(): DemoScenario {
  return parseDemoScenario(scenarioJson);
}

// The demo list as the bytes of a spreadsheet file (CSV text), for the
// normal import.
export function demoWorkbook(): ArrayBuffer {
  return new TextEncoder().encode(listText).buffer as ArrayBuffer;
}
