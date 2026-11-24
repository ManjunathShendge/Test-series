import type { Metadata } from 'next';
import { AdminCmsView } from '@/features/admin/AdminCmsView';

export const metadata: Metadata = { title: 'CMS' };

export default function Page() {
  return <AdminCmsView />;
}
