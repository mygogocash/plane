/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Headless UI v2 (required by React 19) throws `Passing props on "Fragment"!`
// when a Menu/Combobox/Popover `.Button` renders `as={Fragment}` (or
// `as={React.Fragment}`) — a Fragment can't receive the ref/props HUI forwards
// to its button. The Plane v1-era code did this in 14 files (7 of them shared
// @plane/ui dropdown primitives) and crashed every authenticated route on
// whichever `.Button` mounted. This guard fails the build if the pattern ever
// comes back. Fix a hit by collapsing the inner <button> onto <X.Button>, or
// using `as="div"` when the child is a custom component / variable / ternary.

// Scan the whole monorepo — every app (web, space, admin, live) and shared
// package. The first cut of this migration missed apps/space because it only
// scanned apps/web + @plane/ui, so the guard is intentionally repo-wide.
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const SCAN_ROOTS = [join(REPO_ROOT, "apps"), join(REPO_ROOT, "packages")];

const BUTTON_FRAGMENT = /<[A-Za-z][\w.]*\.Button[^>]*?as=\{(?:React\.)?Fragment\}/;

const IGNORED_DIRS = new Set(["node_modules", "build", "dist", ".turbo", ".react-router"]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // root may not exist in every checkout layout
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectSourceFiles(fullPath, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe("Headless UI v2 — no `.Button as={Fragment}`", () => {
  it("never renders a Menu/Combobox/Popover .Button as a Fragment", () => {
    const offenders = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root)).filter((file) =>
      BUTTON_FRAGMENT.test(readFileSync(file, "utf8"))
    );

    expect(offenders).toEqual([]);
  });
});
