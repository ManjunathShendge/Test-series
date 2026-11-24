import type { Metadata } from 'next';
import { ReportsView } from '@/features/examiner/ExaminerQualityView';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';

export const metadata: Metadata = { title: 'Student reports' };

export default function Page() {
  return (
    <ApprovedOnly>
      <ReportsView />
    </ApprovedOnly>
  );
}
