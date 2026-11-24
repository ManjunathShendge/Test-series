import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { SeriesView } from '@/features/examiner/ExaminerSeriesView';

export const metadata: Metadata = { title: 'Test series' };

export default function Page() {
  return (
    <ApprovedOnly>
      <SeriesView />
    </ApprovedOnly>
  );
}
