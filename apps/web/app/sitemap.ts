import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/config/site';

/**
 * Public, indexable pages only. Exam, series and examiner pages join when the catalogue
 * API exists (M2/M6); signed-in and policy-draft pages are never listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 }];
}
