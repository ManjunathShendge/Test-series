import type { Metadata } from 'next';
import { PlayerView } from '@/features/attempt/PlayerView';

export const metadata: Metadata = { title: 'Test in progress' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AttemptPage({ params }: Props) {
  const { id } = await params;
  return <PlayerView attemptId={id} />;
}
