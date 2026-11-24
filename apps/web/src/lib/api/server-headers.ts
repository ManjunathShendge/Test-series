/**
 * Headers for the website server's own API reads (page rendering). API_INTERNAL_TOKEN is a
 * server-only variable (never NEXT_PUBLIC_), so it is not built into browser code; with it the
 * API does not count page rendering against the per-network rate limit.
 */
export function serverApiHeaders(): Record<string, string> {
  const token = process.env['API_INTERNAL_TOKEN'];
  return token ? { accept: 'application/json', 'x-internal-caller': token } : { accept: 'application/json' };
}
