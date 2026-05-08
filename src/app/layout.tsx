import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/hooks/useSettings';
import { UserProvider } from '@/hooks/useUser';
import ThemeProfileSync from '@/components/ThemeProfileSync';
import ThemeDecor from '@/components/ThemeDecor';
import PreviewBanner from '@/components/PreviewBanner';

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
        <SettingsProvider>
          <UserProvider>
            <ThemeProfileSync />
            {children}
            {/* Page-wide premium decor for the local viewer's theme.
                Per-player decor on the board itself lives in
                <BoardDecor/> mounted inside <GameBoard/>. */}
            <ThemeDecor />
            {/* Floating banner that appears whenever the user is
                previewing a theme from the store. */}
            <PreviewBanner />
          </UserProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
