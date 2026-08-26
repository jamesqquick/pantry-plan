import { and, desc, eq } from "drizzle-orm";
import { mcpApiKey } from "@/db";
import type { Db } from "@/db";

const TOKEN_PREFIX = "pp_mcp_";
const MAX_KEYS_PER_USER = 20;

export class McpApiKeyLimitError extends Error {
  constructor(limit: number) {
    super(`You can create up to ${limit} MCP keys.`);
    this.name = "McpApiKeyLimitError";
  }
}

export class McpApiKeyNotFoundError extends Error {
  constructor(id: string) {
    super(`MCP key not found: ${id}`);
    this.name = "McpApiKeyNotFoundError";
  }
}

export class McpApiKeyCreationError extends Error {
  constructor() {
    super("Failed to create MCP API key");
    this.name = "McpApiKeyCreationError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createMcpApiKeyToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${TOKEN_PREFIX}${bytesToBase64Url(bytes)}`;
}

export async function hashMcpApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function getBearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  if (!token || token.includes(" ")) return null;
  return token;
}

export async function listMcpApiKeys(db: Db, userId: string) {
  return db
    .select({
      id: mcpApiKey.id,
      name: mcpApiKey.name,
      keyPrefix: mcpApiKey.keyPrefix,
      lastUsedAt: mcpApiKey.lastUsedAt,
      createdAt: mcpApiKey.createdAt,
    })
    .from(mcpApiKey)
    .where(eq(mcpApiKey.userId, userId))
    .orderBy(desc(mcpApiKey.createdAt));
}

export async function createMcpApiKey(db: Db, userId: string, name: string) {
  const existing = await db
    .select({ id: mcpApiKey.id })
    .from(mcpApiKey)
    .where(eq(mcpApiKey.userId, userId));
  if (existing.length >= MAX_KEYS_PER_USER) {
    throw new McpApiKeyLimitError(MAX_KEYS_PER_USER);
  }

  const token = createMcpApiKeyToken();
  const keyHash = await hashMcpApiKey(token);
  const keyPrefix = token.slice(0, 19);
  const [created] = await db
    .insert(mcpApiKey)
    .values({ userId, name, keyHash, keyPrefix })
    .returning({
      id: mcpApiKey.id,
      name: mcpApiKey.name,
      keyPrefix: mcpApiKey.keyPrefix,
      createdAt: mcpApiKey.createdAt,
    });

  if (!created) throw new McpApiKeyCreationError();
  return { ...created, token };
}

export async function revokeMcpApiKey(db: Db, userId: string, id: string) {
  const [deleted] = await db
    .delete(mcpApiKey)
    .where(and(eq(mcpApiKey.id, id), eq(mcpApiKey.userId, userId)))
    .returning({ id: mcpApiKey.id });
  if (!deleted) throw new McpApiKeyNotFoundError(id);
  return deleted;
}

export async function authenticateMcpApiKey(db: Db, authorization: string | null) {
  const token = getBearerToken(authorization);
  if (!token?.startsWith(TOKEN_PREFIX)) return null;

  const keyHash = await hashMcpApiKey(token);
  const [key] = await db
    .select({ id: mcpApiKey.id, userId: mcpApiKey.userId })
    .from(mcpApiKey)
    .where(eq(mcpApiKey.keyHash, keyHash))
    .limit(1);
  if (!key) return null;

  await db.update(mcpApiKey).set({ lastUsedAt: new Date() }).where(eq(mcpApiKey.id, key.id));
  return key;
}
