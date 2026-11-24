/*
 * Where an admin banner (CMS) leads in the app. Links are admin-entered text, so only paths that
 * map onto an existing app screen are followed, and only https addresses open in the browser.
 * Website paths (/exams/x, /tests/x, /series/x, /examiners/x) map to the matching app screens.
 */

export type BannerTarget =
  | { kind: 'exam' | 'test' | 'series' | 'examiner'; id: string }
  | { kind: 'discover' }
  | { kind: 'web'; url: string };

const SEGMENT = /^[A-Za-z0-9-]{1,80}$/;
const HTTPS = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/;
const SCREENS: Record<string, 'exam' | 'test' | 'series' | 'examiner'> = {
  exam: 'exam',
  exams: 'exam',
  test: 'test',
  tests: 'test',
  series: 'series',
  examiner: 'examiner',
  examiners: 'examiner',
};

export function bannerTarget(link: string): BannerTarget | null {
  const value = link.trim();
  // A plain host (letters, digits, dots, hyphens, optional port) and no spaces or credentials.
  if (value.startsWith('https://')) return HTTPS.test(value) ? { kind: 'web', url: value } : null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const path = value.split(/[?#]/, 1)[0]!.replace(/\/+$/, '');
  const parts = path.split('/').slice(1);
  if (parts.length === 1 && (parts[0] === 'discover' || parts[0] === 'exams' || parts[0] === 'tests')) return { kind: 'discover' };
  if (parts.length === 2) {
    const screen = SCREENS[parts[0]!];
    const id = parts[1]!;
    if (screen && SEGMENT.test(id)) return { kind: screen, id };
  }
  return null;
}
