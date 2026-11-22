'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { faqs } from './content';
import styles from './landing.module.css';

/** Accordion: one answer open at a time, height animates; buttons carry aria-expanded. */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const reduced = useReducedMotion();
  const base = useId();

  return (
    <div className={styles.faqList}>
      {faqs.map((f, i) => {
        const expanded = open === i;
        const panelId = `${base}-panel-${i}`;
        const buttonId = `${base}-button-${i}`;
        return (
          <div key={f.q} className={`${styles.faqItem} ${expanded ? styles.faqOpen : ''}`}>
            <h3>
              <button
                id={buttonId}
                type="button"
                className={styles.faqButton}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
              >
                <span>{f.q}</span>
                <motion.svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  initial={false}
                  animate={{ rotate: expanded ? 45 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                  className={styles.faqIcon}
                >
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </motion.svg>
              </button>
            </h3>
            {/* Answers stay in the HTML when collapsed so search engines and find-in-page see them. */}
            <motion.div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!expanded}
              initial={false}
              animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <p className={styles.faqAnswer}>{f.a}</p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
