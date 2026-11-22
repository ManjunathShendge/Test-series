import type { Metadata } from 'next';
import { PolicyPending } from '@/features/marketing/PolicyPending';

export const metadata: Metadata = {
  title: 'Refund policy',
  alternates: { canonical: '/refunds' },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PolicyPending title="Refund policy" summary="When and how you can get a refund for a test, series or pass, and how long refunds take." />;
}
