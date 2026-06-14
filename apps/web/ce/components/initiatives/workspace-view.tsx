/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import type { TInitiativeMemberResponse } from "@plane/types";
import { ContentWrapper, ERowVariant, Loader } from "@plane/ui";
// components
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
import { useInitiative } from "@/plane-web/hooks/store/use-initiative";
// local imports
import { InitiativeDetailPanel } from "./detail-panel";
import {
  createDefaultInitiativeViewState,
  filterInitiatives,
  InitiativesBoard,
  loadInitiativeViewState,
  persistInitiativeViewState,
  type TInitiativeViewState,
} from "./initiatives-board";

type InitiativesWorkspaceViewProps = {
  selectedInitiativeId?: string;
  workspaceSlug: string;
};

const INITIATIVES_LOADER_KEYS = ["initiative-loader-1", "initiative-loader-2", "initiative-loader-3"];

const InitiativesLoader = () => (
  <ContentWrapper variant={ERowVariant.HUGGING}>
    <Loader className="space-y-3 p-4">
      {INITIATIVES_LOADER_KEYS.map((key) => (
        <Loader.Item key={key} height="120px" width="100%" />
      ))}
    </Loader>
  </ContentWrapper>
);

export const InitiativesWorkspaceView = observer(function InitiativesWorkspaceView(
  props: InitiativesWorkspaceViewProps
) {
  const { selectedInitiativeId, workspaceSlug } = props;
  const router = useAppRouter();
  const initiativeStore = useInitiative();
  const timelineStore = useTimeLineChart(GANTT_TIMELINE_TYPE.PROJECT);
  const [viewState, setViewState] = useState<TInitiativeViewState>(() => createDefaultInitiativeViewState());
  const [lastMembershipResponse, setLastMembershipResponse] = useState<TInitiativeMemberResponse | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [isMutatingMembership, setIsMutatingMembership] = useState(false);
  const initiatives = initiativeStore.initiatives;
  const selectedInitiative = selectedInitiativeId ? initiativeStore.getInitiativeById(selectedInitiativeId) : null;
  const selectedProgress = selectedInitiativeId ? initiativeStore.progressMap.get(selectedInitiativeId) : null;
  const visibleInitiatives = useMemo(() => filterInitiatives(initiatives, viewState), [initiatives, viewState]);

  useEffect(() => {
    setViewState(loadInitiativeViewState(workspaceSlug));
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || initiativeStore.fetchedMap[workspaceSlug]) return;

    void initiativeStore.fetchInitiatives(workspaceSlug).catch(() => undefined);
  }, [initiativeStore, workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !selectedInitiativeId) return;

    if (!selectedInitiative)
      void initiativeStore.fetchInitiative(workspaceSlug, selectedInitiativeId).catch(() => undefined);
    void initiativeStore.fetchProgress(workspaceSlug, selectedInitiativeId).catch(() => undefined);
  }, [initiativeStore, selectedInitiative, selectedInitiativeId, workspaceSlug]);

  useEffect(() => {
    if (viewState.layout !== "timeline") return;

    timelineStore.updateCurrentView(viewState.timelineZoom);
    timelineStore.setBlockIds(visibleInitiatives.map((initiative) => initiative.id));
  }, [timelineStore, viewState.layout, viewState.timelineZoom, visibleInitiatives]);

  const handleViewStateChange = (nextViewState: TInitiativeViewState) => {
    setViewState(nextViewState);
    persistInitiativeViewState(workspaceSlug, nextViewState);
  };

  const handleCreateInitiative = async () => {
    const initiative = await initiativeStore.createInitiative(workspaceSlug, {
      name: "Untitled initiative",
      state: "DRAFT",
    });

    router.push(`/${workspaceSlug}/initiatives/${initiative.id}`);
  };

  const refreshSelectedInitiative = async () => {
    if (!selectedInitiativeId) return;
    await Promise.allSettled([
      initiativeStore.fetchInitiative(workspaceSlug, selectedInitiativeId),
      initiativeStore.fetchProgress(workspaceSlug, selectedInitiativeId),
    ]);
  };

  const runMembershipMutation = async (mutation: () => Promise<TInitiativeMemberResponse>) => {
    setMembershipError(null);
    setIsMutatingMembership(true);

    try {
      const response = await mutation();
      setLastMembershipResponse(response);
      await refreshSelectedInitiative();
    } catch {
      await refreshSelectedInitiative();
      setMembershipError("Membership changed while this view was open. The latest initiative data was reloaded.");
    } finally {
      setIsMutatingMembership(false);
    }
  };

  const handleSelectInitiative = (initiativeId: string) => {
    router.push(`/${workspaceSlug}/initiatives/${initiativeId}`);
  };

  if (initiativeStore.loader && initiatives.length === 0) return <InitiativesLoader />;

  if (initiatives.length === 0) {
    return (
      <DetailedEmptyState
        title="Create your first initiative"
        description="Track workspace-level goals across epics and projects."
        primaryButton={{
          text: "Create initiative",
          onClick: handleCreateInitiative,
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <InitiativesBoard
        initiatives={initiatives}
        onSelectInitiative={handleSelectInitiative}
        onViewStateChange={handleViewStateChange}
        selectedInitiativeId={selectedInitiativeId}
        viewState={viewState}
      />
      <InitiativeDetailPanel
        initiative={selectedInitiative}
        isMutating={isMutatingMembership}
        lastMembershipResponse={lastMembershipResponse}
        membershipError={membershipError}
        onAttachEpic={(epicIds) =>
          selectedInitiativeId
            ? runMembershipMutation(() => initiativeStore.attachEpic(workspaceSlug, selectedInitiativeId, epicIds))
            : Promise.resolve()
        }
        onAttachProject={(projectIds) =>
          selectedInitiativeId
            ? runMembershipMutation(() =>
                initiativeStore.attachProject(workspaceSlug, selectedInitiativeId, projectIds)
              )
            : Promise.resolve()
        }
        onDetachEpic={(epicIds) =>
          selectedInitiativeId
            ? runMembershipMutation(() => initiativeStore.detachEpic(workspaceSlug, selectedInitiativeId, epicIds))
            : Promise.resolve()
        }
        onDetachProject={(projectIds) =>
          selectedInitiativeId
            ? runMembershipMutation(() =>
                initiativeStore.detachProject(workspaceSlug, selectedInitiativeId, projectIds)
              )
            : Promise.resolve()
        }
        progress={selectedProgress}
      />
    </div>
  );
});
