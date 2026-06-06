/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const;

export type TViewportBreakpoint = "mobile" | "tablet" | "desktop";

export type TViewportState = {
  width: number;
  height: number;
  breakpoint: TViewportBreakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isReady: boolean;
};

export const getViewportBreakpoint = (width: number): TViewportBreakpoint => {
  if (width < VIEWPORT_BREAKPOINTS.mobile) return "mobile";
  if (width < VIEWPORT_BREAKPOINTS.tablet) return "tablet";
  return "desktop";
};

const getViewportState = (): TViewportState => {
  if (typeof window === "undefined") {
    return {
      width: 0,
      height: 0,
      breakpoint: "desktop",
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isReady: false,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const breakpoint = getViewportBreakpoint(width);

  return {
    width,
    height,
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
    isReady: true,
  };
};

export const useViewport = (): TViewportState => {
  const [viewport, setViewport] = useState<TViewportState>(() => getViewportState());

  useEffect(() => {
    const handleResize = () => setViewport(getViewportState());

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return viewport;
};
