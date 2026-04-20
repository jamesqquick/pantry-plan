// Placeholder auth types — will be replaced in Phase 2 when Better Auth is wired up.

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}
