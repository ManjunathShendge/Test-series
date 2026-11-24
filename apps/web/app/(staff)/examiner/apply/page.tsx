import type { Metadata } from 'next';
import { ExaminerApplicationView } from '@/features/examiner/ExaminerApplicationView';

export const metadata: Metadata = { title: 'Application' };

export default function ExaminerApplicationPage() {
  return <ExaminerApplicationView />;
}
