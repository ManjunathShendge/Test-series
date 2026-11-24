import type { Metadata } from 'next';
import { ReportQueueView } from '@/features/review/ReviewViews';

export const metadata: Metadata = { title: 'Student reports' };

export default function Page() {
  return (
    <ReportQueueView
      title="Student reports"
      lead="Reports on live questions. Read the examiner's answer, then resolve. Five reports from different students hide a question until it is resolved."
    />
  );
}
