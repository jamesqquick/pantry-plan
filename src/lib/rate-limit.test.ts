import { describe, expect, it, vi } from "vitest";
import { getRequestIp, isRateLimited } from "./rate-limit-utils";

describe("getRequestIp", () => {
  it("uses Cloudflare's connecting IP header", () => {
    const request = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    });

    expect(getRequestIp(request)).toBe("203.0.113.10");
  });

  it("falls back when the request has no IP header", () => {
    expect(getRequestIp(new Request("https://example.com"))).toBe("unknown");
  });
});

describe("isRateLimited", () => {
  it("allows requests without a binding", async () => {
    await expect(isRateLimited(undefined, "test")).resolves.toBe(false);
  });

  it("returns the inverse of the binding result", async () => {
    const binding = {
      limit: vi.fn().mockResolvedValue({ success: false }),
    } as unknown as RateLimit;

    await expect(isRateLimited(binding, "test")).resolves.toBe(true);
    expect(binding.limit).toHaveBeenCalledWith({ key: "test" });
  });

  it("suppresses the sixth request when the binding rejects it", async () => {
    const binding = {
      limit: vi.fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false }),
    } as unknown as RateLimit;

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(isRateLimited(binding, "test")).resolves.toBe(false);
    }
    await expect(isRateLimited(binding, "test")).resolves.toBe(true);
  });
});
