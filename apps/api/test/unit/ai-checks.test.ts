import { describe, expect, it } from 'vitest';
import { buildInput, cacheKey, parseReply } from '../../src/jobs/ai-checks.js';

const question = {
  id: 'q1',
  version_number: 2,
  stem_en: 'Capital of India?',
  stem_hi: 'भारत की राजधानी?',
  options: [
    { id: 'A', text_en: 'Delhi', text_hi: 'दिल्ली' },
    { id: 'B', text_en: 'Mumbai', text_hi: 'मुंबई' },
  ],
  correct_option: 'A',
  passage_en: null,
  passage_hi: null,
  has_images: false,
  answer_on: true,
  ambiguity_on: true,
  language_on: true,
};

describe('AI reviewer checks', () => {
  it('never sends the key or the solution to the model', () => {
    const text = JSON.stringify(buildInput(question, ['answer', 'ambiguity']));
    expect(text).not.toContain('correct');
    expect(text).not.toContain('solution');
    expect(text).toContain('दिल्ली');
  });

  it('changes the cache key when any language, option or model changes', () => {
    const base = cacheKey(buildInput(question, ['answer']), 'anthropic', 'm1');
    expect(cacheKey(buildInput(question, ['answer']), 'anthropic', 'm1')).toBe(base);
    expect(cacheKey(buildInput({ ...question, stem_hi: 'बदला' }, ['answer']), 'anthropic', 'm1')).not.toBe(base);
    const swapped = { ...question, options: [...question.options].reverse() };
    expect(cacheKey(buildInput(swapped, ['answer']), 'anthropic', 'm1')).not.toBe(base);
    expect(cacheKey(buildInput(question, ['answer']), 'anthropic', 'm2')).not.toBe(base);
    expect(cacheKey(buildInput(question, ['answer', 'language']), 'anthropic', 'm1')).not.toBe(base);
  });

  it('accepts only the JSON asked for and bounds it', () => {
    expect(parseReply('Sure: {"answer":"b","ambiguity_note":"","language_note":"  "}', ['A', 'B'])).toEqual({
      answer: 'B',
      ambiguity: null,
      language: null,
    });
    expect(parseReply('{"answer":"E"}', ['A', 'B'])?.answer).toBe('unknown');
    expect(parseReply(`{"answer":"A","ambiguity_note":"${'x'.repeat(900)}"}`, ['A'])?.ambiguity).toHaveLength(300);
    expect(parseReply('no json here', ['A'])).toBeNull();
    expect(parseReply('{"answer": 3}', ['A'])).toBeNull();
    expect(parseReply('{broken', ['A'])).toBeNull();
  });
});
