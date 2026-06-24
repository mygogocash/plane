/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

export function PlaneLockup({ width = "253", height = "53", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 253 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="0.5" y="0.5" width="51" height="51" rx="13.5" fill={color} />
      <path d="M14.5 38V15.5H20.2L26 27.3L31.8 15.5H37.5V38H32V25.4L27.8 34H24.2L20 25.4V38H14.5Z" fill="#9FE7EF" />
      <path d="M39.5 17.5H43.5V38H39.5V17.5Z" fill="#9FE7EF" opacity="0.75" />
      <text x="67" y="37" fill={color} fontFamily="Inter, Geist, Arial, sans-serif" fontSize="30" fontWeight="650">
        Manut
      </text>
    </svg>
  );
}
