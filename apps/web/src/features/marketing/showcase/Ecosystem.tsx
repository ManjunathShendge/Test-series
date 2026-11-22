'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { DashboardMock } from './DashboardMock';
import { Glyph, type GlyphName } from './Glyph';
import { PhoneHome } from './PhoneMock';
import styles from './showcase.module.css';

const HIGHLIGHTS: { icon: GlyphName; title: string; body: string }[] = [
  { icon: 'sync', title: 'One account everywhere', body: 'Start a mock on your laptop, check the result on your phone. Purchases and progress follow you.' },
  { icon: 'cloud', title: 'Answers never lost', body: 'Every answer saves on the device first and syncs when the connection returns.' },
  { icon: 'chart', title: 'Progress in one place', body: 'Scores, percentiles, weak topics and mistakes, the same on web and app.' },
];

/**
 * "One account, every screen": the web dashboard as the main visual with the phone app
 * overlapping it, inside a tinted brand panel. On scroll the window settles from a slight
 * tilt to flat and the floating cards drift at different rates; none of it runs with
 * reduced motion.
 */
export function Ecosystem() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const tilt = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const driftA = useTransform(scrollYProgress, [0, 1], [40, -8]);
  const driftB = useTransform(scrollYProgress, [0, 1], [70, 0]);
  const phoneY = useTransform(scrollYProgress, [0, 1], [90, 0]);

  return (
    <section id="app" className="section" aria-labelledby="ecosystem-title">
      <div className="container">
        <Reveal className={styles.head}>
          <p className="eyebrow">Web and mobile</p>
          <h2 id="ecosystem-title" className="t-display">
            One account, <span className="t-brand">every screen</span>
          </h2>
          <p className="t-body-lg t-secondary">
            Practise on the web with a full dashboard, then pick up on your phone. Your tests, results and mistakes stay in
            sync.
          </p>
        </Reveal>

        <div ref={ref} className={styles.stage}>
          <div className={styles.stageGlow} aria-hidden="true" />
          <motion.div
            className={styles.browserWrap}
            style={reduced ? {} : { rotateX: tilt, y: lift, transformPerspective: 1600 }}
          >
            <DashboardMock />
          </motion.div>

          <motion.div className={`${styles.float} ${styles.floatResult}`} style={reduced ? {} : { y: driftA }} aria-hidden="true">
            <span className={styles.floatIcon}>
              <Glyph name="trophy" size={16} />
            </span>
            <span>
              <b>Result published</b>
              <small>Mock 06 · 91st percentile</small>
            </span>
          </motion.div>

          <motion.div className={`${styles.float} ${styles.floatSync}`} style={reduced ? {} : { y: driftB }} aria-hidden="true">
            <span className={`${styles.floatIcon} ${styles.floatIconOk}`}>
              <Glyph name="check" size={16} />
            </span>
            <span>
              <b>42 answers synced</b>
              <small>Saved on this device first</small>
            </span>
          </motion.div>

          <motion.div className={styles.phoneWrap} style={reduced ? {} : { y: phoneY }}>
            <PhoneHome />
          </motion.div>
        </div>

        <Reveal stagger once={false} as="ul" className={styles.highlights}>
          {HIGHLIGHTS.map((h) => (
            <RevealItem as="li" key={h.title} className={styles.highlight}>
              <span className={`${styles.highlightIcon} pop-icon`}>
                <Glyph name={h.icon} size={20} />
              </span>
              <h3>{h.title}</h3>
              <p className="t-secondary">{h.body}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
