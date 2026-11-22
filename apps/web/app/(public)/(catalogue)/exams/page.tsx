import type { Metadata } from 'next';
import Link from 'next/link';
import type { ExamSummary } from '@exam-prep/contracts';
import { catalogue } from '@/lib/api/catalogue';
import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { formatDate } from '@/features/catalogue/format';
import { EmptyState, PageHero } from '@/features/catalogue/parts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/catalogue/catalogue.module.css';

// Rendered per request from the API's one-minute cache, so builds never depend on the API.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Exams and mock tests',
  description: 'Mock tests and sectionals for SSC, Banking and Railways exams. Every test is reviewed before it goes live, and each exam has free tests to start with.',
  alternates: { canonical: '/exams' },
};

export default async function ExamsPage() {
  const { items } = await catalogue.exams();
  const live = items.reduce((n, e) => n + e.liveTestCount, 0);
  const free = items.reduce((n, e) => n + e.freeTestCount, 0);

  return (
    <>
      <PageHero
        crumbs={[{ href: '/', label: 'Home' }, { href: '/exams', label: 'Exams' }]}
        eyebrow="Exams"
        title="Pick your exam and start practising"
        lead={
          <p>
            {live} reviewed tests across {items.length} exams, {free} of them free. Each one follows the official pattern
            and marking scheme.
          </p>
        }
      />
      <section className="section">
        <div className="container">
          {items.length === 0 ? (
            <EmptyState
              title="Exams are on their way"
              body="We are reviewing the first tests now. Check back soon, or get the app to be told when they go live."
              action={{ href: '/#app', label: 'Get the app' }}
            />
          ) : (
            <Reveal stagger as="ul" className={styles.examGrid}>
              {items.map((e) => (
                <RevealItem as="li" key={e.id}>
                  <ExamCard exam={e} />
                </RevealItem>
              ))}
            </Reveal>
          )}
        </div>
      </section>
    </>
  );
}

function ExamCard({ exam }: { exam: ExamSummary }) {
  return (
    <Link href={`/exams/${exam.slug}`} className={`card card-link ${styles.examCard}`}>
      <span className={styles.examCardHead}>
        <span className="chip">{exam.category.name}</span>
        {exam.stage ? <span className="t-small t-secondary">{exam.stage}</span> : null}
      </span>
      <span className={styles.examName}>{exam.name}</span>
      <dl className={styles.examStats}>
        <div>
          <dt>Live tests</dt>
          <dd>{exam.liveTestCount}</dd>
        </div>
        <div>
          <dt>Free to start</dt>
          <dd>{exam.freeTestCount}</dd>
        </div>
      </dl>
      <span className={`t-small t-secondary ${styles.testMeta}`}>
        {exam.nextDate ? (
          <span>
            <Glyph name="calendar" size={14} /> Next exam {formatDate(exam.nextDate.date)}
          </span>
        ) : null}
        {exam.lastCutoffScore !== null ? (
          <span>
            <Glyph name="chart" size={14} /> Last cutoff {exam.lastCutoffScore}
          </span>
        ) : null}
      </span>
      <span className={styles.go}>
        See tests <Glyph name="arrow" size={14} />
      </span>
    </Link>
  );
}
