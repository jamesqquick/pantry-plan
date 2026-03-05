import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/password";
import { getDb } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || typeof credentials.password !== "string")
          return null;
        const db = getDb();
        const user = await db.user.findUnique({
          where: { email: String(credentials.email).toLowerCase() },
          select: { id: true, email: true, name: true, role: true, passwordHash: true },
        });
        if (!user || !(await verifyPassword(credentials.password, user.passwordHash)))
          return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role };
      },
    }),
  ],
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
});

/** Use in server actions: returns user or null so caller can return ActionResult. */
export async function requireUser(): Promise<
  { id: string; email: string; name: string | null; role: import("@prisma/client").UserRole } | null
> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email!,
    name: session.user.name ?? null,
    role: session.user.role ?? "USER",
  };
}
