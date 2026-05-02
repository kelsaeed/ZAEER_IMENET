import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/hooks/useSettings';

export const metadata: Metadata = {
  title: 'Zaeer Imenet — Ancient Strategy Game',
  description: 'A 16×16 two-player strategy board game with 6 unique piece types, life cycle combat, and tactical gameplay.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0a0a14',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
