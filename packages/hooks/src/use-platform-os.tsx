/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect } from "react";

/** Matches Tailwind `md` and sidebar mobile checks across the web app. */
export const MOBILE_BREAKPOINT = 768;

type TPlatformData = {
  isMobile: boolean;
  platform: string;
};

const detectPlatform = (): TPlatformData => {
  if (typeof window === "undefined") {
    return { isMobile: false, platform: "" };
  }

  const userAgent = window.navigator.userAgent;
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  let platform = "";

  if (!isMobile) {
    if (userAgent.indexOf("Win") !== -1) {
      platform = "Windows";
    } else if (userAgent.indexOf("Mac") !== -1) {
      platform = "MacOS";
    } else if (userAgent.indexOf("Linux") !== -1) {
      platform = "Linux";
    } else {
      platform = "Unknown";
    }
  }

  return { isMobile, platform };
};

export const usePlatformOS = () => {
  const [platformData, setPlatformData] = useState<TPlatformData>({ isMobile: false, platform: "" });

  useEffect(() => {
    const updatePlatform = () => setPlatformData(detectPlatform());

    updatePlatform();
    window.addEventListener("resize", updatePlatform);
    return () => window.removeEventListener("resize", updatePlatform);
  }, []);

  return platformData;
};
