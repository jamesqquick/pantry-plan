const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];

export function isForbiddenCrossOriginRequest(
  request: Request,
  url: URL,
  isPrerendered: boolean,
): boolean {
  if (isPrerendered || SAFE_METHODS.has(request.method)) return false;

  // Token exchange uses PKCE or a refresh token; ?_action= dispatches a browser action instead.
  if (request.method === "POST" && url.pathname === "/api/auth/oauth2/token" && !url.searchParams.has("_action")) return false;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const isFormRequest = !request.headers.has("content-type") ||
    FORM_CONTENT_TYPES.some((type) => contentType.includes(type));

  return isFormRequest && request.headers.get("origin") !== url.origin;
}
