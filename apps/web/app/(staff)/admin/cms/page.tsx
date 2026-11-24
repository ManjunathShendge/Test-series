import type { Metadata } from 'next';
import { ModulePage } from '@/features/admin/ModulePage';

export const metadata: Metadata = { title: 'CMS' };

// PRD 8. Shown without figures until its backend milestone ships.
export default function Page() {
  return (
    <ModulePage
      title="CMS"
      scope="Banners for the website: image, link and order. Exam page content is edited in Exams and templates."
      dependsOn="Banner editing opens with the website content milestone."
    />
  );
}
