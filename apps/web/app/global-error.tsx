'use client';

import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import './globals.css';

/** The root layout itself failed: this replaces the whole document, so it brings its own html. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body>
        <main id="main">
          <ErrorScreen kind={errorKind(error)} variant="page" onRetry={reset} />
        </main>
      </body>
    </html>
  );
}
