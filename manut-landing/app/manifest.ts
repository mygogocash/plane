import type { MetadataRoute } from 'next';

import { siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf2',
    theme_color: '#fafaf2',
    lang: 'en',
    orientation: 'portrait-primary',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
