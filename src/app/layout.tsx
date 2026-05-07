import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/hooks/useSettings';
import { UserProvider } from '@/hooks/useUser';
import ThemeProfileSync from '@/components/ThemeProfileSync';
import ThemeDecor from '@/components/ThemeDecor';

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
            {/* Premium-theme overlay. Mounted last so its position:
                fixed layer paints above the page's bgGradient (which
                lives on the page wrapper). Gated to themeId === 'celestial'
                inside the component, so it costs one context read on
                every other theme. */}
            <ThemeDecor />
          </UserProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
