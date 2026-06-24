import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appUrl = 'https://app.manut.xyz';

const requiredSnippets = [
  {
    file: 'lib/site.ts',
    snippet: `appUrl: '${appUrl}'`,
  },
  {
    file: 'components/site-nav.tsx',
    snippet: 'href={siteConfig.appUrl}',
  },
  {
    file: 'components/sections/hero.tsx',
    snippet: 'href={siteConfig.appUrl}',
  },
  {
    file: 'components/sections/cta.tsx',
    snippet: 'href={siteConfig.appUrl}',
  },
  {
    file: 'lib/jsonld.ts',
    snippet: 'target: siteConfig.appUrl',
  },
];

const forbiddenSnippets = [
  {
    file: 'components/site-nav.tsx',
    snippet: 'href="/sign-in"',
  },
  {
    file: 'components/sections/hero.tsx',
    snippet: 'href="/sign-in"',
  },
  {
    file: 'components/sections/cta.tsx',
    snippet: 'href="/sign-in"',
  },
  {
    file: 'lib/jsonld.ts',
    snippet: '`${siteConfig.url}/sign-in`',
  },
];

const failures = [];

for (const check of requiredSnippets) {
  const source = fs.readFileSync(path.join(root, check.file), 'utf8');
  if (!source.includes(check.snippet)) {
    failures.push(`${check.file} is missing ${check.snippet}`);
  }
}

for (const check of forbiddenSnippets) {
  const source = fs.readFileSync(path.join(root, check.file), 'utf8');
  if (source.includes(check.snippet)) {
    failures.push(`${check.file} still contains ${check.snippet}`);
  }
}

if (failures.length > 0) {
  console.error('App redirect link check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`App redirect links point to ${appUrl}`);
