import type { Metadata } from 'next';
import { Karla, Lora } from 'next/font/google';
import './globals.css';

const karla = Karla({
  variable: '--font-karla',
  subsets: ['latin'],
});

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Mike Stephens Classic · CVAR Live Timing',
  description:
    'Race weekend information, live timing, and downloadable CVAR result archives for the 20th Annual Mike Stephens Classic.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${karla.variable} ${lora.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
