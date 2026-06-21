import './globals.css';

import type { Viewport } from 'next';

import { StructuredData } from '@/components/structured-data';
import { ThemeProvider } from '@/components/theme-provider';
import { buildRootMetadata } from '@/lib/seo';

export const metadata = buildRootMetadata();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf2' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e10' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
          >
            Skip to content
          </a>
          {children}
        </ThemeProvider>
        <StructuredData />
      </body>
    </html>
  );
}
