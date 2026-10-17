/**
 * Server-side PDF generation.
 *
 * A small, dependency-free writer that produces a valid PDF 1.4 document
 * with selectable text. It is deliberately limited — no embedded font files,
 * no images — so the app can hand a customer a real file without adding a
 * 20 MB rendering dependency.
 *
 * It now lays out documents properly: blocks of headings, paragraphs,
 * bullets, tables and cards, paginated with a running header, a footer and
 * page numbers. The original title/meta/sections shape still works and is
 * translated into those blocks, so the invoice, the manifest, the fuel
 * report and the inspection certificate are unchanged.
 */

/* ------------------------------------------------------------- the model */

export type PdfColumn = {
  /** Column heading. */
  label: string;
  /** Relative width. Normalised across the table. */
  width?: number;
  /** Right-align the cell (numbers should always be right-aligned). */
  align?: "left" | "right";
};

export type PdfSection = {
  heading?: string;
  columns: PdfColumn[];
  rows: string[][];
  /** Rendered under the table, in the body text style. */
  note?: string;
};

export type PdfCard = {
  title: string;
  text: string;
};

export type PdfBlock =
  | { type: "heading"; text: string; level?: 1 | 2 }
  | { type: "lead"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "table"; columns: PdfColumn[]; rows: string[][]; note?: string }
  | { type: "cards"; items: PdfCard[] }
  | { type: "callout"; title?: string; text: string }
  | { type: "rule" }
  | { type: "spacer"; height?: number }
  | { type: "pagebreak" };

export type PdfCover = {
  kicker?: string;
  title: string;
  subtitle?: string;
  /** The sections of the document, printed on the cover. */
  contents?: string[];
  preparedFor?: string;
  date?: string;
};

export type PdfDocument = {
  title: string;
  subtitle?: string;
  /** Key/value pairs printed under the title. */
  meta?: Array<[string, string]>;
  /** A full-bleed cover page. The title block is then drawn on the cover. */
  cover?: PdfCover;
  /** The body of the document. */
  blocks?: PdfBlock[];
  /** The original shape — still supported, translated into blocks. */
  sections?: PdfSection[];
  footer?: string;
  /** Print "Page n of m" in the footer. */
  pageNumbers?: boolean;
};

/* ------------------------------------------------------------- geometry */

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const BODY_SIZE = 9.2;
const LINE_HEIGHT = 13.4;

/** The product palette, so a document matches the application. */
const INK = { r: 0.06, g: 0.07, b: 0.08 };
const MUTED = { r: 0.42, g: 0.45, b: 0.48 };
const FAINT = { r: 0.72, g: 0.74, b: 0.76 };
const LINE = { r: 0.85, g: 0.86, b: 0.87 };
const PAPER = { r: 0.97, g: 0.96, b: 0.95 };
const ACCENT = { r: 1, g: 0.388, b: 0.078 };
const ABYSS = { r: 0.016, g: 0.027, b: 0.039 };
const CHARCOAL = { r: 0.102, g: 0.114, b: 0.122 };
const LIMESTONE = { r: 0.969, g: 0.965, b: 0.949 };

type Colour = { r: number; g: number; b: number };

/* ------------------------------------------------------------- encoding */

/**
 * The base-14 fonts are WinAnsi. These characters have a place in that
 * encoding but not in Latin-1, so they are converted to the byte the font
 * expects before the file is written.
 */
const WINANSI: Record<string, number> = {
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94,
  "–": 0x96, "—": 0x97, "•": 0x95, "…": 0x85,
  "€": 0x80, "™": 0x99, "£": 0xa3, "¢": 0xa2,
  "©": 0xa9, "®": 0xae, "°": 0xb0, "·": 0xb7,
  "«": 0xab, "»": 0xbb, " ": 0x20,
};

function toWinAnsi(value: string): string {
  let out = "";
  for (const char of value) {
    const mapped = WINANSI[char];
    if (mapped !== undefined) {
      out += String.fromCharCode(mapped);
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    const printable = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    out += printable ? char : "?";
  }
  return out;
}

/** Escape a string for a PDF literal string. */
function escapeText(value: string): string {
  return toWinAnsi(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

/* --------------------------------------------------------------- widths */

/* Helvetica advance widths, in 1/1000 em, for the printable ASCII range. */
const W_REGULAR: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

const W_BOLD: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611,
  "@": 975, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278,
  j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389,
  s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
};

/** Widths for the characters that WinAnsi adds on top of Latin-1. */
const W_EXTRA: Record<string, number> = {
  "’": 222, "‘": 222, "“": 333, "”": 333, "–": 556, "—": 1000, "•": 350,
  "…": 1000, "€": 556, "™": 1000, "£": 556, "©": 737, "®": 737, "°": 400,
  "·": 278, "«": 556, "»": 556,
};

/** The width of a string in points. */
function textWidth(value: string, size: number, bold = false): number {
  const table = bold ? W_BOLD : W_REGULAR;
  let units = 0;
  for (const char of value) {
    const extra = W_EXTRA[char];
    if (extra !== undefined) {
      units += extra;
      continue;
    }
    const mapped = WINANSI[char];
    const glyph = mapped !== undefined ? String.fromCharCode(mapped) : char;
    units += table[glyph] ?? 556;
  }
  return (units / 1000) * size;
}

/** Break a string into lines that fit the given width. */
function wrap(value: string, maxWidth: number, size: number, bold = false): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------ the engine */

type TextOp = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  italic: boolean;
  colour: Colour;
};

type RectOp = {
  x: number;
  y: number;
  width: number;
  height: number;
  colour: Colour;
};

type Page = { text: TextOp[]; rects: RectOp[] };

class Layout {
  pages: Page[] = [];
  page!: Page;
  y = 0;
  contentWidth = PAGE_WIDTH - MARGIN * 2;

  private document: PdfDocument;

  constructor(document: PdfDocument) {
    this.document = document;
    this.page = { text: [], rects: [] };
    this.pages.push(this.page);
    this.y = this.top;
  }

  /* --- primitives --- */

  text(
    value: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    colour: Colour = INK,
    italic = false,
  ) {
    this.page.text.push({ text: value, x, y, size, bold, italic, colour });
  }

  rect(x: number, y: number, width: number, height: number, colour: Colour) {
    this.page.rects.push({ x, y, width, height, colour });
  }

  rule(y: number, colour: Colour = LINE) {
    this.rect(MARGIN, y, this.contentWidth, 0.6, colour);
  }

  newPage() {
    this.page = { text: [], rects: [] };
    this.pages.push(this.page);
    this.y = this.top;
  }

  /** Leave room for the running header. */
  get top(): number {
    return PAGE_HEIGHT - MARGIN - 26;
  }

  get bottom(): number {
    return MARGIN + 34;
  }

  /** Break to a new page when the next block would not fit. */
  ensure(height: number) {
    if (this.y - height < this.bottom) this.newPage();
  }

  /* --- blocks --- */

  heading(value: string, level: 1 | 2) {
    const size = level === 1 ? 14 : 10.5;
    const lines = wrap(value, this.contentWidth, size, true);
    const height = lines.length * (size + 5) + 14;
    this.ensure(height);
    if (level === 1) {
      this.y -= 6;
      this.rect(MARGIN, this.y - size + 1, 22, 2.4, ACCENT);
      this.y -= 8;
    } else {
      this.y -= 8;
    }
    for (const line of lines) {
      this.text(line, MARGIN, this.y, size, true, INK);
      this.y -= size + 5;
    }
    this.y -= level === 1 ? 6 : 2;
  }

  lead(value: string) {
    const lines = wrap(value, this.contentWidth, 11, false);
    this.ensure(lines.length * 15 + 6);
    for (const line of lines) {
      this.text(line, MARGIN, this.y, 11, false, MUTED);
      this.y -= 15;
    }
    this.y -= 4;
  }

  paragraph(value: string) {
    const lines = wrap(value, this.contentWidth, BODY_SIZE, false);
    this.ensure(lines.length * LINE_HEIGHT + 6);
    for (const line of lines) {
      this.text(line, MARGIN, this.y, BODY_SIZE, false, INK);
      this.y -= LINE_HEIGHT;
    }
    this.y -= 6;
  }

  list(items: string[], ordered = false) {
    const indent = 16;
    for (const item of items) {
      const lines = wrap(item, this.contentWidth - indent, BODY_SIZE, false);
      this.ensure(lines.length * LINE_HEIGHT + 3);
      const first = this.y;
      for (const [index, line] of lines.entries()) {
        if (index === 0) {
          this.text(
            ordered ? `${items.indexOf(item) + 1}.` : "•",
            MARGIN,
            first,
            BODY_SIZE,
            false,
            ACCENT,
          );
        }
        this.text(line, MARGIN + indent, this.y, BODY_SIZE, false, INK);
        this.y -= LINE_HEIGHT;
      }
      this.y -= 2;
    }
    this.y -= 4;
  }

  table(columns: PdfColumn[], rows: string[][], note?: string) {
    const total = columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
    const widths = columns.map(
      (column) => ((column.width ?? 1) / total) * this.contentWidth,
    );
    const positions: number[] = [];
    let cursor = MARGIN;
    for (const width of widths) {
      positions.push(cursor);
      cursor += width;
    }

    const headerHeight = 20;
    this.ensure(headerHeight + 40);

    // Header band.
    this.rect(MARGIN, this.y - headerHeight + 4, this.contentWidth, headerHeight, CHARCOAL);
    columns.forEach((column, index) => {
      const label = column.label.toUpperCase();
      const x =
        column.align === "right"
          ? positions[index] + widths[index] - 8 - textWidth(label, 7.4, true)
          : positions[index] + 8;
      this.text(label, x, this.y - headerHeight + 11, 7.4, true, LIMESTONE);
    });
    this.y -= headerHeight + 4;

    for (const row of rows) {
      const cells = columns.map((column, index) =>
        wrap(
          String(row[index] ?? ""),
          widths[index] - 16,
          BODY_SIZE,
          false,
        ),
      );
      const lines = Math.max(...cells.map((cell) => cell.length), 1);
      const height = lines * LINE_HEIGHT + 9;
      this.ensure(height + 2);
      const top = this.y;
      cells.forEach((cell, index) => {
        const column = columns[index];
        cell.forEach((line, lineIndex) => {
          const lineWidth = textWidth(line, BODY_SIZE, false);
          const x =
            column.align === "right"
              ? positions[index] + widths[index] - 8 - lineWidth
              : positions[index] + 8;
          this.text(line, x, top - 9 - lineIndex * LINE_HEIGHT, BODY_SIZE, false, INK);
        });
      });
      this.y -= height;
      this.rule(this.y + 4, LINE);
    }

    this.y -= 8;
    if (note) {
      const lines = wrap(note, this.contentWidth, 8, false);
      for (const line of lines) {
        this.ensure(LINE_HEIGHT);
        this.text(line, MARGIN, this.y, 8, false, MUTED);
        this.y -= 11;
      }
      this.y -= 4;
    }
  }

  cards(items: PdfCard[]) {
    const gap = 14;
    const cardWidth = (this.contentWidth - gap) / 2;
    const cardHeight = 92;
    const perRow = 2;
    for (let index = 0; index < items.length; index += perRow) {
      const row = items.slice(index, index + perRow);
      this.ensure(cardHeight + 12);
      row.forEach((card, column) => {
        const x = MARGIN + column * (cardWidth + gap);
        const top = this.y;
        this.rect(x, top - cardHeight, cardWidth, cardHeight, PAPER);
        this.rect(x, top - cardHeight, cardWidth, 2.4, ACCENT);
        this.text(card.title, x + 12, top - 20, 10, true, INK);
        const lines = wrap(card.text, cardWidth - 24, 8.6, false);
        lines.forEach((line, lineIndex) => {
          this.text(line, x + 12, top - 36 - lineIndex * 11.5, 8.6, false, MUTED);
        });
      });
      this.y -= cardHeight + gap;
    }
    this.y -= 4;
  }

  callout(title: string | undefined, value: string) {
    const lines = wrap(value, this.contentWidth - 32, 9.4, false);
    const height = lines.length * 13 + (title ? 20 : 12) + 16;
    this.ensure(height + 8);
    const top = this.y;
    this.rect(MARGIN, top - height, this.contentWidth, height, PAPER);
    this.rect(MARGIN, top - height, 2.4, height, ACCENT);
    let y = top - 18;
    if (title) {
      this.text(title.toUpperCase(), MARGIN + 16, y, 7.6, true, MUTED);
      y -= 13;
    }
    for (const line of lines) {
      this.text(line, MARGIN + 16, y, 9.4, false, INK);
      y -= 13;
    }
    this.y = top - height - 8;
  }

  /* --- the cover and the running furniture --- */

  cover() {
    const cover = this.document.cover;
    if (!cover) return;
    this.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, ABYSS);

    let y = PAGE_HEIGHT - 82;
    this.rect(MARGIN, y, 44, 3, ACCENT);
    y -= 22;

    if (cover.kicker) {
      this.text(cover.kicker.toUpperCase(), MARGIN, y, 8.4, true, ACCENT);
      y -= 28;
    }
    for (const line of wrap(cover.title, this.contentWidth - 60, 30, true)) {
      this.text(line, MARGIN, y, 30, true, LIMESTONE);
      y -= 36;
    }
    if (cover.subtitle) {
      y -= 4;
      for (const line of wrap(cover.subtitle, this.contentWidth - 40, 12, false)) {
        this.text(line, MARGIN, y, 12, false, { r: 0.68, g: 0.7, b: 0.72 });
        y -= 17;
      }
    }

    // What is inside.
    if (cover.contents?.length) {
      y -= 34;
      this.text("IN THIS DOCUMENT", MARGIN, y, 7.6, true, { r: 0.55, g: 0.58, b: 0.6 });
      y -= 22;
      const columnWidth = (this.contentWidth - 30) / 2;
      cover.contents.forEach((item, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = MARGIN + column * (columnWidth + 30);
        const lineY = y - row * 21;
        this.rect(x, lineY + 2.5, 5, 5, ACCENT);
        this.text(item, x + 13, lineY, 9.4, false, { r: 0.82, g: 0.83, b: 0.84 });
      });
    }

    const footY = MARGIN + 18;
    this.rect(MARGIN, footY + 40, this.contentWidth, 0.6, { r: 0.2, g: 0.22, b: 0.24 });
    if (cover.preparedFor) {
      this.text("PREPARED FOR", MARGIN, footY + 22, 7.4, true, { r: 0.55, g: 0.58, b: 0.6 });
      this.text(cover.preparedFor, MARGIN, footY + 8, 11, true, LIMESTONE);
    }
    if (cover.date) {
      const label = cover.date.toUpperCase();
      this.text(
        label,
        PAGE_WIDTH - MARGIN - textWidth(label, 7.4, true),
        footY + 22,
        7.4,
        true,
        { r: 0.55, g: 0.58, b: 0.6 },
      );
    }
  }

  /** The header, the footer and the page numbers on every page but the first. */
  furniture() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const saved = this.page;
      this.page = page;

      if (index > 0) {
        const title = this.document.title.toUpperCase();
        this.text(title, MARGIN, PAGE_HEIGHT - MARGIN + 14, 7, true, FAINT);
        this.rule(PAGE_HEIGHT - MARGIN + 6, LINE);
      }

      const footer = this.document.footer ?? "StaffRide";
      if (index > 0 || !this.document.cover) {
        this.text(footer, MARGIN, MARGIN - 4, 7.4, false, FAINT);
      }
      if (this.document.pageNumbers && (index > 0 || !this.document.cover)) {
        const label = `Page ${index + 1} of ${total}`;
        this.text(
          label,
          PAGE_WIDTH - MARGIN - textWidth(label, 7.4, false),
          MARGIN - 4,
          7.4,
          false,
          FAINT,
        );
      }
      this.page = saved;
    });
  }
}

/* -------------------------------------------------------------- the file */

function contentStream(page: Page): string {
  const ops: string[] = [];
  for (const rect of page.rects) {
    ops.push(
      "q",
      `${rect.colour.r.toFixed(3)} ${rect.colour.g.toFixed(3)} ${rect.colour.b.toFixed(3)} rg`,
      `${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re`,
      "f",
      "Q",
    );
  }
  for (const item of page.text) {
    if (!item.text) continue;
    ops.push(
      "BT",
      `${item.colour.r.toFixed(3)} ${item.colour.g.toFixed(3)} ${item.colour.b.toFixed(3)} rg`,
      `/${item.bold ? "F2" : item.italic ? "F3" : "F1"} ${item.size} Tf`,
      `1 0 0 1 ${item.x.toFixed(2)} ${item.y.toFixed(2)} Tm`,
      `(${escapeText(item.text)}) Tj`,
      "ET",
    );
  }
  return ops.join("\n");
}

/** Build a PDF as a byte buffer. */
export function buildPdf(document: PdfDocument): Buffer {
  const layout = new Layout(document);

  if (document.cover) {
    layout.cover();
    layout.newPage();
  } else {
    // The original shape: a title block, meta pairs, then the sections.
    layout.text(document.title, MARGIN, layout.y, 17, true, INK);
    layout.y -= 20;
    if (document.subtitle) {
      layout.text(document.subtitle, MARGIN, layout.y, 10, false, MUTED);
      layout.y -= 14;
    }
    layout.rule(layout.y);
    layout.y -= 16;
    if (document.meta?.length) {
      const columnWidth = layout.contentWidth / 2;
      document.meta.forEach(([label, value], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = MARGIN + column * columnWidth;
        const lineY = layout.y - row * 26;
        layout.text(label.toUpperCase(), x, lineY, 7, true, MUTED);
        layout.text(value, x, lineY - 11, 9, false, INK);
      });
      layout.y -= Math.ceil(document.meta.length / 2) * 26 + 14;
    }
  }

  const blocks: PdfBlock[] = [...(document.blocks ?? [])];
  for (const section of document.sections ?? []) {
    if (section.heading) blocks.push({ type: "heading", text: section.heading, level: 2 });
    blocks.push({ type: "table", columns: section.columns, rows: section.rows, note: section.note });
  }

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        layout.heading(block.text, block.level ?? 1);
        break;
      case "lead":
        layout.lead(block.text);
        break;
      case "paragraph":
        layout.paragraph(block.text);
        break;
      case "bullets":
        layout.list(block.items, false);
        break;
      case "numbers":
        layout.list(block.items, true);
        break;
      case "table":
        layout.table(block.columns, block.rows, block.note);
        break;
      case "cards":
        layout.cards(block.items);
        break;
      case "callout":
        layout.callout(block.title, block.text);
        break;
      case "rule":
        layout.ensure(20);
        layout.rule(layout.y);
        layout.y -= 12;
        break;
      case "spacer":
        layout.y -= block.height ?? 12;
        break;
      case "pagebreak":
        layout.newPage();
        break;
    }
  }

  layout.furniture();

  const streams = layout.pages.map(contentStream);

  /* Object layout: 1 catalog, 2 pages, then a page and a stream per page,
     then the three fonts. */
  const objects: string[] = [];
  const pageRefs: number[] = [];
  const firstPageObject = 3;
  for (let index = 0; index < streams.length; index += 1) {
    pageRefs.push(firstPageObject + index * 2);
  }
  const firstFontObject = firstPageObject + streams.length * 2;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${streams.length} >>`,
  );

  streams.forEach((stream, index) => {
    const pageRef = firstPageObject + index * 2;
    const streamRef = pageRef + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${firstFontObject} 0 R /F2 ${firstFontObject + 1} 0 R /F3 ${firstFontObject + 2} 0 R >> >> ` +
        `/Contents ${streamRef} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  });

  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>",
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/** A safe, readable file name for a generated document. */
export function pdfFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "document"}.pdf`;
}
