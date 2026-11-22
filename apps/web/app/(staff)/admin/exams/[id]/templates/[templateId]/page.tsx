import type { Metadata } from 'next';
import { TemplateEditor } from '@/features/admin/TemplateEditor';

export const metadata: Metadata = { title: 'Template' };

export default async function TemplatePage({ params }: { params: Promise<{ id: string; templateId: string }> }) {
  const { id, templateId } = await params;
  return <TemplateEditor examId={id} templateId={templateId} />;
}
