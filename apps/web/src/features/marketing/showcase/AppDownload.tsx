import { Reveal, RevealItem } from '@/ui/motion/Reveal';
import { Glyph, type GlyphName } from './Glyph';
import { PhoneAttempt, PhoneHome } from './PhoneMock';
import styles from './showcase.module.css';

const BENEFITS: { icon: GlyphName; text: string }[] = [
  { icon: 'phone', text: 'Take full timed mocks on your phone, even on a patchy connection' },
  { icon: 'bell', text: 'Get notified when results are published and new tests arrive from examiners you follow' },
  { icon: 'sync', text: 'Your dashboard, purchases and progress, the same as on the web' },
];

/**
 * Mobile app download band. The apps are not in the stores yet, so the store buttons are
 * marked "Coming soon" and do not link anywhere. Before launch, replace them with the
 * official Google Play and App Store badges (both stores require their own artwork) and
 * the real listing URLs.
 */
export function AppDownload() {
  return (
    <section className={styles.downloadWrap} aria-labelledby="download-title">
      <div className="container">
        <div className={`on-inverse ${styles.download}`}>
          <div className={styles.downloadGlow} aria-hidden="true" />
          <Reveal className={styles.downloadCopy}>
            <p className="eyebrow">MakeMePrepare app</p>
            <h2 id="download-title" className="t-display">
              Your exam prep, <span className={styles.accentWord}>in your pocket</span>
            </h2>
            <p className={styles.downloadLead}>
              The same tests and results as the web, built for practice on the go. Android and iPhone.
            </p>
            <Reveal stagger once={false} as="ul" className={styles.benefits}>
              {BENEFITS.map((b) => (
                <RevealItem as="li" variant="left" key={b.text}>
                  <span className={`${styles.benefitIcon} pop-icon`}>
                    <Glyph name={b.icon} size={16} />
                  </span>
                  {b.text}
                </RevealItem>
              ))}
            </Reveal>
            <div className={styles.stores}>
              <StoreButton store="google" />
              <StoreButton store="apple" />
            </div>
          </Reveal>

          <div className={styles.phones}>
            <PhoneAttempt className={styles.phoneBack} />
            <PhoneHome className={styles.phoneFront} />
            <div className={`${styles.float} ${styles.floatNotify}`} aria-hidden="true">
              <span className={styles.floatIcon}>
                <Glyph name="bell" size={16} />
              </span>
              <span>
                <b>New test from Ankit Sir</b>
                <small>SSC CGL Mock 08 · Free</small>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoreButton({ store }: { store: 'google' | 'apple' }) {
  const google = store === 'google';
  return (
    <span className={styles.store} aria-label={`${google ? 'Google Play' : 'App Store'}: coming soon`} role="img">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        {google ? (
          <path d="M5 3.5v17l9-8.5-9-8.5Zm10.2 7.4 2.6-2.5-10-5.6 7.4 8.1Zm0 2.2-7.4 8.1 10-5.6-2.6-2.5Zm4.2-3.1-2.9-1.6-2.7 2.6 2.7 2.6 2.9-1.6c.8-.5.8-1.5 0-2Z" fill="currentColor" />
        ) : (
          <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8ZM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" fill="currentColor" />
        )}
      </svg>
      <span>
        <small>Coming soon to</small>
        <b>{google ? 'Google Play' : 'App Store'}</b>
      </span>
    </span>
  );
}
