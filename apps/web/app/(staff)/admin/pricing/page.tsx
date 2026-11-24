import type { Metadata } from 'next';
import { AdminPricingView } from '@/features/admin/AdminMoneyViews';

export const metadata: Metadata = { title: 'Pass and pricing' };

export default function Page() {
  return <AdminPricingView />;
}
