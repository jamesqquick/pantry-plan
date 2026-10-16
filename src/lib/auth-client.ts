import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/**
 * Browser-side auth client used by React islands.
 *
 * Same-origin: we don't set `baseURL`, so the client posts to
 * `/api/auth/*` relative to the current page.
 */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export const {
  signIn,
  signUp,
  signOut,
  linkSocial,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
