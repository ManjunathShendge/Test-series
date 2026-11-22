import type { Metadata } from 'next';
import Link from 'next/link';
import { catalogue } from '@/lib/api/catalogue';
import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { formatDuration, formatPrice, TEST_TYPE_LABEL } from '@/features/catalogue/format';
import { EmptyState, ExaminerLink, Facts, PageHero, PriceTag, SectionHead } from '@/features/catalogue/parts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/catalogue/catalogue.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const series = await catalogue.series(slug);
  return {
    title: `${series.title} | ${series.exam.name}`,
    description: series.description ?? `${series.publishedTests} ${series.exam.name} tests by ${series.examiner.name}.`,
    alternates: { canonical: `/series/${series.slug}` },
  };
}

export default async function SeriesPage({ params }: Props) {
  const { slug } = await params;
  const series = await catalogue.series(slug);
  const sumSingles = series.tests.reduce((n, t) => n + t.pricePaise, 0);
  const signIn = `/sign-in?next=${encodeURIComponent(`/series/${series.slug}`)}`;

  return (
    <>
      <PageHero
        crumbs={[
          { href: '/', label: 'Home' },
          { href: '/exams', label: 'Exams' },
          { href: `/exams/${series.exam.slug}`, label: series.exam.name },
          { href: `/series/${series.slug}`, label: series.title },
        ]}
        eyebrow={`${series.exam.name} · Test series`}
        title={series.title}
        lead={series.description ? <p>{series.description}</p> : undefined}
        aside={
          <div className={`card ${styles.sideCard}`}>
            <div className={styles.priceRow}>
              <span className={styles.bigPrice}>{formatPrice(series.pricePaise)}</span>
              <span className="t-small t-secondary">{series.validityDays} days access</span>
            </div>
            <ul className={styles.checks}>
              <li>
                <Glyph name="check" size={16} /> All {series.publishedTests} published tests
                {series.plannedTests > series.publishedTests ? `, plus ${series.plannedTests - series.publishedTests} more as they release` : ''}
              </li>
              {sumSingles > series.pricePaise ? (
                <li>
                  <Glyph name="check" size={16} /> {formatPrice(sumSingles)} if bought one by one
                </li>
              ) : null}
              <li>
                <Glyph name="check" size={16} /> Works on the web and the app with one login
              </li>
            </ul>
            <Link href={signIn} className="btn btn-primary btn-lg btn-full">
              Sign in to buy <Glyph name="arrow" size={18} />
            </Link>
          </div>
        }
      >
        <Facts
          items={[
            { icon: 'layers', value: String(series.publishedTests), label: 'tests live' },
            ...(series.syllabusCoverage ? [{ icon: 'book' as const, value: series.syllabusCoverage, label: '' }] : []),
          ]}
        />
      </PageHero>

      <section className="section">
        <div className={`container ${styles.split}`}>
          <section aria-labelledby="series-tests">
            <SectionHead id="series-tests" eyebrow="In this series" title="Tests in release order" />
            {series.tests.length === 0 ? (
              <EmptyState
                title="The first test is in review"
                body="Tests appear here as soon as a reviewer approves them."
                action={{ href: `/exams/${series.exam.slug}`, label: `Browse ${series.exam.name} tests` }}
              />
            ) : (
              <Reveal stagger as="ol" className={styles.seriesList}>
                {series.tests.map((t, i) => (
                  <RevealItem as="li" key={t.id}>
                    <Link href={`/tests/${t.slug}`} className={`card card-link ${styles.seriesItem}`}>
                      <span className={styles.seriesIndex} aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className={styles.examinerText}>
                        <strong>{t.title}</strong>
                        <span className="t-small t-secondary">
                          {TEST_TYPE_LABEL[t.type]} · {t.totalQuestions} questions · {formatDuration(t.durationSeconds)}
                        </span>
                      </span>
                      <PriceTag pricePaise={t.pricePaise} />
                    </Link>
                  </RevealItem>
                ))}
              </Reveal>
            )}
          </section>
          <aside className={styles.sideStack} aria-label="About this series">
            <ExaminerLink examiner={series.examiner} note="Series by" />
          </aside>
        </div>
      </section>
    </>
  );
}
