import type { Metadata } from 'next';
import { TemplateEditor } from '@/features/admin/TemplateEditor';

export const metadata: Metadata = { title: 'New template' };

export default async function NewTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditor examId={id} />;
}
