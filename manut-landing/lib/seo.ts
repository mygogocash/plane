import type { Metadata } from 'next';

import { siteConfig } from '@/lib/site';

/** Primary landing metadata, tuned for clear search and answer snippets. */
export const homeDescription =
  'Manut is a GoGoCash-hosted work-management app for projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows.';

export function buildRootMetadata(): Metadata {
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: `${siteConfig.name} - ${siteConfig.tagline}`,
      template: `%s - ${siteConfig.name}`,
    },
    description: siteConfig.description,
    keywords: [...siteConfig.keywords],
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.organization.legalName, url: siteConfig.url }],
    creator: siteConfig.organization.legalName,
    publisher: siteConfig.organization.legalName,
    category: 'technology',
    alternates: {
      canonical: siteConfig.url,
      languages: { 'en-US': siteConfig.url },
    },
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title: `${siteConfig.name} - ${siteConfig.tagline}`,
      description: homeDescription,
      url: siteConfig.url,
      locale: siteConfig.locale,
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: siteConfig.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${siteConfig.name} - ${siteConfig.tagline}`,
      description: homeDescription,
      images: ['/opengraph-image'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    icons: {
      icon: '/icon.png',
      apple: '/apple-icon.png',
    },
    manifest: '/manifest.webmanifest',
    formatDetection: { email: false, address: false, telephone: false },
    other: {
      'apple-mobile-web-app-title': siteConfig.name,
    },
  };
}

export function buildHomeMetadata(): Metadata {
  return {
    title: `${siteConfig.name} - project work, issues, cycles, and pages`,
    description: homeDescription,
    alternates: { canonical: siteConfig.url },
    openGraph: {
      title: `${siteConfig.name} - project work, issues, cycles, and pages`,
      description: homeDescription,
      url: siteConfig.url,
    },
  };
}
