import type { Metadata } from 'next';
import { EarningsView } from '@/features/examiner/ExaminerMoneyViews';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';

export const metadata: Metadata = { title: 'Earnings and payouts' };

export default function Page() {
  return (
    <ApprovedOnly>
      <EarningsView />
    </ApprovedOnly>
  );
}
