import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';

/** A verified Firebase identity. Never constructed from unverified client input. */
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  signInProvider: string | null;
}

export interface IdentityVerifier {
  /** Resolves only for a valid, unexpired ID token issued for this project; rejects otherwise. */
  verify(idToken: string): Promise<VerifiedIdentity>;
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

// Google's public keys for Firebase Auth ID tokens (securetoken service account).
const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);

/**
 * Verifies Firebase ID tokens as documented by Firebase: RS256 signature from Google's
 * securetoken keys, issuer https://securetoken.google.com/<project>, audience <project>,
 * unexpired, non-empty subject and an auth_time in the past. No service account is needed.
 */
export class FirebaseIdentityVerifier implements IdentityVerifier {
  private readonly keys: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

  constructor(
    private readonly projectId: string,
    testJwks?: JSONWebKeySet,
  ) {
    this.keys = testJwks ? createLocalJWKSet(testJwks) : createRemoteJWKSet(FIREBASE_JWKS_URL);
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    const { payload } = await jwtVerify(idToken, this.keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${this.projectId}`,
      audience: this.projectId,
      requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
      clockTolerance: 5,
    });
    const authTime = Number(payload['auth_time']);
    if (!payload.sub || !Number.isFinite(authTime) || authTime > Date.now() / 1000 + 5) {
      throw new Error('Invalid Firebase token claims');
    }
    const firebase = payload['firebase'] as { sign_in_provider?: unknown } | undefined;
    return {
      uid: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
      emailVerified: payload['email_verified'] === true,
      name: typeof payload['name'] === 'string' ? payload['name'] : null,
      signInProvider: typeof firebase?.sign_in_provider === 'string' ? firebase.sign_in_provider : null,
    };
  }
}
