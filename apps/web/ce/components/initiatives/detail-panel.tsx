/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TInitiative, TInitiativeMemberResponse, TInitiativeProgress } from "@plane/types";

type InitiativeDetailPanelProps = {
  initiative: TInitiative | null;
  isMutating?: boolean;
  lastMembershipResponse?: TInitiativeMemberResponse | null;
  membershipError?: string | null;
  onAttachEpic: (epicIds: string[]) => Promise<void>;
  onAttachProject: (projectIds: string[]) => Promise<void>;
  onDetachEpic: (epicIds: string[]) => Promise<void>;
  onDetachProject: (projectIds: string[]) => Promise<void>;
  progress?: TInitiativeProgress | null;
};

const parseMemberIds = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatPercent = (percent?: number) => `${Math.max(0, Math.min(100, Math.round(percent ?? 0)))}%`;

const MutationRow = ({
  disabled,
  label,
  onAttach,
  onDetach,
  placeholder,
}: {
  disabled?: boolean;
  label: string;
  onAttach: (ids: string[]) => Promise<void>;
  onDetach: (ids: string[]) => Promise<void>;
  placeholder: string;
}) => {
  const [value, setValue] = useState("");

  const runMutation = async (mutation: (ids: string[]) => Promise<void>) => {
    const memberIds = parseMemberIds(value);
    if (memberIds.length === 0) return;
    await mutation(memberIds);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle bg-layer-1 p-3">
      <label className="text-12 font-medium text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          className="h-8 min-w-0 flex-1 rounded border border-subtle bg-layer-2 px-2 text-12 outline-none placeholder:text-placeholder"
          disabled={disabled}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder={placeholder}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || parseMemberIds(value).length === 0}
          prependIcon={<Link2 className="size-3.5" />}
          onClick={() => runMutation(onAttach)}
        >
          Attach
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || parseMemberIds(value).length === 0}
          prependIcon={<Unlink className="size-3.5" />}
          onClick={() => runMutation(onDetach)}
        >
          Detach
        </Button>
      </div>
    </div>
  );
};

const MembershipResult = ({ response }: { response?: TInitiativeMemberResponse | null }) => {
  if (!response) return null;

  const entries = Object.entries(response).filter(([, value]) => Array.isArray(value) && value.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-md border border-subtle bg-layer-1 p-3">
      <h4 className="text-12 font-medium text-secondary">Last membership update</h4>
      <div className="mt-2 space-y-1">
        {entries.map(([key, value]) => (
          <p key={key} className="text-11 break-all text-tertiary">
            {key}: {(value as string[]).join(", ")}
          </p>
        ))}
      </div>
    </div>
  );
};

export const InitiativeDetailPanel = ({
  initiative,
  isMutating = false,
  lastMembershipResponse,
  membershipError,
  onAttachEpic,
  onAttachProject,
  onDetachEpic,
  onDetachProject,
  progress,
}: InitiativeDetailPanelProps) => {
  if (!initiative) {
    return (
      <aside className="hidden w-96 shrink-0 border-l border-subtle bg-layer-1 p-4 xl:block">
        <div className="grid h-full place-items-center text-center text-13 text-secondary">
          Select an initiative to view progress and membership.
        </div>
      </aside>
    );
  }

  const progressValue = progress ?? initiative.progress ?? initiative.progress_snapshot ?? null;

  return (
    <aside className="vertical-scrollbar hidden w-96 shrink-0 overflow-y-auto border-l border-subtle bg-layer-1 p-4 xl:block">
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-subtle bg-layer-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-16 font-semibold text-primary">{initiative.name}</h2>
              <p className="mt-1 text-12 text-tertiary">{initiative.description_stripped || "No description"}</p>
            </div>
            <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-11 font-medium text-secondary">
              {initiative.state}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-subtle bg-layer-1 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-13 font-medium text-primary">Progress</h3>
            <span className="text-13 font-semibold text-primary">{formatPercent(progressValue?.percent_complete)}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="bg-custom-primary-100 h-full rounded-full"
              style={{ width: formatPercent(progressValue?.percent_complete) }}
            />
          </div>
          <p className="mt-2 text-11 text-tertiary">{progressValue?.total_count ?? 0} work items included</p>
          {Object.entries(progressValue?.counts_by_group ?? {}).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(progressValue?.counts_by_group ?? {}).map(([group, count]) => (
                <div key={group} className="rounded bg-layer-2 px-2 py-1">
                  <p className="text-11 text-tertiary">{group}</p>
                  <p className="text-13 font-medium text-primary">{count ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-13 font-medium text-primary">Members</h3>
          <MutationRow
            disabled={isMutating}
            label="Epics"
            onAttach={onAttachEpic}
            onDetach={onDetachEpic}
            placeholder="Epic IDs"
          />
          <MutationRow
            disabled={isMutating}
            label="Projects"
            onAttach={onAttachProject}
            onDetach={onDetachProject}
            placeholder="Project IDs"
          />
          {membershipError && (
            <p className="rounded bg-danger-subtle p-2 text-12 text-danger-primary">{membershipError}</p>
          )}
          <MembershipResult response={lastMembershipResponse} />
        </div>
      </div>
    </aside>
  );
};
