import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The address carries the code of the link in its fragment: out of the index, and no Referer to other sites.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
