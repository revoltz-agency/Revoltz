import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/feedback';
import { getServerStatus } from '@/lib/server-status';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'AgencyOS — Lead generation & outreach for AI agencies',
    template: '%s · AgencyOS',
  },
  description:
    'Search local businesses with the official Google Places API (New), qualify them with an evidence-based Opportunity Score, and generate personalised email/WhatsApp outreach drafts you send manually.',
  applicationName: 'AgencyOS',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const status = getServerStatus();

  return (
    <html lang="en">
      <body className="font-sans">
        <ToastProvider>
          <AppShell status={status}>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
