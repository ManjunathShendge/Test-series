import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  // Product name is an open decision (O10); this is a placeholder, not a brand.
  title: 'Exam Prep Marketplace',
  description: 'Practice tests for competitive exam preparation.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
