// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it, vi } from "vitest";

import { AI_EDITOR_TASKS } from "@/constants/ai";
import { AIService } from "../ai.service";

describe("AIService extensions", () => {
  it("checkDuplicates posts to duplicate-check with the payload", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { candidates: [] } });

    await service.checkDuplicates("acme", "project-1", {
      title: "Login crash",
      description: "Fails on submit",
      project_id: "project-1",
    });

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/issues/duplicate-check/", {
      title: "Login crash",
      description: "Fails on submit",
      project_id: "project-1",
    });
  });

  it("contextAssist posts to the context-assist endpoint", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { blockers: [] } });

    await service.contextAssist("acme", { entity_type: "issue", entity_id: "issue-1" });

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/copilot/context-assist/", {
      entity_type: "issue",
      entity_id: "issue-1",
    });
  });

  it("createBuildDraft sends build_project mode to copilot messages", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { project_draft: { name: "Draft" } } });

    await service.createBuildDraft("acme", { message: "Plan a launch", project_id: "project-1" });

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/copilot/messages/", {
      message: "Plan a launch",
      project_id: "project-1",
      mode: "build_project",
    });
  });

  it("applyBuildDraft posts the draft payload to build-project apply", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { project_id: "project-2" } });
    const payload = {
      draft_token: "token-1",
      project_draft: { name: "Launch", work_items: [] },
    };

    await service.applyBuildDraft("acme", "project-1", payload);

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/build-project/apply/", payload);
  });

  it("summarizeEntity and createShareLink target entity summarize routes", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { markdown: "Digest" } });

    await service.summarizeEntity("acme", "cycle", "cycle-1");
    await service.createShareLink("acme", "project", "project-1");

    expect(postSpy).toHaveBeenNthCalledWith(1, "/api/workspaces/acme/cycles/cycle-1/summarize/", {});
    expect(postSpy).toHaveBeenNthCalledWith(2, "/api/workspaces/acme/projects/project-1/summarize/share/", {});
  });

  it("generateBrief posts to the issue generate-brief route", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { page_id: "page-1" } });

    await service.generateBrief("acme", "project-1", "issue-1", { regenerate: true });

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/projects/project-1/issues/issue-1/generate-brief/", {
      regenerate: true,
    });
  });

  it("translate routes through rephrase-grammar with translate task", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: { response: "Hola" } });

    await service.translate("acme", { text_input: "Hello", target_language: "es" });

    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/rephrase-grammar/", {
      task: AI_EDITOR_TASKS.TRANSLATE,
      text_input: "Hello",
      target_language: "es",
    });
  });
});
