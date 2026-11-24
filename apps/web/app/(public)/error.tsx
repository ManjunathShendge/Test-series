'use client';

import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';

/** Website pages: keeps the site header and footer around the error. */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind={errorKind(error)} variant="page" onRetry={reset} />;
}
