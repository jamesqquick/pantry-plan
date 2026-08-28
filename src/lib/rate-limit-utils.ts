export async function isRateLimited(
  binding: RateLimit | undefined,
  key: string,
): Promise<boolean> {
  if (!binding) return false;
  const { success } = await binding.limit({ key });
  return !success;
}

export function getRequestIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
