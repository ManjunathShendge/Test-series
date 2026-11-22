import { Glyph } from './Glyph';
import styles from './showcase.module.css';

/*
 * Phone frames showing the real mobile screens (DECISIONS V3/V6): light canvas, navy hero
 * card, tinted tiles, floating navy tab bar; and the CBT attempt screen. Sample data only.
 */

function Frame({ children, label, className }: { children: React.ReactNode; label: string; className?: string | undefined }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} role="img" aria-label={label}>
      <div className={styles.phoneScreen}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span className={styles.island} />
          <span className={styles.statusIcons}>
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PhoneHome({ className }: { className?: string | undefined }) {
  return (
    <Frame label="Sample of the MakeMePrepare mobile app home screen" className={className}>
      <div className={styles.pHeader}>
        <span className={styles.pAvatar}>PS</span>
        <div>
          <p className={styles.pCaption}>Good evening</p>
          <p className={styles.pHello}>Hello, Priya!</p>
        </div>
        <span className={styles.pIcon}>
          <Glyph name="bell" size={14} />
        </span>
      </div>
      <div className={styles.pHero}>
        <div>
          <p className={styles.pHeroLabel}>Your progress</p>
          <p className={styles.pMetric}>78%</p>
          <p className={styles.pHeroCaption}>Last test · SSC CGL Mock 06</p>
        </div>
        <div className={styles.pRing}>
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
            <circle cx="32" cy="32" r="27" fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="6" />
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" pathLength="100" strokeDasharray="91 100" transform="rotate(-90 32 32)" />
          </svg>
          <span>
            <strong>91</strong>
            <small>pct</small>
          </span>
        </div>
      </div>
      <div className={styles.pTiles}>
        <div className={styles.pTileIce}>
          <strong>14</strong>
          <span>Mistakes</span>
        </div>
        <div className={styles.pTileSky}>
          <strong>6</strong>
          <span>Bookmarks</span>
        </div>
        <div className={styles.pTileCyan}>
          <span>Weakest</span>
          <strong className={styles.pTileWord}>Percentages</strong>
        </div>
        <div className={styles.pTileNavy}>
          <span>Free test</span>
          <strong className={styles.pTileWord}>Ready</strong>
        </div>
      </div>
      <div className={styles.pTabBar} aria-hidden="true">
        <span className={styles.pTabActive}>
          <Glyph name="home" size={13} /> Home
        </span>
        <Glyph name="compass" size={15} />
        <Glyph name="chart" size={15} />
        <Glyph name="user" size={15} />
      </div>
    </Frame>
  );
}

const PALETTE = [
  'a', 'a', 'n', 'a', 'm', 'a', 'a', 'u', 'a', 'n',
  'a', 'c', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'u',
] as const;

export function PhoneAttempt({ className }: { className?: string | undefined }) {
  return (
    <Frame label="Sample of the MakeMePrepare exam screen with timer and question palette" className={className}>
      <div className={styles.aTop}>
        <div>
          <p className={styles.pCaption}>Quantitative Aptitude</p>
          <p className={styles.aTitle}>Question 12 of 25</p>
        </div>
        <span className={styles.aTimer}>
          <Glyph name="clock" size={12} /> 31:20
        </span>
      </div>
      <div className={styles.aQuestion}>
        <p>A shopkeeper marks an article 25% above cost and allows a 12% discount. What is his profit percentage?</p>
        <ol className={styles.aOptions}>
          <li>8%</li>
          <li className={styles.aChosen}>10%</li>
          <li>12%</li>
          <li>13%</li>
        </ol>
      </div>
      <div className={styles.aPalette} aria-hidden="true">
        {PALETTE.map((s, i) => (
          <span key={i} className={styles[`q_${s}`]}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className={styles.aActions} aria-hidden="true">
        <span className={styles.aGhost}>Mark for review</span>
        <span className={styles.aPrimary}>Save &amp; next</span>
      </div>
    </Frame>
  );
}
