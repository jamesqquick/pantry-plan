const SAFE_ACTION_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "CLIENT_STATE",
  "CONFLICT",
  "FORBIDDEN",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "UNAUTHORIZED",
]);

interface ActionErrorDetails {
  code?: unknown;
  message?: unknown;
}

export function getSafeActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;

  const details = error as ActionErrorDetails;
  if (
    typeof details.code !== "string" ||
    !SAFE_ACTION_ERROR_CODES.has(details.code) ||
    typeof details.message !== "string" ||
    details.message.length === 0
  ) {
    return fallback;
  }

  return details.message;
}
