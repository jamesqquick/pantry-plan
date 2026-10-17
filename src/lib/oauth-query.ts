/** Match the provider client's signed-parameter selection, excluding unrelated UI query parameters. */
export function readSignedOAuthQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const names = new Set(params.getAll("ba_param"));
  if (!params.has("sig") || !names.size) return null;
  return new URLSearchParams([...params].filter(([name]) => name === "sig" || name === "ba_param" || names.has(name))).toString();
}

export function getOAuthRedirect(data: unknown): string | null {
  return data && typeof data === "object" && "redirect" in data && data.redirect === true &&
    "url" in data && typeof data.url === "string" ? data.url : null;
}
