// Deterministic marking, the same rule the database applies on submit: correct earns the
// question's positive marks, wrong loses its negative marks, unanswered scores zero.

import type { OptionId } from '../reducer/attempt.js';

export interface MarkedQuestion {
  selected: OptionId | null;
  correct: OptionId;
  positive: number;
  negative: number;
}

export interface Score {
  score: number;
  correct: number;
  incorrect: number;
  attempted: number;
  skipped: number;
}

export function score(questions: readonly MarkedQuestion[]): Score {
  let cents = 0;
  const out: Score = { score: 0, correct: 0, incorrect: 0, attempted: 0, skipped: 0 };
  for (const q of questions) {
    if (q.selected === null) {
      out.skipped++;
      continue;
    }
    out.attempted++;
    if (q.selected === q.correct) {
      out.correct++;
      cents += Math.round(q.positive * 100);
    } else {
      out.incorrect++;
      cents -= Math.round(q.negative * 100);
    }
  }
  // Integer hundredths avoid 0.1 + 0.2 drift; marks are stored with two decimals.
  out.score = cents / 100;
  return out;
}
