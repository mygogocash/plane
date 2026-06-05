/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const PROJECT_NAME_SPECIAL_CHAR_ERROR_CODE = "PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS";
export const PROJECT_IDENTIFIER_SPECIAL_CHAR_ERROR_CODE = "PROJECT_IDENTIFIER_CANNOT_CONTAIN_SPECIAL_CHARACTERS";

const PROJECT_FORBIDDEN_CHARS_PATTERN = /[&+,:;$^}{*=?@#|'<>.()%!-]/;

type ProjectValidationField = "name" | "identifier";

export const getProjectNameValidationMessageKey = (name: string | null | undefined): string | undefined => {
  if (name && PROJECT_FORBIDDEN_CHARS_PATTERN.test(name)) return "project_name_cannot_contain_special_characters";
};

const getErrorPayload = (error: unknown): unknown => {
  if (!error || typeof error !== "object") return error;

  if ("data" in error) return error.data;
  if ("response" in error && error.response && typeof error.response === "object" && "data" in error.response)
    return error.response.data;

  return error;
};

const getErrorValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return [value];
  if (value && typeof value === "object" && "detail" in value) return getErrorValues(value.detail);

  return [];
};

export const hasProjectValidationErrorCode = (error: unknown, field: ProjectValidationField, code: string): boolean => {
  const payload = getErrorPayload(error);
  if (!payload || typeof payload !== "object" || !(field in payload)) return false;

  const errorPayload = payload as Record<ProjectValidationField, unknown>;

  return getErrorValues(errorPayload[field]).includes(code);
};
