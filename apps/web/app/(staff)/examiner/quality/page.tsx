import type { Metadata } from 'next';
import { QualityView } from '@/features/examiner/ExaminerQualityView';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';

export const metadata: Metadata = { title: 'Tier and quality' };

export default function Page() {
  return (
    <ApprovedOnly>
      <QualityView />
    </ApprovedOnly>
  );
}
