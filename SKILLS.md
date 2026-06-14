# Skills

This file indexes on-demand agent capabilities. Do not paste every workflow into `AGENTS.md`; load the relevant skill only when the task needs it.

## Available Local Skills

The same skills are mirrored under `.agents/skills/` and `.claude/skills/`.

| Skill               | Load when                                                                        | Entry point                                   |
| ------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| Branch name         | Starting or renaming a branch with Plane work item conventions.                  | `.agents/skills/branch-name/SKILL.md`         |
| Create pull request | Creating a PR from an actual branch diff and repo template.                      | `.agents/skills/create-pull-request/SKILL.md` |
| Release notes       | Generating Plane release PR notes from commits.                                  | `.agents/skills/release-notes/SKILL.md`       |
| Translate           | Adding, changing, or reviewing locale JSON under `packages/i18n/src/locales/**`. | `.agents/skills/translate/SKILL.md`           |

## Loading Rules

- Read only the relevant skill for the current task.
- Follow the skill's allowed scope, test requirements, and output format.
- If a skill needs git metadata, first confirm `git status` works in this checkout.
- If a skill references a file that is missing locally, report the gap and continue with the closest safe workflow.

## Adding A Skill

Add a focused `SKILL.md` under `.agents/skills/<name>/` and mirror it to `.claude/skills/<name>/` if Claude Code should see the same workflow. Keep each skill narrow, task-triggered, and concrete.
