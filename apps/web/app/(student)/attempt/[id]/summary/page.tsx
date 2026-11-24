import type { Metadata } from 'next';
import { SummaryView } from '@/features/attempt/SummaryView';

export const metadata: Metadata = { title: 'Your score' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SummaryPage({ params }: Props) {
  const { id } = await params;
  return <SummaryView attemptId={id} />;
}
