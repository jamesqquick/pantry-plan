import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@/db";
import { handleMcpRequest } from "@/lib/mcp/server";

export const prerender = false;

export const ALL: APIRoute = async ({ request, locals }) => {
  return handleMcpRequest(request, createDb(env.DB), env, locals.cfContext);
};
