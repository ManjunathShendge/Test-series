import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Accounts made by run.mjs; their ID tokens are signed with the key the test-mode API trusts. */
export interface E2EUser {
  uid: string;
  email: string;
  name: string;
  token: string;
}
export const users = JSON.parse(process.env['E2E_USERS'] ?? '{}') as Record<'examiner' | 'admin', E2EUser>;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/**
 * Answers the Firebase Auth REST calls the web SDK makes for an email sign-in, as the given
 * account, so no real Firebase project or emulator is involved. Returns the list of any other
 * Google requests the page made; a spec asserts it stays empty.
 */
export async function mockFirebase(context: BrowserContext, user: E2EUser): Promise<string[]> {
  const unexpected: string[] = [];
  const now = String(Date.now());
  const account = {
    localId: user.uid,
    email: user.email,
    emailVerified: true,
    displayName: user.name,
    providerUserInfo: [
      { providerId: 'password', federatedId: user.email, email: user.email, rawId: user.email, displayName: user.name },
    ],
    validSince: '0',
    lastLoginAt: now,
    createdAt: now,
  };
  await context.route(/^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (url.pathname.endsWith('/accounts:signInWithPassword')) {
      return reply({
        kind: 'identitytoolkit#VerifyPasswordResponse',
        localId: user.uid,
        email: user.email,
        displayName: user.name,
        idToken: user.token,
        registered: true,
        refreshToken: `refresh-${user.uid}`,
        expiresIn: '3600',
      });
    }
    if (url.pathname.endsWith('/accounts:lookup')) return reply({ kind: 'identitytoolkit#GetAccountInfoResponse', users: [account] });
    if (url.hostname === 'securetoken.googleapis.com') {
      return reply({
        access_token: user.token,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: `refresh-${user.uid}`,
        id_token: user.token,
        user_id: user.uid,
      });
    }
    unexpected.push(request.url());
    return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: '{"error":{"code":400,"message":"UNSUPPORTED_IN_E2E"}}' });
  });
  await context.route(/^https:\/\/apis\.google\.com\//, (route) => {
    unexpected.push(route.request().url());
    return route.abort();
  });
  return unexpected;
}

/** Opens a protected page signed out, logs in on /sign-in, and waits to be sent back. */
export async function signIn(page: Page, user: E2EUser, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('not-checked-in-e2e');
  await page.locator('form').getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === path);
}
