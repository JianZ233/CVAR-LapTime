import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CVAR Timing Control',
  description: 'Private timing and transponder operations for CVAR staff.',
  robots: { index: false, follow: false },
};

// The staff console keeps its original dark palette; see `.theme-night`.
export default function ControlLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="theme-night">{children}</div>;
}
