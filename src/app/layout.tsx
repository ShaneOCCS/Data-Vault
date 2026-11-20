
import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { PreferencesProvider, PREFS_BOOT_SCRIPT } from '@/lib/preferences';
import { SettingsMenu } from '@/components/site/SettingsMenu';

// next/font downloads the font at build time and serves it from this app, so
// visitors' browsers never contact Google.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Data Vault - Secure Portal',
  description: 'Secure data access using two-factor authentication and KIT ID.',
};

// Local dev: the terminal prints http://127.0.0.1:9002, but the backend's
// CORS allowlist and the session cookie both belong to http://localhost:9002.
// The browser treats those as two different sites, so on 127.0.0.1 every API
// call is blocked and sign-in silently fails. Send 127.0.0.1 to localhost
// before anything else runs. Has no effect on any real domain.
const LOCALHOST_REDIRECT = `if (location.hostname === '127.0.0.1') { location.replace(location.href.replace('//127.0.0.1', '//localhost')); }`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: PREFS_BOOT_SCRIPT sets lang / dark / text size on
    // <html> before React loads, so the server HTML and the page differ there on purpose.
    <html lang="en-CA" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="font-body antialiased selection:bg-accent/30">
        <script dangerouslySetInnerHTML={{ __html: LOCALHOST_REDIRECT }} />
        <PreferencesProvider>
          {children}
          <SettingsMenu />
          <Toaster />
        </PreferencesProvider>
      </body>
    </html>
  );
}
