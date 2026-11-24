import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';

// Test-taking screens: personal and never indexed (WEB.md "Private/admin/result routes noindex").
export const metadata: Metadata = {
  title: { default: 'Test', template: '%s | MakeMePrepare' },
  robots: { index: false, follow: false },
};

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
