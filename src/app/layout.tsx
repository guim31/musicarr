import type { Metadata, Viewport } from 'next';
import { Anton, Archivo, DM_Mono, Permanent_Marker } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/shell/AppShell';
import { ActivityProvider } from '@/context/ActivityContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { ToastProvider } from '@/context/ToastContext';

const display = Anton({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-body', display: 'swap' });
const mono = DM_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono', display: 'swap' });
const hand = Permanent_Marker({ weight: '400', subsets: ['latin'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Musicarr', template: '%s · Musicarr' },
  description: 'Le bac à disques de la maison : collection, manquants et téléchargements.',
  applicationName: 'Musicarr',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Musicarr', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: '/icons/apple-touch-icon.png',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0f0e0c',
  colorScheme: 'dark',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ToastProvider>
          <ConfirmProvider>
            <ActivityProvider>
              <AppShell>{children}</AppShell>
            </ActivityProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
