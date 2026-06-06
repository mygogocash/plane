/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AuthRoot } from "@/components/account/auth-forms/auth-root";
import type { EAuthModes } from "@/helpers/authentication.helper";
import { AuthFooter } from "./footer";
import { AuthHeader } from "./header";

type AuthBaseProps = {
  authType: EAuthModes;
};

export function AuthBase({ authType }: AuthBaseProps) {
  return (
    <div className="relative z-10 flex min-h-dvh w-full flex-col items-center overflow-hidden overflow-y-auto px-4 pt-5 pb-8 md:px-8 md:pt-6 md:pb-10">
      <AuthHeader type={authType} />
      <AuthRoot authMode={authType} />
      <AuthFooter />
    </div>
  );
}
