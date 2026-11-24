import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import type { ReactNode } from 'react';
import { isIndexable, site } from '@/lib/config/site';
import './globals.css';
import { jsonLdHtml } from '@/lib/utils/json-ld';

// Same families as mobile (DECISIONS V4), self-hosted by next/font so no request leaves for Google.
const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-outfit', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: reviewed mock tests for SSC, Banking and Railways`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: site.name, url: site.url, locale: site.locale },
  twitter: { card: 'summary_large_image' },
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#001D39',
};

const organization = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: site.name,
      url: site.url,
      logo: `${site.url}/brand/logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      name: site.name,
      url: site.url,
      inLanguage: 'en-IN',
      publisher: { '@id': `${site.url}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(organization) }} />
      </body>
    </html>
  );
}
