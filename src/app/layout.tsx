
import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

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
    <html lang="en" className={inter.variable}>
      <body className="font-body antialiased selection:bg-accent/30">
        <script dangerouslySetInnerHTML={{ __html: LOCALHOST_REDIRECT }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
