import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ReviewShell } from '@/features/review/ReviewShell';

// Staff workspace: private, never indexed (WEB.md "Private/admin/result routes noindex").
export const metadata: Metadata = {
  title: { default: 'QC review', template: '%s | QC review | MakeMePrepare' },
  robots: { index: false, follow: false },
};

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ReviewShell>{children}</ReviewShell>
    </AuthProvider>
  );
}
