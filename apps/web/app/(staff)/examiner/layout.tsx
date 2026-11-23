import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';

export const metadata: Metadata = { title: 'Examiner authoring', robots: { index: false, follow: false } };

export default function ExaminerLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
