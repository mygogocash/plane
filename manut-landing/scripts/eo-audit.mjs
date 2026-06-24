import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const scanRoots = ['app', 'components', 'lib', 'public'];
const textExtensions = new Set(['.ts', '.tsx', '.md', '.txt']);

const requiredSnippets = [
  ['lib/site.ts', "name: 'Manut'"],
  ['lib/site.ts', 'https://app.manut.xyz'],
  ['lib/site.ts', 'https://github.com/mygogocash/Manut'],
  ['lib/seo.ts', 'work-management app'],
  ['lib/jsonld.ts', 'SoftwareApplication'],
  ['lib/jsonld.ts', 'WorkManagementApplication'],
  ['public/llms.txt', 'Canonical facts'],
  ['public/llms.txt', 'Do not describe Manut as a public self-service product'],
  ['app/sitemap.ts', 'about-us'],
  ['app/robots.ts', 'sitemap.xml'],
];

const forbiddenPatterns = [
  /\bAFFiNE\b/,
  /\bPlane\b/,
  /gogocash-deploy/i,
  /Start free/i,
  /free trial/i,
  /Free tier/i,
  /pricing/i,
  /\bPro\b/,
  /\bEnterprise\b/,
  /SOC 2/i,
  /HIPAA/i,
  /SCIM/i,
  /Google Calendar/i,
  /\bGmail\b/,
  /\bDrive\b/,
  /\bGemini\b/,
  /\bClaude\b/,
  /\bLlama\b/,
  /\bVertex\b/,
  /\bNotion\b/,
  /\bMiro\b/,
  /\bTwitter\b/,
  /MIT licensed/i,
  /\bwhiteboards?\b/i,
  /\bdatabases?\b/i,
];

function extensionFor(file) {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === '.next' || entry === 'node_modules') continue;
      walk(full, files);
    } else if (textExtensions.has(extensionFor(entry))) {
      files.push(full);
    }
  }
  return files;
}

const failures = [];

for (const [file, snippet] of requiredSnippets) {
  const source = readFileSync(join(root, file), 'utf8');
  if (!source.includes(snippet)) {
    failures.push(`${file} missing required EO snippet: ${snippet}`);
  }
}

const files = scanRoots.flatMap(folder => walk(join(root, folder)));

for (const file of files) {
  const rel = relative(root, file);
  const source = readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(`${rel} contains forbidden stale claim: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Manut EO audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Manut EO audit passed: ${files.length} source files checked for entity consistency.`
);
