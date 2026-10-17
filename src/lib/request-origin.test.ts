import { describe, expect, it } from "vitest";
import { isForbiddenCrossOriginRequest } from "./request-origin";

const origin = "https://quickpantry.app";
const formTypes = [
  undefined,
  "application/x-www-form-urlencoded",
  "multipart/form-data; boundary=test",
  "Text/Plain; charset=UTF-8",
];

function isForbidden(path: string, method: string, headers: HeadersInit, isPrerendered = false) {
  const url = new URL(path, origin);
  return isForbiddenCrossOriginRequest(new Request(url, { method, headers }), url, isPrerendered);
}

describe("form-origin protection", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects cross-origin and originless %s forms on browser routes", (method) => {
    for (const path of ["/profile", "/_actions/chatgpt.disconnect", "/_actions/chatgpt.configure", "/api/auth/sign-out"]) {
      for (const contentType of formTypes) {
        for (const requestOrigin of [undefined, "https://attacker.example", "null"]) {
          const headers = new Headers({ cookie: "better-auth.session_token=test" });
          if (contentType) headers.set("content-type", contentType);
          if (requestOrigin) headers.set("origin", requestOrigin);
          expect(isForbidden(path, method, headers)).toBe(true);
        }
      }
    }
  });

  it("allows same-origin forms and non-form API requests", () => {
    for (const contentType of formTypes) {
      const headers = new Headers({ origin });
      if (contentType) headers.set("content-type", contentType);
      expect(isForbidden("/_actions/chatgpt.disconnect", "POST", headers)).toBe(false);
    }
    expect(isForbidden("/mcp", "POST", { "content-type": "application/json" })).toBe(false);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("allows safe %s requests", (method) => {
    expect(isForbidden("/profile", method, {})).toBe(false);
  });

  it("allows prerendered routes", () => {
    expect(isForbidden("/privacy", "POST", {}, true)).toBe(false);
  });

  it("allows server-to-server and cross-origin OAuth token POSTs", () => {
    for (const requestOrigin of [undefined, "https://chatgpt.com"]) {
      const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
      if (requestOrigin) headers.set("origin", requestOrigin);
      expect(isForbidden("/api/auth/oauth2/token", "POST", headers)).toBe(false);
    }
  });

  it("limits the OAuth exemption to an exact path and POST method", () => {
    for (const path of ["/api/auth/oauth2/token/", "/api/auth/oauth2/token/extra", "/api/auth/oauth2/consent"]) {
      expect(isForbidden(path, "POST", {})).toBe(true);
    }
    expect(isForbidden("/api/auth/oauth2/token", "PUT", {})).toBe(true);
  });

  it("protects Astro form actions dispatched through the token endpoint", () => {
    for (const requestOrigin of [undefined, "https://other.quickpantry.app"]) {
      const headers = new Headers({
        "content-type": "application/x-www-form-urlencoded",
        cookie: "better-auth.session_token=test",
      });
      if (requestOrigin) headers.set("origin", requestOrigin);
      expect(isForbidden("/api/auth/oauth2/token?_action=tags.create", "POST", headers)).toBe(true);
    }
  });
});
