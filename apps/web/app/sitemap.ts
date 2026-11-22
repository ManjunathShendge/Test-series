import type { MetadataRoute } from 'next';
import type { TestSummary } from '@exam-prep/contracts';
import { catalogue } from '@/lib/api/catalogue';
import { absoluteUrl } from '@/lib/config/site';

/**
 * Public, indexable pages only: home, the exam index and every live exam, test, series and
 * examiner page from the catalogue API. Signed-in and policy-draft pages are never listed.
 * If the API is unreachable (for example during a build) the static pages are still served,
 * and the hourly revalidation adds the catalogue back.
 */
export const revalidate = 3600;

const MAX_PAGES = 20;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/exams'), changeFrequency: 'daily', priority: 0.9 },
  ];
  try {
    const { items: exams } = await catalogue.exams();
    const tests: TestSummary[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await catalogue.tests({ limit: 50, cursor });
      tests.push(...res.items);
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    const examinerIds = [...new Set(tests.map((t) => t.examiner.id))];
    const examiners = await Promise.all(examinerIds.map((id) => catalogue.examiner(id)));
    const series = new Map(examiners.flatMap((e) => e.series.map((s) => [s.slug, s] as const)));

    entries.push(
      ...exams.map((e) => ({ url: absoluteUrl(`/exams/${e.slug}`), changeFrequency: 'daily' as const, priority: 0.8 })),
      ...tests.map((t) => ({
        url: absoluteUrl(`/tests/${t.slug}`),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
        ...(t.publishedAt ? { lastModified: t.publishedAt } : {}),
      })),
      ...[...series.keys()].map((slug) => ({ url: absoluteUrl(`/series/${slug}`), changeFrequency: 'weekly' as const, priority: 0.6 })),
      ...examinerIds.map((id) => ({ url: absoluteUrl(`/examiners/${id}`), changeFrequency: 'weekly' as const, priority: 0.5 })),
    );
  } catch {
    // Catalogue unavailable: keep the static entries.
  }
  return entries;
}
