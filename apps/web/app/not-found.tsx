import type { Metadata } from 'next';
import { SiteFooter } from '@/ui/patterns/SiteFooter';
import { SiteHeader } from '@/ui/patterns/SiteHeader';
import { ErrorScreen } from '@/ui/errors/ErrorScreen';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } };

/** Any unknown address on the site (and every `notFound()` without a closer handler). */
export default function NotFound() {
  return (
    <>
      <SiteHeader overHero={false} />
      <main id="main">
        <ErrorScreen kind="not-found" variant="page" />
      </main>
      <SiteFooter />
    </>
  );
}
