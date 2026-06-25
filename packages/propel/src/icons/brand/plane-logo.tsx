/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

const MANUT_MARK_BACKGROUND = "#9FE7EF";
const MANUT_MARK_FOREGROUND = "var(--neutral-black)";

export function PlaneLogo({ width = "85", height = "52", className, color: _color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 85 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="16.5" y="0.5" width="51" height="51" rx="13.5" fill={MANUT_MARK_BACKGROUND} />
      <path
        d="M30.5 38V15.5H36.2L42 27.3L47.8 15.5H53.5V38H48V25.4L43.8 34H40.2L36 25.4V38H30.5Z"
        fill={MANUT_MARK_FOREGROUND}
      />
      <path d="M55.5 17.5H59.5V38H55.5V17.5Z" fill={MANUT_MARK_FOREGROUND} opacity="0.75" />
    </svg>
  );
}
