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
// a footprint linked by the identifier value of its item). Version 3
// (v1.3.1, FR-41 as amended) carries every text in both interface languages:
// the preset (its name, headers, roles, and vocabularies), the colour labels,
// the at-a-glance columns, the comment texts, and the annotation labels, with
// one demo list per language; the demo loads in the interface language. The
// vocabularies of the two languages correspond entry by entry, so that a
// provided label not renamed can follow a change of language.

import listText from '../example-data/demo.csv?raw';
import listTextSv from '../example-data/demo-sv.csv?raw';
import scenarioJson from '../example-data/demo-scenario.json';
import mapText from '../example-data/example-map.osm?raw';
import { COLOURS, type RowColour } from './dataset';
import { parsePresets, type ColumnPreset } from './presets';
import { isSymbol, type MarkerSymbol } from './symbols';
import { isCommentDate } from './comments';
import { ANNOTATION_KINDS, LINE_STYLES, OUTLINES, type AnnotationKind, type LineStyle, type Outline } from './annotations';
import type { Lang } from './i18n';

const LANGS: Lang[] = ['en', 'sv'];

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

// The scenario in both languages, as parsed.
export type DemoScenarios = Record<Lang, DemoScenario>;

// Validates the scenario; a fixture that does not hold is a build defect, so
// it throws rather than loading part of the demo.
export function parseDemoScenarios(raw: unknown): DemoScenarios {
  const fail = (what: string): never => {
    throw new Error(`demo scenario: ${what}`);
  };
  if (typeof raw !== 'object' || raw === null) return fail('not an object');
  const o = raw as Json;
  if (o.format !== 'mapvibes-demo' || o.version !== 3) fail('format');
  // A text in both languages, none empty unless allowed.
  const texts = (v: unknown, what: string, allowEmpty = false): Record<Lang, string> => {
    if (typeof v !== 'object' || v === null) return fail(what);
    const t = v as Json;
    for (const lang of LANGS) if (typeof t[lang] !== 'string' || (!allowEmpty && (t[lang] as string).trim() === '')) fail(`${what}.${lang}`);
    return { en: t.en as string, sv: t.sv as string };
  };
  const perLang = (v: unknown, what: string): Json => {
    if (typeof v !== 'object' || v === null) return fail(what);
    for (const lang of LANGS) if (!(lang in (v as Json))) fail(`${what}.${lang}`);
    return v as Json;
  };
  const presetsByLang = perLang(o.preset, 'preset');
  const presets = {} as Record<Lang, ColumnPreset>;
  for (const lang of LANGS) {
    const parsed = parsePresets([presetsByLang[lang]]);
    if (parsed === null || parsed.length !== 1) return fail(`preset.${lang}`);
    presets[lang] = parsed[0];
    if (presets[lang].roles.identifier === undefined) fail(`the preset (${lang}) assigns no identifier`);
  }
  // The two languages correspond entry by entry.
  const [en, sv] = [presets.en, presets.sv];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => (a?.length ?? 0) === (b?.length ?? 0);
  if (!same(en.headers, sv.headers) || !same(en.areas, sv.areas) || !same(en.programs, sv.programs) || !same(en.statuses, sv.statuses)) fail('the languages do not correspond');
  if ((en.statuses ?? []).some((s, i) => s.symbol !== sv.statuses![i].symbol)) fail('the status symbols differ between the languages');
  for (const [role, key] of Object.entries(en.roles)) if (sv.roles[role as keyof typeof sv.roles] !== sv.headers[en.headers.indexOf(key as string)]) fail(`the role ${role} differs between the languages`);
  if (typeof o.symbolsFromStatus !== 'boolean') fail('symbolsFromStatus');
  if (!Array.isArray(o.items)) return fail('items');
  const items = o.items.map((entry, i) => {
    const it = entry as Json;
    if (typeof it.item !== 'string' || it.item === '') fail(`items[${i}].item`);
    if (!COLOURS.includes(it.colour as RowColour)) fail(`items[${i}].colour`);
    const position = it.position;
    if (position !== null && !(Array.isArray(position) && position.length === 2 && position.every(fraction))) fail(`items[${i}].position`);
    if (it.symbol !== null && !isSymbol(it.symbol)) fail(`items[${i}].symbol`);
    if (!Array.isArray(it.comments)) fail(`items[${i}].comments`);
    const comments = (it.comments as Json[]).map((c, j) => {
      if (!isCommentDate(c.date)) fail(`items[${i}].comments[${j}]`);
      return { date: c.date as string, text: texts(c.text, `items[${i}].comments[${j}].text`) };
    });
    return {
      item: it.item as string,
      colour: it.colour as RowColour,
      position: position === null ? null : ([(position as number[])[0], (position as number[])[1]] as [number, number]),
      symbol: (it.symbol as MarkerSymbol | null) ?? null,
      comments,
    };
  });
  if (new Set(items.map((i) => i.item)).size !== items.length) fail('repeated items');
  const labelsByLang = perLang(o.colourLabels, 'colourLabels');
  const colourLabels = {} as Record<Lang, Partial<Record<RowColour, string>>>;
  for (const lang of LANGS) {
    const labels = labelsByLang[lang];
    if (typeof labels !== 'object' || labels === null) return fail(`colourLabels.${lang}`);
    colourLabels[lang] = {};
    for (const [colour, label] of Object.entries(labels as Json)) {
      if (!COLOURS.includes(colour as RowColour) || typeof label !== 'string' || label.trim() === '') fail(`colourLabels.${lang}.${colour}`);
      colourLabels[lang][colour as RowColour] = label as string;
    }
  }
  if (Object.keys(colourLabels.en).sort().join() !== Object.keys(colourLabels.sv).sort().join()) fail('the colour labels do not correspond');
  const glanceByLang = perLang(o.glanceColumns, 'glanceColumns');
  const glanceColumns = {} as Record<Lang, string[]>;
  for (const lang of LANGS) {
    const glance = glanceByLang[lang];
    if (!Array.isArray(glance) || glance.some((h) => !presets[lang].headers.includes(h as string))) return fail(`glanceColumns.${lang}`);
    glanceColumns[lang] = glance as string[];
  }
  if (!Array.isArray(o.annotations)) return fail('annotations');
  const annotations = o.annotations.map((entry, i) => {
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
    const label = texts(a.label, `annotations[${i}].label`, true);
    if (a.link !== null && !items.some((it) => it.item === a.link)) fail(`annotations[${i}].link`);
    return {
      kind,
      points: (points as number[][]).map((p) => [p[0], p[1]] as [number, number]),
      colour: a.colour as RowColour,
      fillOpacity: a.fillOpacity as number,
      outline: a.outline as Outline,
      lineStyle: a.lineStyle as LineStyle,
      label,
      link: (a.link as string | null) ?? null,
    };
  });
  const inLang = (lang: Lang): DemoScenario => ({
    preset: presets[lang],
    symbolsFromStatus: o.symbolsFromStatus as boolean,
    colourLabels: colourLabels[lang],
    glanceColumns: glanceColumns[lang],
    items: items.map((it) => ({ ...it, comments: it.comments.map((c) => ({ date: c.date, text: c.text[lang] })) })),
    annotations: annotations.map((a) => ({ ...a, label: a.label[lang] })),
  });
  return { en: inLang('en'), sv: inLang('sv') };
}

export function demoScenario(lang: Lang = 'en'): DemoScenario {
  return parseDemoScenarios(scenarioJson)[lang];
}

// The provided labels of the demo in one language and their counterparts in
// another (FR-41 as amended in v1.3.1): the colour labels by colour, the
// area, program, and status values by their place in the vocabulary, the
// annotation labels by their place in the scenario.
export interface DemoCounterparts {
  colourLabels: Array<{ colour: RowColour; from: string; to: string }>;
  areas: Array<[string, string]>;
  programs: Array<[string, string]>;
  statuses: Array<[string, string]>;
  annotationLabels: Array<[string, string]>;
}

export function demoCounterparts(from: Lang, to: Lang): DemoCounterparts {
  const scenarios = parseDemoScenarios(scenarioJson);
  const [a, b] = [scenarios[from], scenarios[to]];
  const pairs = (x: string[] = [], y: string[] = []) => x.map((v, i): [string, string] => [v, y[i]]);
  return {
    colourLabels: COLOURS.filter((c) => a.colourLabels[c] !== undefined).map((c) => ({ colour: c, from: a.colourLabels[c]!, to: b.colourLabels[c]! })),
    areas: pairs(a.preset.areas, b.preset.areas),
    programs: pairs(a.preset.programs, b.preset.programs),
    statuses: pairs(a.preset.statuses?.map((s) => s.name), b.preset.statuses?.map((s) => s.name)),
    annotationLabels: pairs(a.annotations.map((x) => x.label), b.annotations.map((x) => x.label)),
  };
}

// The demo list in a language as the bytes of a spreadsheet file (CSV text),
// for the normal import.
export function demoWorkbook(lang: Lang = 'en'): ArrayBuffer {
  // With the byte order mark, the spreadsheet reader reads the text as UTF-8
  // (without it, as a single-byte code page).
  return new TextEncoder().encode(`\uFEFF${lang === 'sv' ? listTextSv : listText}`).buffer as ArrayBuffer;
}
