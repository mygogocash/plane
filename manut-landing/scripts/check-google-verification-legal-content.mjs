import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

const files = {
  privacy: readFileSync(join(root, 'app/privacy-policy/page.tsx'), 'utf8'),
  terms: readFileSync(join(root, 'app/terms-of-service/page.tsx'), 'utf8'),
  deletion: readFileSync(
    join(root, 'app/legal/data-deletion-instructions/page.tsx'),
    'utf8'
  ),
};

const required = {
  privacy: [
    'work-management app',
    'projects, work items, cycles, modules',
    'AI feature data',
    'We do not sell personal data',
    'privacy@manut.xyz',
  ],
  terms: [
    'Access model',
    'access-controlled production app',
    'does not promise public self-service signup',
    'AI-assisted features',
    'Source repository',
  ],
  deletion: [
    'Data Deletion Instructions',
    'workspace data',
    'Verify ownership',
    'privacy@manut.xyz',
  ],
};

const forbidden = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'Gmail',
  'Drive',
  'Calendar',
  'Stripe',
  'billing',
  'Free, Pro, and Enterprise',
  'social analytics',
];

let failed = false;

for (const [file, snippets] of Object.entries(required)) {
  for (const snippet of snippets) {
    if (!files[file].includes(snippet)) {
      failed = true;
      console.error(`${file} missing required legal content: ${snippet}`);
    }
  }
}

for (const [file, source] of Object.entries(files)) {
  for (const snippet of forbidden) {
    if (source.includes(snippet)) {
      failed = true;
      console.error(`${file} contains stale unsupported claim: ${snippet}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('Manut legal content matches the current access model.');
