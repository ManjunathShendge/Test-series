// Attempt state for the CBT interface (PRD 6.4, TEST_ENGINE "Pure engine"). Pure: no clock,
// storage or network. The client binds time, persistence and sync around it; the server keeps
// its own authority over windows and score.

export type OptionId = 'A' | 'B' | 'C' | 'D';

/** The five palette states. Marking never erases a chosen answer; answered-and-marked is scored. */
export type Palette = 'not_visited' | 'not_answered' | 'answered' | 'marked_for_review' | 'answered_and_marked';

export interface AnswerState {
  selected: OptionId | null;
  marked: boolean;
  visited: boolean;
  /** Cumulative time on this question, in milliseconds (never a retry-sensitive delta). */
  timeMs: number;
}

export interface PaperItem {
  id: string;
  sectionId: string;
}

export interface AttemptState {
  items: readonly PaperItem[];
  /** Index into `items`. */
  current: number;
  answers: Readonly<Record<string, AnswerState>>;
  /** Sections the student may open now; with sectional timing only the open one. */
  openSections: readonly string[];
}

export type AttemptAction =
  | { type: 'go'; index: number }
  | { type: 'select'; option: OptionId }
  | { type: 'clear' }
  | { type: 'toggle_mark' }
  | { type: 'save_next' }
  | { type: 'mark_next' }
  | { type: 'tick'; ms: number }
  | { type: 'sections'; open: readonly string[] };

export const EMPTY_ANSWER: AnswerState = { selected: null, marked: false, visited: false, timeMs: 0 };

export function paletteOf(answer: AnswerState | undefined): Palette {
  if (!answer || !answer.visited) return answer?.selected ? (answer.marked ? 'answered_and_marked' : 'answered') : 'not_visited';
  if (answer.selected) return answer.marked ? 'answered_and_marked' : 'answered';
  return answer.marked ? 'marked_for_review' : 'not_answered';
}

/** Fresh state: the first question of the first open section is visited. */
export function initialState(
  items: readonly PaperItem[],
  answers: Readonly<Record<string, AnswerState>>,
  openSections: readonly string[],
  currentId?: string | null,
): AttemptState {
  const wanted = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  const open = new Set(openSections);
  const start =
    wanted >= 0 && open.has(items[wanted]!.sectionId) ? wanted : Math.max(0, items.findIndex((item) => open.has(item.sectionId)));
  return visit({ items, current: start, answers, openSections }, start);
}

function visit(state: AttemptState, index: number): AttemptState {
  const item = state.items[index];
  if (!item) return state;
  const answer = state.answers[item.id] ?? EMPTY_ANSWER;
  return {
    ...state,
    current: index,
    answers: answer.visited ? state.answers : { ...state.answers, [item.id]: { ...answer, visited: true } },
  };
}

function update(state: AttemptState, change: (answer: AnswerState) => AnswerState): AttemptState {
  const item = state.items[state.current];
  if (!item || !state.openSections.includes(item.sectionId)) return state;
  const answer = state.answers[item.id] ?? EMPTY_ANSWER;
  return { ...state, answers: { ...state.answers, [item.id]: change(answer) } };
}

/** The next question in an open section after the current one (stays put at the end). */
function nextIndex(state: AttemptState): number {
  for (let i = state.current + 1; i < state.items.length; i++)
    if (state.openSections.includes(state.items[i]!.sectionId)) return i;
  return state.current;
}

export function canOpen(state: AttemptState, index: number): boolean {
  const item = state.items[index];
  return !!item && state.openSections.includes(item.sectionId);
}

export function reduce(state: AttemptState, action: AttemptAction): AttemptState {
  switch (action.type) {
    case 'go':
      return canOpen(state, action.index) ? visit(state, action.index) : state;
    case 'select':
      return update(state, (a) => ({ ...a, selected: action.option }));
    case 'clear':
      return update(state, (a) => ({ ...a, selected: null }));
    case 'toggle_mark':
      return update(state, (a) => ({ ...a, marked: !a.marked }));
    case 'save_next':
      return visit(state, nextIndex(state));
    case 'mark_next':
      return visit(update(state, (a) => ({ ...a, marked: true })), nextIndex(state));
    case 'tick':
      if (action.ms <= 0) return state;
      return update(state, (a) => ({ ...a, timeMs: a.timeMs + Math.round(action.ms) }));
    case 'sections': {
      const next = { ...state, openSections: action.open };
      // The server moved on (time ran out or the student finished the section): follow it.
      return canOpen(next, next.current) ? next : visit(next, Math.max(0, next.items.findIndex((i) => action.open.includes(i.sectionId))));
    }
  }
}

export interface PaletteCounts {
  answered: number;
  notAnswered: number;
  notVisited: number;
  marked: number;
  answeredAndMarked: number;
  total: number;
}

/** Counts for the palette legend and the summary before submit, optionally for one section. */
export function counts(state: AttemptState, sectionId?: string): PaletteCounts {
  const out: PaletteCounts = { answered: 0, notAnswered: 0, notVisited: 0, marked: 0, answeredAndMarked: 0, total: 0 };
  for (const item of state.items) {
    if (sectionId && item.sectionId !== sectionId) continue;
    out.total++;
    const p = paletteOf(state.answers[item.id]);
    if (p === 'answered') out.answered++;
    else if (p === 'not_answered') out.notAnswered++;
    else if (p === 'not_visited') out.notVisited++;
    else if (p === 'marked_for_review') out.marked++;
    else out.answeredAndMarked++;
  }
  return out;
}

/** True when two answer snapshots differ in anything the server stores. */
export function answerChanged(a: AnswerState | undefined, b: AnswerState | undefined): boolean {
  const x = a ?? EMPTY_ANSWER;
  const y = b ?? EMPTY_ANSWER;
  return x.selected !== y.selected || x.marked !== y.marked || x.visited !== y.visited || Math.floor(x.timeMs / 1000) !== Math.floor(y.timeMs / 1000);
}
