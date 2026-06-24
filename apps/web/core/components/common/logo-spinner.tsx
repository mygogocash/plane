/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import manutLogo from "@/app/assets/manut-logo.jpeg?url";

export function LogoSpinner() {
  return (
    <div className="relative flex size-16 items-center justify-center" role="status" aria-label="Loading Manut">
      <span className="absolute inset-1 rounded-[20px] border border-[#9fe7ef]/45 motion-safe:animate-ping motion-reduce:hidden" />
      <span className="absolute h-16 w-6 -rotate-12 rounded-full bg-[#9fe7ef]/25 blur-sm motion-safe:animate-pulse motion-reduce:hidden" />
      <img
        src={manutLogo}
        alt=""
        className="relative size-12 rounded-2xl object-cover shadow-[0_16px_42px_-18px_#9fe7ef]"
      />
      <span className="sr-only">Loading Manut</span>
    </div>
  );
}
