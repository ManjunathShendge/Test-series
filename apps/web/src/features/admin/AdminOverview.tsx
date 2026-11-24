'use client';

import Link from 'next/link';
import type { ExaminerApplication } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { useAuth } from '@/features/auth/AuthProvider';
import { Waiting } from '@/features/auth/ui';
import { Glass, Pending, StatCard, plural, today } from '@/ui/console/Dashboard';
import ui from '@/ui/console/console.module.css';
import { Icon } from '@/ui/icons/Icon';
import { messageOf, useLoad } from './ui';

const STATUS_LABEL: Record<ExaminerApplication['status'], string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Not approved',
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Admin dashboard: counts from the modules that exist (exams, templates, examiner applications).
 * Sales, QC and payout figures appear once those modules ship; nothing here is invented.
 */
export function AdminOverview() {
  const { state: auth } = useAuth();
  const first = auth.status === 'ready' ? auth.profile.fullName.trim().split(/\s+/)[0] || 'there' : 'there';
  const { state, reload } = useLoad(async () => {
    const [exams, applications] = await Promise.all([adminApi.exams(), adminApi.examinerApplications()]);
    return { exams, applications };
  }, []);

  if (state.status === 'loading') return <Waiting label="Loading the dashboard…" />;
  if (state.status === 'error') {
    return (
      <section className={ui.panel} role="status">
        <h2>Could not load the dashboard</h2>
        <p className={ui.muted}>{messageOf(state.error)}</p>
        <div>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  const { exams, applications } = state.data;
  const live = exams.filter((exam) => exam.isActive).length;
  const hidden = exams.length - live;
  const published = exams.reduce((total, exam) => total + exam.publishedTemplateCount, 0);
  const drafts = exams.reduce((total, exam) => total + exam.draftTemplateCount, 0);
  const ready = exams.filter((exam) => exam.publishedTemplateCount > 0).length;
  const pending = applications.filter((item) => item.status === 'pending').length;
  const approved = applications.filter((item) => item.status === 'approved').length;
  const rejected = applications.filter((item) => item.status === 'rejected').length;
  const recent = [...applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className={ui.page}>
      <section className={ui.hero} aria-labelledby="welcome-title">
        <div className={ui.heroHead}>
          <h1 id="welcome-title">Welcome back, {first}</h1>
          <span className={ui.pill}>{today()}</span>
          <p>Here is where exams and examiners stand today.</p>
        </div>
        <div className={ui.glassGrid}>
          <Glass icon="grid" label="Exams" value={exams.length} note={`${live} on the website`} />
          <Glass icon="file" label="Published templates" value={published} note={`${plural(drafts, 'draft')} in progress`} />
          <Glass icon="clock" label="Applications to review" value={pending} note="Waiting for a decision" />
          <Glass icon="users" label="Approved examiners" value={approved} note="Can write questions and build tests" />
        </div>
        <div className={ui.heroActions}>
          <Link className={`${ui.heroButton} ${ui.heroButtonSolid}`} href="/admin/examiners">
            <Icon name="users" size={18} />
            Review applications
          </Link>
          <Link className={ui.heroButton} href="/admin/exams">
            <Icon name="grid" size={18} />
            Manage exams
          </Link>
        </div>
      </section>

      <div className={ui.cards}>
        <StatCard icon="grid" chip={`${live} live`} value={exams.length} label="Exams" note="Shown on the website once made live" part={live} whole={exams.length} barLabel="On the website" />
        <StatCard icon="file" chip={plural(drafts, 'draft')} value={published} label="Published templates" note="Exam patterns examiners build from" part={published} whole={published + drafts} barLabel="Published" />
        <StatCard icon="check" chip={`${ready} ready`} value={ready} label="Exams open to examiners" note="Have at least one published template" part={ready} whole={exams.length} barLabel="Of all exams" />
        <StatCard icon="users" chip={`${pending} pending`} value={applications.length} label="Examiner applications" note={`${approved} approved, ${rejected} not approved`} part={approved + rejected} whole={applications.length} barLabel="Decided" />
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
            <Link className={`${ui.action} ${ui.actionA}`} href="/admin/exams">
              <Icon name="plus" size={24} />
              <b>Add an exam</b>
              <small>Category, stages and syllabus</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionB}`} href="/admin/exams">
              <Icon name="file" size={24} />
              <b>Publish a template</b>
              <small>{plural(drafts, 'draft')} in progress</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionC}`} href="/admin/examiners">
              <Icon name="users" size={24} />
              <b>Review examiners</b>
              <small>Samples and agreement</small>
            </Link>
            <Link className={`${ui.action} ${ui.actionD}`} href="/admin/examiners">
              <Icon name="shield" size={24} />
              <b>Check KYC</b>
              <small>PAN and bank proof</small>
            </Link>
          </div>
        </section>

        <section className={ui.panel} aria-labelledby="recent-title">
          <div className={ui.panelHead}>
            <div>
              <h2 id="recent-title">Recent applications</h2>
              <p>Newest examiner applications</p>
            </div>
            <Link href="/admin/examiners" className="t-small">
              View all
            </Link>
          </div>
          {recent.length ? (
            <ul className={ui.list}>
              {recent.map((item) => (
                <li key={item.id}>
                  <span className={ui.listIcon} aria-hidden="true">
                    {(item.examinerName.trim()[0] ?? 'E').toUpperCase()}
                  </span>
                  <div>
                    <b>{item.instituteName ?? item.examinerName}</b>
                    <small>
                      {STATUS_LABEL[item.status]} · applied {shortDate(item.createdAt)}
                    </small>
                  </div>
                  <Link className="btn btn-secondary" href="/admin/examiners" aria-label={`Open ${item.examinerName}'s application`}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.muted}>No examiner applications yet.</p>
          )}
        </section>
      </div>

      <section className={ui.panel} aria-labelledby="pending-title">
        <div className={ui.panelHead}>
          <div>
            <h2 id="pending-title">Pending actions</h2>
            <p>Work waiting on the team</p>
          </div>
          <span className={ui.chip}>{pending + drafts + hidden} pending</span>
        </div>
        <div className={ui.pendingGrid}>
          <Pending icon="users" count={pending} title="Applications to review" body="Examiners waiting for approval." href="/admin/examiners" action="Review applications" />
          <Pending icon="file" count={drafts} title="Draft templates" body="Publish so examiners can build tests." href="/admin/exams" action="Open exams" />
          <Pending icon="alert" count={hidden} title="Hidden exams" body="Not shown on the website yet." href="/admin/exams" action="Review exams" />
        </div>
      </section>
    </div>
  );
}
