import type { Metadata } from 'next';
import { AdminAuditView } from '@/features/admin/AdminAuditView';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return <AdminAuditView />;
}
