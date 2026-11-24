import type { Metadata } from 'next';
import { AdminOverview } from '@/features/admin/AdminOverview';

export const metadata: Metadata = { title: 'Dashboard' };

export default function AdminHome() {
  return <AdminOverview />;
}
