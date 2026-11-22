import Link from 'next/link';
import { Logo } from '@/ui/primitives/Logo';
import styles from './SiteFooter.module.css';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#exams', label: 'Exams' },
      { href: '/#app', label: 'App' },
      { href: '/#examiners', label: 'For examiners' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of use' },
      { href: '/refunds', label: 'Refund policy' },
    ],
  },
] as const;

/** Navy site footer with the reversed logo, page links and policy links. */
export function SiteFooter() {
  return (
    <footer className={`on-inverse ${styles.footer}`}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.brand}>
          <Logo tone="inverse" variant="full" height={72} />
          <p className={styles.tagline}>Original mock tests, reviewed before you see them.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className={styles.col}>
            <h2 className={styles.heading}>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={`container ${styles.base}`}>
        <p>© {new Date().getFullYear()} MakeMePrepare. All rights reserved.</p>
      </div>
    </footer>
  );
}
