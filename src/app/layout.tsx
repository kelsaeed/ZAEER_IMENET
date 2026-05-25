import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/hooks/useSettings';
import { UserProvider } from '@/hooks/useUser';
import ThemeProfileSync from '@/components/ThemeProfileSync';
import ThemeDecor from '@/components/ThemeDecor';
import PreviewBanner from '@/components/PreviewBanner';
import PerfOverlay from '@/components/PerfOverlay';

export const metadata: Metadata = {
  title: 'Zaeer Imenet — Ancient Strategy Game',
  description: 'A 16x16 two-player strategy board game with 6 unique piece types, life cycle combat, and tactical gameplay.',
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
      <head>
        <link rel="preconnect" href="https://drive.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://docs.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.google.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://drive.google.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
      </head>
      <body>
        <SettingsProvider>
          <UserProvider>
            <ThemeProfileSync />
            {children}
            <ThemeDecor />
            <PreviewBanner />
            <PerfOverlay />
          </UserProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}