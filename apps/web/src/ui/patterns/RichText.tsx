import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseRichText, type RichInline } from '@exam-prep/contracts';
import styles from './RichText.module.css';

// Same limits as the server check. trust:false keeps \href, \url and \html* inert; invalid math
// renders in red here and is rejected on save.
function mathHtml(tex: string, displayMode: boolean) {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 200,
  });
}

function Inlines({ inlines }: { inlines: RichInline[] }) {
  return inlines.map((inline, index) =>
    inline.type === 'text' ? (
      <span key={index}>{inline.text}</span>
    ) : (
      <span
        key={index}
        className={inline.display ? styles.display : undefined}
        dangerouslySetInnerHTML={{ __html: mathHtml(inline.tex, inline.display) }}
      />
    ),
  );
}

/**
 * Renders question text in the shared content format: plain text with KaTeX math and simple
 * tables. Author text is never interpreted as HTML. `showIssues` lists format problems while
 * authoring.
 */
export function RichText({
  text,
  lang,
  showIssues = false,
}: {
  text: string;
  lang?: 'en' | 'hi';
  showIssues?: boolean;
}) {
  const { blocks, issues } = parseRichText(text);
  return (
    <div className={styles.rich} lang={lang}>
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>
            <Inlines inlines={block.inlines} />
          </p>
        ) : (
          <div key={index} className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, column) => (
                    <th key={column} scope="col">
                      <Inlines inlines={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, column) => (
                      <td key={column}>
                        <Inlines inlines={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
      {showIssues && issues.length ? (
        <ul className={styles.issues} role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
