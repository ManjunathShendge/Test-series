import type { Metadata } from 'next';
import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { TestAccess, TestType } from '@exam-prep/contracts';
import { catalogue } from '@/lib/api/catalogue';
import { Reveal } from '@/ui/motion/Reveal';
import { formatDate, formatDuration } from '@/features/catalogue/format';
import { EmptyState, Facts, FilterChips, PageHero, SectionHead, SectionTable, TestGrid } from '@/features/catalogue/parts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/catalogue/catalogue.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTERS: { label: string; type?: TestType; access?: TestAccess }[] = [
  { label: 'All tests' },
  { label: 'Free', access: 'free' },
  { label: 'Full mocks', type: 'mock' },
  { label: 'Sectionals', type: 'sectional' },
  { label: 'Previous year', type: 'pyq' },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const exam = await catalogue.exam(slug);
  return {
    title: `${exam.name} mock tests`,
    description: `${exam.liveTestCount} reviewed ${exam.name}${exam.stage ? ` ${exam.stage}` : ''} mock tests and sectionals, ${exam.freeTestCount} free. Official pattern, marking scheme and section timing.`,
    alternates: { canonical: `/exams/${exam.slug}` },
  };
}

/** Lines starting "- " become a list; everything else is a paragraph. Never rendered as HTML. */
function Syllabus({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const list = line.startsWith('- ');
    const last = blocks.at(-1);
    if (last && last.list === list && list) last.lines.push(line.slice(2));
    else blocks.push({ list, lines: [list ? line.slice(2) : line] });
  }
  return (
    <div className={styles.prose}>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i}>
            {b.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.lines[0]}</p>
        ),
      )}
    </div>
  );
}

export default async function ExamPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const type = TestType.safeParse(one(query['type'])).data;
  const access = TestAccess.safeParse(one(query['access'])).data;
  const cursor = one(query['cursor']);
  const [exam, tests] = await Promise.all([
    catalogue.exam(slug),
    catalogue.tests({ exam: slug, type, access, cursor: cursor && cursor.length <= 200 ? cursor : undefined, limit: 12 }),
  ]);
  const firstFree = exam.freeTestCount > 0 ? (await catalogue.tests({ exam: exam.slug, access: 'free', limit: 1 })).items[0] : undefined;
  const base = `/exams/${exam.slug}`;
  // Exams can be addressed by id (post-onboarding links, old shares); keep one readable URL.
  if (slug !== exam.slug) {
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (typeof v === 'string') keep.set(k, v);
    permanentRedirect(keep.size ? `${base}?${keep}` : base);
  }
  const filtered = type !== undefined || access !== undefined;

  return (
    <>
      <PageHero
        crumbs={[
          { href: '/', label: 'Home' },
          { href: '/exams', label: 'Exams' },
          { href: base, label: exam.name },
        ]}
        eyebrow={`${exam.category.name}${exam.stage ? ` · ${exam.stage}` : ''}`}
        title={`${exam.name} mock tests`}
        lead={
          <p>
            {exam.liveTestCount} reviewed tests, {exam.freeTestCount} free. Practise on the official pattern with the
            real marking scheme.
          </p>
        }
      >
        <Facts
          items={[
            ...(exam.pattern
              ? [
                  { icon: 'tests' as const, value: String(exam.pattern.totalQuestions), label: 'questions in the exam' },
                  { icon: 'clock' as const, value: formatDuration(exam.pattern.durationSeconds), label: 'exam time' },
                ]
              : []),
            ...(exam.nextDate ? [{ icon: 'calendar' as const, value: formatDate(exam.nextDate.date), label: 'next exam' }] : []),
            ...(exam.lastCutoffScore !== null ? [{ icon: 'chart' as const, value: String(exam.lastCutoffScore), label: 'last cutoff' }] : []),
          ]}
        />
      </PageHero>

      <section className="section">
        <div className={`container ${styles.split}`}>
          <div className={styles.page}>
            <section aria-labelledby="tests-title">
              <SectionHead id="tests-title" eyebrow="Tests" title={`Practice tests for ${exam.name}`}>
                <FilterChips
                  label="Filter tests"
                  options={FILTERS.map((f) => {
                    const qs = new URLSearchParams();
                    if (f.type) qs.set('type', f.type);
                    if (f.access) qs.set('access', f.access);
                    return {
                      label: f.label,
                      href: qs.size ? `${base}?${qs}` : base,
                      active: f.type === type && f.access === access,
                    };
                  })}
                />
              </SectionHead>
              {tests.items.length === 0 ? (
                <EmptyState
                  title={filtered ? 'No tests match this filter yet' : `No ${exam.name} tests yet`}
                  body={
                    filtered
                      ? 'Examiners are adding new tests every week. Try all tests for this exam in the meantime.'
                      : 'The first tests for this exam are in review. Browse another exam meanwhile.'
                  }
                  action={filtered ? { href: base, label: 'Show all tests' } : { href: '/exams', label: 'Browse exams' }}
                />
              ) : (
                <Reveal key={`${type}-${access}-${cursor}`}>
                  <TestGrid tests={tests.items} />
                </Reveal>
              )}
              {tests.nextCursor ? (
                <div className={styles.pager}>
                  <Link
                    className="btn btn-secondary"
                    href={`${base}?${new URLSearchParams({ ...(type ? { type } : {}), ...(access ? { access } : {}), cursor: tests.nextCursor })}`}
                  >
                    More tests <Glyph name="arrow" size={16} />
                  </Link>
                </div>
              ) : null}
            </section>

            {exam.pattern ? (
              <section aria-labelledby="pattern-title">
                <SectionHead id="pattern-title" eyebrow="Exam pattern" title={exam.pattern.name}>
                  <span className="t-small t-secondary">
                    {exam.pattern.sectionalTiming ? 'Each section is timed separately' : 'Move freely between sections'}
                  </span>
                </SectionHead>
                <SectionTable sections={exam.pattern.sections} caption={`${exam.name} exam pattern`} />
              </section>
            ) : null}

            {exam.syllabusMarkdown ? (
              <section aria-labelledby="syllabus-title">
                <SectionHead id="syllabus-title" eyebrow="Syllabus" title="What the exam covers" />
                <div className="card">
                  <Syllabus text={exam.syllabusMarkdown} />
                </div>
              </section>
            ) : null}
          </div>

          <aside className={styles.sideStack} aria-label={`${exam.name} at a glance`}>
            {firstFree ? (
              <div className={`card ${styles.sideCard}`}>
                <h2 className="t-title">Start with a free test</h2>
                <p className="t-secondary" style={{ margin: 0 }}>
                  {firstFree.title}: {firstFree.totalQuestions} questions in {formatDuration(firstFree.durationSeconds)}.
                </p>
                <Link href={`/tests/${firstFree.slug}`} className="btn btn-primary btn-full">
                  View free test <Glyph name="arrow" size={16} />
                </Link>
              </div>
            ) : null}
            {exam.importantDates.length ? (
              <div className={`card ${styles.sideCard}`}>
                <h2 className="t-title">Key dates</h2>
                <ul className={styles.dates}>
                  {exam.importantDates.map((d) => (
                    <li key={`${d.label}-${d.date}`}>
                      <span className="t-small">{d.label}</span>
                      <strong className="t-small">{formatDate(d.date)}</strong>
                    </li>
                  ))}
                </ul>
                <p className={styles.note}>Dates come from the latest official notice and can change.</p>
              </div>
            ) : null}
            {exam.subjects.length ? (
              <div className={`card ${styles.sideCard}`}>
                <h2 className="t-title">Subjects</h2>
                <ul className={styles.subjects}>
                  {exam.subjects.map((s) => (
                    <li key={s} className="chip chip-muted">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}
