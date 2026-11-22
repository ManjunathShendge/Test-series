import type { ReactNode } from 'react';
import { SectionFade } from '@/ui/motion/SectionFade';
import { SmoothScroll } from '@/ui/motion/SmoothScroll';
import { SiteFooter } from '@/ui/patterns/SiteFooter';
import { SiteHeader } from '@/ui/patterns/SiteHeader';

/** Marketing and policy pages: shared header and footer, Lenis smoothing. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <SmoothScroll>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <SectionFade />
    </SmoothScroll>
  );
}
