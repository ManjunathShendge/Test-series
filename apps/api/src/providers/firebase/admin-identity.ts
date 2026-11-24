import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';

const ServiceAccount = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
});
type ServiceAccount = z.infer<typeof ServiceAccount>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

/** Accepts the service account JSON as-is or base64-encoded. */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return ServiceAccount.parse(JSON.parse(text));
}

/**
 * Deletes Firebase Auth users with a service account (Identity Toolkit REST API), so an
 * account deletion also removes the sign-in identity. No Firebase Admin SDK is needed.
 */
export class FirebaseAdminIdentity {
  private token: { value: string; expires: number } | null = null;

  constructor(private readonly account: ServiceAccount) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const key = await importPKCS8(this.account.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google token HTTP ${response.status}`);
    const body = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await response.json());
    this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  /** Deletes one user; an already-deleted user counts as success. */
  async deleteUser(uid: string): Promise<void> {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${this.account.project_id}/accounts:delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return;
    const text = await response.text();
    if (text.includes('USER_NOT_FOUND')) return;
    throw new Error(`Firebase delete HTTP ${response.status}`);
  }
}
