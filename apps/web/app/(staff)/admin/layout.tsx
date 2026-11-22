import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/AdminShell';
import { AuthProvider } from '@/features/auth/AuthProvider';

// Staff console: private, never indexed (WEB.md "Private/admin/result routes noindex").
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin | MakeMePrepare' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
