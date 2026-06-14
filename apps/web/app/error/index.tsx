/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// layouts
import { reportClientError } from "./client-error-report";
import { DevErrorComponent } from "./dev";
import { ProdErrorComponent } from "./prod";

const handleReload = () => window.location.reload();

export function CustomErrorComponent({ error }: { error: unknown }) {
  // router
  const router = useAppRouter();

  useEffect(() => {
    reportClientError(error);
  }, [error]);

  const handleGoHome = () => router.push("/");

  if (import.meta.env.DEV) {
    return <DevErrorComponent error={error} onGoHome={handleGoHome} onReload={handleReload} />;
  }

  return <ProdErrorComponent onGoHome={handleGoHome} />;
}
