/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent } from "react";
import { CalendarRange, Columns3, Filter, List, Tags, UserRound } from "lucide-react";
import { INITIATIVE_STATES } from "@plane/constants";
import type { TInitiative, TInitiativeState } from "@plane/types";
import { cn } from "@plane/utils";

export type TInitiativeLayout = "board" | "list" | "timeline";
export type TInitiativeTimelineZoom = "week" | "month" | "quarter";
export type TInitiativeGroupBy = "state" | "lead" | "none";

export type TInitiativeViewState = {
  layout: TInitiativeLayout;
  state: TInitiativeState | "ALL";
  leadId: string;
  labelIds: string[];
  startDate: string | null;
  endDate: string | null;
  groupBy: TInitiativeGroupBy;
  timelineZoom: TInitiativeTimelineZoom;
};

type InitiativesBoardProps = {
  initiatives: TInitiative[];
  onSelectInitiative?: (initiativeId: string) => void;
  onViewStateChange?: (viewState: TInitiativeViewState) => void;
  selectedInitiativeId?: string;
  viewState: TInitiativeViewState;
};

const ALL_LEADS_VALUE = "ALL";
const INITIATIVE_VIEW_STATE_VERSION = 1;

const INITIATIVE_STATE_LABELS: Record<TInitiativeState, string> = {
  DRAFT: "Draft",
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const INITIATIVE_LAYOUT_OPTIONS: {
  key: TInitiativeLayout;
  label: string;
  icon: typeof Columns3;
}[] = [
  { key: "board", label: "Board", icon: Columns3 },
  { key: "list", label: "List", icon: List },
  { key: "timeline", label: "Timeline", icon: CalendarRange },
];

const INITIATIVE_TIMELINE_ZOOMS: TInitiativeTimelineZoom[] = ["week", "month", "quarter"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInitiativeLayout = (value: unknown): value is TInitiativeLayout =>
  value === "board" || value === "list" || value === "timeline";

const isInitiativeStateFilter = (value: unknown): value is TInitiativeState | "ALL" =>
  value === "ALL" || INITIATIVE_STATES.some((state) => state.value === value);

const isInitiativeGroupBy = (value: unknown): value is TInitiativeGroupBy =>
  value === "state" || value === "lead" || value === "none";

const isTimelineZoom = (value: unknown): value is TInitiativeTimelineZoom =>
  value === "week" || value === "month" || value === "quarter";

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];

export const getInitiativeStateLabel = (state: TInitiativeState) => INITIATIVE_STATE_LABELS[state];

export const getInitiativeViewStateStorageKey = (workspaceSlug: string) =>
  `plane:initiatives:${workspaceSlug}:view-state:v${INITIATIVE_VIEW_STATE_VERSION}`;

export const createDefaultInitiativeViewState = (): TInitiativeViewState => ({
  layout: "board",
  state: "ALL",
  leadId: ALL_LEADS_VALUE,
  labelIds: [],
  startDate: null,
  endDate: null,
  groupBy: "state",
  timelineZoom: "month",
});

export const updateInitiativeViewState = (
  currentViewState: TInitiativeViewState,
  updates: Partial<TInitiativeViewState>
): TInitiativeViewState => ({
  ...currentViewState,
  ...updates,
  labelIds: updates.labelIds ?? currentViewState.labelIds,
});

export const normalizeInitiativeViewState = (value: unknown): TInitiativeViewState => {
  const defaultViewState = createDefaultInitiativeViewState();
  if (!isRecord(value)) return defaultViewState;

  return {
    layout: isInitiativeLayout(value.layout) ? value.layout : defaultViewState.layout,
    state: isInitiativeStateFilter(value.state) ? value.state : defaultViewState.state,
    leadId: typeof value.leadId === "string" && value.leadId.length > 0 ? value.leadId : defaultViewState.leadId,
    labelIds: normalizeStringArray(value.labelIds),
    startDate: typeof value.startDate === "string" && value.startDate.length > 0 ? value.startDate : null,
    endDate: typeof value.endDate === "string" && value.endDate.length > 0 ? value.endDate : null,
    groupBy: isInitiativeGroupBy(value.groupBy) ? value.groupBy : defaultViewState.groupBy,
    timelineZoom: isTimelineZoom(value.timelineZoom) ? value.timelineZoom : defaultViewState.timelineZoom,
  };
};

export const loadInitiativeViewState = (workspaceSlug: string): TInitiativeViewState => {
  if (typeof window === "undefined") return createDefaultInitiativeViewState();

  const storageValue = window.localStorage.getItem(getInitiativeViewStateStorageKey(workspaceSlug));
  if (!storageValue) return createDefaultInitiativeViewState();

  try {
    return normalizeInitiativeViewState(JSON.parse(storageValue));
  } catch {
    return createDefaultInitiativeViewState();
  }
};

export const persistInitiativeViewState = (workspaceSlug: string, viewState: TInitiativeViewState) => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getInitiativeViewStateStorageKey(workspaceSlug), JSON.stringify(viewState));
};

type TInitiativeWithLabels = TInitiative & {
  label_ids?: string[];
  labels?: Array<{ id?: string }>;
};

const getInitiativeLabelIds = (initiative: TInitiative) => {
  const initiativeWithLabels = initiative as TInitiativeWithLabels;
  const directLabelIds = initiativeWithLabels.label_ids ?? [];
  const nestedLabelIds = (initiativeWithLabels.labels ?? [])
    .map((label) => label.id)
    .filter((labelId): labelId is string => typeof labelId === "string");

  return [...directLabelIds, ...nestedLabelIds];
};

const isInitiativeInDateWindow = (initiative: TInitiative, viewState: TInitiativeViewState) => {
  if (viewState.startDate && (!initiative.start_date || initiative.start_date < viewState.startDate)) return false;
  if (viewState.endDate && (!initiative.end_date || initiative.end_date > viewState.endDate)) return false;
  return true;
};

export const filterInitiatives = (initiatives: TInitiative[], viewState: TInitiativeViewState) =>
  initiatives.filter((initiative) => {
    if (viewState.state !== "ALL" && initiative.state !== viewState.state) return false;
    if (viewState.leadId !== ALL_LEADS_VALUE && initiative.lead_id !== viewState.leadId) return false;
    if (viewState.labelIds.length > 0) {
      const initiativeLabelIds = new Set(getInitiativeLabelIds(initiative));
      if (!viewState.labelIds.every((labelId) => initiativeLabelIds.has(labelId))) return false;
    }
    return isInitiativeInDateWindow(initiative, viewState);
  });

const formatDate = (date?: string | null) => {
  if (!date) return "No date";
  return date;
};

const formatPercent = (percent?: number) => {
  const value = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
  return `${value}%`;
};

const InitiativeCard = ({
  initiative,
  isSelected,
  onSelectInitiative,
}: {
  initiative: TInitiative;
  isSelected?: boolean;
  onSelectInitiative?: (initiativeId: string) => void;
}) => {
  const progress = initiative.progress ?? initiative.progress_snapshot ?? null;

  return (
    <button
      type="button"
      className={cn(
        "flex min-h-28 w-full flex-col gap-3 rounded-md border border-subtle bg-layer-1 p-3 text-left transition-colors hover:bg-layer-2",
        {
          "border-custom-primary-100 bg-custom-primary-100/5": isSelected,
        }
      )}
      onClick={() => onSelectInitiative?.(initiative.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-14 font-medium text-primary">{initiative.name}</h3>
          <p className="mt-1 line-clamp-2 text-12 text-secondary">
            {initiative.description_stripped || initiative.description || "No description"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-11 font-medium",
            INITIATIVE_STATES.find((state) => state.value === initiative.state)?.bgColor,
            INITIATIVE_STATES.find((state) => state.value === initiative.state)?.textColor
          )}
        >
          {getInitiativeStateLabel(initiative.state)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-11 text-tertiary">
        <span>{formatDate(initiative.start_date)}</span>
        <span>{formatDate(initiative.end_date)}</span>
        <span>{formatPercent(progress?.percent_complete)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-custom-primary-100 h-full" style={{ width: formatPercent(progress?.percent_complete) }} />
      </div>
    </button>
  );
};

const FilterToolbar = ({
  initiatives,
  onViewStateChange,
  viewState,
}: {
  initiatives: TInitiative[];
  onViewStateChange?: (viewState: TInitiativeViewState) => void;
  viewState: TInitiativeViewState;
}) => {
  const leadIds = Array.from(new Set(initiatives.map((initiative) => initiative.lead_id).filter(Boolean) as string[]));
  const labelValue = viewState.labelIds.join(", ");

  const applyViewState = (updates: Partial<TInitiativeViewState>) =>
    onViewStateChange?.(updateInitiativeViewState(viewState, updates));

  const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) =>
    applyViewState({
      labelIds: event.currentTarget.value
        .split(",")
        .map((labelId) => labelId.trim())
        .filter(Boolean),
    });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-layer-1 px-4 py-3">
      <div className="flex h-8 items-center gap-1 rounded border border-subtle bg-layer-2 p-1">
        {INITIATIVE_LAYOUT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              className={cn("flex h-6 items-center gap-1 rounded px-2 text-12 text-secondary", {
                "shadow-sm bg-layer-1 text-primary": option.key === viewState.layout,
              })}
              onClick={() => applyViewState({ layout: option.key })}
              aria-pressed={option.key === viewState.layout}
            >
              <Icon className="size-3.5" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <label className="flex h-8 items-center gap-1.5 rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <Filter className="size-3.5" />
        <select
          className="bg-transparent outline-none"
          value={viewState.state}
          onChange={(event) => applyViewState({ state: event.currentTarget.value as TInitiativeState | "ALL" })}
        >
          <option value="ALL">All states</option>
          {INITIATIVE_STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {getInitiativeStateLabel(state.value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-8 items-center gap-1.5 rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <UserRound className="size-3.5" />
        <select
          className="bg-transparent outline-none"
          value={viewState.leadId}
          onChange={(event) => applyViewState({ leadId: event.currentTarget.value })}
        >
          <option value={ALL_LEADS_VALUE}>All leads</option>
          {leadIds.map((leadId) => (
            <option key={leadId} value={leadId}>
              {leadId}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-8 items-center gap-1.5 rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <Tags className="size-3.5" />
        <input
          className="w-36 bg-transparent outline-none placeholder:text-placeholder"
          value={labelValue}
          onChange={handleLabelChange}
          placeholder="Label IDs"
        />
      </label>
      <label className="flex h-8 items-center gap-1.5 rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <CalendarRange className="size-3.5" />
        <input
          className="w-28 bg-transparent outline-none"
          type="date"
          value={viewState.startDate ?? ""}
          onChange={(event) => applyViewState({ startDate: event.currentTarget.value || null })}
        />
      </label>
      <label className="flex h-8 items-center gap-1.5 rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <CalendarRange className="size-3.5" />
        <input
          className="w-28 bg-transparent outline-none"
          type="date"
          value={viewState.endDate ?? ""}
          onChange={(event) => applyViewState({ endDate: event.currentTarget.value || null })}
        />
      </label>
      <label className="flex h-8 items-center rounded border border-subtle bg-layer-1 px-2 text-12 text-secondary">
        <span className="sr-only">Group initiatives</span>
        <select
          className="bg-transparent outline-none"
          value={viewState.groupBy}
          onChange={(event) => applyViewState({ groupBy: event.currentTarget.value as TInitiativeGroupBy })}
        >
          <option value="state">Group by state</option>
          <option value="lead">Group by lead</option>
          <option value="none">No grouping</option>
        </select>
      </label>
      {viewState.layout === "timeline" && (
        <div className="flex h-8 items-center gap-1 rounded border border-subtle bg-layer-2 p-1">
          {INITIATIVE_TIMELINE_ZOOMS.map((zoom) => (
            <button
              key={zoom}
              type="button"
              className={cn("h-6 rounded px-2 text-12 text-secondary capitalize", {
                "shadow-sm bg-layer-1 text-primary": zoom === viewState.timelineZoom,
              })}
              onClick={() => applyViewState({ timelineZoom: zoom })}
              aria-pressed={zoom === viewState.timelineZoom}
            >
              {zoom}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const BoardLayout = ({
  initiatives,
  onSelectInitiative,
  selectedInitiativeId,
}: Pick<InitiativesBoardProps, "onSelectInitiative" | "selectedInitiativeId"> & { initiatives: TInitiative[] }) => (
  <div className="horizontal-scrollbar grid h-full auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto p-4">
    {INITIATIVE_STATES.map((state) => {
      const columnInitiatives = initiatives.filter((initiative) => initiative.state === state.value);
      const label = getInitiativeStateLabel(state.value);

      return (
        <section
          key={state.value}
          data-testid="initiative-state-column"
          aria-label={`${label} initiatives`}
          className="flex min-h-96 flex-col rounded-md border border-subtle bg-layer-2"
        >
          <div className="flex h-10 items-center justify-between border-b border-subtle px-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: state.color }} />
              <h2 className="text-13 font-medium text-primary">{label}</h2>
            </div>
            <span className="text-11 text-tertiary">{columnInitiatives.length}</span>
          </div>
          <div className="vertical-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            {columnInitiatives.map((initiative) => (
              <InitiativeCard
                key={initiative.id}
                initiative={initiative}
                isSelected={initiative.id === selectedInitiativeId}
                onSelectInitiative={onSelectInitiative}
              />
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

const ListLayout = ({
  initiatives,
  onSelectInitiative,
  selectedInitiativeId,
}: Pick<InitiativesBoardProps, "onSelectInitiative" | "selectedInitiativeId"> & { initiatives: TInitiative[] }) => (
  <div className="vertical-scrollbar flex h-full flex-col overflow-y-auto p-4">
    <div className="overflow-hidden rounded-md border border-subtle bg-layer-1">
      {initiatives.map((initiative) => (
        <button
          key={initiative.id}
          type="button"
          className={cn(
            "grid min-h-14 w-full grid-cols-[minmax(12rem,1fr)_8rem_7rem_7rem_5rem] items-center gap-3 border-b border-subtle px-4 text-left last:border-b-0 hover:bg-layer-2",
            {
              "bg-custom-primary-100/5": initiative.id === selectedInitiativeId,
            }
          )}
          onClick={() => onSelectInitiative?.(initiative.id)}
        >
          <span className="truncate text-13 font-medium text-primary">{initiative.name}</span>
          <span className="text-12 text-secondary">{getInitiativeStateLabel(initiative.state)}</span>
          <span className="text-12 text-tertiary">{formatDate(initiative.start_date)}</span>
          <span className="text-12 text-tertiary">{formatDate(initiative.end_date)}</span>
          <span className="text-right text-12 text-tertiary">
            {formatPercent((initiative.progress ?? initiative.progress_snapshot)?.percent_complete)}
          </span>
        </button>
      ))}
    </div>
  </div>
);

const TimelineLayout = ({
  initiatives,
  onSelectInitiative,
  selectedInitiativeId,
  viewState,
}: Pick<InitiativesBoardProps, "onSelectInitiative" | "selectedInitiativeId" | "viewState"> & {
  initiatives: TInitiative[];
}) => (
  <div className="vertical-scrollbar flex h-full flex-col overflow-y-auto p-4">
    <div className="rounded-md border border-subtle bg-layer-1">
      <div className="grid h-10 grid-cols-[minmax(12rem,18rem)_1fr_5rem] items-center border-b border-subtle px-4 text-11 font-medium text-tertiary uppercase">
        <span>Initiative</span>
        <span className="capitalize">{viewState.timelineZoom}</span>
        <span className="text-right">Progress</span>
      </div>
      {initiatives.map((initiative) => {
        const progress = initiative.progress ?? initiative.progress_snapshot ?? null;

        return (
          <button
            key={initiative.id}
            type="button"
            className={cn(
              "grid min-h-16 w-full grid-cols-[minmax(12rem,18rem)_1fr_5rem] items-center gap-4 border-b border-subtle px-4 text-left last:border-b-0 hover:bg-layer-2",
              {
                "bg-custom-primary-100/5": initiative.id === selectedInitiativeId,
              }
            )}
            onClick={() => onSelectInitiative?.(initiative.id)}
          >
            <span className="min-w-0">
              <span className="block truncate text-13 font-medium text-primary">{initiative.name}</span>
              <span className="text-11 text-tertiary">
                {formatDate(initiative.start_date)} - {formatDate(initiative.end_date)}
              </span>
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-surface-2">
              <span
                className="bg-custom-primary-100 block h-full rounded-full"
                style={{ width: formatPercent(progress?.percent_complete) }}
              />
            </span>
            <span className="text-right text-12 text-tertiary">{formatPercent(progress?.percent_complete)}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export const InitiativesBoard = ({
  initiatives,
  onSelectInitiative,
  onViewStateChange,
  selectedInitiativeId,
  viewState,
}: InitiativesBoardProps) => {
  const filteredInitiatives = filterInitiatives(initiatives, viewState);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-active-layout={viewState.layout}
      data-filter-lead-id={viewState.leadId}
      data-filter-state={viewState.state}
    >
      <FilterToolbar initiatives={initiatives} onViewStateChange={onViewStateChange} viewState={viewState} />
      {filteredInitiatives.length === 0 ? (
        <div className="grid h-full place-items-center px-5 text-center text-13 text-secondary">
          No initiatives match these filters
        </div>
      ) : viewState.layout === "list" ? (
        <ListLayout
          initiatives={filteredInitiatives}
          onSelectInitiative={onSelectInitiative}
          selectedInitiativeId={selectedInitiativeId}
        />
      ) : viewState.layout === "timeline" ? (
        <TimelineLayout
          initiatives={filteredInitiatives}
          onSelectInitiative={onSelectInitiative}
          selectedInitiativeId={selectedInitiativeId}
          viewState={viewState}
        />
      ) : (
        <BoardLayout
          initiatives={filteredInitiatives}
          onSelectInitiative={onSelectInitiative}
          selectedInitiativeId={selectedInitiativeId}
        />
      )}
    </section>
  );
};
