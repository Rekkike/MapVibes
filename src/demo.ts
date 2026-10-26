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
// symbol, and comments.

import listText from '../example-data/demo.csv?raw';
import scenarioJson from '../example-data/demo-scenario.json';
import mapText from '../example-data/example-map.osm?raw';
import { COLOURS, type RowColour } from './dataset';
import { parsePresets, type ColumnPreset } from './presets';
import { isSymbol, type MarkerSymbol } from './symbols';
import { isCommentDate } from './comments';

export const DEMO_MAP_TEXT: string = mapText;

export interface DemoItem {
  // The value of the identifier column.
  item: string;
  colour: RowColour;
  position: [number, number] | null;
  symbol: MarkerSymbol | null;
  comments: Array<{ date: string; text: string }>;
}

export interface DemoScenario {
  preset: ColumnPreset;
  symbolsFromStatus: boolean;
  items: DemoItem[];
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
  if (o.format !== 'mapvibes-demo' || o.version !== 1) fail('format');
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
  return { preset, symbolsFromStatus: o.symbolsFromStatus as boolean, items };
}

export function demoScenario(): DemoScenario {
  return parseDemoScenario(scenarioJson);
}

// The demo list as the bytes of a spreadsheet file (CSV text), for the
// normal import.
export function demoWorkbook(): ArrayBuffer {
  return new TextEncoder().encode(listText).buffer as ArrayBuffer;
}
