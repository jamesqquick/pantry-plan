import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth client used by React islands.
 *
 * Same-origin: we don't set `baseURL`, so the client posts to
 * `/api/auth/*` relative to the current page.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
