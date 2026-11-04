
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-body antialiased selection:bg-accent/30">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
