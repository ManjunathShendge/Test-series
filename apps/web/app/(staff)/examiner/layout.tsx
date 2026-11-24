import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ExaminerShell } from '@/features/examiner/ExaminerShell';

// Examiner workspace: private, never indexed (WEB.md "Private/admin/result routes noindex").
export const metadata: Metadata = {
  title: { default: 'Examiner', template: '%s | Examiner | MakeMePrepare' },
  robots: { index: false, follow: false },
};

export default function ExaminerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ExaminerShell>{children}</ExaminerShell>
    </AuthProvider>
  );
}
