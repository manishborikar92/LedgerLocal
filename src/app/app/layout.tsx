import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { absoluteUrl } from '@/config/site';

// The workbench is an application shell with no indexable content: keep it out of search results.
export const metadata: Metadata = {
  title: 'Workbench',
  description: 'Drop in statement PDFs, check the reconciliation, and export. Everything runs on your device.',
  robots: { index: false, follow: true },
  alternates: { canonical: absoluteUrl('/app/') },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
