import type { Metadata } from 'next';
import { AdminQcView } from '@/features/admin/AdminQcView';

export const metadata: Metadata = { title: 'QC operations' };

export default function Page() {
  return <AdminQcView />;
}
