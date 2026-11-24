'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import type { TestDetail } from '@exam-prep/contracts';
import { track } from '@/lib/analytics';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { isDurable, newLocalAttempt, saveAttempt } from '@/lib/storage/attemptStore';
import { RequireSession } from '@/features/auth/RequireSession';
import { Alert, BusyButton } from '@/features/auth/ui';
import { formatDuration, formatMarks, LANGUAGE_LABEL } from '@/features/catalogue/format';
import { SectionTable } from '@/features/catalogue/parts';
import { testRules } from '@/features/catalogue/rules';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { AttemptBar, PaletteLegend } from './parts';
import styles from './attempt.module.css';

type Problem =
  | { kind: 'entitlement' }
  | { kind: 'other-test'; attemptId: string | null }
  | { kind: 'message'; text: string };

/** PRD 6.4: instructions, then "I have read the instructions", then the clock starts. */
export function StartView({ test }: { test: TestDetail }) {
  return (
    <RequireSession>
      {() => <Instructions test={test} />}
    </RequireSession>
  );
}

function Instructions({ test }: { test: TestDetail }) {
  const router = useRouter();
  const checkId = useId();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [durable, setDurable] = useState(true);

  useEffect(() => {
    void isDurable().then(setDurable);
  }, []);

  async function start() {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await attemptsApi.start(test.id);
      if ('sessionToken' in reply) {
        const { state, sessionToken } = reply;
        // The token goes to the device before the player opens, so a refresh keeps this tab the writer.
        await saveAttempt(newLocalAttempt(state.attemptId, sessionToken, state.epoch, state.ackSeq)).catch(() => undefined);
        if (test.pricePaise === 0) track('free_attempt_started', { testId: test.id });
        router.replace(`/attempt/${state.attemptId}`);
      } else {
        // Already running (another tab or device): the player offers to continue here.
        router.replace(`/attempt/${reply.attemptId}`);
      }
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiRequestError && error.code === 'NOT_ENTITLED') return setProblem({ kind: 'entitlement' });
      if (error instanceof ApiRequestError && error.code === 'ATTEMPT_IN_PROGRESS') {
        const details = error.details as { attemptId?: unknown } | undefined;
        return setProblem({ kind: 'other-test', attemptId: typeof details?.attemptId === 'string' ? details.attemptId : null });
      }
      setProblem({
        kind: 'message',
        text: error instanceof ApiRequestError ? error.message : 'We could not start the test. Check your connection and try again.',
      });
    }
  }

  const sectional = test.sections.some((s) => s.durationSeconds !== null);

  return (
    <div className={styles.page}>
      <AttemptBar title={test.title} subtitle={test.exam.name} />
      <main id="main" className={styles.wrap}>
        <div>
          <p className={styles.eyebrow}>Instructions</p>
          <h1 className={styles.h1}>Read before you begin</h1>
          <ul className={styles.facts}>
            <li>
              <Glyph name="tests" size={16} /> {test.totalQuestions} questions
            </li>
            <li>
              <Glyph name="clock" size={16} /> {formatDuration(test.durationSeconds)}
            </li>
            <li>
              <Glyph name="trophy" size={16} /> {formatMarks(test.totalMarks)} marks
            </li>
            <li>
              <Glyph name="language" size={16} /> {test.languages.map((l) => LANGUAGE_LABEL[l]).join(' + ')}
            </li>
          </ul>
        </div>

        <section className="card" aria-labelledby="pattern-title">
          <h2 id="pattern-title" className={styles.h2}>
            Sections and marking
          </h2>
          <SectionTable sections={test.sections} caption={`${test.title} sections`} />
        </section>

        <section className="card" aria-labelledby="rules-title">
          <h2 id="rules-title" className={styles.h2}>
            How this test works
          </h2>
          <ul className={styles.list}>
            {testRules(test).map((rule) => (
              <li key={rule}>
                <Glyph name="check" size={16} /> {rule}
              </li>
            ))}
            <li>
              <Glyph name="check" size={16} /> The timer runs on our server. Closing the tab or losing your connection does
              not stop it, and you can reopen the test to continue until time runs out.
            </li>
            <li>
              <Glyph name="check" size={16} /> Every answer is saved on this device first, then sent to our server. If you
              go offline, keep answering; we send your answers when you reconnect.
            </li>
            {sectional ? (
              <li>
                <Glyph name="check" size={16} /> You can finish a section early, but you cannot return to it, and its unused
                time is not added to later sections.
              </li>
            ) : null}
            <li>
              <Glyph name="check" size={16} /> The test can be open on one device at a time. Opening it somewhere else asks you
              to move it there.
            </li>
          </ul>
        </section>

        <section className="card" aria-labelledby="palette-title">
          <h2 id="palette-title" className={styles.h2}>
            Question palette
          </h2>
          <p className="t-small t-secondary" style={{ marginTop: 0 }}>
            The numbers on the right of the test screen show where you are. Each shape means:
          </p>
          <PaletteLegend />
          <p className="t-small t-secondary" style={{ marginBottom: 0 }}>
            Use <strong>Save &amp; Next</strong> to keep an answer and move on, <strong>Mark for Review &amp; Next</strong> to
            come back to a question later, and <strong>Clear Response</strong> to remove an answer. A marked question that has
            an answer is still scored.
          </p>
        </section>

        {!durable ? (
          <p className={styles.warn} role="status">
            <Glyph name="bell" size={16} />
            <span>
              This browser is not letting us save answers on the device (a private window can do this). Your answers still go
              to our server while you are online, but stay connected during the test.
            </span>
          </p>
        ) : null}

        {problem?.kind === 'entitlement' ? (
          <Alert>
            You don’t have access to this test yet. <Link href={`/tests/${test.slug}`}>Get access on the test page</Link>, then
            come back.
          </Alert>
        ) : null}
        {problem?.kind === 'other-test' ? (
          <Alert>
            You have another test in progress. Finish or submit it before starting a new one.{' '}
            {problem.attemptId ? <Link href={`/attempt/${problem.attemptId}`}>Go to that test</Link> : null}
          </Alert>
        ) : null}
        {problem?.kind === 'message' ? <Alert>{problem.text}</Alert> : null}

        <label className={styles.check} htmlFor={checkId}>
          <input id={checkId} type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            I have read and understood the instructions. I agree that the timer starts as soon as I press{' '}
            <strong>Start test</strong>.
          </span>
        </label>

        <div className={styles.startRow}>
          <BusyButton type="button" busy={busy} disabled={!accepted} className="btn btn-primary btn-lg" onClick={() => void start()}>
            Start test <Glyph name="arrow" size={18} />
          </BusyButton>
          <Link href={`/tests/${test.slug}`} className="btn btn-ghost btn-lg">
            Back to test details
          </Link>
        </div>
      </main>
    </div>
  );
}
