/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TStatusUpdate } from "@plane/types";
// local imports
import {
  StatusUpdateThread,
  buildStatusUpdateTree,
  postStatusUpdate,
  toggleStatusUpdateReaction,
} from "./status-update-thread";

const statusUpdate = (overrides: Partial<TStatusUpdate> = {}): TStatusUpdate => ({
  id: "status-1",
  workspace: "workspace-1",
  epic: "epic-1",
  initiative: null,
  status: "AT_RISK",
  comment_html: "<p>Blocked by beta access</p>",
  comment_stripped: "Blocked by beta access",
  comment_json: {},
  parent: null,
  actor: "user-1",
  actor_detail: { id: "user-1", display_name: "Mina Lee" },
  reactions: [],
  created_at: "2026-06-14T12:00:00Z",
  updated_at: "2026-06-14T12:00:00Z",
  ...overrides,
});

describe("StatusUpdateThread", () => {
  it("posts an AT_RISK update, renders a threaded reply, and toggles an emoji reaction", async () => {
    const parent = statusUpdate();
    const reply = statusUpdate({
      id: "status-reply",
      parent: "status-1",
      comment_html: "<p>Investigating the blocker</p>",
      comment_stripped: "Investigating the blocker",
    });
    const service = {
      list: vi.fn().mockResolvedValue([parent, reply]),
      create: vi.fn().mockResolvedValue(parent),
      addReaction: vi.fn().mockResolvedValue({ id: "reaction-1", reaction: "128077" }),
      removeReaction: vi.fn().mockResolvedValue(undefined),
    };

    await postStatusUpdate({
      commentHtml: "<p>Blocked by beta access</p>",
      owner: { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      service,
      status: "AT_RISK",
    });
    const tree = buildStatusUpdateTree([parent, reply]);
    await toggleStatusUpdateReaction({
      currentUserId: "user-1",
      owner: { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      reaction: "128077",
      service,
      update: parent,
    });
    const reactedParent = statusUpdate({
      reactions: [{ id: "reaction-1", actor: "user-1", status_update: "status-1", reaction: "128077" }],
    });
    await toggleStatusUpdateReaction({
      currentUserId: "user-1",
      owner: { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      reaction: "128077",
      service,
      update: reactedParent,
    });
    const markup = renderToStaticMarkup(
      <StatusUpdateThread
        currentUserId="user-1"
        initialUpdates={[parent, reply]}
        owner={{ type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" }}
        service={service}
      />
    );

    expect(service.create).toHaveBeenCalledWith(
      { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      {
        status: "AT_RISK",
        comment_html: "<p>Blocked by beta access</p>",
      }
    );
    expect(tree[0]?.replies[0]).toMatchObject(reply);
    expect(tree[0]?.replies[0]?.replies).toEqual([]);
    expect(service.addReaction).toHaveBeenCalledWith(
      { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      "status-1",
      { reaction: "128077" }
    );
    expect(service.removeReaction).toHaveBeenCalledWith(
      { type: "epic", workspaceSlug: "acme", projectId: "project-1", id: "epic-1" },
      "status-1",
      "128077"
    );
    expect(markup).toContain("At risk");
    expect(markup).toContain("Blocked by beta access");
    expect(markup).toContain("Investigating the blocker");
  });
});
