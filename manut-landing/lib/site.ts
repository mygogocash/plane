interface NavItem {
  href: string;
  label: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

export interface AccessOption {
  id: string;
  name: string;
  eyebrow: string;
  blurb: string;
  details: ReadonlyArray<string>;
  cta: { href: string; label: string };
  featured?: boolean;
}

export const siteConfig = {
  name: 'Manut',
  tagline: 'Work management that stays close to the work',
  description:
    'Manut is the GoGoCash-hosted work-management app for teams that need projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows in one focused workspace.',
  keywords: [
    'Manut',
    'manut.xyz',
    'work management',
    'project management',
    'issue tracking',
    'work items',
    'project cycles',
    'team workspace',
    'product operations',
    'AI-assisted workflows',
    'GoGoCash',
  ],
  url: 'https://manut.xyz',
  appUrl: 'https://app.manut.xyz',
  domain: 'manut.xyz',
  locale: 'en_US',
  github: 'https://github.com/mygogocash/Manut',
  email: 'hello@manut.xyz',
  accessRequestHref:
    'mailto:hello@manut.xyz?subject=Manut%20access%20request',
  ogImageAlt:
    'Manut work management for projects, work items, cycles, modules, intake, views, pages, and AI-assisted workflows.',
  organization: {
    legalName: 'GoGoCash',
  },
} as const;

export const primaryNav: ReadonlyArray<NavItem> = [
  { href: '#features', label: 'Features' },
  { href: '#ai', label: 'AI assist' },
  { href: '#source', label: 'Source' },
  { href: '#access', label: 'Access' },
  { href: '#faq', label: 'FAQ' },
];

export const footerNav: Record<string, ReadonlyArray<NavItem>> = {
  Product: [
    { href: '#features', label: 'Features' },
    { href: '#ai', label: 'AI assist' },
    { href: '#source', label: 'Source' },
    { href: '#access', label: 'Access' },
    { href: '#faq', label: 'FAQ' },
  ],
  Resources: [
    { href: siteConfig.appUrl, label: 'Production app' },
    { href: siteConfig.github, label: 'GitHub' },
    {
      href: `${siteConfig.github}/releases`,
      label: 'Releases',
    },
    {
      href: `${siteConfig.github}#readme`,
      label: 'Repository README',
    },
    { href: '/llms.txt', label: 'LLM summary' },
  ],
  Company: [
    { href: '/about-us', label: 'About' },
    { href: '/contact-us', label: 'Contact' },
    { href: siteConfig.accessRequestHref, label: 'Request access' },
  ],
  Legal: [
    { href: '/privacy-policy', label: 'Privacy' },
    { href: '/terms-of-service', label: 'Terms' },
    { href: '/legal/data-deletion-instructions', label: 'Data deletion' },
    { href: '/contact-us', label: 'Security contact' },
  ],
};

export const trustLogos: ReadonlyArray<string> = [
  'GoGoCash hosted',
  'Better Stack monitored',
  'GCP production',
  'GitHub source',
  'Email access',
];

export const stats = {
  release: 'v1.3.1',
  auth: 'Email + magic link',
  edition: 'Community edition',
  monitoring: 'Better Stack',
};

export const accessOptions: ReadonlyArray<AccessOption> = [
  {
    id: 'sign-in',
    name: 'Existing workspace',
    eyebrow: 'For invited users',
    blurb:
      'Use the production app when your account already has access to a Manut workspace.',
    details: [
      'Email and password sign-in',
      'Magic-link access',
      'Workspace sidebar, projects, and work items',
    ],
    cta: { href: siteConfig.appUrl, label: 'Sign in to Manut' },
    featured: true,
  },
  {
    id: 'request',
    name: 'Access request',
    eyebrow: 'For new teams',
    blurb:
      'Tell GoGoCash your team size and use case so access can be enabled intentionally.',
    details: [
      'No public signup promise',
      'Use-case review by the operator',
      'Workspace setup handled through support',
    ],
    cta: { href: siteConfig.accessRequestHref, label: 'Request access' },
  },
  {
    id: 'source',
    name: 'Source review',
    eyebrow: 'For technical review',
    blurb:
      'Review the landing page source, release notes, and operational changes in the GitHub repository.',
    details: [
      'Public repository link',
      'Release history',
      'Issue tracker for feedback',
    ],
    cta: { href: siteConfig.github, label: 'Browse source' },
  },
];

/** Short factual blocks for AEO / answer engines, also rendered on-page. */
export const quickAnswers: ReadonlyArray<FaqItem> = [
  {
    question: 'What is Manut?',
    answer:
      'Manut is a GoGoCash-hosted work-management app for projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows.',
  },
  {
    question: 'Where is the Manut app?',
    answer:
      'The production Manut app runs at https://app.manut.xyz and the public landing page is https://manut.xyz.',
  },
  {
    question: 'Is public signup enabled for Manut?',
    answer:
      'Public signup is not presented as generally available. Existing users sign in at app.manut.xyz, and new teams can request access by email.',
  },
  {
    question: 'What sign-in methods does Manut support?',
    answer:
      'The current production app exposes email and password sign-in plus magic-link access for authorized users.',
  },
  {
    question: 'Does Manut include AI?',
    answer:
      'Manut includes AI-assisted workflow support when configured. The landing page does not promise a specific model provider or autonomous write behavior.',
  },
  {
    question: 'Where is the Manut source repository?',
    answer: `The Manut landing source is published at ${siteConfig.github}.`,
  },
];

export const faqs: ReadonlyArray<FaqItem> = [
  {
    question: 'How do I get started?',
    answer:
      'If you already have access, sign in at app.manut.xyz. If you need a workspace, email hello@manut.xyz with your team size and intended use case.',
  },
  {
    question: 'What work can teams manage in Manut?',
    answer:
      'Teams can manage projects, work items, cycles, modules, intake queues, saved views, pages, attachments, and workspace activity.',
  },
  {
    question: 'Who operates Manut?',
    answer:
      'Manut is operated by GoGoCash. The public site, app entry point, support email, and source repository all use the Manut identity.',
  },
  {
    question: 'What version is shown for production?',
    answer:
      'The production instance currently reports Manut app version v1.3.1 in the app instance API.',
  },
  {
    question: 'How is server status tracked?',
    answer:
      'The current production domains are tracked in Better Stack, with app.manut.xyz monitored as the main application endpoint.',
  },
  {
    question: 'Is Manut a public self-service product?',
    answer:
      'The current copy treats Manut as an access-controlled production app. It avoids unsupported self-service signup, public tier, and public billing claims.',
  },
  {
    question: 'How do I report a bug or security issue?',
    answer:
      'Use the GitHub issue tracker for product feedback or email security@manut.xyz for responsible security disclosure.',
  },
];
