import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Product name MakeMePrepare on makemeprepare.com (DECISIONS O10, 22 November 2026).
const SITE_URL = 'https://makemeprepare.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'MakeMePrepare', template: '%s | MakeMePrepare' },
  description: 'Reviewed mock tests for SSC, Banking and Railways exams, written by examiners who have cleared them.',
  applicationName: 'MakeMePrepare',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'MakeMePrepare', url: SITE_URL, locale: 'en_IN' },
  // Until the public site (milestone W1) ships, keep the placeholder out of search indexes.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#001D39',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
