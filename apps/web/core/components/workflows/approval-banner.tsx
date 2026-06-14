/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Check, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// store
import { StoreContext } from "@/lib/store-context";
// plane-web
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// local imports
import { getApprovalBannerModel } from "./approval-banner.utils";

type Props = {
  issueId: string;
  projectId: string;
  workspaceSlug: string;
};

const getWorkflowErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Approval could not be updated. Please try again.";
};

export const ApprovalBanner = observer(function ApprovalBanner(props: Props) {
  const { issueId, projectId, workspaceSlug } = props;
  const store = useContext(StoreContext);
  if (store === undefined) throw new Error("ApprovalBanner must be used within StoreProvider");

  const featureEnabled = isSelfHostedFeatureEnabled("workflows_approvals");
  const { data: currentUser } = useUser();
  const memberStore = useMember();
  const { getStateById } = useProjectState();
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mutate } = useSWR(
    featureEnabled && workspaceSlug && projectId && issueId
      ? `WORK_ITEM_APPROVALS_${workspaceSlug}_${projectId}_${issueId}`
      : null,
    () => store.workflow.fetchApprovals(workspaceSlug, projectId, issueId),
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!featureEnabled) return null;

  const approvals = store.workflow.getApprovalsByIssue(issueId);
  const approval = approvals.find((item) => item.status === "pending") ?? null;
  const currentProjectMemberId = currentUser?.id
    ? memberStore.project.getProjectMemberDetails(currentUser.id, projectId)?.id
    : undefined;
  const model = getApprovalBannerModel({
    approval,
    currentProjectMemberId,
    getStateName: (stateId) => getStateById(stateId)?.name ?? stateId,
    getUserName: (userId) => memberStore.getUserDetails(userId)?.display_name ?? userId,
  });

  if (!approval || !model) return null;

  const handleDecision = async (approved: boolean) => {
    setSubmitting(approved ? "approve" : "reject");
    setError(null);
    try {
      await store.workflow.decideApproval(workspaceSlug, projectId, issueId, approval.id, { approved });
      void mutate();
    } catch (decisionError) {
      setError(getWorkflowErrorMessage(decisionError));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-warning-subtle bg-warning-subtle/30 p-2">
      <div className="space-y-1">
        <div className="text-caption-md-medium text-primary">Approval pending</div>
        <p className="text-caption-md-regular break-words text-secondary">
          {model.requesterName} requested a move to {model.targetStateName}. Fallback: {model.fallbackStateName}.
        </p>
        {model.comment && <p className="text-caption-md-regular break-words text-tertiary">{model.comment}</p>}
      </div>

      {model.canDecide && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            loading={submitting === "approve"}
            disabled={submitting !== null}
            prependIcon={<Check />}
            onClick={() => handleDecision(true)}
          >
            Approve
          </Button>
          <Button
            variant="error-outline"
            size="sm"
            loading={submitting === "reject"}
            disabled={submitting !== null}
            prependIcon={<X />}
            onClick={() => handleDecision(false)}
          >
            Reject
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-sm bg-danger-subtle p-1.5 text-caption-md-regular break-words text-danger-primary">
          {error}
        </div>
      )}
    </div>
  );
});
