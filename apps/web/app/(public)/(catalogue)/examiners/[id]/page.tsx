import type { Metadata } from 'next';
import Link from 'next/link';
import { catalogue } from '@/lib/api/catalogue';
import { Reveal } from '@/ui/motion/Reveal';
import { formatCount, formatPrice } from '@/features/catalogue/format';
import { Avatar, EmptyState, Facts, PageHero, SectionHead, TestGrid, TierBadge } from '@/features/catalogue/parts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/catalogue/catalogue.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const examiner = await catalogue.examiner(id);
  return {
    title: `${examiner.name}, examiner`,
    description: `Mock tests by ${examiner.name} for ${examiner.exams.map((e) => e.name).join(', ') || 'competitive exams'}. ${examiner.bio ?? ''}`.trim(),
    alternates: { canonical: `/examiners/${examiner.id}` },
  };
}

export default async function ExaminerPage({ params }: Props) {
  const { id } = await params;
  const examiner = await catalogue.examiner(id);

  return (
    <>
      <PageHero
        crumbs={[
          { href: '/', label: 'Home' },
          { href: '/exams', label: 'Exams' },
          { href: `/examiners/${examiner.id}`, label: examiner.name },
        ]}
        eyebrow="Examiner"
        title={examiner.name}
        lead={examiner.bio ? <p>{examiner.bio}</p> : undefined}
      >
        <div className={styles.profileHead}>
          <Avatar name={examiner.name} size={56} />
          <TierBadge tier={examiner.tier} />
        </div>
        <Facts
          items={[
            { icon: 'user', value: formatCount(examiner.followerCount), label: 'followers' },
            { icon: 'tests', value: String(examiner.recentTests.length), label: examiner.recentTests.length === 1 ? 'live test' : 'recent tests' },
            ...(examiner.experienceYears ? [{ icon: 'trophy' as const, value: `${examiner.experienceYears} years`, label: 'teaching' }] : []),
          ]}
        />
      </PageHero>

      <section className="section">
        <div className={`container ${styles.page}`}>
          {examiner.exams.length ? (
            <section aria-labelledby="exams-title">
              <SectionHead id="exams-title" eyebrow="Writes for" title="Exams" />
              <ul className={styles.subjects}>
                {examiner.exams.map((e) => (
                  <li key={e.id}>
                    <Link href={`/exams/${e.slug}`} className={styles.filter}>
                      {e.name} <Glyph name="arrow" size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {examiner.series.length ? (
            <section aria-labelledby="series-title">
              <SectionHead id="series-title" eyebrow="Series" title="Test series" />
              <ul className={styles.seriesList}>
                {examiner.series.map((s) => (
                  <li key={s.id}>
                    <Link href={`/series/${s.slug}`} className={`card card-link ${styles.seriesItem}`}>
                      <span className={styles.seriesIndex} aria-hidden="true">
                        <Glyph name="layers" size={18} />
                      </span>
                      <span className={styles.examinerText}>
                        <strong>{s.title}</strong>
                        <span className="t-small t-secondary">
                          {s.exam.name} · {s.publishedTests} tests · {s.validityDays} days access
                        </span>
                      </span>
                      <span className={styles.price}>{formatPrice(s.pricePaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="tests-title">
            <SectionHead id="tests-title" eyebrow="Tests" title={`Latest from ${examiner.name.split(' ')[0]}`} />
            {examiner.recentTests.length ? (
              <Reveal>
                <TestGrid tests={examiner.recentTests} showExam />
              </Reveal>
            ) : (
              <EmptyState
                title="No live tests yet"
                body="New tests appear here once a reviewer approves them."
                action={{ href: '/exams', label: 'Browse exams' }}
              />
            )}
          </section>
        </div>
      </section>
    </>
  );
}
