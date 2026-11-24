import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { ImportsView } from '@/features/examiner/ExaminerAuthoringView';

export const metadata: Metadata = { title: 'Upload questions' };

export default function Page() {
  return (
    <ApprovedOnly>
      <ImportsView />
    </ApprovedOnly>
  );
}
