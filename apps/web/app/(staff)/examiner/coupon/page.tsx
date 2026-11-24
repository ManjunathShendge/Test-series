import type { Metadata } from 'next';
import { CouponView } from '@/features/examiner/ExaminerMoneyViews';
import { ApprovedOnly } from '@/features/examiner/ExaminerShell';

export const metadata: Metadata = { title: 'Coupon code' };

export default function Page() {
  return (
    <ApprovedOnly>
      <CouponView />
    </ApprovedOnly>
  );
}
