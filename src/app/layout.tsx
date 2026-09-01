import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VEXCollab',
  description:
    'Write VEX V5 Python with your whole team in the browser, then upload it straight to the brain over USB.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-shell text-ink">{children}</body>
    </html>
  );
}
