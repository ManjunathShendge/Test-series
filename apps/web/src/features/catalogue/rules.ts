import type { TestDetail } from '@exam-prep/contracts';
import { formatDuration, formatMarks } from './format';

/** Rules derived from the test's own sections; nothing here is invented copy. */
export function testRules(test: TestDetail): string[] {
  const out: string[] = [];
  const marking = [...new Set(test.sections.map((s) => `${formatMarks(s.positiveMarks)}|${formatMarks(s.negativeMarks)}`))];
  if (marking.length === 1 && test.sections[0]) {
    const s = test.sections[0];
    out.push(
      `Each correct answer earns ${formatMarks(s.positiveMarks)} mark${s.positiveMarks === 1 ? '' : 's'}. ${
        s.negativeMarks ? `${formatMarks(s.negativeMarks)} is deducted for a wrong answer.` : 'There is no negative marking.'
      } Unanswered questions score zero.`,
    );
  } else {
    out.push('Marks per question differ by section; see the table above. Unanswered questions score zero.');
  }
  out.push(
    test.sections.some((s) => s.durationSeconds !== null)
      ? 'Each section has its own timer. When it ends, the section locks and the next one opens.'
      : `You can move between sections freely within the ${formatDuration(test.durationSeconds)}.`,
  );
  out.push('The paper submits automatically when time runs out.');
  if (test.languages.length > 1) out.push('Switch between English and Hindi at any time without losing your answers.');
  return out;
}
