/**
 * Fetch HTML from a URL. Only http/https; blocks localhost and private networks (SSRF protection).
 * Caller must validate URL with parseUrlSchema before calling.
 */

const ALLOWED_PROTOCOLS = ["http:", "https:"];

function isUrlAllowed(url: URL): boolean {
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (["127.0.0.1", "0.0.0.0", "::1"].includes(host)) return false;
  if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false;
  return true;
}

export async function fetchHtml(urlString: string): Promise<string> {
  const url = new URL(urlString);
  if (!isUrlAllowed(url)) {
    throw new Error("URL not allowed (localhost or private network)");
  }
  const res = await fetch(urlString, {
    headers: { "User-Agent": "RecipesApp/1.0 (compatible; parse)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL did not return HTML");
  }
  return res.text();
}
