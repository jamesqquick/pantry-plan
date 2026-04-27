import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

/** CUID2 primary key matching Prisma's `@id @default(cuid())` behavior. */
export const cuidPk = () => text("id").primaryKey().$defaultFn(createId);

/** Timestamp column stored as Unix millis (integer) — D1 stores INTEGER natively. */
export const createdAt = () =>
  integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** Auto-updated timestamp column (Drizzle runs $onUpdateFn on mutations). */
export const updatedAt = () =>
  integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdateFn(() => new Date());
