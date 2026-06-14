# TypeScript

This repo uses TypeScript 5.8 with strict shared configs from `packages/typescript-config`.

## Compiler Defaults

The base config enables strict checks, including:

- `strict`
- `exactOptionalPropertyTypes`
- `isolatedModules`
- `moduleResolution: "bundler"`
- `verbatimModuleSyntax`
- `noImplicitReturns`
- `noUnusedLocals`
- `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`

Use `import type` for type-only imports so `verbatimModuleSyntax` can erase them safely.

## Imports And Dependencies

- Internal packages use `workspace:*`.
- External dependencies managed in `pnpm-workspace.yaml` use `catalog:`.
- Prefer existing shared packages over new dependencies.
- Do not introduce app-to-app imports.
- Keep service/API clients in `@plane/services` or the established app service layer.

## React And State

- Use React 18 function components and hooks.
- Follow existing MobX store patterns in `packages/shared-state`.
- Keep reusable components presentation-focused. Push workflow orchestration into app screens or stores.
- Reuse `@plane/ui` primitives before creating new app-local UI primitives.
- Avoid putting backend secrets or privileged decisions in frontend code.

## Types

- Prefer explicit domain types for API payloads and shared contracts.
- Use discriminated unions for state machines and variants.
- Use `satisfies` when checking object literals without widening them.
- Avoid `any`. If a boundary is truly unknown, narrow from `unknown`.
- Avoid enums for new frontend code unless the surrounding package already uses them; prefer literal unions or const objects.
- Keep nullable and optional fields distinct. Do not erase backend contract nuance with broad optional types.

## Formatting And Linting

Formatting uses `oxfmt`; linting uses OxLint with `.oxlintrc.json`.

```bash
pnpm check:format
pnpm check:lint
pnpm fix:format
pnpm fix:lint
```

Root lint docs: [docs/linting.md](docs/linting.md).

## i18n

- Do not hardcode new user-facing strings in areas that already use `packages/i18n`.
- Load the translate skill before editing `packages/i18n/src/locales/**`.
- Preserve ICU placeholders, tags, Markdown, keyboard shortcuts, and product names exactly according to the translate skill.
