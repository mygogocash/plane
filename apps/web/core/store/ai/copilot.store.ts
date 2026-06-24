/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import {
  AIService,
  type TApplyBuildDraftPayload,
  type TBuildProjectDraft,
  type TCopilotConversation,
  type TCopilotMode,
} from "@/services/ai.service";
import type { CoreRootStore } from "../root.store";

export type TCopilotPanelEntityType = "issue" | "cycle" | "project" | "initiative" | null;

export interface IAICopilotStore {
  activeMode: TCopilotMode;
  isPanelOpen: boolean;
  panelEntityType: TCopilotPanelEntityType;
  panelEntityId: string | null;
  buildDraft: TBuildProjectDraft | null;
  buildDraftToken: string | null;
  conversations: TCopilotConversation[];
  setMode: (mode: TCopilotMode) => void;
  openPanel: (context?: { entityType?: TCopilotPanelEntityType; entityId?: string | null }) => void;
  closePanel: () => void;
  setBuildDraft: (draft: TBuildProjectDraft | null, draftToken?: string | null) => void;
  applyBuildDraft: (workspaceSlug: string, projectId: string) => Promise<boolean>;
  fetchConversations: (workspaceSlug: string) => Promise<TCopilotConversation[]>;
}

export class AICopilotStore implements IAICopilotStore {
  activeMode: TCopilotMode = "auto";
  isPanelOpen = false;
  panelEntityType: TCopilotPanelEntityType = null;
  panelEntityId: string | null = null;
  buildDraft: TBuildProjectDraft | null = null;
  buildDraftToken: string | null = null;
  conversations: TCopilotConversation[] = [];

  rootStore: CoreRootStore;
  aiService: AIService;

  constructor(rootStore: CoreRootStore, aiService: AIService = new AIService()) {
    makeObservable(this, {
      activeMode: observable,
      isPanelOpen: observable,
      panelEntityType: observable,
      panelEntityId: observable,
      buildDraft: observable,
      buildDraftToken: observable,
      conversations: observable,
      setMode: action,
      openPanel: action,
      closePanel: action,
      setBuildDraft: action,
      applyBuildDraft: action,
      fetchConversations: action,
    });

    this.rootStore = rootStore;
    this.aiService = aiService;
  }

  setMode = (mode: TCopilotMode) => {
    this.activeMode = mode;
  };

  openPanel = (context?: { entityType?: TCopilotPanelEntityType; entityId?: string | null }) => {
    this.isPanelOpen = true;
    this.panelEntityType = context?.entityType ?? null;
    this.panelEntityId = context?.entityId ?? null;
  };

  closePanel = () => {
    this.isPanelOpen = false;
  };

  setBuildDraft = (draft: TBuildProjectDraft | null, draftToken: string | null = null) => {
    this.buildDraft = draft;
    this.buildDraftToken = draftToken;
  };

  applyBuildDraft = async (workspaceSlug: string, projectId: string): Promise<boolean> => {
    if (!this.buildDraft || !this.buildDraftToken) return false;

    const payload: TApplyBuildDraftPayload = {
      draft_token: this.buildDraftToken,
      project_draft: this.buildDraft,
    };

    try {
      await this.aiService.applyBuildDraft(workspaceSlug, projectId, payload);
      runInAction(() => {
        this.buildDraft = null;
        this.buildDraftToken = null;
      });
      return true;
    } catch {
      return false;
    }
  };

  fetchConversations = async (workspaceSlug: string): Promise<TCopilotConversation[]> => {
    const conversations = await this.aiService.listCopilotConversations(workspaceSlug);
    runInAction(() => {
      this.conversations = conversations;
    });
    return conversations;
  };
}
