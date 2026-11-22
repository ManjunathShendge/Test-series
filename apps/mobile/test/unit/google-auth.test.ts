import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '@/lib/auth/errors';
import { googleSignInStatus } from '@/lib/auth/google-status';

const base = { isExpoGo: false, platform: 'ios', webClientId: 'web.apps.googleusercontent.com', iosClientId: 'ios.apps.googleusercontent.com' };

describe('googleSignInStatus', () => {
  it('is ready in a development build with both client IDs', () => {
    expect(googleSignInStatus(base)).toBe('ready');
  });

  it('needs a development build in Expo Go, even when configured', () => {
    expect(googleSignInStatus({ ...base, isExpoGo: true })).toBe('needs-dev-build');
  });

  it('is not configured without the web client ID', () => {
    expect(googleSignInStatus({ ...base, webClientId: '' })).toBe('not-configured');
  });

  it('needs the iOS client ID on iOS but not on Android', () => {
    expect(googleSignInStatus({ ...base, iosClientId: '' })).toBe('not-configured');
    expect(googleSignInStatus({ ...base, platform: 'android', iosClientId: '' })).toBe('ready');
  });
});

describe('authErrorMessage for Google sign-in', () => {
  it('sends an existing password account back to email sign-in instead of merging', () => {
    expect(authErrorMessage({ code: 'auth/account-exists-with-different-credential' })).toMatch(/email and password/);
  });

  it('explains Google library and adapter codes', () => {
    expect(authErrorMessage({ code: 'IN_PROGRESS' })).toMatch(/already open/);
    expect(authErrorMessage({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toMatch(/Play services/);
    expect(authErrorMessage({ code: 'google/unavailable' })).toMatch(/Use email/);
    expect(authErrorMessage({ code: 'google/no-id-token' })).toMatch(/did not confirm/);
  });

  it('falls back to a generic line for unknown errors', () => {
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
