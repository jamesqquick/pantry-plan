import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, match auth config

/** Cookie name and salt must match Auth.js defaults (authjs.session-token or __Secure-authjs.session-token). */
function getSessionCookieName(): string {
  const useSecure =
    process.env.NODE_ENV === "production" &&
    (process.env.AUTH_URL?.startsWith("https:") ?? false);
  return useSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
}

export type SessionTokenPayload = {
  sub: string;
  email: string;
  name: string | null;
  iat?: number;
  exp?: number;
  jti?: string;
};

/**
 * Encode a new JWT with the given user payload and set the session cookie
 * so the next request sees the updated session. Used after profile (name) update.
 */
export async function setSessionCookie(payload: SessionTokenPayload): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  const cookieName = getSessionCookieName();
  const token = await encode({
    token: {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    },
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  });
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieName.startsWith("__Secure-"),
    maxAge: SESSION_MAX_AGE,
  });
}
