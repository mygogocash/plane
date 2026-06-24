<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Confirm the installed Next.js version in `node_modules/next/package.json`, then verify API usage against [Next.js docs](https://nextjs.org/docs). Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Manut workrules for this app

This folder follows repo-level rules in `../AGENTS.md` and adds these app-specific requirements:

1. Plan and verify every change
   - Start with a short implementation plan and acceptance criteria.
   - End with explicit verification results (`test`, `lint`, `typecheck`, and any targeted runtime checks).

2. TDD is required for non-trivial behavior
   - Write or update tests before implementing behavior changes.
   - For bug fixes, add a regression test first.

3. Use tools, skills, and agents to speed up delivery
   - Use specialized tooling/agents for implementation, code review, and testing.
   - Parallelize independent work where safe, but keep one owner per coherent workstream.

4. Security and secrets
   - Never hardcode API keys/tokens.
   - Keep secrets in environment variables and document required env names.

5. Next.js compatibility checks
   - Check the installed Next.js version in `node_modules/next/package.json`.
   - Validate API usage against [Next.js docs](https://nextjs.org/docs) for that version.
   - Avoid assumptions based on older Next.js behavior.
