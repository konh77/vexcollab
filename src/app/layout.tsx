import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VEXCollab',
  icons: { icon: '/favicon.svg', apple: '/favicon.svg' },
  description:
    'Write VEX V5 Python with your whole team in the browser, then upload it straight to the brain over USB.',
};

/**
 * Zoom is deliberately left on: pinching to read is an accessibility feature,
 * not something to disable to stop an iPhone zooming into a field -- that is
 * fixed by giving fields a 16px font instead (see globals.css).
 *
 * viewport-fit=cover lets the page reach the screen edges around a notch, and
 * interactive-widget makes the on-screen keyboard shrink the page rather than
 * cover the bottom of the editor.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1c1e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint so a dark-theme user never sees a white
          flash. Kept tiny and dependency-free on purpose.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('vexcollab.prefs')||'{}');var t=p.theme||'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-shell text-ink">{children}</body>
    </html>
  );
}
