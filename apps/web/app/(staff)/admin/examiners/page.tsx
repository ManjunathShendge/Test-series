import type { Metadata } from 'next';
import { AdminExaminersPage } from '@/features/admin/AdminExaminersView';

export const metadata: Metadata = { title: 'Examiners' };

export default function ExaminersPage() {
  return <AdminExaminersPage />;
}
