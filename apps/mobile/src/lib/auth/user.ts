import type { User } from 'firebase/auth';

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export const toUser = (user: User): AuthUser => ({ uid: user.uid, email: user.email, emailVerified: user.emailVerified });
