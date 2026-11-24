import { PublicBannerList, type PublicBanner } from '@exam-prep/contracts';
import { serverApiHeaders } from './server-headers';

/*
 * Server-side read of the public banners (GET /v1/banners?placement=web). Banners are
 * decoration: any failure (API down, slow, drifted reply) shows nothing instead of an error.
 */

const API_BASE = (process.env['API_BASE_URL'] ?? process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3001/v1').replace(/\/$/, '');
const REVALIDATE_SECONDS = 60;

export async function webBanners(): Promise<PublicBanner[]> {
  try {
    const res = await fetch(`${API_BASE}/banners?placement=web`, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: serverApiHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const parsed = PublicBannerList.safeParse(await res.json());
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}
