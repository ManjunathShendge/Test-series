import type { Metadata } from 'next';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';
import { TestBuilderView } from '@/features/examiner/ExaminerTestsView';

export const metadata: Metadata = { title: 'Test' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ApprovedOnly>
      <TestBuilderView id={id} />
    </ApprovedOnly>
  );
}
