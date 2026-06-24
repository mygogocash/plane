// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

export type TTranslateLanguage = {
  key: string;
  label: string;
};

export const TRANSLATE_LANGUAGES: TTranslateLanguage[] = [
  { key: "es", label: "Spanish" },
  { key: "fr", label: "French" },
  { key: "de", label: "German" },
  { key: "ja", label: "Japanese" },
  { key: "th", label: "Thai" },
];

export type TTranslateValidationResult = { ok: true } | { ok: false; message: string };

export const validateTranslateInput = (
  selection?: string | null,
  targetLanguage?: string | null
): TTranslateValidationResult => {
  if (!selection?.trim()) {
    return { ok: false, message: "Select text to translate." };
  }

  if (!targetLanguage?.trim()) {
    return { ok: false, message: "Choose a target language." };
  }

  return { ok: true };
};

export const shouldReplaceSelectionOnAccept = (action: "accept" | "cancel") => action === "accept";
