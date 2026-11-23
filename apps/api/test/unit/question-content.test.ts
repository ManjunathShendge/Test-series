import { describe, expect, it } from 'vitest';
import {
  contentIssues,
  questionContentIssues,
} from '../../src/modules/authoring/domain/question-content.js';

describe('question content validation', () => {
  it('accepts valid math, tables and Hindi text', () => {
    expect(
      contentIssues(String.raw`मान \(\sqrt{2} + \text{कुल}\)` + '\n| a | b |\n| --- | --- |\n| 1 | 2 |'),
    ).toEqual([]);
  });

  it('rejects unreadable math and blocked commands', () => {
    expect(contentIssues(String.raw`\(\frac{a}{\)`)[0]).toMatch(/cannot be read/);
    expect(contentIssues(String.raw`\(\href{javascript:alert(1)}{x}\)`)).toEqual([
      String.raw`Math may not use \href.`,
    ]);
    expect(contentIssues(String.raw`\(\def\a{\a}\a\)`)[0]).toMatch(/cannot be read/);
  });

  it('labels the field that has the problem', () => {
    const issues = questionContentIssues({
      stemEn: 'Fine',
      options: [
        { textEn: 'A' },
        { textEn: String.raw`\(x` },
        { textEn: 'C' },
        { textEn: 'D' },
      ],
      solutionEn: 'Fine',
    });
    expect(issues.map(({ path }) => path)).toEqual(['options.1.textEn']);
    expect(issues[0]!.message).toMatch(/^Option B \(English\): /);
  });
});
