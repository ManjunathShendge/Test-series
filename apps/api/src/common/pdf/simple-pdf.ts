/**
 * Minimal single-page PDF writer for receipts and invoices: Helvetica text lines and rules, no
 * images or embedded fonts. Text outside Latin-1 is replaced (₹ becomes "Rs."), since the
 * standard fonts only cover WinAnsi.
 */

export interface PdfLine {
  text: string;
  x: number;
  /** Distance from the top of the page, in points. */
  y: number;
  size?: number;
  bold?: boolean;
  /** Right-align the text so it ends at x. */
  right?: boolean;
}

export interface PdfRule {
  x1: number;
  x2: number;
  y: number;
}

const PAGE_W = 595; // A4 in points
const PAGE_H = 842;

function clean(text: string): string {
  return text
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Helvetica advance widths are not embedded; an average width is close enough for right-aligning short figures. */
const approxWidth = (text: string, size: number, bold: boolean) => text.length * size * (bold ? 0.56 : 0.52);

export function renderPdf(lines: PdfLine[], rules: PdfRule[] = [], title = 'Document'): Buffer {
  const ops: string[] = [];
  for (const r of rules) ops.push(`0.8 G 0.6 w ${r.x1} ${PAGE_H - r.y} m ${r.x2} ${PAGE_H - r.y} l S`);
  for (const l of lines) {
    const size = l.size ?? 10;
    const text = clean(l.text);
    const x = l.right ? l.x - approxWidth(l.text, size, !!l.bold) : l.x;
    ops.push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${(PAGE_H - l.y).toFixed(1)} Td (${text}) Tj ET`);
  }
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    `<< /Title (${clean(title)}) /Producer (Exam Prep) >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
