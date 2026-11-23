import { describe, expect, it } from 'vitest';
import { parseRichText, richTextMath } from '../src/authoring/rich-text.js';

describe('question content format', () => {
  it('keeps HTML as literal text and finds inline and display math', () => {
    const { blocks, issues } = parseRichText(String.raw`<script>x</script> \(x^2\) and \[\frac{a}{b}\]`);
    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: '<script>x</script> ' },
          { type: 'math', tex: 'x^2', display: false },
          { type: 'text', text: ' and ' },
          { type: 'math', tex: String.raw`\frac{a}{b}`, display: true },
        ],
      },
    ]);
  });

  it('parses a table, ignoring pipes inside math, and leaves |x| lines as text', () => {
    const text = ['|x| = 3', '| Year | Value |', '| --- | ---: |', String.raw`| 2024 | \(|y|\) |`].join(
      '\n',
    );
    const { blocks, issues } = parseRichText(text);
    expect(issues).toEqual([]);
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'table']);
    expect(richTextMath(blocks)).toEqual(['|y|']);
    const table = blocks[1]!;
    expect(table.type === 'table' && table.rows[0]!.length).toBe(2);
  });

  it('reports unclosed, stray and empty math and ragged tables', () => {
    expect(parseRichText(String.raw`a \(x`).issues).toEqual([
      String.raw`Math started with \( is not closed with \).`,
    ]);
    expect(parseRichText(String.raw`a \) b`).issues).toEqual([
      String.raw`\) closes math that was never opened.`,
    ]);
    expect(parseRichText(String.raw`\( \)`).issues).toEqual([String.raw`Math \(\) is empty.`]);
    expect(parseRichText('| a | b |\n| --- | --- |\n| 1 |').issues).toEqual([
      'Every table row needs 2 cells, like the header.',
    ]);
  });
});
