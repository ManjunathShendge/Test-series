import type { Metadata } from 'next';
import { ExaminerApplicationsView } from '@/features/admin/ExaminerApplicationsView';

export const metadata: Metadata = { title: 'Examiner applications' };

export default function ExaminerApplicationsPage() {
  return <ExaminerApplicationsView />;
}
