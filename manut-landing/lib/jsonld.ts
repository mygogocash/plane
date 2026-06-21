import { faqs, quickAnswers, siteConfig, stats } from '@/lib/site';

interface Schema {
  '@context': 'https://schema.org';
  '@type': string;
  [key: string]: unknown;
}

function organizationSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    legalName: siteConfig.organization.legalName,
    url: siteConfig.url,
    logo: `${siteConfig.url}/icon.png`,
    sameAs: [siteConfig.github],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: siteConfig.email,
      availableLanguage: ['en'],
    },
  };
}

function websiteSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteConfig.url}/#website`,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: 'en-US',
    publisher: { '@type': 'Organization', name: siteConfig.name },
    potentialAction: {
      '@type': 'ViewAction',
      target: siteConfig.appUrl,
      name: 'Open the Manut production app',
    },
  };
}

function webPageSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${siteConfig.url}/#webpage`,
    url: siteConfig.url,
    name: `${siteConfig.name} - ${siteConfig.tagline}`,
    description: siteConfig.description,
    isPartOf: { '@id': `${siteConfig.url}/#website` },
    about: { '@type': 'SoftwareApplication', name: siteConfig.name },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${siteConfig.url}/opengraph-image`,
    },
  };
}

function softwareApplicationSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    operatingSystem: 'Web',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'WorkManagementApplication',
    description: siteConfig.description,
    url: siteConfig.url,
    softwareVersion: stats.release,
    creator: {
      '@type': 'Organization',
      name: siteConfig.organization.legalName,
      url: siteConfig.url,
    },
    codeRepository: siteConfig.github,
    featureList: [
      'Projects',
      'Work items',
      'Cycles',
      'Modules',
      'Intake',
      'Saved views',
      'Pages',
      'Attachments',
      'AI-assisted workflows',
    ],
  };
}

function faqEntities() {
  const seen = new Set<string>();
  const items = [...quickAnswers, ...faqs];
  return items
    .filter(f => {
      if (seen.has(f.question)) return false;
      seen.add(f.question);
      return true;
    })
    .map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    }));
}

function faqSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntities(),
  };
}

export function allSchemas(): ReadonlyArray<Schema> {
  return [
    organizationSchema(),
    websiteSchema(),
    webPageSchema(),
    softwareApplicationSchema(),
    faqSchema(),
  ];
}
