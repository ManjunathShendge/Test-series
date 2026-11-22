import { describe, expect, it } from 'vitest';
import { CreateTemplateRequest, templateIssues, type TemplateSectionInput } from '../src/index.js';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const OTHER_SUBJECT = '00000000-0000-4000-8000-000000000002';
const TOPIC = '00000000-0000-4000-8000-0000000000a1';
const OTHER_TOPIC = '00000000-0000-4000-8000-0000000000b1';
const topics = new Map([[TOPIC, SUBJECT], [OTHER_TOPIC, OTHER_SUBJECT]]);

const section = (over: Partial<TemplateSectionInput> = {}): TemplateSectionInput => ({
  name: 'Quant', subjectId: SUBJECT, questionCount: 25, durationSeconds: null, positiveMarks: 2, negativeMarks: 0.5, targetTopicCounts: {}, ...over,
});
const draft = (sections: TemplateSectionInput[], over = {}) => ({ totalQuestions: 50, totalDurationSeconds: 3600, hasSectionalTiming: false, sections, ...over });

describe('templateIssues', () => {
  it('accepts a consistent template', () => {
    expect(templateIssues(draft([section(), section({ name: 'Reasoning', targetTopicCounts: {} })]), topics)).toEqual([]);
  });

  it('needs sections whose counts add up', () => {
    expect(templateIssues(draft([]), topics)).toEqual(['Add at least one section.']);
    expect(templateIssues(draft([section()]), topics)).toEqual(['Sections add up to 25 questions, but the template has 50.']);
  });

  it('checks sectional timing', () => {
    const timed = { hasSectionalTiming: true };
    expect(templateIssues(draft([section(), section({ name: 'B' })], timed), topics)[0]).toMatch(/time limit \(missing: Quant, B\)/);
    expect(templateIssues(draft([section({ durationSeconds: 1200 }), section({ name: 'B', durationSeconds: 1200 })], timed), topics)).toEqual([
      'Section times add up to 40 min, but the template allows 60 min.',
    ]);
    expect(templateIssues(draft([section({ durationSeconds: 1800 }), section({ name: 'B', durationSeconds: 1800 })], timed), topics)).toEqual([]);
  });

  it('flags duplicate names and odd marking', () => {
    const issues = templateIssues(draft([section(), section({ name: ' quant ', positiveMarks: 0, negativeMarks: 1 })]), topics);
    expect(issues).toContain('Two sections are called " quant ". Give each section its own name.');
    expect(issues).toContain('" quant " needs marks for a correct answer.');
    expect(issues.some((i) => i.includes('takes away more'))).toBe(true);
  });

  it('checks topic targets against the section subject and size', () => {
    expect(templateIssues(draft([section({ subjectId: null, targetTopicCounts: { [TOPIC]: 5 } }), section({ name: 'B' })]), topics)[0]).toMatch(/no subject/);
    expect(templateIssues(draft([section({ targetTopicCounts: { [OTHER_TOPIC]: 5 } }), section({ name: 'B' })]), topics)[0]).toMatch(/outside its subject/);
    expect(templateIssues(draft([section({ targetTopicCounts: { [TOPIC]: 30 } }), section({ name: 'B' })]), topics)[0]).toMatch(/targets 30 questions/);
  });
});

describe('CreateTemplateRequest', () => {
  it('rejects marks with more than two decimals and unknown fields', () => {
    const base = { stageId: SUBJECT, name: 'T', totalQuestions: 1, totalDurationSeconds: 60, hasSectionalTiming: false, defaultPositiveMarks: 1, defaultNegativeMarks: 0.25, sections: [] };
    expect(CreateTemplateRequest.safeParse(base).success).toBe(true);
    expect(CreateTemplateRequest.safeParse({ ...base, defaultNegativeMarks: 0.333 }).success).toBe(false);
    expect(CreateTemplateRequest.safeParse({ ...base, publishedAt: 'x' }).success).toBe(false);
  });
});
