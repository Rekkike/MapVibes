// A minimal PowerPoint writer (FR-51): a valid .pptx package (Office Open
// XML, a zip of XML parts with their content types and relationships) with
// one slide master, one blank layout, and one theme; the first slide carries
// an image filling the slide, the following slides each carry a title and a
// native table. Written for this application alone: no libraries.

import { zip, type ZipEntry } from './zipwriter';

// A 16:9 slide, 13.333 by 7.5 inches, in English Metric Units.
export const SLIDE = { width: 12192000, height: 6858000 };
export const EMU_PER_POINT = 12700;

export interface PptxTableSlide {
  title: string;
  headings: string[];
  // Per row, the text of each cell as it is shown, its lines separated by
  // line breaks.
  rows: string[][];
  // Column widths and row heights, in points.
  widths: number[];
  rowHeights: number[];
  headingHeight: number;
}

export interface PptxContent {
  title: string;
  image: { png: Uint8Array; description: string };
  tables: PptxTableSlide[];
  // Text sizes in points and the cell padding in points.
  font: number;
  padding: number;
  margin: number;
  titleHeight: number;
  // A language tag for the text runs (for example en-GB).
  lang: string;
  created: Date;
}

// The XML namespaces and relationship types the format requires. They are
// identifiers written into the document, never addresses that are fetched;
// they are all here, so that the check for network addresses in the source
// can exempt exactly these (hard constraint 2).
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  table: 'http://schemas.openxmlformats.org/drawingml/2006/table',
  coreProperties: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  extendedProperties: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
};

const REL = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  extended: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
};

// Every identifier above, for the source check.
export const XML_IDENTIFIERS: readonly string[] = [...Object.values(NS), ...Object.values(REL)];

const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  extended: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Text for XML: the five special characters escaped; characters XML does
// not allow (control characters other than tab and line breaks, lone
// surrogates) dropped.
export function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function emu(points: number): number {
  return Math.round(points * EMU_PER_POINT);
}

function relationships(rels: Array<[string, string, string]>): string {
  return `${DECLARATION}<Relationships xmlns="${NS.rel}">${rels.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
}

const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function theme(): string {
  const colour = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const fonts = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>';
  return (
    `${DECLARATION}<a:theme xmlns:a="${NS.a}" name="MapVibes"><a:themeElements>` +
    `<a:clrScheme name="MapVibes"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    colour('dk2', '1A1C20') +
    colour('lt2', 'F6F7F9') +
    colour('accent1', '287A4D') +
    colour('accent2', '2F66B3') +
    colour('accent3', 'E0B31F') +
    colour('accent4', 'C03A3A') +
    colour('accent5', '6B7380') +
    colour('accent6', '3A3F47') +
    colour('hlink', '2F66B3') +
    colour('folHlink', '6B7380') +
    `</a:clrScheme>` +
    `<a:fontScheme name="MapVibes"><a:majorFont>${fonts}</a:majorFont><a:minorFont>${fonts}</a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="MapVibes"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

function slideMaster(): string {
  return (
    `${DECLARATION}<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    `<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:otherStyle></p:txStyles>` +
    `</p:sldMaster>`
  );
}

function slideLayout(): string {
  return `${DECLARATION}<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function slide(shapes: string): string {
  return `${DECLARATION}<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree>${EMPTY_TREE}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function picture(description: string): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Presentation stage" descr="${xmlText(description)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${SLIDE.width}" cy="${SLIDE.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function run(text: string, size: number, bold: boolean, lang: string): string {
  return `<a:r><a:rPr lang="${xmlText(lang)}" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="1A1C20"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${xmlText(text)}</a:t></a:r>`;
}

function titleBox(text: string, c: PptxContent): string {
  const m = emu(c.margin);
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${m}" y="${m}"/><a:ext cx="${SLIDE.width - 2 * m}" cy="${emu(c.titleHeight)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/><a:lstStyle/><a:p>${run(text, c.font + 4, true, c.lang)}</a:p></p:txBody></p:sp>`
  );
}

function cell(text: string, c: PptxContent, bold: boolean, shade: string | null): string {
  const pad = emu(c.padding);
  const border = (side: string) => `<a:${side} w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="C9CED6"/></a:solidFill><a:prstDash val="solid"/></a:${side}>`;
  const none = (side: string) => `<a:${side} w="0"><a:noFill/></a:${side}>`;
  // Each line of the cell is a paragraph of its own, so that the lines
  // break where the layout broke them.
  const paragraph =
    text === ''
      ? `<a:p><a:endParaRPr lang="${xmlText(c.lang)}" sz="${Math.round(c.font * 100)}" dirty="0"/></a:p>`
      : text
          .split('\n')
          .map((line) => `<a:p>${run(line, c.font, bold, c.lang)}</a:p>`)
          .join('');
  return (
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph}</a:txBody>` +
    `<a:tcPr marL="${pad}" marR="${pad}" marT="${pad}" marB="${pad}">${none('lnL')}${none('lnR')}${none('lnT')}${border('lnB')}` +
    (shade ? `<a:solidFill><a:srgbClr val="${shade}"/></a:solidFill>` : '<a:noFill/>') +
    `</a:tcPr></a:tc>`
  );
}

function table(t: PptxTableSlide, c: PptxContent): string {
  const widths = t.widths.map(emu);
  const total = widths.reduce((s, w) => s + w, 0);
  const height = emu(t.headingHeight + t.rowHeights.reduce((s, h) => s + h, 0));
  const row = (values: string[], h: number, bold: boolean, shade: string | null) => `<a:tr h="${emu(h)}">${values.map((v) => cell(v, c, bold, shade)).join('')}</a:tr>`;
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${emu(c.margin)}" y="${emu(c.margin + c.titleHeight)}"/><a:ext cx="${total}" cy="${height}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS.table}"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>` +
    `<a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>` +
    row(t.headings, t.headingHeight, true, 'EEF0F3') +
    t.rows.map((r, i) => row(r, t.rowHeights[i], false, i % 2 === 1 ? 'F8F9FB' : null)).join('') +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function isoDate(d: Date): string {
  return `${d.toISOString().slice(0, 19)}Z`;
}

export function buildPptx(c: PptxContent): Uint8Array {
  const encoder = new TextEncoder();
  const slides = [slide(picture(c.image.description)), ...c.tables.map((t) => slide(titleBox(t.title, c) + table(t, c)))];
  const entries: ZipEntry[] = [];
  const add = (name: string, text: string) => entries.push({ name, data: encoder.encode(text) });

  add(
    '[Content_Types].xml',
    `${DECLARATION}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="${CT.presentation}"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT.slideMaster}"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT.slideLayout}"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT.theme}"/>` +
      slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT.slide}"/>`).join('') +
      `<Override PartName="/docProps/core.xml" ContentType="${CT.core}"/><Override PartName="/docProps/app.xml" ContentType="${CT.extended}"/></Types>`,
  );
  add(
    '_rels/.rels',
    relationships([
      ['rId1', REL.officeDocument, 'ppt/presentation.xml'],
      ['rId2', REL.core, 'docProps/core.xml'],
      ['rId3', REL.extended, 'docProps/app.xml'],
    ]),
  );
  add(
    'docProps/core.xml',
    `${DECLARATION}<cp:coreProperties xmlns:cp="${NS.coreProperties}" xmlns:dc="${NS.dc}" xmlns:dcterms="${NS.dcterms}" xmlns:xsi="${NS.xsi}">` +
      `<dc:title>${xmlText(c.title)}</dc:title><dc:creator>MapVibes</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${isoDate(c.created)}</dcterms:created></cp:coreProperties>`,
  );
  add(
    'docProps/app.xml',
    `${DECLARATION}<Properties xmlns="${NS.extendedProperties}"><Application>MapVibes</Application><Slides>${slides.length}</Slides></Properties>`,
  );
  add(
    'ppt/presentation.xml',
    `${DECLARATION}<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE.width}" cy="${SLIDE.height}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      `<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`,
  );
  add(
    'ppt/_rels/presentation.xml.rels',
    relationships([
      ['rId1', REL.slideMaster, 'slideMasters/slideMaster1.xml'],
      ['rId2', REL.theme, 'theme/theme1.xml'],
      ...slides.map((_, i): [string, string, string] => [`rId${i + 3}`, REL.slide, `slides/slide${i + 1}.xml`]),
    ]),
  );
  add('ppt/slideMasters/slideMaster1.xml', slideMaster());
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    relationships([
      ['rId1', REL.slideLayout, '../slideLayouts/slideLayout1.xml'],
      ['rId2', REL.theme, '../theme/theme1.xml'],
    ]),
  );
  add('ppt/slideLayouts/slideLayout1.xml', slideLayout());
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([['rId1', REL.slideMaster, '../slideMasters/slideMaster1.xml']]));
  add('ppt/theme/theme1.xml', theme());
  slides.forEach((xml, i) => {
    add(`ppt/slides/slide${i + 1}.xml`, xml);
    const rels: Array<[string, string, string]> = [['rId1', REL.slideLayout, '../slideLayouts/slideLayout1.xml']];
    if (i === 0) rels.push(['rId2', REL.image, '../media/image1.png']);
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relationships(rels));
  });
  entries.push({ name: 'ppt/media/image1.png', data: c.image.png });
  return zip(entries, c.created);
}
