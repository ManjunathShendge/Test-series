/**
 * The in-app route a notification opens, from its data (`{ path }`, or `{ url }`). Only app
 * routes are accepted: a single leading slash, never a scheme, host or protocol-relative URL,
 * so a payload cannot send the student to an outside page.
 */
export function internalPath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { path, url } = data as { path?: unknown; url?: unknown };
  const candidate = typeof path === 'string' ? path : typeof url === 'string' ? url : null;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  return candidate;
}
