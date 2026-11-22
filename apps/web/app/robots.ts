import type { MetadataRoute } from 'next';
import { absoluteUrl, isIndexable } from '@/lib/config/site';

/** Production allows public pages; every other environment blocks all crawling. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app/', '/sign-in', '/api/', '/health'] },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
