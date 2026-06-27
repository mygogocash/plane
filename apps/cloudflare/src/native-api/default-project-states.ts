/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type DefaultStateTemplate = {
  suffix: string;
  name: string;
  group: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
  color: string;
  order: number;
  sequence: number;
  default: boolean;
};

const DEFAULT_STATE_TEMPLATES: DefaultStateTemplate[] = [
  { suffix: "backlog", name: "Backlog", group: "backlog", color: "#60646C", order: 1, sequence: 15000, default: true },
  {
    suffix: "unstarted",
    name: "Todo",
    group: "unstarted",
    color: "#60646C",
    order: 2,
    sequence: 25000,
    default: false,
  },
  {
    suffix: "started",
    name: "In Progress",
    group: "started",
    color: "#F59E0B",
    order: 3,
    sequence: 35000,
    default: false,
  },
  {
    suffix: "completed",
    name: "Done",
    group: "completed",
    color: "#46A758",
    order: 4,
    sequence: 45000,
    default: false,
  },
  {
    suffix: "cancelled",
    name: "Cancelled",
    group: "cancelled",
    color: "#9AA4BC",
    order: 5,
    sequence: 55000,
    default: false,
  },
];

export function buildDefaultProjectStates(projectId: string, workspaceId: string) {
  return DEFAULT_STATE_TEMPLATES.map((template) => ({
    id: `${projectId}-${template.suffix}`,
    color: template.color,
    default: template.default,
    description: "",
    group: template.group,
    name: template.name,
    project_id: projectId,
    sequence: template.sequence,
    workspace_id: workspaceId,
    order: template.order,
  }));
}

export function buildDefaultIntakeState(projectId: string, workspaceId: string) {
  return {
    id: `${projectId}-intake`,
    color: "#60646C",
    default: true,
    description: "",
    group: "triage" as const,
    name: "Triage",
    project_id: projectId,
    sequence: 65000,
    workspace_id: workspaceId,
  };
}
