/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { sanitizeRichHTML } from "@plane/utils";

const BLOCK_TAGS = new Set(["blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "pre", "tr"]);

const normalizePlainText = (value: string): string =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const htmlToText = (value: string): string => {
  const textParts: string[] = [];
  const appendLineBreak = () => {
    const previousPart = textParts.at(-1);
    if (previousPart && !previousPart.endsWith("\n")) textParts.push("\n");
  };

  sanitizeRichHTML(value || "", {
    allowedTags: [...BLOCK_TAGS, "br"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea"],
    onOpenTag: (name) => {
      if (name === "br" || BLOCK_TAGS.has(name)) appendLineBreak();
    },
    onCloseTag: (name) => {
      if (BLOCK_TAGS.has(name)) appendLineBreak();
    },
    textFilter: (text) => {
      textParts.push(text);
      return text;
    },
  });

  return normalizePlainText(textParts.join(""));
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const textToHtml = (value: string): string => {
  const text = value.trim();
  if (!text) return "<p></p>";
  return `<p>${escapeHtml(text).split("\n").join("<br/>")}</p>`;
};
