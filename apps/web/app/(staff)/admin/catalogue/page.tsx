import type { Metadata } from 'next';
import { AdminCatalogueView } from '@/features/admin/AdminCatalogueView';

export const metadata: Metadata = { title: 'Catalogue' };

export default function Page() {
  return <AdminCatalogueView />;
}
