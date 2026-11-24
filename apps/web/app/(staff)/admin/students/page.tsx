import type { Metadata } from 'next';
import { AdminStudentsView } from '@/features/admin/AdminMoneyViews';

export const metadata: Metadata = { title: 'Students' };

export default function Page() {
  return <AdminStudentsView />;
}
