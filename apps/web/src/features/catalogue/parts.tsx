import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ExaminerCard, PatternSection, TestSummary } from '@exam-prep/contracts';
import { Glyph } from '../marketing/showcase/Glyph';
import { absoluteUrl } from '@/lib/config/site';
import {
  formatCount,
  formatDuration,
  formatMarks,
  formatPrice,
  initials,
  LANGUAGE_LABEL,
  TEST_TYPE_LABEL,
  TIER_LABEL,
} from './format';
import styles from './catalogue.module.css';

/*
 * Shared catalogue building blocks (server components). Cards keep one clear action, show
 * exam, language, question count, duration and price (design MASTER "Lists/cards"), and
 * never rely on colour alone: price and type are always written out.
 */

export interface Crumb {
  href: string;
  label: string;
}

/** Light hero band under the floating header, with breadcrumbs and BreadcrumbList data. */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  children,
  aside,
}: {
  crumbs: Crumb[];
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: absoluteUrl(c.href) })),
  };
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.heroGrid} ${aside ? styles.heroWithAside : ''}`}>
        <div className={styles.heroMain}>
          <nav aria-label="Breadcrumb">
            <ol className={styles.crumbs}>
              {crumbs.map((c, i) => (
                <li key={c.href}>
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page">{c.label}</span>
                  ) : (
                    <Link href={c.href} className="u-link">
                      {c.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          {eyebrow ? <p className="eyebrow eyebrow-static">{eyebrow}</p> : null}
          <h1 className={`t-display ${styles.heroTitle}`}>{title}</h1>
          {lead ? <div className={`t-body-lg ${styles.heroLead}`}>{lead}</div> : null}
          {children}
        </div>
        {aside ? <div className={styles.heroAside}>{aside}</div> : null}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

/** Compact facts row: icon, value and label, read as one phrase by screen readers. */
export function Facts({ items }: { items: { icon: Parameters<typeof Glyph>[0]['name']; value: string; label: string }[] }) {
  return (
    <ul className={styles.facts}>
      {items.map((f) => (
        <li key={f.label}>
          <span className={styles.factIcon}>
            <Glyph name={f.icon} size={18} />
          </span>
          <span>
            <strong>{f.value}</strong>
            <span className="t-small t-secondary"> {f.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PriceTag({ pricePaise }: { pricePaise: number }) {
  return pricePaise === 0 ? (
    <span className={`${styles.price} ${styles.priceFree}`}>
      <Glyph name="check" size={14} /> Free
    </span>
  ) : (
    <span className={styles.price}>{formatPrice(pricePaise)}</span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function TierBadge({ tier }: { tier: ExaminerCard['tier'] }) {
  return (
    <span className={`chip ${tier === 'top' ? '' : 'chip-muted'} ${styles.tier}`}>
      {tier === 'new' ? null : <Glyph name={tier === 'top' ? 'trophy' : 'check'} size={13} />}
      {TIER_LABEL[tier]}
    </span>
  );
}

/** One test: the whole card is the link; meta stays on one wrapping line. */
export function TestCard({ test, showExam = false }: { test: TestSummary; showExam?: boolean }) {
  return (
    <Link href={`/tests/${test.slug}`} className={`card card-link ${styles.testCard}`}>
      <span className={styles.testTop}>
        <span className="chip chip-muted">{TEST_TYPE_LABEL[test.type]}</span>
        <PriceTag pricePaise={test.pricePaise} />
      </span>
      {showExam ? <span className="t-caption t-secondary">{test.exam.name}</span> : null}
      <span className={styles.testTitle}>{test.title}</span>
      <span className={`t-small t-secondary ${styles.testMeta}`}>
        <span>
          <Glyph name="tests" size={14} /> {test.totalQuestions} questions
        </span>
        <span>
          <Glyph name="clock" size={14} /> {formatDuration(test.durationSeconds)}
        </span>
        <span>
          <Glyph name="language" size={14} /> {test.languages.map((l) => LANGUAGE_LABEL[l]).join(' + ')}
        </span>
      </span>
      <span className={styles.testFoot}>
        <span className={styles.byline}>
          <Avatar name={test.examiner.name} size={28} />
          <span className="t-small">{test.examiner.name}</span>
        </span>
        <span className={`t-caption t-secondary ${styles.go}`}>
          View test <Glyph name="arrow" size={14} />
        </span>
      </span>
    </Link>
  );
}

export function TestGrid({ tests, showExam = false }: { tests: TestSummary[]; showExam?: boolean }) {
  return (
    <ul className={styles.testGrid}>
      {tests.map((t) => (
        <li key={t.id}>
          <TestCard test={t} showExam={showExam} />
        </li>
      ))}
    </ul>
  );
}

/** Filter links: state lives in the URL, so filters are shareable and Back works. */
export function FilterChips({ label, options }: { label: string; options: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label={label}>
      <ul className={styles.filters}>
        {options.map((o) => (
          <li key={o.label}>
            <Link
              href={o.href}
              scroll={false}
              className={`${styles.filter} ${o.active ? styles.filterActive : ''}`}
              aria-current={o.active ? 'true' : undefined}
            >
              {o.active ? <Glyph name="check" size={14} /> : null}
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Exam or test pattern as a real table, so it reads correctly with assistive tech. */
export function SectionTable({ sections, caption }: { sections: PatternSection[]; caption: string }) {
  const totalQuestions = sections.reduce((n, s) => n + s.questionCount, 0);
  const timed = sections.some((s) => s.durationSeconds !== null);
  return (
    <div className={styles.tableWrap} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Questions</th>
            {timed ? <th scope="col">Time</th> : null}
            <th scope="col">Correct</th>
            <th scope="col">Wrong</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.name}>
              <th scope="row">{s.name}</th>
              <td>{s.questionCount}</td>
              {timed ? <td>{s.durationSeconds ? formatDuration(s.durationSeconds) : '–'}</td> : null}
              <td>+{formatMarks(s.positiveMarks)}</td>
              <td>{s.negativeMarks ? `−${formatMarks(s.negativeMarks)}` : '0'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{totalQuestions}</td>
            {timed ? <td /> : null}
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ExaminerLink({ examiner, note }: { examiner: ExaminerCard; note?: string }) {
  return (
    <Link href={`/examiners/${examiner.id}`} className={`card card-link ${styles.examinerLink}`}>
      <Avatar name={examiner.name} size={48} />
      <span className={styles.examinerText}>
        <span className="t-caption t-secondary">{note ?? 'Written by'}</span>
        <strong>{examiner.name}</strong>
        <span className="t-small t-secondary">
          {TIER_LABEL[examiner.tier]} · {formatCount(examiner.followerCount)} followers
        </span>
      </span>
      <span className={styles.go} aria-hidden="true">
        <Glyph name="arrow" size={18} />
      </span>
    </Link>
  );
}

/** Helpful dead-end: says what happened and offers the next step (no bare "0 results"). */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: Crumb }) {
  return (
    <div className={`card ${styles.empty}`}>
      <span className={styles.emptyIcon}>
        <Glyph name="search" size={22} />
      </span>
      <h3 className="t-title">{title}</h3>
      <p className="t-secondary">{body}</p>
      {action ? (
        <Link href={action.href} className="btn btn-secondary">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id} className="t-title">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
