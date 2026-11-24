import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PracticeKind } from '@exam-prep/contracts';
import { PracticeView } from '@/features/results/PracticeView';
import styles from '@/features/auth/auth.module.css';

interface Props {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind === 'bookmarks' ? 'Bookmarks' : 'Mistake notebook' };
}

export default async function PracticePage({ params }: Props) {
  const parsed = PracticeKind.safeParse((await params).kind);
  if (!parsed.success) notFound();
  return (
    <section className={styles.stage}>
      <div className="container">
        <Suspense fallback={null}>
          <PracticeView kind={parsed.data} />
        </Suspense>
      </div>
    </section>
  );
}
