import type { TemplateSectionInput } from './index.js';

export interface TemplateDraftShape {
  totalQuestions: number;
  totalDurationSeconds: number;
  hasSectionalTiming: boolean;
  sections: TemplateSectionInput[];
}

const minutes = (seconds: number) => `${Math.round((seconds / 60) * 10) / 10} min`;

/**
 * Why a draft template cannot be published yet; empty when it can. Shared by the API (which
 * refuses to publish otherwise) and the admin editor (which shows the same list as you type).
 *
 * `topicSubject` maps each topic id of the exam to its subject id.
 */
export function templateIssues(draft: TemplateDraftShape, topicSubject: ReadonlyMap<string, string>): string[] {
  const issues: string[] = [];
  const { sections } = draft;
  if (sections.length === 0) return ['Add at least one section.'];

  const questions = sections.reduce((sum, s) => sum + s.questionCount, 0);
  if (questions !== draft.totalQuestions) {
    issues.push(`Sections add up to ${questions} questions, but the template has ${draft.totalQuestions}.`);
  }

  if (draft.hasSectionalTiming) {
    const untimed = sections.filter((s) => s.durationSeconds === null).map((s) => s.name);
    if (untimed.length) issues.push(`Give every section a time limit (missing: ${untimed.join(', ')}).`);
    else {
      const seconds = sections.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
      if (seconds !== draft.totalDurationSeconds) {
        issues.push(`Section times add up to ${minutes(seconds)}, but the template allows ${minutes(draft.totalDurationSeconds)}.`);
      }
    }
  }

  const seen = new Set<string>();
  for (const s of sections) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) issues.push(`Two sections are called "${s.name}". Give each section its own name.`);
    seen.add(key);
    if (s.positiveMarks <= 0) issues.push(`"${s.name}" needs marks for a correct answer.`);
    if (s.negativeMarks > s.positiveMarks) issues.push(`"${s.name}" takes away more for a wrong answer than it gives for a right one.`);

    const targets = Object.entries(s.targetTopicCounts);
    if (!targets.length) continue;
    if (!s.subjectId) {
      issues.push(`"${s.name}" has topic targets but no subject. Choose its subject.`);
      continue;
    }
    if (targets.some(([topic]) => topicSubject.get(topic) !== s.subjectId)) {
      issues.push(`"${s.name}" has a topic target outside its subject. Remove it.`);
    }
    const targeted = targets.reduce((sum, [, n]) => sum + n, 0);
    if (targeted > s.questionCount) {
      issues.push(`"${s.name}" targets ${targeted} questions across topics, but the section has ${s.questionCount}.`);
    }
  }
  return issues;
}
