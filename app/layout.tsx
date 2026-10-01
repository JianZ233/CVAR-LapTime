import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Serif } from 'next/font/google';
import './globals.css';

// One variable family covers the whole range: extra-expanded for display
// lettering, normal width for reading, and condensed tabular figures for
// timing data.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
});

// Editorial accent, used sparingly in headings.
const instrumentSerif = Instrument_Serif({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
});

export const metadata: Metadata = {
  title: 'Mike Stephens Classic · CVAR Live Timing',
  description:
    'Race weekend information, live timing, and downloadable CVAR result archives for the 20th Annual Mike Stephens Classic.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d0e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Font variables live on <html> so the :root tokens that reference them
    // (--font-sans, --font-display, --font-data) resolve.
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
