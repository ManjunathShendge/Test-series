import Link from 'next/link';
import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { examinerPoints, exams, faqs, steps } from './content';
import { Faq } from './Faq';
import { About } from './hero/About';
import { Hero } from './hero/Hero';
import { AppDownload } from './showcase/AppDownload';
import { Ecosystem } from './showcase/Ecosystem';
import { TrendLine } from './motion';
import styles from './landing.module.css';

/**
 * Public landing page in the mobile app's visual language (DECISIONS V1-V9). The hero and
 * about band follow the owner's NOVACORE reference (hero/), the rest the dashboard tiles. Server-rendered for SEO; only the animated pieces are client code.
 */
export function Landing() {
  return (
    <>
      <Hero />
      <About />
      <HowItWorks />
      <Ecosystem />
      <Features />
      <Exams />
      <AppDownload />
      <Examiners />
      <FaqSection />
      <FinalCta />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

function HowItWorks() {
  return (
    <section id="how-it-works" className="section" aria-labelledby="how-title">
      <div className="container">
        <Reveal className={styles.sectionHead}>
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="t-display">
            From first mock to <span className="t-brand">exam-ready</span>
          </h2>
        </Reveal>
        <Reveal stagger once={false} as="ol" className={styles.steps}>
          {steps.map((s) => (
            <RevealItem as="li" variant="left" key={s.n} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {s.n}
              </span>
              <h3 className="t-title">{s.title}</h3>
              <p className="t-secondary">{s.body}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const PALETTE_STATES = [
  { label: 'Answered', cls: 'stAnswered', n: 12 },
  { label: 'Not answered', cls: 'stNot', n: 3 },
  { label: 'Marked for review', cls: 'stMarked', n: 2 },
  { label: 'Not visited', cls: 'stUnseen', n: 8 },
] as const;

function Features() {
  return (
    <section className={`section ${styles.features}`} aria-labelledby="features-title">
      <div className="container">
        <Reveal className={styles.sectionHead}>
          <p className="eyebrow">Built for serious practice</p>
          <h2 id="features-title" className="t-display">
            Everything you need between now and the exam
          </h2>
        </Reveal>
        <Reveal stagger once={false} className={styles.bento}>
          <RevealItem variant="left" className={`${styles.bentoCard} ${styles.bentoWide} ${styles.surfaceWhite}`}>
            <div>
              <h3 className="t-title">An interface like the real exam</h3>
              <p className="t-secondary">
                Section timers, the five-state question palette, mark for review, zoom and a language toggle, so exam day
                feels familiar.
              </p>
            </div>
            <ul className={styles.paletteDemo} aria-label="Question palette states">
              {PALETTE_STATES.map((s) => (
                <li key={s.label}>
                  <span className={`${styles.paletteDot} ${styles[s.cls]}`} aria-hidden="true">
                    {s.n}
                  </span>
                  {s.label}
                </li>
              ))}
            </ul>
          </RevealItem>
          <RevealItem variant="right" className={`${styles.bentoCard} ${styles.surfaceNavy} on-inverse`}>
            <h3 className="t-title">Know your standing</h3>
            <p className={styles.onNavySecondary}>Score, rank and percentile after every test, with the topper and average to compare against.</p>
          </RevealItem>
          <RevealItem variant="left" className={`${styles.bentoCard} ${styles.surfaceIce}`}>
            <h3 className="t-title">Mistake notebook</h3>
            <p>Every wrong answer is collected automatically, ready to revise and reattempt.</p>
          </RevealItem>
          <RevealItem variant="right" className={`${styles.bentoCard} ${styles.bentoWide} ${styles.surfaceWhite} ${styles.trendCard}`}>
            <div>
              <h3 className="t-title">Score trend against the cutoff</h3>
              <p className="t-secondary">See whether you are clearing last year’s cutoff, and which topics are holding you back.</p>
            </div>
            <div className={styles.trendChart}>
              <TrendLine points={[48, 55, 52, 63, 61, 70, 78]} cutoff={62} />
              <p className="t-caption t-secondary">
                <span className={styles.legendLine} aria-hidden="true" /> Your score{' '}
                <span className={styles.legendDash} aria-hidden="true" /> Cutoff
              </p>
            </div>
          </RevealItem>
          <RevealItem variant="up" className={`${styles.bentoCard} ${styles.bentoFull} ${styles.surfaceSky}`}>
            <h3 className="t-title">Never lose an answer</h3>
            <p>Answers save on your device first and sync when you are back online. Resume exactly where you left off.</p>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}

function Exams() {
  return (
    <section id="exams" className="section" aria-labelledby="exams-title">
      <div className="container">
        <Reveal className={styles.sectionHead}>
          <p className="eyebrow">Exams</p>
          <h2 id="exams-title" className="t-display">
            Starting with the exams most aspirants sit
          </h2>
        </Reveal>
        <Reveal stagger once={false} as="ul" className={styles.examGrid}>
          {exams.map((e, i) => (
            <RevealItem as="li" variant="scale" key={e.name} className={`card ${styles.examCard}`}>
              <ExamShape variant={i} />
              <h3 className="t-title">{e.name}</h3>
              <p className="t-secondary">{e.body}</p>
              <Link href={e.href} className={`u-link ${styles.examLink}`}>
                {e.link}
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function Examiners() {
  return (
    <section id="examiners" className={`section on-inverse ${styles.examiners}`} aria-labelledby="examiners-title">
      <div className={`container ${styles.examinersGrid}`}>
        <Reveal>
          <p className="eyebrow">For examiners and institutes</p>
          <h2 id="examiners-title" className="t-display">
            Your questions, reviewed and sold to the students who need them
          </h2>
          <p className={`t-body-lg ${styles.onNavySecondary}`}>
            If you teach for SSC, Banking or Railways exams, publish your mock tests on MakeMePrepare. We handle review,
            delivery, payments and payouts.
          </p>
          <p className={`t-small ${styles.onNavySecondary} ${styles.examinerNote}`}>The examiner portal opens soon.</p>
        </Reveal>
        <Reveal stagger once={false} as="ul" className={styles.examinerList}>
          {examinerPoints.map((p) => (
            <RevealItem as="li" variant="right" key={p}>
              <span className={`${styles.examinerTick} pop-icon`} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {p}
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className={`container ${styles.faqGrid}`}>
        <Reveal className={styles.sectionHead}>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title" className="t-display">
            Questions students ask
          </h2>
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={styles.ctaWrap} aria-labelledby="cta-title">
      <div className="container">
        <Reveal variant="scale" className={`on-inverse ${styles.cta}`}>
          <h2 id="cta-title" className="t-display">
            Your free mock test is waiting
          </h2>
          <p className={styles.onNavySecondary}>Create an account, pick your exam and start in under a minute.</p>
          <Link href="/sign-in?mode=signup" className="btn btn-accent btn-lg">
            Start free
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/** The rotated exam shapes from the mobile Discover screen, in the brand palette. */
function ExamShape({ variant }: { variant: number }) {
  const fills = ['var(--sky-300)', 'var(--ice-100)', 'var(--cyan-400)'];
  const shapes = [
    <rect key="r" x="10" y="10" width="36" height="36" rx="10" transform="rotate(-12 28 28)" />,
    <circle key="c" cx="28" cy="28" r="19" />,
    <path key="p" d="M28 7 49 44H7Z" strokeLinejoin="round" />,
  ];
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className={styles.examShape} fill={fills[variant]} stroke="var(--navy-900)" strokeWidth="2">
      {shapes[variant]}
    </svg>
  );
}
