/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { expect, test, type Page } from "@playwright/test";

type TSmokeTarget = {
  name: string;
  url: string;
};

const VIEWPORTS = [
  { name: "phone-sm", width: 360, height: 740 },
  { name: "phone-md", width: 390, height: 844 },
  { name: "phone-lg", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const DEFAULT_TARGETS: TSmokeTarget[] = [
  { name: "web", url: process.env.RESPONSIVE_WEB_URL ?? "http://127.0.0.1:3000" },
  { name: "admin", url: process.env.RESPONSIVE_ADMIN_URL ?? "http://127.0.0.1:3001" },
];

const authTargets = (process.env.RESPONSIVE_AUTH_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)
  .map((url, index) => ({ name: `auth-${index + 1}`, url }));

const TARGETS = [...DEFAULT_TARGETS, ...authTargets];

const ALLOWED_CONSOLE_PATTERNS = [
  /Failed to load resource: the server responded with a status of 401/,
  /Module ".*" has been externalized for browser compatibility/,
  /\/api\/users\/me\/?/,
  /favicon/i,
];

const collectConsoleIssues = (page: Page) => {
  const issues: string[] = [];

  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;

    const text = message.text();
    if (ALLOWED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    issues.push(`${message.type()}: ${text}`);
  });

  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return issues;
};

const assertNoDocumentOverflow = async (page: Page) => {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      bodyScrollWidth: body.scrollWidth,
      documentScrollWidth: documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      visibleTextLength: body.innerText.trim().length,
    };
  });

  expect(metrics.visibleTextLength, "page should render meaningful text").toBeGreaterThan(0);
  expect(
    Math.max(metrics.bodyScrollWidth, metrics.documentScrollWidth),
    `document should not horizontally overflow viewport ${metrics.viewportWidth}`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
};

const assertPrimaryControlsReachable = async (page: Page) => {
  const clippedInteractiveCount = await page.evaluate(() => {
    const selectors = ["button", "a[href]", "input", "textarea", "select", '[role="button"]'];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .filter((element) => {
        if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.right < 0 || rect.left > viewportWidth || rect.bottom < 0 || rect.top > viewportHeight;
      }).length;
  });

  expect(clippedInteractiveCount, "visible interactive controls should stay inside the viewport").toBe(0);
};

for (const target of TARGETS) {
  for (const viewport of VIEWPORTS) {
    test(`${target.name} has mobile-safe shell at ${viewport.name}`, async ({ page }) => {
      const consoleIssues = collectConsoleIssues(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(target.url, { waitUntil: "networkidle" });

      await assertNoDocumentOverflow(page);
      await assertPrimaryControlsReachable(page);

      expect(consoleIssues, "console should not include relevant runtime errors").toEqual([]);
    });
  }
}
