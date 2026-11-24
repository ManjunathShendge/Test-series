import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { QuestionsView } from '@/features/examiner/ExaminerAuthoringView';

export const metadata: Metadata = { title: 'Question bank' };

export default function Page() {
  return (
    <ApprovedOnly>
      <QuestionsView />
    </ApprovedOnly>
  );
}
