import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { SeriesDetailView } from '@/features/examiner/ExaminerSeriesView';

export const metadata: Metadata = { title: 'Test series' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ApprovedOnly>
      <SeriesDetailView id={id} />
    </ApprovedOnly>
  );
}
