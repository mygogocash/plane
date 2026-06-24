// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useState } from "react";
import { cn } from "@plane/utils";
import { maskSecret, type TSentryConfig } from "./connectors.utils";

type TSentryConnectorPanelProps = {
  className?: string | undefined;
  config?: TSentryConfig | null | undefined;
};

export const SentryConnectorPanel = ({ className, config }: TSentryConnectorPanelProps) => {
  // The plaintext secret is never provided to the client. The input starts empty;
  // a stored secret renders only as the mask placeholder and is never round-tripped.
  const [secretInput, setSecretInput] = useState("");

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-lg border border-subtle p-4", className)}
      data-testid="sentry-connector-panel"
    >
      <div className="flex flex-col gap-1">
        <span className="text-13 font-semibold text-primary">Sentry</span>
        <span className="text-11 text-tertiary">
          Register the webhook, then verified alerts become triaged, linked issues.
        </span>
      </div>

      <label className="flex flex-col gap-1 text-12 text-tertiary">
        Inbound webhook URL
        <input
          readOnly
          data-testid="sentry-webhook-url"
          className="rounded-md border border-subtle bg-layer-1 px-2 py-1 text-12 text-secondary"
          value={config?.webhook_url ?? ""}
          placeholder=".../integrations/sentry/webhook/"
        />
      </label>

      <label className="flex flex-col gap-1 text-12 text-tertiary">
        Webhook secret
        <input
          type="password"
          data-testid="sentry-secret-input"
          className="rounded-md border border-subtle bg-transparent px-2 py-1 text-12 text-primary"
          value={secretInput}
          placeholder={maskSecret(Boolean(config?.has_secret)) || "Enter webhook secret"}
          onChange={(event) => setSecretInput(event.target.value)}
        />
      </label>
      {config?.has_secret ? (
        <span className="text-10 text-tertiary" data-testid="sentry-secret-status">
          A secret is set. Leave blank to keep it; enter a new value to replace it.
        </span>
      ) : null}
    </div>
  );
};
