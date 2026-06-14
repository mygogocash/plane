/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { RefreshCcw } from "lucide-react";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
// helpers
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";

export const RecurringWorkItemModalSection = observer(function RecurringWorkItemModalSection() {
  const featureEnabled = isSelfHostedFeatureEnabled("recurring_work_items");
  const { recurrenceDraft, setRecurrenceDraft, recurrenceRuns } = useIssueModal();

  if (!featureEnabled) return null;

  const updateDraft = (patch: Partial<typeof recurrenceDraft>) =>
    setRecurrenceDraft((current) => ({
      ...current,
      ...patch,
    }));

  return (
    <section className="rounded border border-subtle bg-surface-1 p-3" aria-label="Recurring work item">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <RefreshCcw className="size-3.5 flex-shrink-0 text-tertiary" />
          <div className="min-w-0">
            <div className="text-body-xs-medium text-primary">Repeat</div>
            <div className="truncate text-caption-sm-regular text-tertiary">Schedule future work items.</div>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-caption-sm-regular text-secondary">
          <input
            aria-label="Repeat work item"
            className="size-4"
            type="checkbox"
            checked={recurrenceDraft.enabled}
            onChange={(event) => updateDraft({ enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>

      {recurrenceDraft.enabled && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
            Frequency
            <select
              className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              value={recurrenceDraft.frequency}
              onChange={(event) => updateDraft({ frequency: event.target.value as typeof recurrenceDraft.frequency })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {recurrenceDraft.frequency === "custom" && (
            <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
              RRULE
              <input
                className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
                placeholder="FREQ=WEEKLY;INTERVAL=2"
                value={recurrenceDraft.rrule}
                onChange={(event) => updateDraft({ rrule: event.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
            Timezone
            <input
              className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              value={recurrenceDraft.timezone}
              onChange={(event) => updateDraft({ timezone: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
            Starts
            <input
              className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              type="datetime-local"
              value={recurrenceDraft.start_date}
              onChange={(event) => updateDraft({ start_date: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
            Ends
            <input
              className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              type="datetime-local"
              value={recurrenceDraft.end_date}
              onChange={(event) => updateDraft({ end_date: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption-sm-regular text-secondary">
            Iterations
            <input
              className="h-8 rounded border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              min={1}
              type="number"
              value={recurrenceDraft.max_iterations ?? ""}
              onChange={(event) =>
                updateDraft({
                  max_iterations: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
          <div className="flex items-end">
            {recurrenceRuns.length === 0 ? (
              <div className="w-full rounded border border-dashed border-subtle px-3 py-2 text-caption-sm-regular text-tertiary">
                Self-hosted - no recurrence runs yet.
              </div>
            ) : (
              <div className="text-caption-sm-regular text-tertiary">{recurrenceRuns.length} runs generated.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
});
