'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AttemptSection, PaperQuestion } from '@exam-prep/contracts';
import { canOpen, counts, formatCountdown, paletteOf, type AttemptState, type OptionId } from '@exam-prep/engine';
import { attemptsApi } from '@/lib/api/attempts';
import { isDurable } from '@/lib/storage/attemptStore';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import { RichText } from '@/ui/patterns/RichText';
import { AttemptBar, cellClass, PALETTE_LABEL, PaletteLegend } from './parts';
import { useAttempt, type Net } from './useAttempt';
import styles from './attempt.module.css';

const LANG_KEY = 'mmp.attempt.lang';
const ZOOM_KEY = 'mmp.attempt.zoom';
const ZOOMS = [0.9, 1, 1.15, 1.3, 1.5] as const;

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference only.
  }
}

export function PlayerView({ attemptId }: { attemptId: string }) {
  return <RequireSession>{() => <Player attemptId={attemptId} />}</RequireSession>;
}

/**
 * One writer per attempt in this browser (TEST_ENGINE "Browser tabs also coordinate a single
 * writer"): a Web Lock per attempt. A second tab waits and can take over; the first one stops.
 */
function useSingleTab(name: string, onHeld: () => void, onLost: () => void) {
  const [busy, setBusy] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const handlers = useRef({ onHeld, onLost });
  handlers.current = { onHeld, onLost };

  const acquire = useCallback(
    (steal: boolean, tries = 0) => {
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (!locks) {
        handlers.current.onHeld();
        return;
      }
      let held = false;
      locks
        .request(name, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) return null;
          held = true;
          setBusy(false);
          handlers.current.onHeld();
          return new Promise<void>((resolve) => {
            release.current = resolve;
          });
        })
        .then(
          () => {
            if (held) return;
            // A reload can briefly overlap the old page's lock; try again before calling it busy.
            if (tries < 3) setTimeout(() => acquire(false, tries + 1), 250);
            else setBusy(true);
          },
          () => {
            // Another tab took the lock.
            release.current = null;
            setBusy(true);
            handlers.current.onLost();
          },
        );
    },
    [name],
  );

  useEffect(() => {
    acquire(false);
    return () => {
      release.current?.();
      release.current = null;
    };
  }, [acquire]);

  return { busy, takeTab: () => acquire(true) };
}

function Player({ attemptId }: { attemptId: string }) {
  const a = useAttempt(attemptId);
  const tab = useSingleTab(`mmp-attempt-${attemptId}`, () => void a.boot(), a.showOtherTab);
  const running = a.phase.kind === 'running' || a.phase.kind === 'submitting';

  // Leaving mid-test asks first; the answers are safe either way.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  if (tab.busy || a.phase.kind === 'other-tab')
    return (
      <Gate
        title="This test is open in another tab"
        action={
          <button type="button" className="btn btn-primary btn-lg" onClick={tab.takeTab}>
            Use this tab instead
          </button>
        }
      >
        <p>To keep your answers in order, a test can be open in only one tab at a time. Your answers are safe.</p>
      </Gate>
    );
  if (a.phase.kind === 'loading') return <FullWait label="Opening your test…" />;
  if (a.phase.kind === 'done') return <FullWait label="Opening your score…" />;
  if (a.phase.kind === 'takeover') {
    const { unsynced } = a.phase;
    return (
      <Gate
        title="This test is open on another device"
        action={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void a.takeover()}>
            Continue on this device
          </button>
        }
      >
        <p>
          Your test is running on another device or browser. You can move it here; the timer keeps running and answers the
          server already has come with you.
        </p>
        {unsynced > 0 ? (
          <p className={styles.warn}>
            <Glyph name="bell" size={16} />
            <span>
              {unsynced} change{unsynced === 1 ? '' : 's'} on this device never reached the server and can’t be merged safely.
              {unsynced === 1 ? ' It' : ' They'} will be discarded.
            </span>
          </p>
        ) : null}
      </Gate>
    );
  }
  if (a.phase.kind === 'error')
    return (
      <main id="main" className={styles.page}>
        <ErrorScreen kind={errorKind(a.phase.error)} variant="page" onRetry={() => void a.boot()} />
      </main>
    );
  if (!a.engine || !a.meta) return <FullWait label="Opening your test…" />;
  return <Paper a={a} attemptId={attemptId} engine={a.engine} />;
}

function FullWait({ label }: { label: string }) {
  return (
    <main id="main" className={styles.page} style={{ display: 'grid', placeItems: 'center' }}>
      <Waiting label={label} />
    </main>
  );
}

/** Full-page choice screens (another tab, another device), in the same style as error screens. */
function Gate({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <main id="main" className={styles.page}>
      <section className={styles.wrap} style={{ maxWidth: 560, textAlign: 'center', justifyItems: 'center', paddingTop: 80 }}>
        <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
          <rect x="8" y="14" width="92" height="64" rx="8" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="3" />
          <rect x="18" y="24" width="72" height="44" rx="4" fill="var(--surface)" />
          <path d="M40 96h28M54 78v18" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
          <rect x="108" y="40" width="44" height="72" rx="8" fill="var(--surface)" stroke="var(--brand)" strokeWidth="3" />
          <circle cx="130" cy="102" r="3" fill="var(--brand)" />
          <path d="M98 56c8-10 16-12 24-8" stroke="var(--steel-500)" strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="4 6" />
          <path d="m118 42 6 6-8 3" stroke="var(--steel-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <h1 className={styles.h1}>{title}</h1>
        <div className="t-secondary" style={{ display: 'grid', gap: 12, lineHeight: 1.6 }}>
          {children}
        </div>
        <div className={styles.startRow} style={{ justifyContent: 'center' }}>
          {action}
          <Link href="/account" className="btn btn-ghost btn-lg">
            Go to my account
          </Link>
        </div>
      </section>
    </main>
  );
}

type Controller = ReturnType<typeof useAttempt>;

function Paper({ a, attemptId, engine }: { a: Controller; attemptId: string; engine: AttemptState }) {
  const meta = a.meta!;
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [zoom, setZoom] = useState(1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<'submit' | 'section' | null>(null);
  const [durable, setDurable] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paletteId = useId();

  useEffect(() => {
    if (meta.hasHindi && readPref(LANG_KEY) === 'hi') setLang('hi');
    const z = Number(readPref(ZOOM_KEY));
    if ((ZOOMS as readonly number[]).includes(z)) setZoom(z);
    void isDurable().then(setDurable);
  }, [meta.hasHindi]);

  const item = engine.items[engine.current];
  const question = a.questions[engine.current];
  const answer = item ? engine.answers[item.id] : undefined;
  const sectionId = item?.sectionId;
  const section = a.sections.find((s) => s.id === sectionId);
  const openSection = a.sections.find((s) => engine.openSections.includes(s.id));
  const waitingForSection = engine.openSections.length === 0;
  const lastSection = a.sections[a.sections.length - 1];
  const submitting = a.phase.kind === 'submitting';

  // New question: start reading from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [engine.current]);

  const left = Math.max(0, a.deadline - a.clock);
  const sectionLeft = meta.sectional && openSection?.closesAt ? Math.max(0, Date.parse(openSection.closesAt) - a.clock) : null;

  function go(index: number) {
    a.dispatch({ type: 'go', index });
    setPaletteOpen(false);
  }
  function openSectionTab(s: AttemptSection) {
    const index = engine.items.findIndex((i) => i.sectionId === s.id);
    if (index >= 0) go(index);
  }
  function changeLang(next: 'en' | 'hi') {
    setLang(next);
    writePref(LANG_KEY, next);
  }
  function changeZoom(step: 1 | -1) {
    const i = Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]) + step));
    setZoom(ZOOMS[i]!);
    writePref(ZOOM_KEY, String(ZOOMS[i]));
  }

  const sectionItems = engine.items.map((it, index) => ({ ...it, index })).filter((it) => it.sectionId === sectionId);
  const sectionCounts = counts(engine, sectionId);
  const hi = lang === 'hi';

  return (
    <div className={styles.player} style={{ '--zoom': zoom } as CSSProperties}>
      <AttemptBar title={meta.testTitle} subtitle={meta.examName}>
        <div className={styles.timers}>
          {sectionLeft !== null ? <Timer label="Section" ms={sectionLeft} /> : null}
          <Timer label={meta.sectional ? 'Total' : 'Time left'} ms={left} />
        </div>
        <div className={styles.tools}>
          {meta.hasHindi ? (
            <div className={styles.toolGroup} role="group" aria-label="Question language">
              <button type="button" className={styles.toolBtn} aria-pressed={!hi} onClick={() => changeLang('en')}>
                EN
              </button>
              <button type="button" className={styles.toolBtn} aria-pressed={hi} onClick={() => changeLang('hi')} lang="hi">
                हिं
              </button>
            </div>
          ) : null}
          <div className={`${styles.toolGroup} ${styles.hideNarrow}`} role="group" aria-label="Text size">
            <button type="button" className={styles.toolBtn} onClick={() => changeZoom(-1)} disabled={zoom === ZOOMS[0]} aria-label="Smaller text">
              A−
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => changeZoom(1)}
              disabled={zoom === ZOOMS[ZOOMS.length - 1]}
              aria-label="Larger text"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            className={`${styles.toolBtn} ${styles.paletteToggle}`}
            aria-expanded={paletteOpen}
            aria-controls={paletteId}
            onClick={() => setPaletteOpen(true)}
          >
            Questions
          </button>
        </div>
      </AttemptBar>

      <nav className={styles.tabs} aria-label="Sections">
        {a.sections.map((s) => {
          const open = engine.openSections.includes(s.id);
          const c = counts(engine, s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={styles.tab}
              aria-current={s.id === sectionId ? 'true' : undefined}
              disabled={!open}
              onClick={() => openSectionTab(s)}
              title={open ? undefined : s.state === 'closed' ? 'This section has closed' : 'Opens after the current section'}
            >
              {s.name}
              <span className={styles.tabCount}>
                {open ? `${c.answered + c.answeredAndMarked}/${c.total}` : s.state === 'closed' ? 'Closed' : 'Locked'}
              </span>
            </button>
          );
        })}
      </nav>

      <div className={styles.body}>
        <main id="main" className={styles.main}>
          <div className={styles.scroll} ref={scrollRef} onCopy={(e) => e.preventDefault()}>
            <div className={styles.watermark} aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i}>{meta.watermark}</span>
              ))}
            </div>
            <div className={styles.qInner}>
              <Banners a={a} durable={durable} />
              {waitingForSection ? (
                <div className={styles.waitPane}>
                  <Waiting label={a.net === 'offline' ? 'Waiting for a connection to open the next section…' : 'Opening the next section…'} />
                </div>
              ) : question && item ? (
                <QuestionBody
                  attemptId={attemptId}
                  question={question}
                  section={section}
                  hi={hi}
                  selected={answer?.selected ?? null}
                  disabled={!canOpen(engine, engine.current) || submitting}
                  onSelect={(option) => a.dispatch({ type: 'select', option })}
                />
              ) : null}
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => go(engine.current - 1)}
              disabled={submitting || waitingForSection || !canOpen(engine, engine.current - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className={`btn ${styles.btnReview}`}
              onClick={() => a.dispatch({ type: 'mark_next' })}
              disabled={submitting || waitingForSection}
            >
              Mark for Review &amp; Next
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => a.dispatch({ type: 'clear' })}
              disabled={submitting || waitingForSection || !answer?.selected}
            >
              Clear Response
            </button>
            <span className={styles.spacer} />
            <button type="button" className="btn btn-primary" onClick={() => a.dispatch({ type: 'save_next' })} disabled={submitting || waitingForSection}>
              Save &amp; Next
            </button>
          </div>
        </main>

        {paletteOpen ? <button type="button" className={styles.scrim} aria-label="Close question palette" onClick={() => setPaletteOpen(false)} /> : null}
        <aside
          id={paletteId}
          className={`${styles.side} ${paletteOpen ? styles.sideOpen : ''}`}
          aria-label="Question palette"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPaletteOpen(false);
          }}
        >
          <div className={styles.sideHead}>
            <SyncLine net={a.net} pending={a.pending} storageFailed={a.storageFailed} durable={durable} />
            <PaletteLegend counts={sectionCounts} compact />
          </div>
          <div className={styles.sideScroll}>
            <p className={styles.gridTitle}>{section?.name ?? 'Questions'}</p>
            <ol className={styles.grid}>
              {sectionItems.map((it) => {
                const p = paletteOf(engine.answers[it.id]);
                const n = a.questions[it.index]?.number ?? it.index + 1;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={`${cellClass(p)} ${it.index === engine.current ? styles.current : ''}`}
                      aria-label={`Question ${n}, ${PALETTE_LABEL[p].toLowerCase()}`}
                      aria-current={it.index === engine.current ? 'step' : undefined}
                      disabled={!canOpen(engine, it.index) || submitting}
                      onClick={() => go(it.index)}
                    >
                      {n}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className={styles.sideFoot}>
            {meta.sectional && openSection && openSection.id !== lastSection?.id ? (
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setDialog('section')} disabled={submitting}>
                Finish {openSection.name}
              </button>
            ) : null}
            <button type="button" className="btn btn-primary btn-full" onClick={() => setDialog('submit')} disabled={submitting}>
              Submit test
            </button>
          </div>
        </aside>
      </div>

      <Modal open={dialog === 'submit'} onClose={() => setDialog(null)} title="Submit your test?">
        <p>After you submit, you can’t change any answers. Here is where you stand:</p>
        <CountTable engine={engine} sections={a.sections} />
        {a.pending > 0 && a.net === 'offline' ? (
          <p className={styles.warn}>
            <Glyph name="bell" size={16} />
            <span>
              You’re offline. {a.pending} change{a.pending === 1 ? ' is' : 's are'} saved on this device and will be sent with
              your submission when you reconnect.
            </span>
          </p>
        ) : null}
        {meta.sectional && openSection && openSection.id !== lastSection?.id ? (
          <p className="t-small t-secondary">Sections you haven’t reached yet will close with this submission.</p>
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
            Keep working
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDialog(null);
              void a.submit();
            }}
          >
            Submit test
          </button>
        </div>
      </Modal>

      <Modal open={dialog === 'section' && !!openSection} onClose={() => setDialog(null)} title={`Finish ${openSection?.name ?? 'section'}?`}>
        <p>
          You can’t come back to {openSection?.name ?? 'this section'} after this, and its remaining
          {sectionLeft !== null ? ` ${formatCountdown(sectionLeft)}` : ' time'} won’t be added to the next section.
        </p>
        {openSection ? <CountTable engine={engine} sections={[openSection]} /> : null}
        <div className={styles.dialogActions}>
          <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
            Stay in this section
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDialog(null);
              if (openSection) a.finishSection(openSection.id);
            }}
          >
            Finish section
          </button>
        </div>
      </Modal>

      {submitting ? (
        <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="submitting-title" style={{ position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content', zIndex: 60 }}>
          <div className={styles.dialogBody}>
            <h2 id="submitting-title">{a.phase.kind === 'submitting' && a.phase.waiting ? 'Submission pending' : 'Submitting your test…'}</h2>
            {a.phase.kind === 'submitting' && a.phase.waiting ? (
              <p>
                You’re offline. Your answers are saved on this device and we’ll submit as soon as you reconnect. Keep this tab
                open.
              </p>
            ) : (
              <Waiting label="Sending your final answers" />
            )}
          </div>
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {a.announcement}
      </p>
    </div>
  );
}

function Timer({ label, ms }: { label: string; ms: number }) {
  const tone = ms <= 60_000 ? styles.timerOut : ms <= 5 * 60_000 ? styles.timerLow : '';
  return (
    <div className={`${styles.timer} ${tone}`} role="timer" aria-label={`${label} remaining`}>
      <span>{label}</span>
      <strong>{formatCountdown(ms)}</strong>
    </div>
  );
}

function SyncLine({ net, pending, storageFailed, durable }: { net: Net; pending: number; storageFailed: boolean; durable: boolean }) {
  if (storageFailed)
    return (
      <p className={`${styles.sync} ${styles.syncBad}`}>
        <span className={styles.dot} /> Not saved on this device
      </p>
    );
  if (net === 'offline')
    return (
      <p className={`${styles.sync} ${styles.syncOff}`}>
        <span className={styles.dot} /> Offline · {durable ? `${pending} saved on this device` : 'keep this tab open'}
      </p>
    );
  if (net === 'saving' || pending > 0)
    return (
      <p className={`${styles.sync} ${styles.syncBusy}`}>
        <span className={styles.dot} /> Saving…
      </p>
    );
  return (
    <p className={`${styles.sync} ${styles.syncOk}`}>
      <span className={styles.dot} /> All answers saved
    </p>
  );
}

function Banners({ a, durable }: { a: Controller; durable: boolean }) {
  return (
    <>
      {a.storageFailed ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <p>This browser didn’t save your last change on the device. It will still be sent to the server while you’re online.</p>
          <button type="button" className="btn btn-secondary" onClick={a.retryStorage}>
            Try saving again
          </button>
        </div>
      ) : null}
      {a.net === 'offline' ? (
        <div className={styles.banner} role="status">
          <p>
            {durable
              ? 'You’re offline. Keep answering: your answers are saved on this device and will be sent when you reconnect. The timer keeps running.'
              : 'You’re offline and this browser can’t save answers on the device. Keep this tab open until you reconnect.'}
          </p>
        </div>
      ) : null}
      {a.notice ? (
        <div className={`${styles.banner} ${styles.bannerInfo}`} role="status">
          <p>{a.notice}</p>
          <button type="button" className="btn btn-ghost" onClick={a.dismissNotice}>
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}

function QuestionBody({
  attemptId,
  question,
  section,
  hi,
  selected,
  disabled,
  onSelect,
}: {
  attemptId: string;
  question: PaperQuestion;
  section: AttemptSection | undefined;
  hi: boolean;
  selected: OptionId | null;
  disabled: boolean;
  onSelect: (option: OptionId) => void;
}) {
  const useHi = hi && !!question.stemHi;
  const lang = useHi ? 'hi' : 'en';
  const passage = useHi ? (question.passageHi ?? question.passageEn) : question.passageEn;
  const legendId = useId();
  return (
    <article aria-labelledby={legendId}>
      <div className={styles.qHead}>
        <h1 className={styles.qNum} id={legendId}>
          Question {question.number}
        </h1>
        <span className={styles.marks}>
          <span className={styles.plus}>+{question.positiveMarks}</span>
          {question.negativeMarks ? <span className={styles.minus}>−{question.negativeMarks}</span> : null}
        </span>
        {section ? <span className={styles.qMeta}>{section.name}</span> : null}
      </div>
      {hi && !question.stemHi ? <p className={styles.fallback}>Hindi is not available for this question; showing English.</p> : null}
      {passage ? (
        <div className={styles.passage}>
          <RichText text={passage} lang={lang} />
        </div>
      ) : null}
      <div className={styles.stem}>
        <RichText text={useHi ? question.stemHi! : question.stemEn} lang={lang} />
      </div>
      {question.imageAssetIds.length ? (
        <div className={styles.images}>
          {question.imageAssetIds.map((id, i) => (
            <QuestionImage key={id} attemptId={attemptId} assetId={id} alt={`Figure ${i + 1} for question ${question.number}`} />
          ))}
        </div>
      ) : null}
      <fieldset className={styles.options} disabled={disabled}>
        <legend className="visually-hidden">Choose one answer for question {question.number}</legend>
        {question.options.map((o) => (
          <label key={o.id} className={styles.option}>
            <input
              type="radio"
              name={`q-${question.testQuestionId}`}
              value={o.id}
              checked={selected === o.id}
              onChange={() => onSelect(o.id)}
            />
            <span className={styles.optKey} aria-hidden="true">
              {o.id}
            </span>
            <span className={styles.optText}>
              <span className="visually-hidden">Option {o.id}: </span>
              <RichText text={useHi && o.textHi ? o.textHi : o.textEn} lang={lang} />
            </span>
          </label>
        ))}
      </fieldset>
    </article>
  );
}

/** Question figures come through short-lived links scoped to this attempt. */
function QuestionImage({ attemptId, assetId, alt }: { attemptId: string; assetId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    attemptsApi.image(attemptId, assetId).then(
      (r) => live && setUrl(r.url),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attemptId, assetId, tries]);
  if (url) return <img src={url} alt={alt} onError={() => {
          setUrl(null);
          setFailed(true);
        }} />;
  return (
    <div className={styles.imageWait}>
      {failed ? (
        <button type="button" className="btn btn-secondary" onClick={() => setTries((t) => t + 1)}>
          Image didn’t load. Try again
        </button>
      ) : (
        'Loading image…'
      )}
    </div>
  );
}

function CountTable({ engine, sections }: { engine: AttemptState; sections: AttemptSection[] }) {
  const rows = sections.map((s) => ({ name: s.name, c: counts(engine, s.id) }));
  const total = counts(engine);
  return (
    <div className={styles.tableScroll}>
      <table className={styles.countTable}>
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Answered</th>
            <th scope="col">Not answered</th>
            <th scope="col">Marked</th>
            <th scope="col">Answered &amp; marked</th>
            <th scope="col">Not visited</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, c }) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{c.answered}</td>
              <td>{c.notAnswered}</td>
              <td>{c.marked}</td>
              <td>{c.answeredAndMarked}</td>
              <td>{c.notVisited}</td>
            </tr>
          ))}
          {rows.length > 1 ? (
            <tr>
              <th scope="row">Total</th>
              <td>{total.answered}</td>
              <td>{total.notAnswered}</td>
              <td>{total.marked}</td>
              <td>{total.answeredAndMarked}</td>
              <td>{total.notVisited}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Native modal dialog: focus moves in, Escape closes, the page behind is inert. */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      {open ? (
        <div className={styles.dialogBody}>
          <h2 id={titleId}>{title}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
