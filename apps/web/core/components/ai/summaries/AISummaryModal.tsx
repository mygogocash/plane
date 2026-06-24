// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Link2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TEntitySummaryResponse } from "@/services/ai.service";
import { AIThinkingIndicator } from "@/components/core/modals/ai-thinking-indicator";
import { MarkdownRenderer } from "@/components/ui/markdown-to-component";
import { buildRollupStatCards } from "./summaries.utils";

export type TAISummaryModalStatus = "idle" | "loading" | "success" | "error";

type TAISummaryModalProps = {
  errorMessage?: string | null;
  isCopyingShareLink?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCopyShareLink?: () => void;
  shareUrl?: string | null;
  status: TAISummaryModalStatus;
  summary: TEntitySummaryResponse | null;
  title?: string;
};

export const AISummaryModal = ({
  errorMessage,
  isCopyingShareLink = false,
  isOpen,
  onClose,
  onCopyShareLink,
  shareUrl,
  status,
  summary,
  title = "AI digest",
}: TAISummaryModalProps) => (
  <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-18 font-semibold text-primary">{title}</h2>
          <p className="mt-1 text-13 text-tertiary">AI-generated summary with rollup stats for this scope.</p>
        </div>
        {status === "success" && onCopyShareLink ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isCopyingShareLink}
            prependIcon={<Link2 className="size-3.5" />}
            onClick={onCopyShareLink}
          >
            {shareUrl ? "Copy share link again" : "Copy share link"}
          </Button>
        ) : null}
      </div>

      {status === "loading" ? <AIThinkingIndicator /> : null}

      {status === "error" && errorMessage ? (
        <p className="rounded-md bg-danger-subtle p-3 text-13 text-danger-primary">{errorMessage}</p>
      ) : null}

      {status === "success" && summary ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {buildRollupStatCards(summary.rollup).map((card) => (
              <div key={card.label} className="rounded-md border border-subtle bg-layer-1 p-3">
                <p className="text-11 text-tertiary">{card.label}</p>
                <p className="mt-1 text-16 font-semibold text-primary">{card.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-subtle bg-layer-1 p-4">
            <MarkdownRenderer markdown={summary.markdown} />
          </div>
          {shareUrl ? (
            <p className="text-12 break-all text-secondary">
              Share link: <span className="font-medium text-primary">{shareUrl}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  </ModalCore>
);
