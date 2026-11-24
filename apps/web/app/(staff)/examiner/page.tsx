import type { Metadata } from 'next';
import { ExaminerOverview } from '@/features/examiner/ExaminerOverview';

export const metadata: Metadata = { title: 'Overview' };

export default function ExaminerOverviewPage() {
  return <ExaminerOverview />;
}
