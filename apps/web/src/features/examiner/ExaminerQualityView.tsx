'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import { useState } from 'react';
import { REPORT_REASON_LABELS, type QuestionReport } from '@exam-prep/contracts';
import { examinerApi, rupees } from '@/lib/api/examiner';
import { Alert, Waiting } from '@/features/auth/ui';
import { formatWhen, messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { StatCard } from '@/ui/console/Dashboard';
import ui from '@/ui/console/console.module.css';
import { PageHead } from './ExaminerShell';
import styles from './examiner.module.css';

const TIER_LABEL = { new: 'New', verified: 'Verified', top: 'Top' } as const;

/** PRD 4.4 "Tier and quality inputs" and 5.5: what the team reviews monthly when setting a tier. */
export function QualityView() {
  const { state, reload } = useLoad(() => examinerApi.quality(), []);
  if (state.status === 'loading') return <Waiting label="Loading your quality inputs…" />;
  if (state.status === 'error')
    return (
      <State kind={errorKind(state.error)} title="Could not load your quality inputs" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
        {messageOf(state.error)}
      </State>
    );
  const { tier, fastLane, kycVerified, quality, priceBands } = state.data;
  const rate = quality.qcPassRate;
  return (
    <div className={styles.stack}>
      <PageHead
        title="Tier and quality"
        lead="Our team sets your tier (New, Verified or Top) each month from these inputs. Your tier sets your price ceiling and review lane."
        action={<span className={`${admin.badge} ${admin.badgeOn}`}>{TIER_LABEL[tier]} tier</span>}
      />
      <div className={ui.cards}>
        <StatCard
          icon="check"
          chip={`${quality.reviewedQuestions} reviewed`}
          value={rate === null ? '—' : `${rate}%`}
          label="QC pass rate"
          note="Questions approved out of those reviewed"
          part={rate ?? 0}
          whole={100}
          barLabel="Approved"
        />
        <StatCard
          icon="alert"
          chip="Lower is better"
          value={quality.duplicateRejects}
          label="Duplicate rejects"
          note="Questions rejected as copies"
          part={quality.duplicateRejects}
          whole={Math.max(quality.reviewedQuestions, 1)}
          barLabel="Of reviewed questions"
        />
        <StatCard
          icon="edit"
          chip="After launch"
          value={quality.keyCorrections}
          label="Answer key corrections"
          note="Keys corrected after a test went live"
          part={quality.keyCorrections}
          whole={Math.max(quality.liveTests, 1)}
          barLabel="Per live test"
        />
        <StatCard
          icon="clock"
          chip={`${quality.openReports} open`}
          value={quality.avgReportResponseHours === null ? '—' : `${quality.avgReportResponseHours} h`}
          label="Report response time"
          note="Average time to answer student reports (target 72 h)"
          part={quality.avgReportResponseHours === null ? 0 : Math.min(quality.avgReportResponseHours, 72)}
          whole={72}
          barLabel="Of the 72 h target"
        />
      </div>
      <div className={ui.panels}>
        <section className={ui.panel} aria-labelledby="standing-title">
          <div className={ui.panelHead}>
            <div>
              <h2 id="standing-title">Your standing</h2>
              <p>What your tier gives you today</p>
            </div>
          </div>
          <ul className={ui.list}>
            <li>
              <div>
                <b>{TIER_LABEL[tier]} tier</b>
                <small>Reviewed monthly by our team</small>
              </div>
            </li>
            <li>
              <div>
                <b>{fastLane ? 'Fast review lane' : 'Standard review lane'}</b>
                <small>{fastLane ? 'Your tests are reviewed first.' : 'Top tier examiners are reviewed first.'}</small>
              </div>
            </li>
            <li>
              <div>
                <b>{kycVerified ? 'KYC verified' : 'KYC not yet verified'}</b>
                <small>{kycVerified ? 'Payouts can be released to you.' : 'Our team checks your documents by hand.'}</small>
              </div>
            </li>
            <li>
              <div>
                <b>{quality.liveTests} live tests</b>
                <small>Approved by QC and on sale</small>
              </div>
            </li>
          </ul>
        </section>
        <section className={ui.panel} aria-labelledby="band-title">
          <div className={ui.panelHead}>
            <div>
              <h2 id="band-title">Price bands</h2>
              <p>Paid tests must be priced inside these limits</p>
            </div>
          </div>
          {priceBands.length ? (
            <ul className={ui.list}>
              {priceBands.map((band) => (
                <li key={band.examId}>
                  <div>
                    <b>{band.examName}</b>
                    <small>
                      {rupees(band.minPaise)} to {rupees(band.maxPaise)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.muted}>No exams are assigned to you yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** PRD 4.4 "Student reports: to respond to within 72 hours" and 5.4. */
export function ReportsView() {
  const { state, reload, set } = useLoad(() => examinerApi.reports(), []);
  if (state.status === 'loading') return <Waiting label="Loading student reports…" />;
  if (state.status === 'error')
    return (
      <State kind={errorKind(state.error)} title="Could not load student reports" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
        {messageOf(state.error)}
      </State>
    );
  const reports = state.data;
  const open = reports.filter((item) => item.status === 'open');
  return (
    <div className={styles.stack}>
      <PageHead
        title="Student reports"
        lead="Students report questions they think are wrong. Answer each within 72 hours; a reviewer then decides. Five reports from different students hide a question until it is reviewed."
        action={<span className={`${admin.badge} ${open.length ? admin.badgeOff : admin.badgeOn}`}>{open.length} to answer</span>}
      />
      {reports.length ? (
        reports.map((item) => <ReportCard key={item.id} report={item} onAnswered={set} />)
      ) : (
        <State title="No reports">When students report one of your live questions, it appears here.</State>
      )}
    </div>
  );
}

function ReportCard({ report, onAnswered }: { report: QuestionReport; onAnswered: (reports: QuestionReport[]) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAnswer = report.status === 'open' || report.status === 'examiner_responded';
  const overdue = report.status === 'open' && new Date(report.slaDeadlineAt).getTime() < Date.now();

  async function submit() {
    if (text.trim().length < 10) return setError('Write at least 10 characters.');
    setBusy(true);
    setError(null);
    try {
      onAnswered(await examinerApi.respond(report.id, text.trim()));
      setText('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${admin.card} ${styles.section}`} aria-label={`Report on ${report.testTitle}`}>
      <div className={admin.cardHead}>
        <div>
          <b>{REPORT_REASON_LABELS[report.reason]}</b>
          <p className={admin.helper}>
            {report.testTitle} · reported {formatWhen(report.createdAt)}
            {report.questionHidden ? ' · hidden from new attempts' : ''}
          </p>
        </div>
        <span className={`${admin.badge} ${overdue ? admin.badgeOff : report.status === 'open' ? admin.badgeDraft : admin.badgeOn}`}>
          {overdue ? 'Overdue' : report.status === 'open' ? `Answer by ${formatWhen(report.slaDeadlineAt)}` : report.status.replaceAll('_', ' ')}
        </span>
      </div>
      <p className={styles.lead}>{report.stemEn.length > 300 ? `${report.stemEn.slice(0, 300)}…` : report.stemEn}</p>
      {report.studentComment ? <p>Student: “{report.studentComment}”</p> : null}
      {report.examinerResponse ? <p>Your answer: {report.examinerResponse}</p> : null}
      {report.resolutionNotes ? <p>Reviewer: {report.resolutionNotes}</p> : null}
      {canAnswer ? (
        <div className={styles.section}>
          {error ? <Alert>{error}</Alert> : null}
          <label className={admin.field}>
            <span>{report.examinerResponse ? 'Update your answer' : 'Your answer'}</span>
            <textarea className={admin.control} rows={3} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className={admin.actions}>
            <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} onClick={() => void submit()}>
              {busy ? 'Sending…' : 'Send answer'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
