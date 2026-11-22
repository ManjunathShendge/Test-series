import type { Metadata } from 'next';
import Link from 'next/link';
import type { TestDetail } from '@exam-prep/contracts';
import { catalogue } from '@/lib/api/catalogue';
import { formatCount, formatDuration, formatMarks, formatPrice, LANGUAGE_LABEL, TEST_TYPE_LABEL } from '@/features/catalogue/format';
import { ExaminerLink, Facts, PageHero, SectionHead, SectionTable, TestGrid } from '@/features/catalogue/parts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/catalogue/catalogue.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const test = await catalogue.test(slug);
  return {
    title: `${test.title} | ${test.exam.name}`,
    description: `${TEST_TYPE_LABEL[test.type]} for ${test.exam.name}: ${test.totalQuestions} questions, ${formatDuration(test.durationSeconds)}, ${test.languages.map((l) => LANGUAGE_LABEL[l]).join(' and ')}. ${test.pricePaise === 0 ? 'Free to attempt.' : ''} Reviewed before publishing.`.trim(),
    alternates: { canonical: `/tests/${test.slug}` },
  };
}

/** Rules derived from the test's own sections; nothing here is invented copy. */
function rules(test: TestDetail): string[] {
  const out: string[] = [];
  const marking = [...new Set(test.sections.map((s) => `${formatMarks(s.positiveMarks)}|${formatMarks(s.negativeMarks)}`))];
  if (marking.length === 1 && test.sections[0]) {
    const s = test.sections[0];
    out.push(
      `Each correct answer earns ${formatMarks(s.positiveMarks)} mark${s.positiveMarks === 1 ? '' : 's'}. ${
        s.negativeMarks ? `${formatMarks(s.negativeMarks)} is deducted for a wrong answer.` : 'There is no negative marking.'
      } Unanswered questions score zero.`,
    );
  } else {
    out.push('Marks per question differ by section; see the table above. Unanswered questions score zero.');
  }
  out.push(
    test.sections.some((s) => s.durationSeconds !== null)
      ? 'Each section has its own timer. When it ends, the section locks and the next one opens.'
      : `You can move between sections freely within the ${formatDuration(test.durationSeconds)}.`,
  );
  out.push('The paper submits automatically when time runs out.');
  if (test.languages.length > 1) out.push('Switch between English and Hindi at any time without losing your answers.');
  return out;
}

export default async function TestPage({ params }: Props) {
  const { slug } = await params;
  const test = await catalogue.test(slug);
  const more = (await catalogue.tests({ exam: test.exam.slug, limit: 4 })).items.filter((t) => t.id !== test.id).slice(0, 3);
  const free = test.pricePaise === 0;
  const signIn = `/sign-in?next=${encodeURIComponent(`/tests/${test.slug}`)}`;

  return (
    <>
      <PageHero
        crumbs={[
          { href: '/', label: 'Home' },
          { href: '/exams', label: 'Exams' },
          { href: `/exams/${test.exam.slug}`, label: test.exam.name },
          { href: `/tests/${test.slug}`, label: test.title },
        ]}
        eyebrow={`${test.exam.name} · ${TEST_TYPE_LABEL[test.type]}`}
        title={test.title}
        aside={
          <div className={`card ${styles.sideCard}`}>
            <div className={styles.priceRow}>
              <span className={styles.bigPrice}>{formatPrice(test.pricePaise)}</span>
              {test.series && !free ? <span className="t-small t-secondary">or in the series</span> : null}
            </div>
            <ul className={styles.checks}>
              <li>
                <Glyph name="check" size={16} /> Reviewed by a subject expert before going live
              </li>
              <li>
                <Glyph name="check" size={16} /> Detailed solutions after you submit
              </li>
              <li>
                <Glyph name="check" size={16} /> Rank and section analysis
              </li>
            </ul>
            <Link href={signIn} className="btn btn-primary btn-lg btn-full">
              {free ? 'Start free test' : 'Sign in to buy'} <Glyph name="arrow" size={18} />
            </Link>
            <p className={styles.note}>
              {free ? 'Sign in with email or Google. No payment needed.' : 'You can see the full pattern before you buy.'}
            </p>
          </div>
        }
      >
        <Facts
          items={[
            { icon: 'tests', value: String(test.totalQuestions), label: 'questions' },
            { icon: 'clock', value: formatDuration(test.durationSeconds), label: 'time' },
            { icon: 'trophy', value: formatMarks(test.totalMarks), label: 'marks' },
            { icon: 'language', value: test.languages.map((l) => LANGUAGE_LABEL[l]).join(' + '), label: '' },
          ]}
        />
        {test.attemptsCount > 0 ? (
          <p className="t-small" style={{ margin: 0, color: 'var(--navy-700)' }}>
            Attempted {formatCount(test.attemptsCount)} times
          </p>
        ) : null}
      </PageHero>

      <section className="section">
        <div className={`container ${styles.split}`}>
          <div className={styles.page}>
            <section aria-labelledby="sections-title">
              <SectionHead id="sections-title" eyebrow="Paper" title="Sections and marking" />
              <SectionTable sections={test.sections} caption={`${test.title} sections`} />
            </section>
            <section aria-labelledby="rules-title">
              <SectionHead id="rules-title" eyebrow="Before you start" title="How this test works" />
              <div className="card">
                <ul className={styles.checks}>
                  {rules(test).map((r) => (
                    <li key={r}>
                      <Glyph name="check" size={16} /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            {more.length ? (
              <section aria-labelledby="more-title">
                <SectionHead id="more-title" eyebrow={test.exam.name} title="More tests for this exam">
                  <Link href={`/exams/${test.exam.slug}`} className="u-link t-small">
                    All {test.exam.name} tests
                  </Link>
                </SectionHead>
                <TestGrid tests={more} />
              </section>
            ) : null}
          </div>
          <aside className={styles.sideStack} aria-label="About this test">
            <ExaminerLink examiner={test.examiner} />
            {test.series ? (
              <Link href={`/series/${test.series.slug}`} className={`card card-link ${styles.examinerLink}`}>
                <span className={styles.seriesIndex}>
                  <Glyph name="layers" size={18} />
                </span>
                <span className={styles.examinerText}>
                  <span className="t-caption t-secondary">Part of a series</span>
                  <strong>{test.series.title}</strong>
                  <span className="t-small t-secondary">
                    {test.series.publishedTests} tests · {formatPrice(test.series.pricePaise)}
                  </span>
                </span>
                <span className={styles.go} aria-hidden="true">
                  <Glyph name="arrow" size={18} />
                </span>
              </Link>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}
