import type { Metadata } from 'next';
import { AdminPayoutsView } from '@/features/admin/AdminMoneyViews';

export const metadata: Metadata = { title: 'Payouts' };

export default function Page() {
  return <AdminPayoutsView />;
}
