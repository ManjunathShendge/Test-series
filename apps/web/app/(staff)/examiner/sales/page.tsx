import type { Metadata } from 'next';
import { SalesView } from '@/features/examiner/ExaminerMoneyViews';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';

export const metadata: Metadata = { title: 'Sales and revenue' };

export default function Page() {
  return (
    <ApprovedOnly>
      <SalesView />
    </ApprovedOnly>
  );
}
