/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
// local imports
import { getPageImportMetadata, parsePageImportFiles, rewriteHtmlAssetSources } from "./page-import.utils";

const makeFile = (name: string, content: BlobPart, type = "text/plain") => new File([content], name, { type });

describe("parsePageImportFiles", () => {
  it("parses standalone Notion HTML and strips unsafe markup", async () => {
    const file = makeFile(
      "Launch Roadmap.html",
      '<html><head><title>Launch Roadmap</title></head><body><h1>Launch Roadmap</h1><p onclick="alert(1)">Ship it</p><script>alert("x")</script><img src="javascript:alert(1)" /></body></html>',
      "text/html"
    );

    const result = await parsePageImportFiles([file]);

    expect(result.errors).toEqual([]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe("Launch Roadmap");
    expect(result.pages[0].html).toContain("<p>Ship it</p>");
    expect(result.pages[0].html).not.toContain("<script");
    expect(result.pages[0].html).not.toContain("onclick");
    expect(result.pages[0].html).not.toContain("javascript:");
  });

  it("parses Markdown using the first heading as the page title", async () => {
    const file = makeFile("Weekly Plan.md", "# Weekly Plan\n\n- Invite team\n- Import docs", "text/markdown");

    const result = await parsePageImportFiles([file]);

    expect(result.errors).toEqual([]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe("Weekly Plan");
    expect(result.pages[0].html).toContain("<h1>Weekly Plan</h1>");
    expect(result.pages[0].html).toContain("<li>Invite team</li>");
  });

  it("parses Notion ZIP files in deterministic content-path order and maps local image assets", async () => {
    const archive = zipSync({
      "Workspace/Second.html": strToU8("<html><body><h1>Second</h1><p>Two</p></body></html>"),
      "Workspace/First.html": strToU8('<html><body><h1>First</h1><img src="assets/logo.png" /></body></html>'),
      "Workspace/assets/logo.png": new Uint8Array([137, 80, 78, 71]),
    });
    const file = makeFile("notion-export.zip", archive, "application/zip");

    const result = await parsePageImportFiles([file]);

    expect(result.errors).toEqual([]);
    expect(result.pages.map((page) => page.title)).toEqual(["First", "Second"]);
    expect(result.pages[0].assets).toHaveLength(1);
    expect(result.pages[0].assets[0].source).toBe("assets/logo.png");
    expect(result.pages[0].assets[0].file.name).toBe("logo.png");
  });

  it("reports unsupported files without producing import pages", async () => {
    const file = makeFile("contacts.csv", "name,email", "text/csv");

    const result = await parsePageImportFiles([file]);

    expect(result.pages).toEqual([]);
    expect(result.errors).toEqual(["contacts.csv is not a supported import file."]);
  });

  it("reports empty files without producing import pages", async () => {
    const file = makeFile("Empty.md", "", "text/markdown");

    const result = await parsePageImportFiles([file]);

    expect(result.pages).toEqual([]);
    expect(result.errors).toEqual(["Empty.md is empty."]);
  });

  it("skips unsafe ZIP path traversal entries", async () => {
    const archive = zipSync({
      "../Escape.html": strToU8("<html><body><h1>Escape</h1></body></html>"),
      "Workspace/Valid.html": strToU8("<html><body><h1>Valid</h1></body></html>"),
    });
    const file = makeFile("notion-export.zip", archive, "application/zip");

    const result = await parsePageImportFiles([file]);

    expect(result.errors).toEqual([]);
    expect(result.pages.map((page) => page.title)).toEqual(["Valid"]);
    expect(result.warnings).toEqual(["Skipped unsafe archive entry ../Escape.html."]);
  });

  it("builds source-specific import metadata for create payloads", async () => {
    const htmlFile = makeFile("Standalone.html", "<html><body><h1>Standalone</h1></body></html>", "text/html");
    const markdownFile = makeFile("Notes.md", "# Notes", "text/markdown");
    const archive = zipSync({
      "Workspace/Imported.html": strToU8("<html><body><h1>Imported</h1></body></html>"),
    });
    const zipFile = makeFile("notion-export.zip", archive, "application/zip");

    const result = await parsePageImportFiles([htmlFile, markdownFile, zipFile]);

    expect(result.errors).toEqual([]);
    expect(result.pages.map((page) => getPageImportMetadata(page).external_source)).toEqual([
      "html",
      "markdown",
      "notion",
    ]);
  });
});

describe("rewriteHtmlAssetSources", () => {
  it("rewrites local image references and preserves remote image URLs", () => {
    const html = '<p>Logo</p><img src="assets/logo.png" /><img src="https://example.com/remote.png" />';

    const result = rewriteHtmlAssetSources(html, {
      "assets/logo.png": "uploaded-asset-id",
    });

    expect(result).toContain('src="uploaded-asset-id"');
    expect(result).toContain('src="https://example.com/remote.png"');
  });
});
