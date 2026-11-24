'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import Link from 'next/link';
import { createContext, Suspense, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { ExaminerApplication, ExaminerAuthoringOptions, Profile } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { ApiRequestError } from '@/lib/api/http';
import { updateMe } from '@/lib/api/identity';
import { useAuth } from '@/features/auth/AuthProvider';
import { RequireSession } from '@/features/auth/RequireSession';
import { Alert, Waiting } from '@/features/auth/ui';
import { messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { ConsoleFrame, type ConsoleMenuGroup } from '@/ui/console/ConsoleFrame';
import styles from './examiner.module.css';

interface ExaminerContextValue {
  profile: Profile;
  application: ExaminerApplication | null;
  /** Every exam with a published template (for the application form). */
  options: ExaminerAuthoringOptions;
  /** Only the approved application's exams and subjects (what the API accepts). */
  assigned: ExaminerAuthoringOptions;
  approved: boolean;
  setApplication: (application: ExaminerApplication) => void;
}

const ExaminerContext = createContext<ExaminerContextValue | null>(null);

export function useExaminer(): ExaminerContextValue {
  const value = useContext(ExaminerContext);
  if (!value) throw new Error('useExaminer must be used inside ExaminerShell');
  return value;
}

/** PRD 4.4 examiner dashboard modules plus authoring. Phase 2 (question stats, ratings) is not listed. */
const MENU: ConsoleMenuGroup[] = [
  {
    group: 'Workspace',
    items: [{ href: '/examiner', label: 'Dashboard', icon: 'dashboard', open: true, lead: 'Your examiner workspace' }],
  },
  {
    group: 'Authoring',
    items: [
      { href: '/examiner/tests', label: 'Tests', icon: 'file', open: false, lead: 'Build tests from exam patterns' },
      { href: '/examiner/series', label: 'Test series', icon: 'layers', open: false, lead: 'Group tests students buy together' },
      { href: '/examiner/questions', label: 'Question bank', icon: 'database', open: false, lead: 'Write and revise your questions' },
      { href: '/examiner/imports', label: 'Upload questions', icon: 'upload', open: false, lead: 'Add many questions from a workbook' },
    ],
  },
  {
    group: 'Business',
    items: [
      { href: '/examiner/sales', label: 'Sales and revenue', icon: 'chart', open: false, lead: 'Sales, attempts and revenue' },
      { href: '/examiner/earnings', label: 'Earnings and payouts', icon: 'wallet', open: false, lead: 'Payouts, statements and TDS' },
      { href: '/examiner/coupon', label: 'Coupon code', icon: 'ticket', open: false, lead: 'Your examiner coupon code' },
    ],
  },
  {
    group: 'Quality',
    items: [
      { href: '/examiner/quality', label: 'Tier and quality', icon: 'award', open: false, lead: 'QC pass rate and your tier' },
      { href: '/examiner/reports', label: 'Student reports', icon: 'flag', open: false, lead: 'Reported questions to answer' },
    ],
  },
  {
    group: 'Account',
    items: [{ href: '/examiner/apply', label: 'Application', icon: 'user', open: true, lead: 'Your examiner application' }],
  },
];

/**
 * Examiner workspace frame: sidebar navigation plus the signed-in examiner's application and
 * catalogue, loaded once. Examiners skip student onboarding but confirm 18+ once. This is
 * navigation only; the API authorizes every call.
 */
export function ExaminerShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
        {(profile) =>
          profile.ageConfirmed ? (
            <ExaminerData profile={profile}>{children}</ExaminerData>
          ) : (
            <Frame profile={profile} approved={false}>
              <AgeConfirmation />
            </Frame>
          )
        }
      </RequireSession>
    </Suspense>
  );
}

function ExaminerData({ profile, children }: { profile: Profile; children: ReactNode }) {
  const { state, reload, set } = useLoad(async () => {
    const [options, application] = await Promise.all([adminApi.examinerOptions(), adminApi.examinerApplication()]);
    return { options, application };
  }, []);
  const setApplication = useCallback(
    (application: ExaminerApplication) => {
      if (state.status === 'ready') set({ ...state.data, application });
    },
    [state, set],
  );
  const value = useMemo<ExaminerContextValue | null>(() => {
    if (state.status !== 'ready') return null;
    const { options, application } = state.data;
    const approved = application?.status === 'approved';
    const assigned: ExaminerAuthoringOptions = {
      ...options,
      exams: approved
        ? options.exams
            .filter((exam) => application.examIds.includes(exam.id))
            .map((exam) => ({
              ...exam,
              subjects: exam.subjects.filter((subject) => application.subjectIds.includes(subject.id)),
            }))
        : [],
    };
    return { profile, application, options, assigned, approved, setApplication };
  }, [state, profile, setApplication]);

  return (
    <Frame profile={profile} approved={value?.approved ?? false}>
      {state.status === 'loading' ? (
        <Waiting label="Loading your examiner workspace…" />
      ) : state.status === 'error' || !value ? (
        <State kind={state.status === 'error' ? errorKind(state.error) : 'server'}
          title="Could not load your workspace"
          action={
            <button className="btn btn-primary" type="button" onClick={() => void reload()}>
              Try again
            </button>
          }
        >
          {state.status === 'error' ? messageOf(state.error) : 'Please try again.'}
        </State>
      ) : (
        <ExaminerContext.Provider value={value}>{children}</ExaminerContext.Provider>
      )}
    </Frame>
  );
}

function Frame({ profile, approved, children }: { profile: Profile; approved: boolean; children: ReactNode }) {
  return (
    <ConsoleFrame
      menu={MENU}
      home="/examiner"
      workspace="Examiner workspace"
      profile={profile}
      status={approved ? 'Approved examiner' : 'Examiner applicant'}
      enabled={approved}
      lockedHint="Opens after your application is approved"
    >
      {children}
    </ConsoleFrame>
  );
}

/** Pages that need an approved examiner; others see where to go next. */
export function ApprovedOnly({ children }: { children: ReactNode }) {
  const { approved, application } = useExaminer();
  if (approved) return <>{children}</>;
  return (
    <State
      title="Available after approval"
      action={
        <Link className="btn btn-primary" href="/examiner/apply">
          {application ? 'View your application' : 'Apply to become an examiner'}
        </Link>
      }
    >
      {application?.status === 'pending'
        ? 'Your application is with our team. Tests, series and questions open once it is approved.'
        : 'Apply with ten sample questions. Tests, series and questions open once you are approved.'}
    </State>
  );
}

export function PageHead({ title, lead, action }: { title: string; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className={admin.pageHead}>
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

function AgeConfirmation() {
  const { setProfile } = useAuth();
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!adult) return setError('Examiners must be 18 or older. Confirm to continue.');
    setBusy(true);
    setError(null);
    try {
      setProfile(await updateMe({ ageConfirmed: true }));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className={`${admin.card} ${styles.section}`} aria-labelledby="age-title">
      <h1 id="age-title">Confirm your age</h1>
      <p className={styles.lead}>MakeMePrepare examiners must be 18 or older. We record this once for your account.</p>
      {error ? <Alert>{error}</Alert> : null}
      <form className={styles.section} onSubmit={(event) => void submit(event)} noValidate>
        <label className={styles.check}>
          <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
          <span>I am 18 or older</span>
        </label>
        <div className={admin.actions}>
          <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </section>
  );
}
