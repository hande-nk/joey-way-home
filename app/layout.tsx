import '@fontsource/press-start-2p';
import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: "Joey's Way Home",
  description: 'JumboCode bonding: Joey bikes home, the room watches.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0b0c0b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
