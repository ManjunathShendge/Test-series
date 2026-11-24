/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify alone lets text such as
 * a test title containing "</script>" close the tag and inject markup, so the characters that can
 * end a script or break parsing are written as JSON escapes (the data stays identical).
 */
const UNSAFE = new RegExp('[<>&\\u2028\\u2029]', 'g');

export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
