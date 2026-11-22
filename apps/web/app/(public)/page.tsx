import type { Metadata } from 'next';
import { Landing } from '@/features/marketing/Landing';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <Landing />;
}
