import Link from 'next/link';
import { ErrorScreen } from '@/ui/errors/ErrorScreen';

/** An exam, test, series or examiner that is not (or no longer) published. */
export default function CatalogueNotFound() {
  return (
    <ErrorScreen
      kind="not-found"
      variant="page"
      title="This page isn’t available"
      action={
        <Link href="/exams" className="btn btn-primary">
          Browse exams
        </Link>
      }
    >
      <p>It may have moved or been retired. Tests are sometimes replaced by a corrected version; browse the exam to find the latest one.</p>
    </ErrorScreen>
  );
}
