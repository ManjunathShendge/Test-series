import { describe, expect, it } from 'vitest';
import {
  CreateExaminerApplicationRequest,
  DecideExaminerApplicationRequest,
  DraftQuestionInput,
  missingHindiFields,
} from '../src/authoring/index.js';

const sample = (position: number) => ({
  position,
  examId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
  topicId: '33333333-3333-4333-8333-333333333333',
  stemEn: 'What is 2 + 2?',
  stemHi: '2 + 2 kya hai?',
  options: [
    { id: 'A' as const, textEn: '3', textHi: 'तीन' },
    { id: 'B' as const, textEn: '4', textHi: 'चार' },
    { id: 'C' as const, textEn: '5', textHi: 'पाँच' },
    { id: 'D' as const, textEn: '6', textHi: 'छह' },
  ],
  correctOption: 'B' as const,
  solutionEn: 'Two plus two equals four.',
  solutionHi: 'Do aur do chaar hote hain.',
  difficulty: 'easy' as const,
  imageAssetIds: [],
});

describe('M3 examiner application contracts', () => {
  it('requires exactly ten uniquely positioned samples', () => {
    const parsed = CreateExaminerApplicationRequest.safeParse({
      accountType: 'individual',
      bio: 'An experienced synthetic examiner with subject expertise.',
      examIds: ['11111111-1111-4111-8111-111111111111'],
      subjectIds: ['22222222-2222-4222-8222-222222222222'],
      agreementVersion: 'examiner-v1',
      samples: Array.from({ length: 10 }, (_, index) => sample(index + 1)),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a rejected decision without a reason', () => {
    expect(DecideExaminerApplicationRequest.safeParse({ status: 'rejected' }).success).toBe(false);
  });

  it('rejects duplicate sample positions', () => {
    const parsed = CreateExaminerApplicationRequest.safeParse({
      accountType: 'individual',
      bio: 'An experienced synthetic examiner with subject expertise.',
      examIds: ['11111111-1111-4111-8111-111111111111'],
      subjectIds: ['22222222-2222-4222-8222-222222222222'],
      agreementVersion: 'examiner-v1',
      samples: Array.from({ length: 10 }, () => sample(1)),
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts English-only and fully bilingual questions but not partial Hindi', () => {
    const english = {
      ...sample(1),
      stemHi: undefined,
      solutionHi: '  ',
      options: sample(1).options.map(({ id, textEn }) => ({ id, textEn })),
    };
    expect(missingHindiFields(english)).toEqual([]);
    expect(missingHindiFields(sample(1))).toEqual([]);
    expect(missingHindiFields({ ...english, stemHi: '2 + 2 kya hai?' })).toEqual([
      'options.0.textHi',
      'options.1.textHi',
      'options.2.textHi',
      'options.3.textHi',
      'solutionHi',
    ]);
  });

  it('reports partial Hindi on the exact draft field', () => {
    const { position: _position, ...question } = sample(1);
    const parsed = DraftQuestionInput.safeParse({ ...question, solutionHi: undefined });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['solutionHi']);
  });
});
