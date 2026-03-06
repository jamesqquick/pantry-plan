import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@/generated/prisma/client";
import { authConfig } from "@/lib/auth.config";
import { verifyPassword } from "@/lib/password";
import { getDb } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
});

/** Use in server actions: returns user or null so caller can return ActionResult. */
export async function requireUser(): Promise<
  { id: string; email: string; name: string | null; role: UserRole } | null
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
