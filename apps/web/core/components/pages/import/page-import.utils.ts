/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { strFromU8, unzipSync } from "fflate";

export type TPageImportSource = "html" | "markdown" | "notion";

export type TPageImportAsset = {
  source: string;
  file: File;
};

export type TPageImportDraft = {
  id: string;
  title: string;
  html: string;
  source: TPageImportSource;
  sourcePath: string;
  sourceFileName: string;
  externalId: string;
  assets: TPageImportAsset[];
  warnings: string[];
};

export type TPageImportParseResult = {
  pages: TPageImportDraft[];
  errors: string[];
  warnings: string[];
};

export type TPageImportMetadata = {
  external_id: string;
  external_source: TPageImportSource;
};

const SUPPORTED_EXTENSIONS = new Set(["html", "htm", "md", "markdown", "zip"]);
const CONTENT_EXTENSIONS = new Set(["html", "htm", "md", "markdown"]);
const IMAGE_EXTENSIONS = new Set(["apng", "avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const MAX_IMPORT_FILES = 50;
const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const EMPTY_DOCUMENT_HTML = "<p></p>";

const getExtension = (path: string): string => {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  const fileName = cleanPath.split("/").pop() ?? cleanPath;
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return extension?.toLowerCase() ?? "";
};

const getFileName = (path: string): string => {
  const normalizedPath = path.replaceAll("\\", "/");
  const pathParts = normalizedPath.split("/");

  for (let index = pathParts.length - 1; index >= 0; index--) {
    if (pathParts[index]) return pathParts[index];
  }

  return normalizedPath;
};

const stripExtension = (fileName: string): string => fileName.replace(/\.[^/.]+$/, "");

const normalizeZipPath = (path: string): string =>
  path
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");

const isSafeZipPath = (path: string): boolean =>
  path
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .every((part) => part !== "..");

const getParentPath = (path: string): string => {
  const parts = normalizeZipPath(path).split("/");
  parts.pop();
  return parts.join("/");
};

const resolveRelativePath = (fromPath: string, relativePath: string): string => {
  const normalizedRelativePath = normalizeZipPath(relativePath);
  if (!normalizedRelativePath || isRemoteOrDataSource(normalizedRelativePath)) return normalizedRelativePath;

  const baseParts = getParentPath(fromPath).split("/").filter(Boolean);
  const relativeParts = normalizedRelativePath.split("/").filter(Boolean);

  for (const part of relativeParts) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== ".") {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
};

const isRemoteOrDataSource = (value: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value.trim()) || value.trim().startsWith("data:");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stableHash = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `notion-${(hash >>> 0).toString(16)}`;
};

const decodeFileText = async (file: File): Promise<string> => await file.text();

const decodeZipText = (data: Uint8Array): string => strFromU8(data);

class PageImportValidationError extends Error {}

const assertNonEmptyText = (text: string, sourcePath: string) => {
  if (!text.trim()) throw new PageImportValidationError(`${sourcePath} is empty.`);
};

const sanitizeWithDomParser = (html: string): string | undefined => {
  if (typeof DOMParser === "undefined") return undefined;

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  document.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());

  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();
      if (attributeName.startsWith("on") || attributeValue.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return document.body.innerHTML.trim() || EMPTY_DOCUMENT_HTML;
};

export const sanitizeImportHtml = (html: string): string => {
  const parsedHtml = sanitizeWithDomParser(html);
  if (parsedHtml !== undefined) return parsedHtml;

  const htmlWithoutUnsafeElements = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?(?:<\/(?:iframe|object|embed|link|meta)>)?/gi, "");

  const withoutUnsafeAttributes = htmlWithoutUnsafeElements
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");

  return withoutUnsafeAttributes.trim() || EMPTY_DOCUMENT_HTML;
};

const extractHtmlTitle = (html: string, sourcePath: string): string => {
  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    const title =
      document.querySelector("title")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim();
    if (title) return title;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = (titleMatch?.[1] || h1Match?.[1] || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return title || stripExtension(getFileName(sourcePath)) || "Imported page";
};

const extractBodyHtml = (html: string): string => {
  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    return document.body.innerHTML.trim() || EMPTY_DOCUMENT_HTML;
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (bodyMatch?.[1] ?? html).trim() || EMPTY_DOCUMENT_HTML;
};

const applyInlineMarkdown = (value: string): string =>
  escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = href.trim().toLowerCase().startsWith("javascript:") ? "" : escapeHtml(href.trim());
      return safeHref ? `<a href="${safeHref}">${label}</a>` : label;
    });

const markdownToHtml = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlParts: string[] = [];
  let listType: "ol" | "ul" | undefined;
  let codeBlock: string[] | undefined;

  const closeList = () => {
    if (!listType) return;
    htmlParts.push(`</${listType}>`);
    listType = undefined;
  };

  const closeCodeBlock = () => {
    if (!codeBlock) return;
    htmlParts.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
    codeBlock = undefined;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (codeBlock) {
        closeCodeBlock();
      } else {
        closeList();
        codeBlock = [];
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.push(line);
      continue;
    }

    const trimmedLine = line.trim();
    if (!trimmedLine) {
      closeList();
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedListMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (unorderedListMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        htmlParts.push("<ul>");
      }
      htmlParts.push(`<li>${applyInlineMarkdown(unorderedListMatch[1])}</li>`);
      continue;
    }

    const orderedListMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (orderedListMatch) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        htmlParts.push("<ol>");
      }
      htmlParts.push(`<li>${applyInlineMarkdown(orderedListMatch[1])}</li>`);
      continue;
    }

    closeList();
    htmlParts.push(`<p>${applyInlineMarkdown(trimmedLine)}</p>`);
  }

  closeList();
  closeCodeBlock();

  return htmlParts.join("") || EMPTY_DOCUMENT_HTML;
};

const extractMarkdownTitle = (markdown: string, sourcePath: string): string => {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim())
    .find(Boolean);

  return heading || stripExtension(getFileName(sourcePath)) || "Imported page";
};

const collectAssetSources = (html: string): string[] => {
  const sources = new Set<string>();

  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    document.querySelectorAll("img, image-component").forEach((element) => {
      const source = element.getAttribute("src")?.trim();
      if (source && !isRemoteOrDataSource(source)) sources.add(source);
    });
    return Array.from(sources);
  }

  const srcPattern = /<(?:img|image-component)\b[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = srcPattern.exec(html))) {
    const source = (match[1] || match[2] || match[3] || "").trim();
    if (source && !isRemoteOrDataSource(source)) sources.add(source);
  }

  return Array.from(sources);
};

const getFileType = (fileName: string): string => {
  const extension = getExtension(fileName);
  if (extension === "svg") return "image/svg+xml";
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "md" || extension === "markdown") return "text/markdown";
  return "application/octet-stream";
};

const buildDraft = (args: {
  html: string;
  source: TPageImportSource;
  sourcePath: string;
  sourceFileName?: string;
  title: string;
  assets?: TPageImportAsset[];
  warnings?: string[];
}): TPageImportDraft => {
  const { html, source, sourcePath, sourceFileName, title, assets = [], warnings = [] } = args;
  const normalizedTitle = title.trim() || stripExtension(getFileName(sourcePath)) || "Imported page";

  return {
    id: stableHash(`${source}:${sourcePath}`),
    title: normalizedTitle,
    html: sanitizeImportHtml(html),
    source,
    sourcePath,
    sourceFileName: sourceFileName ?? getFileName(sourcePath),
    externalId: stableHash(sourcePath),
    assets,
    warnings,
  };
};

export const getPageImportMetadata = (draft: TPageImportDraft): TPageImportMetadata => ({
  external_id: draft.externalId,
  external_source: draft.source,
});

const parseStandaloneHtml = async (file: File): Promise<TPageImportDraft> => {
  const text = await decodeFileText(file);
  assertNonEmptyText(text, file.name);
  return buildDraft({
    html: extractBodyHtml(text),
    source: "html",
    sourcePath: file.name,
    title: extractHtmlTitle(text, file.name),
  });
};

const parseStandaloneMarkdown = async (file: File): Promise<TPageImportDraft> => {
  const text = await decodeFileText(file);
  assertNonEmptyText(text, file.name);
  return buildDraft({
    html: markdownToHtml(text),
    source: "markdown",
    sourcePath: file.name,
    title: extractMarkdownTitle(text, file.name),
  });
};

const parseZipFile = async (file: File): Promise<TPageImportParseResult> => {
  const pages: TPageImportDraft[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));

  const archiveEntries = Object.entries(archive).flatMap(([path, data]) => {
    if (!isSafeZipPath(path)) {
      warnings.push(`Skipped unsafe archive entry ${path}.`);
      return [];
    }

    return {
      data,
      extension: getExtension(path),
      path: normalizeZipPath(path),
    };
  });
  const contentEntries = archiveEntries
    .filter((entry) => CONTENT_EXTENSIONS.has(entry.extension))
    .reduce<typeof archiveEntries>((sortedEntries, entry) => {
      const insertIndex = sortedEntries.findIndex(
        (sortedEntry) => entry.path.localeCompare(sortedEntry.path, undefined, { sensitivity: "base" }) < 0
      );
      if (insertIndex === -1) {
        sortedEntries.push(entry);
      } else {
        sortedEntries.splice(insertIndex, 0, entry);
      }
      return sortedEntries;
    }, []);

  const assetEntries = new Map(
    archiveEntries
      .filter((entry) => IMAGE_EXTENSIONS.has(entry.extension))
      .map((entry) => [
        entry.path,
        new File([entry.data], getFileName(entry.path), {
          type: getFileType(entry.path),
        }),
      ])
  );

  for (const entry of contentEntries) {
    const text = decodeZipText(entry.data);
    if (!text.trim()) {
      errors.push(`${entry.path} is empty.`);
      continue;
    }

    const sourceHtml =
      entry.extension === "md" || entry.extension === "markdown" ? markdownToHtml(text) : extractBodyHtml(text);
    const title =
      entry.extension === "md" || entry.extension === "markdown"
        ? extractMarkdownTitle(text, entry.path)
        : extractHtmlTitle(text, entry.path);
    const draftWarnings: string[] = [];
    const assets: TPageImportAsset[] = [];

    for (const source of collectAssetSources(sourceHtml)) {
      const resolvedPath = resolveRelativePath(entry.path, source);
      const assetFile = assetEntries.get(resolvedPath);
      if (assetFile) {
        assets.push({ source, file: assetFile });
      } else {
        draftWarnings.push(`Could not find local asset ${source}.`);
      }
    }

    pages.push(
      buildDraft({
        html: sourceHtml,
        source: "notion",
        sourcePath: entry.path,
        sourceFileName: file.name,
        title,
        assets,
        warnings: draftWarnings,
      })
    );
  }

  if (contentEntries.length === 0) {
    errors.push(`${file.name} does not contain supported Notion HTML or Markdown pages.`);
  }

  return { pages, errors, warnings };
};

export const rewriteHtmlAssetSources = (html: string, assetMap: Record<string, string>): string => {
  if (Object.keys(assetMap).length === 0) return html;

  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    document.querySelectorAll("img, image-component").forEach((element) => {
      const source = element.getAttribute("src")?.trim();
      if (source && assetMap[source]) element.setAttribute("src", assetMap[source]);
    });
    return document.body.innerHTML.trim() || EMPTY_DOCUMENT_HTML;
  }

  return Object.entries(assetMap).reduce((updatedHtml, [source, replacement]) => {
    const sourcePattern = escapeRegExp(source);
    return updatedHtml.replace(
      new RegExp(`(<(?:img|image-component)\\b[^>]*\\ssrc\\s*=\\s*)(["'])${sourcePattern}\\2`, "gi"),
      `$1"${replacement.replace(/\\/g, "\\\\").replace(/\$/g, "$$$$").replace(/"/g, "&quot;")}"`
    );
  }, html);
};

const parsePageImportFile = async (file: File): Promise<TPageImportParseResult> => {
  const extension = getExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return { pages: [], errors: [`${file.name} is not a supported import file.`], warnings: [] };
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return {
      pages: [],
      errors: [`${file.name} is larger than the ${MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024}MB import limit.`],
      warnings: [],
    };
  }

  try {
    if (extension === "html" || extension === "htm") {
      return { pages: [await parseStandaloneHtml(file)], errors: [], warnings: [] };
    }
    if (extension === "md" || extension === "markdown") {
      return { pages: [await parseStandaloneMarkdown(file)], errors: [], warnings: [] };
    }
    if (extension === "zip") {
      return await parseZipFile(file);
    }
  } catch (error) {
    if (error instanceof PageImportValidationError) {
      return { pages: [], errors: [error.message], warnings: [] };
    }
    return { pages: [], errors: [`${file.name} could not be parsed.`], warnings: [] };
  }

  return { pages: [], errors: [], warnings: [] };
};

export const parsePageImportFiles = async (files: File[]): Promise<TPageImportParseResult> => {
  if (files.length > MAX_IMPORT_FILES) {
    return {
      pages: [],
      errors: [`You can import up to ${MAX_IMPORT_FILES} files at once.`],
      warnings: [],
    };
  }

  const results = await Promise.all(files.map((file) => parsePageImportFile(file)));

  return results.reduce<TPageImportParseResult>(
    (acc, result) => {
      acc.pages.push(...result.pages);
      acc.errors.push(...result.errors);
      acc.warnings.push(...result.warnings);
      return acc;
    },
    { pages: [], errors: [], warnings: [] }
  );
};
