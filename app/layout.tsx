import type { Metadata, Viewport } from 'next';
import {
  Barlow,
  Barlow_Condensed,
  Barlow_Semi_Condensed,
} from 'next/font/google';
import './globals.css';

const barlow = Barlow({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Tabular figures keep lap times aligned in the timing tables.
const barlowSemiCondensed = Barlow_Semi_Condensed({
  variable: '--font-barlow-semi',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
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
  themeColor: '#0f1315',
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
      className={`${barlow.variable} ${barlowSemiCondensed.variable} ${barlowCondensed.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
