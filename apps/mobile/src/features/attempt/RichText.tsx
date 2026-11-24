import { ScrollView, StyleSheet, Text as RNText, View, type TextStyle } from 'react-native';
import { parseRichText, type RichInline } from '@exam-prep/contracts';
import { colors, radius, space } from '@/ui/tokens';

/*
 * Question text in the shared content format (contracts/authoring/rich-text): plain text,
 * `\( \)` / `\[ \]` math and `| a | b |` tables. Author text is never interpreted as markup.
 * Math is shown as readable text (fractions, roots, powers and common symbols); a full
 * typeset renderer comes with the WebView paper renderer (TEST_ENGINE "Required evidence").
 */

const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', infty: '∞', degree: '°', circ: '°', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ',
  delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', omega: 'ω', phi: 'φ', rightarrow: '→',
  leftarrow: '←', Rightarrow: '⇒', therefore: '∴', because: '∵', angle: '∠', triangle: '△', percent: '%',
  sum: 'Σ', int: '∫', sqrt: '√', cup: '∪', cap: '∩', in: '∈', subset: '⊂', perp: '⊥', parallel: '∥',
};
const SUPER: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };

const script = (body: string, map: Record<string, string>, mark: string) =>
  [...body].every((c) => map[c]) ? [...body].map((c) => map[c]).join('') : `${mark}(${body})`;

/** Best-effort plain-text reading of a TeX fragment. */
export function texToText(tex: string): string {
  let out = tex;
  for (let i = 0; i < 4; i++) {
    out = out
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, '$1√($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
      .replace(/\^\{([^{}]*)\}/g, (_, b: string) => script(b, SUPER, '^'))
      .replace(/_\{([^{}]*)\}/g, (_, b: string) => script(b, SUB, '_'));
  }
  return out
    .replace(/\^([0-9n+-])/g, (_, c: string) => SUPER[c] ?? `^${c}`)
    .replace(/_([0-9])/g, (_, c: string) => SUB[c] ?? `_${c}`)
    .replace(/\\left|\\right/g, '')
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => SYMBOLS[name] ?? m)
    .replace(/\\[,;: !]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function Inlines({ inlines }: { inlines: RichInline[] }) {
  return inlines.map((inline, i) =>
    inline.type === 'text' ? (
      inline.text
    ) : (
      <RNText key={i} style={styles.math} accessibilityLabel={texToText(inline.tex)}>
        {inline.display ? '\n' : ''}
        {texToText(inline.tex)}
        {inline.display ? '\n' : ''}
      </RNText>
    ),
  );
}

export function RichText({ text, style }: { text: string; style: TextStyle }) {
  const { blocks } = parseRichText(text);
  return (
    <View style={styles.root}>
      {blocks.map((block, i) =>
        block.type === 'paragraph' ? (
          <RNText key={i} style={[{ color: colors.text }, style]}>
            <Inlines inlines={block.inlines} />
          </RNText>
        ) : (
          <ScrollView key={i} horizontal style={styles.tableWrap} contentContainerStyle={styles.table}>
            <View>
              <View style={[styles.row, styles.head]}>
                {block.header.map((cell, c) => (
                  <RNText key={c} style={[style, styles.cell, styles.headText]}>
                    <Inlines inlines={cell} />
                  </RNText>
                ))}
              </View>
              {block.rows.map((row, r) => (
                <View key={r} style={styles.row}>
                  {row.map((cell, c) => (
                    <RNText key={c} style={[{ color: colors.text }, style, styles.cell]}>
                      <Inlines inlines={cell} />
                    </RNText>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  math: { fontStyle: 'italic', color: colors.primary },
  tableWrap: { flexGrow: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  table: { padding: 0 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  head: { backgroundColor: colors.surfaceMuted },
  headText: { fontWeight: '600', color: colors.text },
  cell: { minWidth: 88, paddingHorizontal: space.md, paddingVertical: space.sm },
});
