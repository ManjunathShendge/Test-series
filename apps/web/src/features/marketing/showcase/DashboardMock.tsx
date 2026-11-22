import { TrendLine } from '../motion';
import { Glyph, type GlyphName } from './Glyph';
import styles from './showcase.module.css';

/*
 * The student web dashboard (WEB.md routes /learn, /progress, /purchases) as a static,
 * realistic sample. Mirrors the mobile Home: continue attempt, progress against cutoff,
 * mistakes and recent results. Not interactive; decorative for assistive tech except
 * for the overall label.
 */

const NAV: { icon: GlyphName; label: string; active?: boolean }[] = [
  { icon: 'home', label: 'Home', active: true },
  { icon: 'compass', label: 'Discover' },
  { icon: 'tests', label: 'My tests' },
  { icon: 'chart', label: 'Progress' },
  { icon: 'book', label: 'Mistake notebook' },
  { icon: 'bookmark', label: 'Bookmarks' },
  { icon: 'receipt', label: 'Purchases' },
];

const STATS = [
  { label: 'Tests taken', value: '18', delta: '+3 this week' },
  { label: 'Average score', value: '71%', delta: '+6 vs last month' },
  { label: 'Best percentile', value: '94', delta: 'IBPS PO Mock 03' },
  { label: 'Questions practised', value: '1,860', delta: '212 this week' },
];

const SECTIONS = [
  { name: 'Reasoning', value: 81 },
  { name: 'English', value: 74 },
  { name: 'Quantitative', value: 68 },
  { name: 'General Awareness', value: 59 },
];

const RESULTS = [
  { test: 'SSC CGL Tier 1 · Mock 06', when: 'Today', score: '156 / 200', pct: '91st' },
  { test: 'IBPS PO Prelims · Mock 03', when: '2 days ago', score: '71.5 / 100', pct: '94th' },
  { test: 'RRB NTPC CBT 1 · Mock 02', when: '5 days ago', score: '68 / 100', pct: '83rd' },
];

export function DashboardMock() {
  return (
    <div className={styles.browser} role="img" aria-label="Sample of the MakeMePrepare student dashboard on the web">
      <div className={styles.browserBar} aria-hidden="true">
        <span className={styles.dots}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.url}>makemeprepare.com/learn</span>
      </div>
      <div className={styles.dash} aria-hidden="true">
        <aside className={styles.side}>
          <div className={styles.sideBrand}>
            <img src="/brand/mark.png" alt="" width={30} height={16} />
            <span>MakeMePrepare</span>
          </div>
          <nav className={styles.sideNav}>
            {NAV.map((n) => (
              <span key={n.label} className={n.active ? styles.sideActive : undefined}>
                <Glyph name={n.icon} size={15} />
                {n.label}
              </span>
            ))}
          </nav>
          <div className={styles.sideCard}>
            <p>Target</p>
            <strong>SSC CGL 2027</strong>
            <span>Tier 1 · English</span>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.mainHead}>
            <div>
              <p className={styles.muted}>Good evening</p>
              <h3 className={styles.welcome}>Welcome back, Priya</h3>
            </div>
            <div className={styles.headTools}>
              <span className={styles.searchBox}>
                <Glyph name="search" size={14} /> Search tests, exams, examiners
              </span>
              <span className={styles.iconBtn}>
                <Glyph name="bell" size={15} />
                <i className={styles.badgeDot} />
              </span>
              <span className={styles.avatar}>PS</span>
            </div>
          </header>

          <div className={styles.stats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.stat}>
                <p className={styles.muted}>{s.label}</p>
                <strong>{s.value}</strong>
                <span>{s.delta}</span>
              </div>
            ))}
          </div>

          <div className={styles.row}>
            <div className={`${styles.panel} ${styles.trendPanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h4>Score trend</h4>
                  <p className={styles.muted}>SSC CGL Tier 1 · last 7 mocks</p>
                </div>
                <span className={styles.segment}>
                  <b>7 tests</b>
                  <span>30 days</span>
                </span>
              </div>
              <TrendLine points={[52, 58, 55, 64, 62, 71, 78]} cutoff={64} width={420} height={150} />
              <p className={styles.legend}>
                <i className={styles.legendLine} /> Your score <i className={styles.legendDash} /> Last year’s cutoff
              </p>
            </div>
            <div className={`${styles.panel} ${styles.continuePanel}`}>
              <p className={styles.tag}>
                <Glyph name="clock" size={12} /> In progress
              </p>
              <h4>SSC CGL Tier 1 · Mock 07</h4>
              <div className={styles.progressTrack}>
                <span style={{ width: '42%' }} />
              </div>
              <p className={styles.continueMeta}>42 of 100 answered · 31:20 left</p>
              <span className={styles.continueBtn}>
                <Glyph name="play" size={12} fill /> Continue attempt
              </span>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h4>Recent results</h4>
                <span className={styles.link}>View all</span>
              </div>
              <ul className={styles.results}>
                {RESULTS.map((r) => (
                  <li key={r.test}>
                    <span className={styles.resultIcon}>
                      <Glyph name="trophy" size={14} />
                    </span>
                    <span className={styles.resultName}>
                      {r.test}
                      <small>{r.when}</small>
                    </span>
                    <span className={styles.resultScore}>{r.score}</span>
                    <span className={styles.pill}>{r.pct}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h4>Section accuracy</h4>
                <span className={styles.muted}>Last 5 tests</span>
              </div>
              <ul className={styles.bars}>
                {SECTIONS.map((s) => (
                  <li key={s.name}>
                    <span>{s.name}</span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFill} style={{ width: `${s.value}%` }} />
                    </span>
                    <b>{s.value}%</b>
                  </li>
                ))}
              </ul>
              <span className={styles.quick}>
                <Glyph name="book" size={13} /> Revise 14 mistakes
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
