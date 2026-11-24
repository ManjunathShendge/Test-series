import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { TestsView } from '@/features/examiner/ExaminerTestsView';

export const metadata: Metadata = { title: 'Tests' };

export default function Page() {
  return (
    <ApprovedOnly>
      <TestsView />
    </ApprovedOnly>
  );
}
