import type { Metadata } from 'next';
import { ReviewView } from '@/features/review/ReviewViews';

export const metadata: Metadata = { title: 'Review' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewView id={id} />;
}
