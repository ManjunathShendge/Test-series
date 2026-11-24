'use client';

import Link from 'next/link';
import type { ExaminerTestSummary } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { examinerApi } from '@/lib/api/examiner';
import { Waiting } from '@/features/auth/ui';
import { messageOf, useLoad } from '@/features/admin/ui';
import { Glass, Pending, StatCard, today } from '@/ui/console/Dashboard';
import ui from '@/ui/console/console.module.css';
import { Icon } from '@/ui/icons/Icon';
import { useExaminer } from './ExaminerShell';
import styles from './examiner.module.css';

const IN_REVIEW = new Set(['submitted', 'in_qc']);
const LIVE = new Set(['approved', 'scheduled', 'live']);

/** Examiner dashboard: real counts only; nothing is shown that the platform does not record yet. */
export function ExaminerOverview() {
  const { profile, approved } = useExaminer();
  const first = profile.fullName.trim().split(/\s+/)[0] || 'there';
  return (
    <div className={styles.stack}>
      {approved ? <ApprovedDashboard first={first} /> : <ApplicantDashboard first={first} />}
    </div>
  );
}

function ApprovedDashboard({ first }: { first: string }) {
  const { state, reload } = useLoad(async () => {
    const [tests, series, all, approvedQuestions] = await Promise.all([
      examinerApi.tests(),
      examinerApi.series(),
      adminApi.examinerQuestions({ status: 'all', page: 1 }),
      adminApi.examinerQuestions({ status: 'approved', page: 1 }),
    ]);
    return { tests, series, questions: all.total, approvedQuestions: approvedQuestions.total };
  }, []);

  if (state.status === 'loading') return <Waiting label="Loading your dashboard…" />;
  if (state.status === 'error') {
    return (
      <div className={ui.panel} role="status">
        <h2>Could not load your dashboard</h2>
        <p className={styles.lead}>{messageOf(state.error)}</p>
        <div>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { tests, series, questions, approvedQuestions } = state.data;
  const drafts = tests.filter((test) => test.status === 'draft');
  const changes = tests.filter((test) => test.status === 'changes_requested');
  const inReview = tests.filter((test) => IN_REVIEW.has(test.status));
  const live = tests.filter((test) => LIVE.has(test.status));
  const building = [...drafts, ...changes];
  const ready = building.filter((test) => test.filledQuestions === test.totalQuestions);
  const unfinished = building.filter((test) => test.filledQuestions < test.totalQuestions);
  const placed = building.reduce((total, test) => total + test.filledQuestions, 0);
  const slots = building.reduce((total, test) => total + test.totalQuestions, 0);
  const seriesTests = series.reduce((total, item) => total + item.testCount, 0);
  const seriesPlanned = series.reduce((total, item) => total + item.totalPlannedTests, 0);
  const recent = tests.slice(0, 5);

  return (
    <>
      <section className={ui.hero} aria-labelledby="welcome-title">
        <div className={ui.heroHead}>
          <h1 id="welcome-title">Welcome back, {first}</h1>
          <span className={ui.pill}>{today()}</span>
          <p>Here is where your tests and questions stand today.</p>
        </div>
        <div className={ui.glassGrid}>
          <Glass icon="file" label="Tests" value={tests.length} note={`${building.length} being built`} />
          <Glass icon="clock" label="With QC review" value={inReview.length} note="Submitted and waiting for review" />
          <Glass icon="check" label="Approved or live" value={live.length} note="Passed QC review" />
          <Glass icon="database" label="Questions" value={questions} note={`${approvedQuestions} approved by QC`} />
        </div>
        <div className={ui.heroActions}>
          <Link className={`${ui.heroButton} ${ui.heroButtonSolid}`} href="/examiner/tests?new=1">
            <Icon name="plus" size={18} />
            Build a test
          </Link>
          <Link className={ui.heroButton} href="/examiner/questions">
            <Icon name="edit" size={18} />
            Write questions
          </Link>
        </div>
      </section>

      <div className={ui.cards}>
        <StatCard icon="database" chip={`${approvedQuestions} approved`} value={questions} label="Question bank" note="Your questions, latest versions" part={approvedQuestions} whole={questions} barLabel="Approved by QC" />
        <StatCard icon="file" chip={`${building.length} in progress`} value={placed} label="Questions placed" note={`Across ${building.length} test${building.length === 1 ? '' : 's'} being built`} part={placed} whole={slots} barLabel="Sections filled" />
        <StatCard icon="layers" chip={`${series.length} series`} value={seriesTests} label="Tests in series" note={`${seriesPlanned} planned across your series`} part={seriesTests} whole={seriesPlanned} barLabel="Series plan" />
        <StatCard icon="send" chip={`${ready.length} ready`} value={inReview.length + live.length} label="Tests submitted" note="Submitted, in review or approved" part={inReview.length + live.length} whole={tests.length} barLabel="Of all your tests" />
      </div>

      <div className={ui.panels}>
        <section className={ui.panel} aria-labelledby="quick-title">
          <div className={ui.panelHead}>
            <div>
              <h2 id="quick-title">Quick actions</h2>
              <p>Things you do most often</p>
            </div>
          </div>
          <div className={ui.actionGrid}>
            <Link className={`${ui.action} ${ui.actionA}`} href="/examiner/tests?new=1">
              <Icon name="file" size={24} />
              <b>Build a test</b>
              <small>From an exam pattern</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionB}`} href="/examiner/series">
              <Icon name="layers" size={24} />
              <b>Create a series</b>
              <small>Bundle your tests</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionC}`} href="/examiner/questions">
              <Icon name="edit" size={24} />
              <b>Write a question</b>
              <small>Editor with preview</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionD}`} href="/examiner/imports">
              <Icon name="upload" size={24} />
              <b>Upload questions</b>
              <small>From a workbook</small>
            </Link>
          </div>
        </section>

        <section className={ui.panel} aria-labelledby="recent-title">
          <div className={ui.panelHead}>
            <div>
              <h2 id="recent-title">Recent tests</h2>
              <p>Your last updated tests</p>
            </div>
            <Link href="/examiner/tests" className="t-small">
              View all
            </Link>
          </div>
          {recent.length ? (
            <ul className={ui.list}>
              {recent.map((test) => (
                <RecentTest key={test.id} test={test} />
              ))}
            </ul>
          ) : (
            <p className={styles.lead}>No tests yet. Build your first test from an exam pattern.</p>
          )}
        </section>
      </div>

      <section className={ui.panel} aria-labelledby="pending-title">
        <div className={ui.panelHead}>
          <div>
            <h2 id="pending-title">Pending actions</h2>
            <p>Tests that need something from you</p>
          </div>
          <span className={ui.chip}>{unfinished.length + changes.length + ready.length} pending</span>
        </div>
        <div className={ui.pendingGrid}>
          <Pending icon="edit" count={unfinished.length} title="Finish building" body="Tests with empty question positions." href="/examiner/tests" action="Continue building" />
          <Pending icon="alert" count={changes.length} title="Changes requested" body="QC asked for changes before approval." href="/examiner/tests" action="Review changes" />
          <Pending icon="send" count={ready.length} title="Ready to submit" body="Every position is filled. Run the checks and submit." href="/examiner/tests" action="Submit for review" />
        </div>
      </section>
    </>
  );
}

function RecentTest({ test }: { test: ExaminerTestSummary }) {
  return (
    <li>
      <span className={ui.listIcon}>
        <Icon name="file" size={18} />
      </span>
      <div>
        <b>{test.title}</b>
        <small>
          {test.filledQuestions}/{test.totalQuestions} questions · {test.status.replace('_', ' ')}
        </small>
      </div>
      <Link className="btn btn-secondary" href={`/examiner/tests/${test.id}`} aria-label={`Open ${test.title}`}>
        Open
      </Link>
    </li>
  );
}

const STEPS = [
  ['Apply', 'Profile, documents and ten sample questions.'],
  ['Get approved', 'Our team reviews your application.'],
  ['Write questions', 'In the editor or by uploading a workbook.'],
  ['Build tests', 'Follow the exam pattern and fill every section.'],
  ['Submit for QC', 'Reviewers check each question before it goes live.'],
] as const;

function ApplicantDashboard({ first }: { first: string }) {
  const { application } = useExaminer();
  const step = application?.status === 'pending' ? 1 : 0;
  return (
    <>
      <section className={ui.hero} aria-labelledby="welcome-title">
        <div className={ui.heroHead}>
          <h1 id="welcome-title">Welcome, {first}</h1>
          <span className={ui.pill}>{today()}</span>
          <p>
            {!application
              ? 'Become a MakeMePrepare examiner: apply with your profile and ten sample questions.'
              : application.status === 'pending'
                ? 'Your application is with our team. Tests, series and questions open once you are approved.'
                : `Your application needs changes: ${application.rejectionReason ?? 'see the review feedback.'}`}
          </p>
        </div>
        <div className={ui.glassGrid}>
          <Glass icon="user" label="Application" value={!application ? 'Not started' : application.status === 'pending' ? 'In review' : 'Needs changes'} note="Profile, documents and samples" />
          <Glass icon="edit" label="Sample questions" value={`${application?.samples.length ?? 0} / 10`} note="Ten are needed to apply" />
        </div>
        <div className={ui.heroActions}>
          <Link className={`${ui.heroButton} ${ui.heroButtonSolid}`} href="/examiner/apply">
            <Icon name={application?.status === 'pending' ? 'file' : 'edit'} size={18} />
            {!application ? 'Start your application' : application.status === 'pending' ? 'View application' : 'Revise application'}
          </Link>
        </div>
      </section>
      <section className={ui.panel} aria-labelledby="steps-title">
        <div className={ui.panelHead}>
          <div>
            <h2 id="steps-title">How it works</h2>
            <p>From application to your first live test</p>
          </div>
        </div>
        <ul className={ui.list}>
          {STEPS.map(([title, body], index) => (
            <li key={title}>
              <span className={ui.listIcon}>{index < step ? <Icon name="check" size={18} /> : index + 1}</span>
              <div>
                <b>{title}</b>
                <small>{body}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
