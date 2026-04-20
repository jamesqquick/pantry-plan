import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";

/**
 * User — Better Auth canonical user table.
 *
 * Better Auth uses lowercase singular table names by default. We're
 * keeping the TABLE name "user" (singular) to match. Columns below
 * are the Better Auth required set PLUS our custom fields:
 *   - `role` — existing USER/ADMIN gating (carried over from Prisma)
 *
 * Passwords are NOT stored here. For email/password credentials,
 * Better Auth stores the hash on `account.password` with
 * providerId = "credential".
 */
export const user = sqliteTable(
  "user",
  {
    id: cuidPk(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("emailVerified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    // App-specific
    role: text("role").notNull().default("USER").$type<"USER" | "ADMIN">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("user_email_key").on(t.email)]
);

/**
 * Session — short-lived Better Auth session rows keyed by `token`.
 * The token lives in a cookie named `better-auth.session_token`.
 */
export const session = sqliteTable(
  "session",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("session_token_key").on(t.token)]
);

/**
 * Account — credentials for each auth method (one row per provider).
 * For email/password, providerId = "credential" and password holds the hash.
 * For OAuth (future), accessToken / refreshToken / scope / idToken are used.
 */
export const account = sqliteTable("account", {
  id: cuidPk(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Verification — Better Auth verification tokens (email verify, reset, etc.).
 */
export const verification = sqliteTable("verification", {
  id: cuidPk(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
