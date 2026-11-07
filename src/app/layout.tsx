import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.PLATFORM_NAME || 'Andrum',
  description: 'Boka yoga, kurser och behandlingar.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2a20',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
