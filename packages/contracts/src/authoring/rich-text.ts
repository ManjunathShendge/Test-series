/**
 * Question content format (DECISIONS "Question content format"). Authors write plain text, never
 * HTML. Two constructs are recognised:
 * - math: inline `\( ... \)` and display `\[ ... \]`, rendered with KaTeX;
 * - tables: a `| a | b |` header line followed by a `| --- | --- |` separator line, then rows.
 * Anything else, including `<script>` or a lone `|x|`, is literal text. Server, web and mobile
 * share this parser so what the author previews is what the student sees.
 */

export type RichInline =
  | { type: 'text'; text: string }
  | { type: 'math'; tex: string; display: boolean };

export type RichBlock =
  | { type: 'paragraph'; inlines: RichInline[] }
  | { type: 'table'; header: RichInline[][]; rows: RichInline[][][] };

export const RICH_TABLE_MAX_COLUMNS = 10;
export const RICH_TABLE_MAX_ROWS = 50;

const SEPARATOR = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);

/** Splits text into text and math pieces, reporting unbalanced delimiters. */
function parseInlines(text: string, issues: string[]): RichInline[] {
  const inlines: RichInline[] = [];
  let index = 0;
  let plain = '';
  while (index < text.length) {
    const pair = text.slice(index, index + 2);
    if (pair === '\\(' || pair === '\\[') {
      const close = pair === '\\(' ? '\\)' : '\\]';
      const end = text.indexOf(close, index + 2);
      const tex = end === -1 ? '' : text.slice(index + 2, end);
      if (end === -1 || tex.includes('\\(') || tex.includes('\\[')) {
        issues.push(`Math started with ${pair} is not closed with ${close}.`);
        plain += text.slice(index);
        break;
      }
      if (!tex.trim()) issues.push(`Math ${pair}${close} is empty.`);
      if (plain) inlines.push({ type: 'text', text: plain });
      plain = '';
      inlines.push({ type: 'math', tex, display: pair === '\\[' });
      index = end + 2;
      continue;
    }
    if (pair === '\\)' || pair === '\\]') {
      issues.push(`${pair} closes math that was never opened.`);
    }
    plain += text[index];
    index += 1;
  }
  if (plain) inlines.push({ type: 'text', text: plain });
  return inlines;
}

/** Splits a table line on `|`, ignoring pipes inside math such as `\(|x|\)`. */
function tableCells(line: string): string[] {
  const body = line.trim().slice(1, -1);
  const cells: string[] = [];
  let cell = '';
  let close: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (!close && (pair === '\\(' || pair === '\\[')) close = pair === '\\(' ? '\\)' : '\\]';
    else if (close && pair === close) close = null;
    if (!close && body[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += body[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseRichText(text: string): { blocks: RichBlock[]; issues: string[] } {
  const issues: string[] = [];
  const blocks: RichBlock[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join('\n'), issues) });
    }
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isTableLine(line) && SEPARATOR.test(lines[index + 1] ?? '')) {
      flush();
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableLine(lines[index]!)) {
        rows.push(tableCells(lines[index]!));
        index += 1;
      }
      index -= 1;
      if (header.length > RICH_TABLE_MAX_COLUMNS) {
        issues.push(`A table may have at most ${RICH_TABLE_MAX_COLUMNS} columns.`);
      }
      if (rows.length > RICH_TABLE_MAX_ROWS) {
        issues.push(`A table may have at most ${RICH_TABLE_MAX_ROWS} rows.`);
      }
      if (rows.some((row) => row.length !== header.length)) {
        issues.push(`Every table row needs ${header.length} cells, like the header.`);
      }
      blocks.push({
        type: 'table',
        header: header.map((cell) => parseInlines(cell, issues)),
        rows: rows.map((row) => row.map((cell) => parseInlines(cell, issues))),
      });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return { blocks, issues: [...new Set(issues)] };
}

/** Every math expression in the text, for server-side KaTeX validation. */
export function richTextMath(blocks: RichBlock[]): string[] {
  const fromInlines = (inlines: RichInline[]) =>
    inlines.flatMap((inline) => (inline.type === 'math' ? [inline.tex] : []));
  return blocks.flatMap((block) =>
    block.type === 'paragraph'
      ? fromInlines(block.inlines)
      : [...block.header, ...block.rows.flat()].flatMap(fromInlines),
  );
}
