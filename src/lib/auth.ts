import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { scrypt } from "@noble/hashes/scrypt.js";
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
} from "@noble/hashes/utils.js";
import { createDb, type Db } from "@/db";
import * as schema from "@/db/schema";

/** Constant-time equality on equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Better Auth instance factory.
 *
 * Cloudflare D1 bindings live on `env.DB` and are only available per-request,
 * so we can't instantiate a single `auth` at module scope. Instead, we build
 * one per request inside the catch-all API route and middleware.
 */

// scrypt params — N=2^14 is the Workers-safe sweet spot (fast enough, strong enough)
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };
const SALT_BYTES = 16;

function encodeHash(salt: Uint8Array, hash: Uint8Array): string {
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

function decodeHash(stored: string): { salt: Uint8Array; hash: Uint8Array } {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) {
    throw new Error("Invalid stored password hash format");
  }
  return { salt: hexToBytes(saltHex), hash: hexToBytes(hashHex) };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = scrypt(password, salt, SCRYPT_PARAMS);
  return encodeHash(salt, hash);
}

export async function verifyPassword({
  password,
  hash: stored,
}: {
  password: string;
  hash: string;
}): Promise<boolean> {
  try {
    const { salt, hash: expected } = decodeHash(stored);
    const got = scrypt(password, salt, SCRYPT_PARAMS);
    if (got.length !== expected.length) return false;
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

/**
 * Build the shared Better Auth options. The same options are passed to
 * every factory invocation; only the database binding changes per-request.
 */
function buildOptions(db: Db, env: Env): BetterAuthOptions {
  // Trust the configured base URL plus the local dev port.
  // Production must set AUTH_URL to the deployed origin
  // (e.g. https://pantry-plan.jamesqquick.workers.dev).
  const trustedOrigins = [
    env.AUTH_URL,
    "http://localhost:4321",
    "http://127.0.0.1:4321",
  ].filter(Boolean);

  return {
    baseURL: env.AUTH_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "USER",
          // role is app-managed; don't let clients set it on signup
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days (seconds)
      updateAge: 60 * 60 * 24, // refresh session rolling window after 1 day
    },
  };
}

export function createAuth(env: Env) {
  const db = createDb(env.DB);
  return betterAuth(buildOptions(db, env));
}

export type Auth = ReturnType<typeof createAuth>;
