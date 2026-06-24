# Manut Landing

Standalone Next.js landing page for `manut.xyz`.

## Canonical Product Facts

- Public site: `https://manut.xyz`
- Production app: `https://app.manut.xyz`
- Source repository: `https://github.com/mygogocash/Manut`
- Operator: GoGoCash
- Support: `hello@manut.xyz`

Manut is positioned as a GoGoCash-hosted work-management app for projects, work items, cycles, modules, intake, views, pages, attachments, and AI-assisted workflows.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The parent repository ignores `package-lock.json`; keep the generated lockfile
local unless this app is later promoted into the root pnpm workspace.

## Validation

```bash
npm run lint
npm run build
npm run test:app-links
npm run test:google-legal
npm run eo:audit
```

`npm run eo:audit` checks that public landing surfaces use the current Manut entity facts and do not reintroduce stale unsupported claims.
