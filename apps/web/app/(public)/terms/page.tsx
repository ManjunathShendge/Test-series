import type { Metadata } from 'next';
import { PolicyPending } from '@/features/marketing/PolicyPending';

export const metadata: Metadata = {
  title: 'Terms of use',
  alternates: { canonical: '/terms' },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PolicyPending title="Terms of use" summary="The rules for using MakeMePrepare as a student, including accounts, devices, purchases and acceptable use." />;
}
