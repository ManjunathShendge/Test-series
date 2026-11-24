import type { Metadata } from 'next';
import { AdminReportsView } from '@/features/admin/AdminReportsView';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return <AdminReportsView />;
}
