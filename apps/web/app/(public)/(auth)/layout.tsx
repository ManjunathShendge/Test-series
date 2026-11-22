import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';

// Sign-in and account pages are personal: never indexed, never cached by search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Firebase loads only under this group, so marketing and catalogue pages stay light. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
