import Link from 'next/link';
import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { CountUp } from '../motion';
import styles from './hero.module.css';

/*
 * The reference's "About us" band: a quiet two-column intro on white, then four stat
 * cards. The reference's figures (solutions delivered, satisfaction, years) do not exist
 * for us, so the cards state product facts that are already decided in the PRD.
 */
export function About() {
  return (
    <section className={styles.about} aria-labelledby="about-title">
      <div className="container">
        <Reveal className={styles.aboutIntro}>
          <div>
            <p className={styles.kicker}>
              <span aria-hidden="true">–</span> Why MakeMePrepare
            </p>
            <h2 id="about-title" className={styles.aboutTitle}>
              A test series built on <span className={styles.gradientText}>original</span> questions and{' '}
              <span className={styles.gradientText}>verified</span> answers.
            </h2>
          </div>
          <div className={styles.aboutSide}>
            <p>
              Mocks often recycle the same questions and ship with wrong keys. We source tests from many examiners and
              compete on question quality, so every mock you take is worth your time.
            </p>
            <Link href="#how-it-works" className={`${styles.aboutLink} u-link`}>
              See how it works
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </Reveal>

        <Reveal stagger once={false} as="ul" className={styles.stats}>
          <RevealItem as="li" variant="up" className={styles.stat}>
            <span className={`${styles.statIcon} pop-icon`} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M12 3 4 7v5c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <p className={styles.statLabel}>Questions reviewed</p>
            <p className={styles.statValue}>
              <CountUp value={100} suffix="%" />
            </p>
            <p className={styles.statText}>A subject reviewer approves every test before it goes live</p>
          </RevealItem>
          <RevealItem as="li" variant="up" className={`${styles.stat} ${styles.statSky}`}>
            <span className={`${styles.statIcon} pop-icon`} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <p className={styles.statLabel}>Exam categories</p>
            <p className={styles.statValue}>
              <CountUp value={3} />
            </p>
            <p className={styles.statText}>SSC, Banking and Railways at launch</p>
          </RevealItem>
          <RevealItem as="li" variant="up" className={`${styles.stat} ${styles.statVisual}`}>
            <div className={styles.paletteArt} aria-hidden="true">
              {['a', 'a', 'n', 'a', 'm', 'a', 'u', 'a', 'a', 'n', 'u', 'u', 'a', 'm', 'u', 'u'].map((s, i) => (
                <span key={i} className={styles[`p_${s}`]} />
              ))}
            </div>
            <div className={styles.statBadge}>
              <p className={styles.statValue}>
                <CountUp value={5} />
              </p>
              <p>Question states, like the real CBT</p>
            </div>
          </RevealItem>
          <RevealItem as="li" variant="up" className={styles.stat}>
            <span className={`${styles.statIcon} pop-icon`} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <p className={styles.statLabel}>Devices per account</p>
            <p className={styles.statValue}>
              <CountUp value={2} />
            </p>
            <p className={styles.statText}>Practise on your phone and the web with one login</p>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}
