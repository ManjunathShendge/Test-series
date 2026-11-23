import katex from 'katex';
import { parseRichText, richTextMath } from '@exam-prep/contracts';

/** Content problems in one text field: structure from the shared parser plus KaTeX parsing. */
export function contentIssues(text: string | null | undefined): string[] {
  if (!text) return [];
  const { blocks, issues } = parseRichText(text);
  for (const tex of richTextMath(blocks)) {
    // trust:false renders \href, \url, \includegraphics and \html* as error text instead of
    // throwing, so record them here and reject; maxExpand stops macro loops.
    const blocked: string[] = [];
    try {
      katex.renderToString(tex, {
        throwOnError: true,
        strict: 'ignore',
        maxSize: 20,
        maxExpand: 200,
        trust: (context) => {
          blocked.push(context.command);
          return false;
        },
      });
    } catch (error) {
      issues.push(
        `Math \\(${tex.slice(0, 40)}\\) cannot be read: ${
          error instanceof katex.ParseError ? error.rawMessage : 'invalid expression'
        }.`,
      );
    }
    if (blocked.length) {
      issues.push(`Math may not use ${[...new Set(blocked)].join(', ')}.`);
    }
  }
  return issues;
}

interface QuestionText {
  stemEn: string;
  stemHi?: string | null | undefined;
  options: { textEn: string; textHi?: string | null | undefined }[];
  solutionEn: string;
  solutionHi?: string | null | undefined;
}

/** Field path and readable label for every content problem in a question. */
export function questionContentIssues(question: QuestionText) {
  const fields: [path: string, label: string, text: string | null | undefined][] = [
    ['stemEn', 'Question (English)', question.stemEn],
    ['stemHi', 'Question (Hindi)', question.stemHi],
    ...question.options.flatMap((option, index) => {
      const letter = 'ABCD'[index];
      return [
        [`options.${index}.textEn`, `Option ${letter} (English)`, option.textEn],
        [`options.${index}.textHi`, `Option ${letter} (Hindi)`, option.textHi],
      ] as [string, string, string | null | undefined][];
    }),
    ['solutionEn', 'Solution (English)', question.solutionEn],
    ['solutionHi', 'Solution (Hindi)', question.solutionHi],
  ];
  return fields.flatMap(([path, label, text]) =>
    contentIssues(text).map((message) => ({ path, message: `${label}: ${message}` })),
  );
}
