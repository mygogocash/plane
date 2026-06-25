/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import { IconWrapper } from "../icon-wrapper";
import type { ISvgIcons } from "../type";

const MANUT_MARK_BACKGROUND = "#9FE7EF";
const MANUT_MARK_FOREGROUND = "var(--neutral-black)";

export function PlaneNewIcon({ color = "currentColor", ...rest }: ISvgIcons) {
  return (
    <IconWrapper color={color} {...rest}>
      <rect x="1" y="1" width="14" height="14" rx="3.5" fill={MANUT_MARK_BACKGROUND} />
      <path
        d="M4.25 11.75V4.25H6.1L8 8.05L9.9 4.25H11.75V11.75H10V7.55L8.62 10.35H7.38L6 7.55V11.75H4.25Z"
        fill={MANUT_MARK_FOREGROUND}
      />
    </IconWrapper>
  );
}
