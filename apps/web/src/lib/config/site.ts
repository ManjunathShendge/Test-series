/**
 * Public site identity (DECISIONS O10, 22 November 2026). SITE_URL is the canonical origin
 * for metadata, sitemap and structured data; staging overrides it with NEXT_PUBLIC_SITE_URL
 * (an empty value, as in a fresh .env from .env.example, means the default).
 */
export const site = {
  name: 'MakeMePrepare',
  url: (process.env['NEXT_PUBLIC_SITE_URL'] || 'https://makemeprepare.com').replace(/\/$/, ''),
  description:
    'Mock tests for SSC, Banking and Railways exams, written by examiners who have cleared them and reviewed before you see them.',
  locale: 'en_IN',
} as const;

/**
 * Search engines may index the site only when SITE_INDEXABLE=true (production). Every
 * other environment, including staging on a real domain, answers noindex.
 */
export function isIndexable(): boolean {
  return process.env['SITE_INDEXABLE'] === 'true';
}

export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith('/') ? path : `/${path}`}`;
}
