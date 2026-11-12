// The documents (PDF and PowerPoint): preparing the pages and the export
// dialog.
import { listColumnOrder } from './roles';
import { strings, type Strings } from './i18n';
import { legendModel } from './legend';
import {
  buildPdf,
  buildPptxDocument,
  PDF_PAGE,
  PPTX_PAGE,
  pptxTables,
  sceneFromStage,
  type DocumentExtraPage,
  type DocumentTable,
  type PageFrame,
  type PptxImage,
  type StageScene,
} from './documents';
import { drawTimelinePage, layoutTimeline, type FigureItem, type TimelineFigure } from './documenttimeline';
import { drawEconomicsPage, economicsBlock, layoutEconomics, type EconomicsBlock, type EconomicsPageLabels } from './documenteconomics';
import { backgroundJpeg, pagePng, stagePagePng } from './raster';
import { DEFAULT_SHAPE, placedMarkers } from './markers';
import { buildTimeline, fitWindow } from './timeline';
import { formatDate, readDate } from './dates';
import { todayDay } from './clock';
import { SERIES_ROLES } from './economics';
import {
  colourLabels,
  effectiveSeries,
  effectiveSymbols,
  hideDialog,
  itemLabel,
  itemSpan,
  labelOf,
  numbered,
  presentationLegendUse,
  presentationView,
  scheduleEvents,
  showDialog,
  shownProgramGroups,
  symbolLabels,
  timelineItems,
} from './main';
import { el, fill, rowById, state } from './appstate';
import { PDF_FILE, PPTX_FILE, writeFile } from './workfile';
import { formatSize } from './exportdialog';
import { workPhaseOf } from './activitydialog';
import { annotationShown, areaLocale } from './annotationpanel';

// Document exports (FR-12, FR-50 to FR-52): the visible presentation stage
// and the table of the shown items, as a PDF or a PowerPoint document. The
// file is prepared
// when the dialog opens, so that the dialog states what the file holds and
// its size before it is written.
type DocumentKind = 'pdf' | 'pptx';
type DocumentMessage = 'preparing' | 'done' | 'cancelled' | 'failed' | 'unavailable';

interface PreparedDocument {
  kind: DocumentKind;
  bytes: Uint8Array;
  scene: StageScene;
  table: DocumentTable;
  pages: number;
  columnGroups: number;
  replaced: number;
  // The timeline pages and the economics blocks between the stage page and
  // the table pages (FR-12 as amended in the documents' chapter).
  timelinePages: number;
  economicsPages: number;
  economicsItems: number;
}

let documentKind: DocumentKind | null = null;
let preparedDocument: PreparedDocument | null = null;
let documentMessage: DocumentMessage | null = null;
// Each preparation has its own token, so that a late result of an earlier
// preparation is ignored.
let documentToken = 0;

function documentLocale(): string {
  return state.prefs.lang === 'sv' ? 'sv-SE' : 'en-GB';
}

// The shown items: the rows not removed and not switched off, in their
// number order; the columns shown in the list, in its order, after the
// number.
export function documentTable(): DocumentTable {
  const t = strings(state.prefs.lang);
  // The assigned series columns are carried by the economics blocks, not by
  // the table (FR-12 as amended in the documents' chapter, the explicit reversal of Pass
  // 15's ruling D9).
  const series = effectiveSeries();
  const inSeries = new Set(
    SERIES_ROLES.flatMap((r) => (series[r] ? [...Object.values(series[r].columns), ...(series[r].total ? [series[r].total] : [])] : [])),
  );
  const columns = listColumnOrder(state.headers, state.roles).filter((h) => !state.hiddenHeaders.has(h) && !inSeries.has(h));
  const rows = numbered()
    .filter((n) => !state.excluded.has(n.row))
    .map((n) => [n.label, ...columns.map((key) => (n.row.values[key] ?? '').trim())]);
  return { headings: [t.documentNumber, ...columns.map(labelOf)], rows };
}

export function documentScene(): StageScene | null {
  const view = presentationView;
  const bg = view?.background;
  if (!view || !bg) {
    return null;
  }
  const t = strings(state.prefs.lang);
  const markers = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered())
    .filter((m) => !state.excluded.has(m.row))
    .map((m) => ({ position: m.position, symbol: m.shape, colour: m.colour, label: m.label }));
  return sceneFromStage({
    viewport: view.viewport,
    stage: view.stageSize(),
    background: { width: bg.width, height: bg.height },
    markers,
    annotations: state.annotations.filter((a) => annotationShown(a)),
    legendTitle: t.legend,
    // The stage page's legend is used-only, as the Presentation segment's is
    // (FR-75 as amended in the documents' chapter).
    legend: legendModel(t, state.statuses, shownProgramGroups(), colourLabels(), symbolLabels(), presentationLegendUse()),
  });
}

// Whether any shown item has a work phase that is drawn (FR-75 as amended
// in the documents' chapter): the timeline pages of the documents carry the
// phase entry then.
function documentPhaseShown(): boolean {
  return state.rows.some((row) => {
    if (state.excluded.has(row)) {
      return false;
    }
    const id = workPhaseOf(row);
    const activity = id === undefined ? undefined : state.activities.get(row)!.find((a) => a.id === id);
    return activity !== undefined && readDate(activity.start).kind === 'date' && readDate(activity.end).kind === 'date';
  });
}

// The timeline figure of the documents (FR-12 as amended in the documents' chapter): the
// shown items' schedule at the fitted window, with the used-only legend and
// the work-phase entry. Null when no item is shown.
function documentFigure(): TimelineFigure | null {
  const t = strings(state.prefs.lang);
  const { start, end } = state.roles;
  const symbols = effectiveSymbols();
  const items: FigureItem[] = timelineItems().map((item) => ({ ...item, symbol: symbols.get(rowById(item.id)!) ?? DEFAULT_SHAPE }));
  if (items.length === 0) {
    return null;
  }
  return {
    model: buildTimeline(items, state.presentationOrder, state.areaValues, areaLocale()),
    events: scheduleEvents(),
    // The export date (FR-12 as noted): the documents are made now.
    today: todayDay(),
    labels: {
      title: t.presentationViewTimeline,
      noDates: t.timelineNoDates,
      noArea: t.numberingNoArea,
      empty: t.timelineEmpty,
      noRoles: start === undefined && end === undefined ? t.timelineNoRoles : null,
      startOnly: t.timelineStartOnly,
      endOnly: t.timelineEndOnly,
      startHeader: start === undefined ? '' : labelOf(start),
      endHeader: end === undefined ? '' : labelOf(end),
      locale: areaLocale(),
      activities: t.timelineActivities,
      edited: t.activityEdited,
      workPhase: t.legendWorkPhase,
      events: t.eventPanel,
      moreEvents: t.eventsMore,
      eventsBefore: t.eventsBefore,
      eventsAfter: t.eventsAfter,
      today: t.todayMark,
    },
    legendTitle: t.legend,
    legend: legendModel(
      t,
      state.statuses,
      shownProgramGroups(),
      colourLabels(),
      symbolLabels(),
      presentationLegendUse(),
      undefined,
      documentPhaseShown(),
      documentToday(),
    ),
  };
}

// The documents' today entry (FR-12 as noted): the export date,
// shown when the timeline page draws its today line within the window.
function documentToday(): string | undefined {
  const day = todayDay();
  const items = timelineItems();
  const extent = buildTimeline(items).extent;
  if (extent === null) {
    return undefined;
  }
  const window = fitWindow(extent);
  if (day < window.from || day > window.to) {
    return undefined;
  }
  return formatDate({ kind: 'date', start: day, end: day, precision: 'day' });
}

// The economics blocks of the documents (FR-12 as amended in the documents' chapter, the
// explicit reversal of Pass 15's D9): every shown item with economics.
function documentEconomics(): { blocks: EconomicsBlock[]; labels: EconomicsPageLabels } {
  const t = strings(state.prefs.lang);
  const series = effectiveSeries();
  const outcome = series.outcome?.name ?? '';
  const forecast = series.forecast?.name ?? '';
  const blocks: EconomicsBlock[] = [];
  for (const n of numbered()) {
    if (state.excluded.has(n.row)) {
      continue;
    }
    const block = economicsBlock(n.label, itemLabel(n.row, n.label), n.row.values, series, itemSpan(n.row), state.currencyUnit);
    if (block) {
      blocks.push(block);
    }
  }
  return {
    blocks,
    labels: {
      title: t.economicsHeading,
      name: '',
      heading: t.economicsHeading,
      close: t.close,
      year: t.economicsYear,
      budget: series.budget?.name ?? '',
      outcome,
      forecast,
      track: outcome && forecast ? `${outcome} / ${forecast}` : outcome || forecast,
      outside: t.economicsOutside,
      noValue: t.economicsNoValue,
      sumBeside: t.economicsSumBeside,
      composition: t.economicsComposition,
      compositionOnly: t.economicsCompositionOnly,
      texts: t.economicsTexts,
      span: t.economicsSpan,
    },
  };
}

function documentTexts(t: Strings) {
  const date = new Intl.DateTimeFormat(documentLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  return {
    title: t.documentTitle,
    footer: fill(t.documentFooter, { version: __APP_VERSION__, date }),
    slideFooter: fill(t.documentSlideFooter, { version: __APP_VERSION__, date }),
    tableTitle: t.documentTableTitle,
    tableTitleParts: t.documentTableTitleParts,
  };
}

async function prepareDocument(kind: DocumentKind, scene: StageScene, table: DocumentTable): Promise<PreparedDocument | null> {
  const src = presentationView?.background?.src;
  if (!src) {
    return null;
  }
  const t = strings(state.prefs.lang);
  const texts = documentTexts(t);
  const fig = documentFigure();
  const { blocks, labels: econLabels } = documentEconomics();
  const fmt = { locale: areaLocale(), unit: state.currencyUnit };
  if (kind === 'pptx') {
    // The slide images at twice the slide's size in points: 1920 by 1080
    // pixels each — the stage, then the timeline pages, then the economics
    // blocks (FR-12 as amended in the documents' chapter).
    const frame: PageFrame = { width: PPTX_PAGE.width, height: PPTX_PAGE.height, margin: PPTX_PAGE.margin, footer: texts.slideFooter };
    const stage = await stagePagePng(scene, frame, 2, scene.background ? src : null);
    const images: PptxImage[] = [{ png: stage.png, description: t.documentImageDescription }];
    let timelinePages = 0;
    if (fig) {
      const layout = layoutTimeline(fig, frame);
      timelinePages = layout.pages.length;
      for (const rows of layout.pages) {
        const png = await pagePng(frame, 2, (p) => drawTimelinePage(p, fig, layout, rows, frame));
        images.push({ png: png.png, description: t.documentTimelineImageDescription });
      }
    }
    let economicsPages = 0;
    if (blocks.length > 0) {
      const layout = layoutEconomics(blocks, frame, econLabels, fmt);
      economicsPages = layout.pages.length;
      for (const page of layout.pages) {
        const png = await pagePng(frame, 2, (p) => drawEconomicsPage(p, blocks, econLabels, fmt, layout, page, frame));
        images.push({ png: png.png, description: t.documentEconomicsImageDescription });
      }
    }
    const tables = pptxTables(table, texts);
    const bytes = buildPptxDocument(images, tables, texts.title, documentLocale(), new Date());
    return {
      kind,
      bytes,
      scene,
      table,
      pages: images.length + tables.slides.length,
      columnGroups: tables.columnGroups,
      replaced: 0,
      timelinePages,
      economicsPages,
      economicsItems: blocks.length,
    };
  }
  const background = scene.background ? await backgroundJpeg(src, scene.background.image) : null;
  // The extra page kinds between the stage page and the table pages: the
  // timeline pages, then the economics blocks. The layout frame reserves the
  // footer's space, as the pages drawn into the document do.
  const frame: PageFrame = { width: PDF_PAGE.width, height: PDF_PAGE.height, margin: PDF_PAGE.margin, footer: 'footer' };
  const extras: DocumentExtraPage[] = [];
  let timelinePages = 0;
  if (fig) {
    const layout = layoutTimeline(fig, frame);
    timelinePages = layout.pages.length;
    for (const rows of layout.pages) {
      extras.push({ draw: (p, f) => drawTimelinePage(p, fig, layout, rows, f) });
    }
  }
  let economicsPages = 0;
  if (blocks.length > 0) {
    const layout = layoutEconomics(blocks, frame, econLabels, fmt);
    economicsPages = layout.pages.length;
    for (const page of layout.pages) {
      extras.push({ draw: (p, f) => drawEconomicsPage(p, blocks, econLabels, fmt, layout, page, f) });
    }
  }
  const pdf = buildPdf(scene, table, background, texts, new Date(), extras);
  return {
    kind,
    bytes: pdf.bytes,
    scene,
    table,
    pages: pdf.pages,
    columnGroups: pdf.columnGroups,
    replaced: pdf.replaced,
    timelinePages,
    economicsPages,
    economicsItems: blocks.length,
  };
}

export async function openDocumentDialog(kind: DocumentKind): Promise<void> {
  if (state.viewOnly) {
    return;
  }
  const token = ++documentToken;
  documentKind = kind;
  preparedDocument = null;
  if (!presentationView?.background) {
    documentMessage = 'unavailable';
    hideDialog('document-panel');
    renderDocument();
    return;
  }
  // The stage as it is in view, captured before the dialog opens above it
  // and narrows the stage.
  const scene = documentScene();
  const table = documentTable();
  documentMessage = 'preparing';
  showDialog('document-panel');
  renderDocument();
  let prepared: PreparedDocument | null = null;
  try {
    prepared = scene ? await prepareDocument(kind, scene, table) : null;
  } catch {
    prepared = null;
  }
  if (token !== documentToken) {
    return;
  }
  preparedDocument = prepared;
  documentMessage = prepared ? null : 'failed';
  if (!prepared) {
    hideDialog('document-panel');
  }
  renderDocument();
  if (prepared) {
    el('document-go').focus();
  }
}

export function closeDocumentDialog(): void {
  documentToken++;
  preparedDocument = null;
  hideDialog('document-panel');
  if (documentKind) {
    el(`${documentKind}-open`).focus();
  }
}

// The dialog states what the document holds and what it leaves out (FR-52).
export function renderDocument(): void {
  const t = strings(state.prefs.lang);
  const status = el('document-status');
  const messages: Record<DocumentMessage, string> = {
    preparing: t.documentPreparing,
    done: t.documentDone,
    cancelled: t.exportCancelled,
    failed: t.documentFailed,
    unavailable: t.documentUnavailable,
  };
  status.textContent = documentMessage ? messages[documentMessage] : '';
  status.classList.toggle('error', documentMessage === 'failed' || documentMessage === 'unavailable');
  const pptx = documentKind === 'pptx';
  el('document-heading').textContent = pptx ? t.pptxExportHeading : t.pdfExportHeading;
  el('document-intro').textContent = pptx ? t.pptxExportIntro : t.pdfExportIntro;
  el('document-contains-heading').textContent = t.documentContainsHeading;
  el('document-omitted-heading').textContent = t.documentOmittedHeading;
  el('document-go').textContent = t.documentGo;
  el('document-cancel').textContent = t.exportCancel;
  const doc = preparedDocument;
  el<HTMLButtonElement>('document-go').disabled = doc === null;
  if (el('document-panel').classList.contains('hidden')) {
    return;
  }
  if (!doc) {
    el('document-contains').replaceChildren();
    el('document-omitted').replaceChildren();
    el('document-size').textContent = t.documentPreparing;
    return;
  }
  const item = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  };
  const shownItems = doc.table.rows.length;
  const columns = doc.table.headings.length - 1;
  const outside = state.rows.filter((r) => !state.excluded.has(r) && state.positions.has(r)).length - doc.scene.markers.length;
  const bg = presentationView?.background;
  const contains = [
    item(fill(t.documentStage, { markers: doc.scene.markers.length, annotations: doc.scene.annotations.length })),
    item(
      doc.scene.background && bg
        ? fill(t.documentBackground, { width: Math.round(doc.scene.background.image.width), height: Math.round(doc.scene.background.image.height) })
        : t.documentNoBackground,
    ),
    item(t.documentLegend),
  ];
  if (doc.timelinePages > 0) {
    contains.push(item(fill(pptx ? t.documentTimelineSlides : t.documentTimeline, { items: shownItems, pages: doc.timelinePages })));
  }
  if (doc.economicsPages > 0) {
    contains.push(item(fill(pptx ? t.documentEconomicsSlides : t.documentEconomics, { items: doc.economicsItems, pages: doc.economicsPages })));
  }
  contains.push(
    item(fill(pptx ? t.documentTableSlides : t.documentTable, { items: shownItems, columns, pages: doc.pages - 1 - doc.timelinePages - doc.economicsPages })),
  );
  if (doc.columnGroups > 1) {
    contains.push(item(fill(t.documentColumnGroups, { groups: doc.columnGroups })));
  }
  el('document-contains').replaceChildren(...contains);
  const hiddenColumns = state.headers.filter((h) => state.hiddenHeaders.has(h)).length;
  const removed = state.ingested.length - state.rows.length;
  const annotationsOff = state.annotations.filter((a) => !annotationShown(a)).length;
  el('document-omitted').replaceChildren(
    item(fill(t.exportRemoved, { removed })),
    item(fill(t.exportExcluded, { excluded: state.rows.filter((r) => state.excluded.has(r)).length })),
    item(fill(t.documentAnnotationsOff, { annotations: annotationsOff })),
    item(fill(t.documentHiddenColumns, { hidden: hiddenColumns })),
    item(fill(t.documentOutside, { outside: Math.max(0, outside) })),
    item(t.documentNoComments),
    item(t.documentLongValues),
    // The PowerPoint document holds its text as Unicode: nothing is replaced.
    ...(pptx ? [] : [item(doc.replaced > 0 ? fill(t.documentReplaced, { replaced: doc.replaced }) : t.documentNoReplaced)]),
  );
  el('document-size').textContent = fill(t.exportSize, { size: formatSize(doc.bytes.length) });
}

export async function runDocumentExport(): Promise<void> {
  const doc = preparedDocument;
  if (!doc) {
    return;
  }
  const { outcome } = await writeFile(doc.bytes, doc.kind === 'pptx' ? PPTX_FILE : PDF_FILE);
  documentMessage = outcome === 'saved' ? 'done' : outcome;
  closeDocumentDialog();
  renderDocument();
}
