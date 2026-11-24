import type { Metadata } from 'next';
import { ReviewQueueView } from '@/features/review/ReviewViews';

export const metadata: Metadata = { title: 'Review queue' };

export default function Page() {
  return <ReviewQueueView />;
}
