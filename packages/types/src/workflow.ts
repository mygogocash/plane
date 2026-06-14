/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Lifecycle posture of a project's workflow. Mirrors Project.workflow_status on the backend.
export type TWorkflowStatus = "disabled" | "enabled" | "paused";

export type TApprovalStatus = "pending" | "approved" | "rejected";

// Where a suggested transition came from: deterministic rules, or copilot refinement.
export type TTransitionSuggestionSource = "rules" | "ai";

// A single transition rule (from_state -> to_state) governing a project (optionally a type).
export interface IWorkflowTransition {
  readonly id: string;
  project: string;
  workspace: string;
  from_state: string;
  to_state: string;
  issue_type: string | null;
  allowed_roles: number[];
  approval_required: boolean;
  fallback_state: string | null;
  auto_assign_member: string | null;
  auto_assign_role: number | null;
  // ProjectMember ids granted explicit actor rights; sent on write, present on read.
  actors?: string[];
}

export interface IWorkItemApprovalApprover {
  member: string;
  responded: boolean;
}

export interface IWorkItemApproval {
  readonly id: string;
  issue: string;
  transition: string;
  status: TApprovalStatus;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  target_state: string | null;
  fallback_state: string | null;
  comment: string;
  approvers: IWorkItemApprovalApprover[];
}

// Payload to decide a pending approval.
export interface IApprovalDecisionPayload {
  approved: boolean;
  comment?: string;
}

// Rules-first (copilot-optional) next-state suggestion. ``to_state`` is null when nothing
// is rankable (the UI should hide the chip).
export interface ISuggestedTransition {
  to_state: string | null;
  confidence: number;
  source: TTransitionSuggestionSource;
}

export interface IWorkflowConfig {
  workflow_status: TWorkflowStatus;
}

// Filter params for listing transition rules.
export interface IWorkflowTransitionFilters {
  from_state?: string;
  issue_type?: string;
}
