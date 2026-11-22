import type { Metadata } from 'next';
import { PolicyPending } from '@/features/marketing/PolicyPending';

export const metadata: Metadata = {
  title: 'Privacy policy',
  alternates: { canonical: '/privacy' },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PolicyPending title="Privacy policy" summary="How MakeMePrepare collects, uses, stores and deletes your personal data, and how to reach our grievance officer." />;
}
