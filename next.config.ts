import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV !== 'production';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080').origin;

// Next.js adds inline bootstrap scripts, and Tailwind/Radix use inline styles,
// so 'unsafe-inline' stays until the app moves to nonce-based rendering. The
// barcode print window inherits this policy too. Dev mode also needs eval and
// a websocket for hot reload.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // QR codes and barcodes are drawn as data URLs
  "font-src 'self'",
  "media-src 'self' blob:", // barcode scanner camera preview
  `connect-src 'self' ${apiOrigin}${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  {key: 'Content-Security-Policy', value: contentSecurityPolicy},
  {key: 'X-Frame-Options', value: 'DENY'},
  {key: 'X-Content-Type-Options', value: 'nosniff'},
  {key: 'Referrer-Policy', value: 'no-referrer'},
  {key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()'},
  // Browsers ignore this header over plain HTTP, so it only applies once HTTPS is live.
  {key: 'Strict-Transport-Security', value: 'max-age=31536000'},
];

const nextConfig: NextConfig = {
  // Hide the dev-only Next.js "N" badge (it never shows on the live site anyway).
  devIndicators: false,
  async headers() {
    return [{source: '/:path*', headers: securityHeaders}];
  },
};

export default nextConfig;
