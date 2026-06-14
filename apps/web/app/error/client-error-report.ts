const MAX_FIELD_LENGTH = 2000;

const truncate = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  return String(value).slice(0, MAX_FIELD_LENGTH);
};

export const buildClientErrorPayload = (error: unknown) => {
  const normalizedError = error instanceof Error ? error : undefined;

  return {
    message: truncate(normalizedError?.message ?? error),
    name: truncate(normalizedError?.name),
    route: typeof window === "undefined" ? undefined : truncate(window.location.pathname),
    stack: truncate(normalizedError?.stack),
    url: typeof window === "undefined" ? undefined : truncate(window.location.href),
    user_agent: typeof navigator === "undefined" ? undefined : truncate(navigator.userAgent),
  };
};

export function reportClientError(error: unknown) {
  if (typeof window === "undefined" || import.meta.env.DEV) return;

  try {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/client-errors/", true);
    request.setRequestHeader("Content-Type", "application/json");
    request.send(JSON.stringify(buildClientErrorPayload(error)));
  } catch {
    return;
  }
}
