import type { Metadata } from 'next';
import { ExamsView } from '@/features/admin/ExamsView';

export const metadata: Metadata = { title: 'Exams and templates' };

export default function AdminExamsPage() {
  return <ExamsView />;
}
