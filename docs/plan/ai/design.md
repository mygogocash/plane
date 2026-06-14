# Plane AI (Ask/Build modes, Connectors, semantic actions) — Design (plane.so alignment)

> **Scope.** This is the annotated-screenshot UX/UI alignment doc for the Plane AI feature set in the self-host fork. It references the marketed plane.so AI surfaces (user screenshots) and annotates the exact deltas the fork must match. It is a companion to the PRD ([`docs/prd-ai-2026-06-07.md`](../../prd-ai-2026-06-07.md)) and reuses its data models, API contracts, and milestones. Where the PRD owns *what to build server-side*, this doc owns *what the screens look like and where the code goes*.
>
> **Stable IDs.** Feature prefix `AI`. Screen-level alignment items are `AI-DS-NN`; cross-reference PRD requirements (R1–R13) and milestones (M1–M9).
>
> **Conventions (shared across all AI docs).**
> - Acceptance criteria are Given/When/Then.
> - Every surface is gated by `isSelfHostedFeatureEnabled(...)` (`apps/web/ce/lib/self-host-entitlements.ts`) **and** the instance LLM flag (`config.has_llm_configured`, from `apps/api/plane/license/api/views/instance.py:164`). Gating renders a **disabled/empty state, never a paywall**.
> - Frontend = React Router 7 + MobX in `apps/web/{core,ce}`; shared types/constants in `@plane/{types,constants,ui,propel}`.
> - All writes are workspace/project-scoped and permission-checked server-side; the UI mirrors but never replaces those checks.

---

## Fork baseline (verified)

These already exist and are reused, not rebuilt:

| Asset | Path | Reused for |
|---|---|---|
| `CopilotPanel` (modal portal, mode state, draft list, conversation history) | `apps/web/core/components/copilot/panel.tsx` (518 lines) | Ask/Build panel shell, Home widget, dedicated `/ai-chat` route |
| Copilot entry button | `apps/web/core/components/issues/issue-detail/main-content.tsx:177` (`Sparkles` + `setIsCopilotOpen`) | Pattern for header "AI assistant" button |
| `AIService` (`sendCopilotMessage`, `listCopilotConversations`, `performEditorTask`, `createGptTask`) | `apps/web/core/services/ai.service.ts` | Extend with build/duplicate/summary/brief/context-assist/translate methods |
| `TCopilotMode` union (`answer`/`draft_subtasks`/`command`/`auto`) | `apps/web/core/services/ai.service.ts:27` | Extend with `build_project`, `context_assist` |
| Editor AI menu (Ask Pi, tone scoring) | `apps/web/ce/components/pages/editor/ai/menu.tsx` | Add Translate item + language picker |
| AI editor task enum + thinking copy | `apps/web/core/constants/ai.ts` (`AI_EDITOR_TASKS`, `getAIThinkingMessage`) | Add `TRANSLATE` task; reuse thinking/escalation copy everywhere |
| Workspace integrations settings page | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx` | Add **Connectors** tab |
| Sidebar nav item registry | `packages/constants/src/workspace.ts` (`home`/`inbox`/`your_work`/`drafts`/`projects` entries, each `{ key, labelTranslationKey, href }`) | Add `ai_chat` nav entry |
| Workspace home page | `apps/web/app/(all)/[workspaceSlug]/(projects)/page.tsx` → `apps/web/core/components/home/root.tsx` + `home-dashboard-widgets.tsx` | Host the "Ask Plane AI" widget |
| Issue create modal form | `apps/web/core/components/issues/issue-modal/form.tsx` (+ `components/title-input.tsx`, `description-editor.tsx`) | Inline duplicate detection |
| Project automations route (exists, project-scoped) | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/automations/` (registered `core.ts:342`) | Extend for rule builder; add workspace-level automations route |
| Route registration | `apps/web/app/routes/core.ts` (settings block `255–350`), `apps/web/app/routes/extended.ts` | Register `/ai-chat`, connectors, automations |

**Gap callout:** the fork has **no left-nav "Plane AI" item**, **no `/ai-chat` route**, **no Build mode**, **no Connectors tab**, **no header AI button**, and **no Ask/Build mode dropdown** (current panel mode defaults to `auto` with no user-facing Ask/Build toggle). Those are the primary plane.so deltas below.

---

## Reference: Home "Ask Plane AI" widget

> **Visual reference:** the user's plane.so screenshot of the workspace Home. A card titled **"Ask Plane AI"** sits among the home widgets. It has a **mode dropdown** showing two options — **"Ask"** (checked) and **"Build"** — a **workspace chip** ("Acme Corp"), promo copy *"Plane AI can now take actions for you. Use Build mode to create work items, cycles and more."*, and a primary **"Activate Build mode"** button.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Card on Home | Persistent "Ask Plane AI" widget in the home dashboard | **Missing** | Add `AskPlaneAIWidget` to the home widgets grid (`apps/web/core/components/home/widgets/`), registered in `home-dashboard-widgets.tsx` |
| Mode dropdown (Ask / Build) | Single dropdown; **Ask** checked by default; selecting **Build** switches the panel to build synthesis | **Missing** (panel has internal `mode` state but no Ask/Build UX) | Add a `CopilotModeDropdown` mapping `Ask`→`answer`/`auto`, `Build`→`build_project`; checkmark on active (matches existing `Check` icon usage in `panel.tsx`) |
| Workspace chip | Shows the active workspace name | **Partial** (workspace known via store) | Render chip from `useWorkspace().currentWorkspace?.name`; non-interactive label |
| Promo copy | Static marketing line about Build mode taking actions | **Missing** | Static i18n string `copilot.build.promo`; hide when `build_project` already active |
| "Activate Build mode" button | Switches mode to Build and focuses the composer | **Missing** | Primary `Button` (`@plane/propel/button`) → sets dropdown to Build, opens `CopilotPanel` in `build_project` mode |
| Disabled state | (n/a on cloud) | — | When `!isSelfHostedFeatureEnabled('ai_copilot')` **or** `!config.has_llm_configured`: render the card with a muted body and a "Connect an AI provider in instance settings" hint; **no paywall** |

**Acceptance criteria**
- **Given** `ai_copilot` is on and a provider is configured, **When** Home renders, **Then** the "Ask Plane AI" widget shows the Ask/Build dropdown defaulting to **Ask**, the workspace chip, and an enabled "Activate Build mode" button.
- **Given** the user clicks "Activate Build mode", **When** the panel opens, **Then** the dropdown reads **Build** and the composer is focused with the Build placeholder.
- **Given** no LLM provider is configured, **When** Home renders, **Then** the widget is visible but disabled with the connect-provider hint and the button is non-interactive (fail-closed, mirrors PRD Edge Case "flag on, provider unset").

**Implementation mapping**
- **Component (new):** `apps/web/core/components/ai/ask-plane-widget/AskPlaneAIWidget.tsx`, `CopilotModeDropdown.tsx`.
- **Register:** add to `apps/web/core/components/home/home-dashboard-widgets.tsx`.
- **Store (new):** `apps/web/core/store/ai/copilot.store.ts` (`AICopilotStore`) holding `activeMode: TCopilotMode`, `isPanelOpen`, `buildDraft`, `setMode`, `openPanel`, composed onto `apps/web/core/store/root.store.ts` and surfaced via `useStore()`. (PRD names this `aiCopilotStore`.)
- **Service:** existing `AIService.sendCopilotMessage` with `mode: "build_project"`.
- **Types:** extend `TCopilotMode` in `ai.service.ts` and `@plane/types`.
- **Gating:** `isSelfHostedFeatureEnabled('ai_copilot')` + `useInstance().config?.has_llm_configured`.
- **Loading/thinking:** reuse `getAIThinkingMessage` (`constants/ai.ts`) for the Build synthesis spinner.
- **Error:** on 400 (`{error:"LLM provider … required"}`) show inline error row (existing `errorMessage` pattern in `panel.tsx`); on 503 (quota) show "AI is busy, retry shortly" with retry.
- **a11y:** dropdown is a `role="menu"` with `aria-checked` on Ask/Build; button has accessible label "Activate Build mode"; widget card uses a labelled region (`aria-labelledby` → card title).
- **Responsive:** widget spans full width < 768px; dropdown + chip stack above the button on narrow screens.

---

## Reference: Build Mode draft (after "Activate Build mode")

> **Visual reference:** Build mode is selected; the user describes a project and the AI returns an **editable draft tree** — a project name + description and a list of work items, each with name / estimate / priority / assignee / label controls and drag reorder. Action row: **"Apply draft"**, **"Cancel"**, and **"Edit cycle assignment"**.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Description input | Free-text project brief feeding synthesis | **Missing** | Textarea in the Build view of `CopilotPanel`; on submit → `sendCopilotMessage(mode:"build_project")` |
| Editable draft tree | Project header + work-item rows (name, estimate, priority, assignee, label), reorderable | **Partial** (panel already renders an *editable subtask draft list* for `draft_subtasks`) | Generalize the existing `TEditableDraftItem` list into a `BuildDraftEditor` that also edits project name/description and `suggested_cycle` |
| Apply draft | Persists project → issues → cycle transactionally | **Missing** | "Apply draft" → `applyBuildDraft` → `POST .../projects/<project_id>/build-project/apply/` (PRD R1) |
| Cancel | Discards draft | **Partial** (panel reset on close) | Explicit Cancel clears `buildDraft` without closing |
| Edit cycle assignment | Edit which cycle the seeded items join | **Missing** | Inline cycle picker bound to `suggested_cycle` |
| Per-item warnings | (cloud handles silently) | — | Render per-item "label/assignee not found → will skip" warnings returned by apply (PRD Edge Case: create-or-skip, never fail whole apply) |

**Acceptance criteria**
- **Given** a description and Build mode, **When** the user submits, **Then** an editable `project_draft` renders (name, description, work_items[], suggested_cycle) and **nothing is persisted yet** (PRD: "Never auto-final").
- **Given** an edited draft, **When** the user clicks "Apply draft", **Then** the apply endpoint runs transactionally; on partial reference misses, items create-or-skip with visible per-item warnings and the apply does **not** fail.
- **Given** a concurrent second apply of the same draft token, **When** it runs, **Then** it is an idempotent no-op (PRD Edge Case).

**Implementation mapping**
- **Components (new):** `apps/web/core/components/ai/build-mode/BuildDraftEditor.tsx`, `BuildWorkItemRow.tsx`, `BuildCyclePicker.tsx`.
- **Service:** add to `AIService`: `createBuildDraft(slug, {message, project_id?})` (wraps `sendCopilotMessage` build mode) and `applyBuildDraft(slug, projectId, draft)`.
- **Types:** add `TBuildProjectDraft` + extend `TCopilotMessageResponse` with optional `project_draft` (mirrors existing `subtask_draft` shape).
- **Store:** `AICopilotStore.buildDraft`, `applyBuildDraft` action (MobX `runInAction` on success/rollback).
- **Entry:** Home widget button; **also** command palette (Cmd+K) per PRD UX — wire into the existing command palette registry.
- **Loading:** synthesis spinner with `getAIThinkingMessage`; apply shows a determinate "Creating project… creating N items…" state (reuse `isApplying` pattern from `panel.tsx`).
- **Error:** apply failure rolls back server-side; UI shows a toast (`setToast`/`TOAST_TYPE` already imported in `panel.tsx`) and keeps the draft editable.
- **a11y:** draft tree is a labelled list; drag reorder has keyboard fallback (move up/down buttons); priority/assignee/label use existing accessible dropdowns.
- **Responsive:** rows collapse property chips into a stacked layout < 640px.

---

## Reference: Dedicated "Plane AI" left-nav item → `/ai-chat`

> **Visual reference:** the user's plane.so screenshot of the dedicated AI surface. A left-nav item **"Plane AI"** routes to `/ai-chat`. The page shows a **"New chat"** action, a **"Recents"** list reading **"No threads available"** when empty, and a centered composer **"What can I do for you?"** with controls **+ / Build / mic / send**. Below: **"Add files or photos"**, a **"Web search"** toggle, **"Add Connectors"**, and promo *"Stop tab-switching. Connect your world. Link GitHub, Slack to track PRs and summarize chats directly in Plane AI."*

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Left-nav "Plane AI" item | Persistent nav entry | **Missing** | Add `{ key: "ai_chat", labelTranslationKey: "ai.plane_ai", href: "/ai-chat/" }` to the workspace sidebar items in `packages/constants/src/workspace.ts`; gated render in `sidebar-menu-items.tsx` |
| `/ai-chat` route | Dedicated full-page chat | **Missing** | Register `:workspaceSlug/ai-chat` and page `apps/web/app/(all)/[workspaceSlug]/(ai)/ai-chat/page.tsx` |
| "New chat" | Starts a fresh conversation | **Partial** (panel resets `conversationId` to null) | Button → reset active conversation, focus composer |
| "Recents" list / "No threads available" | Lists prior conversations; empty-state copy | **Partial** (`listCopilotConversations` exists) | Render conversations sidebar; empty → "No threads available" |
| Composer "What can I do for you?" | Prompt input | **Partial** (panel has `TextArea`) | Reuse composer; this placeholder string |
| **Build** control in composer | Toggle Ask↔Build inline | **Missing** | Same `CopilotModeDropdown`/toggle as Home widget |
| **+** (add) | Attach / new context | **Missing** | Menu stub; wire to file attach when available |
| **mic** | Voice input | **Missing** | **Out of fork scope** — render only if a transcription provider exists; otherwise omit (no dead control). Note as deferred. |
| **send** | Submit prompt | **Present** (`Send` icon in `panel.tsx`) | Reuse |
| "Add files or photos" | File/image upload into context | **Missing** | Render disabled affordance with tooltip "Attachments coming soon" unless attachment ingestion is implemented; do not fake it |
| "Web search" toggle | Toggle web-augmented answers | **Missing** | **Out of fork scope** (no web-search backend in self-host). Hide the toggle by default; document as non-goal rather than render a non-functional switch |
| "Add Connectors" | Jump to Connectors settings | **Missing** | Link to Settings → Integrations → **Connectors** tab (see below); gated by `integrations` |
| Connectors promo | Marketing copy about GitHub/Slack | **Missing** | Static i18n string; only shown when `integrations` flag on |

**Honesty note (no-magic):** mic, "Add files or photos", and "Web search" have **no fork backend**. Per the PRD non-goals and fail-closed principle, these are rendered only when a real capability backs them; otherwise omit or show an explicit "coming soon"/disabled affordance. Do **not** ship controls that silently no-op.

**Acceptance criteria**
- **Given** `ai_copilot` is on, **When** the workspace loads, **Then** a "Plane AI" item appears in the left nav and routes to `/ai-chat`.
- **Given** no prior conversations, **When** `/ai-chat` loads, **Then** the Recents panel shows "No threads available" and the composer shows "What can I do for you?".
- **Given** the user selects Build in the composer and submits, **Then** the page shows the Build draft editor inline (same `BuildDraftEditor`).
- **Given** `ai_copilot` is off, **When** the nav renders, **Then** the "Plane AI" item is hidden (not a paywall).

**Implementation mapping**
- **Route group (new):** `apps/web/app/(all)/[workspaceSlug]/(ai)/layout.tsx` + `ai-chat/page.tsx`; register in `apps/web/app/routes/core.ts` alongside the projects layout block (or `extended.ts` if treated as extended surface).
- **Components (new):** `apps/web/core/components/ai/chat/AIChatRoot.tsx` (composes a full-page variant of the copilot panel), `RecentsList.tsx`, `ChatComposer.tsx`. Share the message/draft rendering with `CopilotPanel` by extracting the conversation/composer internals into a shared `apps/web/core/components/ai/shared/` module (de-dupes Home widget ↔ `/ai-chat`, PRD open-question Q20: prefer **subdirs** under `components/ai/` — `build-mode/`, `chat/`, `shared/`).
- **Nav:** `packages/constants/src/workspace.ts` (item registry) + `apps/web/core/components/workspace/sidebar/sidebar-menu-items.tsx` (gating render). i18n key `ai.plane_ai`.
- **Service/Store:** `AIService.listCopilotConversations` + `AICopilotStore.conversations`.
- **Empty state:** "No threads available"; **loading:** skeleton for Recents + thinking copy for in-flight answer.
- **Error:** provider-missing → full-page disabled state with connect hint.
- **a11y:** nav item is a labelled link; chat is a labelled `main` landmark; composer textarea has an accessible label; Recents is a navigable list with `aria-current` on the active thread.
- **Responsive:** Recents collapses into a top drawer < 1024px; composer pinned to bottom on mobile.

---

## Reference: Top-right "AI assistant" button

> **Visual reference:** the user's plane.so screenshot showing a global **"AI assistant"** button in the top-right of the app header, opening the AI panel from anywhere.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Header AI button | Always-available entry that opens the AI panel/sidebar | **Missing** at global scope (only present inside issue detail via `main-content.tsx:177`) | Add an "AI assistant" button to the global app header that opens `CopilotPanel` (or routes to `/ai-chat` on mobile) |
| Context awareness | Opens with current-page context | **Partial** (panel accepts `projectId`/`issueId`) | Pass current route entity into the panel so `context_assist` can hydrate (PRD R13) |

**Acceptance criteria**
- **Given** `ai_copilot` is on, **When** any app page renders, **Then** an "AI assistant" button is present in the global header and opens the panel.
- **Given** the user is on a work-item/cycle/project page, **When** they open the assistant, **Then** the panel pre-loads page context via `POST .../copilot/context-assist/` (blockers, at-risk, recent changes) with zero prior conversation.
- **Given** the button is shown but no provider is configured, **When** clicked, **Then** the panel opens in a disabled state with the connect hint (fail-closed).

**Implementation mapping**
- **Component (new):** `apps/web/core/components/ai/AIAssistantButton.tsx` mounted in the global app header (the workspace app shell header rendered above `(projects)`/`(ai)` content; reuse the `Sparkles`+`Button` pattern from `main-content.tsx`).
- **Service (new):** `AIService.contextAssist(slug, {entity_type, entity_id})` → `POST .../copilot/context-assist/`.
- **Store:** `AICopilotStore.openPanel({entityType, entityId})`.
- **Context resolution (PRD Q15):** derive `entity_type`/`entity_id` from the active route params; when on a list/view with no single entity, open with no context (general assist) rather than guessing.
- **Loading:** thinking copy while context loads; render context cards (Blockers / At-risk / Recent changes) when ready.
- **a11y:** icon button with text label "AI assistant"; opens a dialog with focus trap and Escape-to-close (matches existing `ModalPortal` usage in `panel.tsx`).
- **Responsive:** on < 768px the header button navigates to `/ai-chat` instead of opening a modal.

---

## Reference: Settings → Integrations → **Connectors** tab

> **Visual reference:** plane.so places connectors under **Settings → Integrations**, with a **Connectors** tab listing **Slack / GitHub / GitLab / Sentry** plus a **"Build your own"** entry (MCP). Each connector shows install/connect state.

| UI element | plane.so behavior | Fork status | Required change |
|---|---|---|---|
| Integrations page | Lists app integrations | **Present** (`integrations/page.tsx`, GitHub/GitLab cards via `SingleIntegrationCard`) | Add a **Connectors** tab/section adjacent to existing "Installed" integrations |
| Slack connector | Channel binding, schedules, alert channel | **Partial** (`SlackProjectSync` model only; no UI) | Add Slack panel: bind channels (inbound→intake, outbound summary/alert), schedule picker, alert channel select (PRD R11) |
| GitHub / GitLab | Full sync | **Present** | No change — list as connected in the tab |
| Sentry connector | Register webhook secret + severity→priority map | **Missing** | Add Sentry panel: register webhook (shows the inbound URL `…/integrations/sentry/webhook/`), enter secret (write-only, never displayed back), edit severity_map (PRD R12) |
| "Build your own" (MCP) | Link/instructions for the MCP server | **Missing** | Card linking to MCP setup: API-token scope explanation + the standalone server (PRD R10); no secrets rendered |
| Admin gating | Connector admin = ADMIN | **Present pattern** (`integrations/page.tsx` already does `isAdmin` check → `NotAuthorizedView`) | Reuse the ADMIN guard; require `integrations` flag |

**Acceptance criteria**
- **Given** an ADMIN with `integrations` on, **When** they open Settings → Integrations, **Then** a **Connectors** tab lists Slack, GitHub, GitLab, Sentry, and "Build your own".
- **Given** a non-admin, **When** they open the page, **Then** `NotAuthorizedView` renders (existing behavior preserved).
- **Given** an admin opens the Sentry panel, **When** they save a webhook secret, **Then** the secret is write-only (never echoed back; PRD Security: "never logged") and the inbound webhook URL is shown for copy.
- **Given** an admin binds a Slack channel for outbound summaries, **When** they set a schedule, **Then** the schedule is stored as cron (PRD Q17) and reflected in the binding list.

**Implementation mapping**
- **Page:** extend `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx` with a tab switcher ("Installed" | "Connectors").
- **Components (new):** `apps/web/core/components/integrations/connectors/ConnectorsList.tsx`, `SlackConnectorPanel.tsx`, `SentryConnectorPanel.tsx`, `McpConnectorCard.tsx`.
- **Service (new):** extend `IntegrationService` (`apps/web/core/services/integrations`) with `getSlackChannels/bindSlackChannel`, `getSentryConfig/upsertSentryConfig` → routes `…/integrations/slack/channels/`, `…/integrations/sentry/` (PRD API Contracts).
- **Gating:** `isSelfHostedFeatureEnabled('integrations')` + existing ADMIN check.
- **Secrets:** secret inputs are write-only; render `••••` placeholders, never round-trip the value (PRD Security).
- **Empty/loading:** reuse `IntegrationsSettingsLoader`; empty connector → "Connect" CTA.
- **a11y:** tabs use `role="tablist"`/`aria-selected`; secret fields labelled with a "stored, write-only" hint.
- **Responsive:** connector cards stack single-column < 768px.

---

## Cross-cutting surfaces (non-screenshot, from PRD — wired for parity)

These complete the feature but are not in the four primary screenshots. Listed concisely so the build is complete; each carries the same gating + fail-closed + a11y rules above.

| Surface | plane.so parity | Fork delta | Implementation mapping |
|---|---|---|---|
| **Duplicate detection** (issue create) | Inline "Similar issues found" with score chips; high-confidence blocks with override | **Missing** | Debounced `checkDuplicates` in `apps/web/core/components/issues/issue-modal/components/title-input.tsx`/`description-editor.tsx`; render list; `score ≥ DUPLICATE_BLOCK_THRESHOLD` → blocking warning + "Create anyway" (PRD R3). Empty backlog → never blocks. |
| **Summaries / Get Digest** | Cycle/project/initiative digest + share link | **Missing** | "Summarize"/"Get Digest" button in cycle/project headers + initiative pane → `AISummaryModal` (markdown + rollup stat cards: % complete / blockers / at-risk); copy-share-link uses `share_token`. New `apps/web/core/components/ai/summaries/`. (PRD R4) |
| **AI Brief / Wiki** | "Generate Brief" on issue → structured Page | **Partial** (Page model exists) | "AI Draft"/"Generate Brief" button in issue detail → `generate-brief` → links new Page; regenerate/refine controls. (PRD R5) |
| **Intake triage** | AI label/assignee/priority suggestions in review queue | **Partial** (manual triage UI) | Confidence-badged suggestion chips with Approve/Correct in the intake review queue; nothing reaches backlog without human action. (PRD R6) |
| **In-editor Translate** | Selection popover → Translate + language picker | **Partial** (editor AI menu exists) | Add `TRANSLATE` to `AI_EDITOR_TASKS` (`constants/ai.ts`) and a Translate item + language dropdown to `apps/web/ce/components/pages/editor/ai/menu.tsx`; `performEditorTask({task:"translate", target_language})`; Accept/Cancel, replace only on Accept. (PRD R7, Q14) |
| **Semantic Actions (rule builder)** | If-then automation + run history | **Missing** | New **workspace-level** automations route (extend the existing project-scoped automations at `settings/projects/[projectId]/automations/`) with trigger → conditions → actions form + `AutomationRun` history table. Gated by `workflows_approvals`, ADMIN. (PRD R8) |
| **Agents** | Agent assignee + `@AgentName` mention | **Missing** | "Agents" section in assignee dropdown (scope badge read-only/write) and `@AgentName` mention in comment editor; agent response threaded inline. (PRD R9) |
| **Context Assist** | Zero-setup current-page context | **Missing** | Covered by the header "AI assistant" button's `context-assist` call above. (PRD R13) |

---

## Shared states, theming, and a11y (apply to every surface)

- **Empty state:** muted card/body with a single clear next action; never a paywall, never a fake control.
- **Loading / thinking:** reuse `AI_THINKING_MESSAGES` + `getAIThinkingMessage` (`apps/web/core/constants/ai.ts`) so all AI surfaces share honest, time-escalating copy ("AI is thinking…" → "Still working on it…" → "Almost there…"). Single-shot requests use this in place of a fake progress bar; the apply step uses a determinate counter.
- **Error states:** 400 provider-missing → inline disabled state + connect hint; 503 quota → "AI is busy, retry shortly" with retry; partial apply → toast + keep draft. Reuse `setToast`/`TOAST_TYPE` (`@plane/propel/toast`) and the `errorMessage` row already in `panel.tsx`.
- **Gating order:** check `isSelfHostedFeatureEnabled(flag)` first (hide if off), then `config.has_llm_configured` (disable + hint if off). UI gating never substitutes for the server-side role checks.
- **Theming:** all new components use Plane design tokens via `@plane/propel`/`@plane/ui` and `cn`; no hardcoded palette. Dark/light both honored (the fork supports themes; do not assume dark).
- **a11y baseline:** labelled landmarks/regions, focus-trapped dialogs (`ModalPortal`), keyboard-operable dropdowns/drag, `aria-checked`/`aria-current`/`aria-selected` on stateful controls, visible focus rings, and reduced-motion-safe spinners.
- **Responsive breakpoints:** 320 / 375 / 768 / 1024 / 1440 verified; AI panels become full-screen sheets < 768px; the global header AI button routes to `/ai-chat` on mobile rather than opening a modal.

---

## Build order (mirrors PRD milestones)

1. **M1** Ask semantic + Context Assist → header "AI assistant" button + `context-assist`.
2. **M2** Duplicate detection → issue create inline.
3. **M3** Summaries → header buttons + modal.
4. **M4** Brief/Wiki + Translate → issue detail button + editor menu item.
5. **M5** **Build Mode** → Home widget + Ask/Build dropdown + `/ai-chat` + `BuildDraftEditor`.
6. **M6** Semantic Actions → automations rule builder.
7. **M7** Intake triage → review-queue chips.
8. **M8** Agents → assignee dropdown + mentions.
9. **M9** Connectors tab (Slack/Sentry/MCP "Build your own").

Each milestone is flag-gated and fails closed; frontend-only milestones roll back by reverting the commit and redeploying web (PRD Rollback Plan).
