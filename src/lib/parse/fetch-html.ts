/**
 * Fetch HTML from a URL. Only http/https; blocks localhost and private networks (SSRF protection).
 * Caller must validate URL with parseUrlSchema before calling.
 */

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isUrlAllowed(url: URL): boolean {
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (["127.0.0.1", "0.0.0.0", "::1"].includes(host)) return false;
  if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host))
    return false;
  return true;
}

export async function fetchHtml(urlString: string): Promise<string> {
  let currentUrl = new URL(urlString);
  if (!isUrlAllowed(currentUrl)) {
    throw new Error("URL not allowed (localhost or private network)");
  }

  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let redirects = 0;
  let res: Response;

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("Recipe page request timed out");

    res = await fetch(currentUrl, {
      headers: { "User-Agent": "RecipesApp/1.0 (compatible; parse)" },
      redirect: "manual",
      signal: AbortSignal.timeout(remainingMs),
    });

    if (!REDIRECT_STATUSES.has(res.status)) break;

    if (redirects >= MAX_REDIRECTS) {
      throw new Error("Recipe page redirected too many times");
    }

    const location = res.headers.get("location");
    if (!location) {
      throw new Error("Recipe page redirect did not include a destination");
    }

    const nextUrl = new URL(location, currentUrl);
    if (!isUrlAllowed(nextUrl)) {
      throw new Error("Recipe page redirected to an unsafe or unsupported URL");
    }

    await res.body?.cancel();
    currentUrl = nextUrl;
    redirects += 1;
  }

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL did not return HTML");
  }
  const contentLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    throw new Error("Recipe page is too large");
  }

  if (!res.body) throw new Error("Recipe page had no response body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) throw new Error("Recipe page is too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
