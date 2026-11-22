import type { Metadata } from 'next';
import { ExamView } from '@/features/admin/ExamView';

export const metadata: Metadata = { title: 'Exam' };

export default async function AdminExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamView id={id} />;
}
