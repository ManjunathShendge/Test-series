import type { Metadata } from 'next';
import { ReportQueueView } from '@/features/review/ReviewViews';

export const metadata: Metadata = { title: 'Support' };

// PRD 8 "Support": the question report queue. Other tickets go through a shared support email.
export default function Page() {
  return (
    <ReportQueueView
      title="Support"
      lead="The question report queue. Read the student's report and the examiner's answer, then resolve. Other tickets go through the shared support email."
    />
  );
}
