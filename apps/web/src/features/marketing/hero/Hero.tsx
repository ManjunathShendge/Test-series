import Link from 'next/link';
import { HeroIllustration } from './HeroIllustration';
import { Bloom, Pleat, Ribbon } from './Shapes';
import styles from './hero.module.css';

/*
 * Hero after the owner's NOVACORE reference (22 November 2026), in our brand: a rounded
 * light ice-to-sky panel with the navigation integrated, a two-line headline (navy, then
 * a navy-to-logo-blue gradient), a pill CTA with an arrow disc, a quiet trust line, the
 * launch illustration in place of the reference portrait with a glass growth widget, and
 * a five-card bento row. The reference's lime role goes to navy and sky; no ratings,
 * client counts or testimonials, because none exist yet.
 */

const BARS = [38, 52, 46, 64, 58, 80, 92];

export function Hero() {
  return (
    <div className={styles.frame}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.glow} aria-hidden="true" />
        <div className={`container ${styles.top}`}>
          <div className={styles.copy}>
            <h1 id="hero-title" className={styles.title}>
              <span className={styles.rise} style={{ animationDelay: '40ms' }}>
                Practise like it’s exam day.
              </span>
              <span className={`${styles.rise} ${styles.gradientText}`} style={{ animationDelay: '140ms' }}>
                Walk in ready.
              </span>
            </h1>
            <p className={`${styles.lead} ${styles.rise}`} style={{ animationDelay: '240ms' }}>
              Timed mock tests for SSC, Banking and Railways, written by examiners who have cleared them and checked by
              a subject reviewer before you see a single question.
            </p>
            <div className={`${styles.actions} ${styles.rise}`} style={{ animationDelay: '320ms' }}>
              <Link href="/sign-in?mode=signup" className={styles.cta}>
                Take your free test
                <span className={styles.ctaDisc} aria-hidden="true">
                  <Arrow />
                </span>
              </Link>
              <Link href="#how-it-works" className={styles.ghost}>
                See how it works
                <span className={styles.ghostDisc} aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" fill="currentColor" />
                  </svg>
                </span>
              </Link>
            </div>
            <ul className={`${styles.trust} ${styles.rise}`} style={{ animationDelay: '400ms' }}>
              <li>
                <Check /> Every question reviewed
              </li>
              <li>
                <Check /> Free first test
              </li>
              <li>
                <Check /> Web, Android and iPhone
              </li>
            </ul>
          </div>

          <div className={styles.visual}>
            <HeroIllustration />
            <div className={styles.glass} aria-label="Sample: score up 18 percent since the first mock" role="img">
              <p className={styles.glassLabel}>Score growth</p>
              <p className={styles.glassValue}>+18.4%</p>
              <p className={styles.glassCaption}>since your first mock</p>
              <div className={styles.bars} aria-hidden="true">
                {BARS.map((h, i) => (
                  <span key={i} style={{ height: `${h}%`, animationDelay: `${600 + i * 70}ms` }} className={i === BARS.length - 1 ? styles.barTop : undefined} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <ul className={`container ${styles.cards}`} aria-label="What you get">
          <li className={`${styles.card} ${styles.rise}`} style={{ animationDelay: '480ms' }}>
            <CardHead title="Timed mocks" text="The real exam pattern" />
            <div className={styles.art}>
              <Ribbon />
            </div>
          </li>
          <li className={`${styles.card} ${styles.rise}`} style={{ animationDelay: '540ms' }}>
            <CardHead title="Verified keys" text="Every answer checked by a reviewer" />
            <div className={styles.art}>
              <Pleat />
            </div>
          </li>
          <li className={`${styles.card} ${styles.cardNavy} ${styles.rise}`} style={{ animationDelay: '600ms' }}>
            <span className={styles.spark} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <p className={styles.statement}>
              Where practice meets precision, <span>results</span> follow.
            </p>
          </li>
          <li className={`${styles.card} ${styles.rise}`} style={{ animationDelay: '660ms' }}>
            <p className={styles.miniLabel}>Sample result · Mock 06</p>
            <p className={styles.miniTotal}>156 / 200</p>
            <p className={styles.miniCaption}>91st percentile</p>
            <ul className={styles.miniRows}>
              <li>
                <i className={styles.dotNavy} /> Reasoning <b>46 / 50</b>
              </li>
              <li>
                <i className={styles.dotBrand} /> English <b>41 / 50</b>
              </li>
              <li>
                <i className={styles.dotSky} /> Quantitative <b>38 / 50</b>
              </li>
            </ul>
          </li>
          <li className={`${styles.card} ${styles.rise}`} style={{ animationDelay: '720ms' }}>
            <CardHead title="Progress" text="Weak topics, mistakes, cutoff" />
            <div className={`${styles.art} ${styles.artBloom}`}>
              <Bloom />
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

function CardHead({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.cardHead}>
      <div>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.cardText}>{text}</p>
      </div>
      <span className={styles.cardArrow} aria-hidden="true">
        <Arrow />
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--navy-700)" />
      <path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="var(--white)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
