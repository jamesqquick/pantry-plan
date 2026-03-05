import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config: session, pages, callbacks only.
 * No providers or DB. Used by middleware so it never pulls in Prisma/Node-only code.
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name ?? undefined;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? null;
        session.user.role = token.role ?? "USER";
      }
      return session;
    },
  },
};
