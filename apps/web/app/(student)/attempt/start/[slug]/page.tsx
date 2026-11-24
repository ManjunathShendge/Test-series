import type { Metadata } from 'next';
import { catalogue } from '@/lib/api/catalogue';
import { StartView } from '@/features/attempt/StartView';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const test = await catalogue.test(slug);
  return { title: `Instructions: ${test.title}` };
}

/** PRD 6.4: instructions and the "I have read the instructions" box come before the clock starts. */
export default async function StartPage({ params }: Props) {
  const { slug } = await params;
  return <StartView test={await catalogue.test(slug)} />;
}
