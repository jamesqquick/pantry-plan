import type { APIContext } from "astro";
import { ActionError, getActionContext } from "astro:actions";
import type { DatabaseBudget } from "./database-timeout";

export const DATABASE_UNAVAILABLE_MESSAGE = "Quick Pantry is temporarily unavailable. Please try again shortly.";
export const DATABASE_WRITE_UNCERTAIN_MESSAGE = "We could not confirm whether your change was saved. Refresh before trying again.";

export function databaseUnavailableResponse(context: APIContext, budget: DatabaseBudget): Response {
  const message = budget.writeStarted ? DATABASE_WRITE_UNCERTAIN_MESSAGE : DATABASE_UNAVAILABLE_MESSAGE;
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (context.url.pathname.startsWith("/_actions/")) {
    const { serializeActionResult } = getActionContext(context);
    const result = serializeActionResult({
      data: undefined,
      error: new ActionError({ code: "SERVICE_UNAVAILABLE", message }),
    });
    if (result.type === "error") {
      headers.set("Content-Type", result.contentType);
      return new Response(result.body, { status: result.status, headers });
    }
  }

  if (context.url.pathname.startsWith("/api/") || context.url.pathname.startsWith("/.well-known/")) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ code: "SERVICE_UNAVAILABLE", message }), { status: 503, headers });
  }

  const readOnly = ["GET", "HEAD"].includes(context.request.method) && !budget.writeStarted;
  if (readOnly) headers.set("Retry-After", "10");
  headers.set("Content-Type", "text/html; charset=utf-8");
  // This document has no layout, scripts, external assets, or database dependencies.
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Temporarily unavailable | Quick Pantry</title><style>body{margin:0;background:#faf7f0;color:#292d25;font:18px/1.6 system-ui,sans-serif}main{max-width:34rem;margin:15vh auto;padding:1.5rem}h1{font:2.5rem/1.2 Georgia,serif}a{display:inline-block;padding:.65rem 1.1rem;background:#384e36;color:white;border-radius:.4rem}</style></head><body><main><p>Quick Pantry</p><h1>Temporarily unavailable</h1><p>${message}</p><a href="">${readOnly ? "Try again" : "Refresh to check your changes"}</a></main></body></html>`, { status: 503, headers });
}
