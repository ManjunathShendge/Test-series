import Link from 'next/link';
import { webBanners } from '@/lib/api/banners';
import { classifyLink } from '@/features/admin/ops-format';
import styles from './BannerStrip.module.css';

/**
 * Banners an admin has put on the website (CMS), under the hero. Renders nothing when there are
 * none or the API cannot be reached. Server component; refreshed every minute.
 */
export async function BannerStrip() {
  const banners = (await webBanners())
    .map((b) => ({ ...b, target: classifyLink(b.link) }))
    .filter((b): b is typeof b & { target: NonNullable<typeof b.target> } => b.target !== null);
  if (!banners.length) return null;
  return (
    <section className={styles.strip} aria-label="Announcements">
      <div className="container">
        <ul className={`${styles.rail} ${banners.length === 1 ? styles.single : ''}`}>
          {banners.map((b, i) => {
            // A 3:1 box with explicit size: no layout shift whatever the image's own size.
            const image = <img src={b.imageUrl} alt={b.title} width={1200} height={400} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />;
            return (
              <li key={b.id} className={styles.item}>
                {b.target.kind === 'internal' ? (
                  <Link href={b.target.href} className={styles.link}>
                    {image}
                  </Link>
                ) : (
                  <a href={b.target.href} className={styles.link} rel="noopener">
                    {image}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
