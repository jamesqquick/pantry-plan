import { ActionError } from "astro:actions";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { mutationOperation, type Db } from "@/db";
import { DatabaseTimeoutError, getDatabaseBudget } from "@/lib/database-timeout";
import type { MutationKind } from "./mutations.schemas";
import { canonicalInput } from "./canonical";

export function assertMutationAccount(userId: string, accountId: string) {
  if (userId !== accountId) {
    throw new ActionError({ code: "FORBIDDEN", message: "Your signed-in account changed. Return to the original account to recover this save." });
  }
}

export async function findMutationOutcome(db: Db, userId: string, operationId: string) {
  const [saved] = await db.select().from(mutationOperation).where(and(
    eq(mutationOperation.userId, userId),
    eq(mutationOperation.operationId, operationId),
  )).limit(1);
  return saved;
}

async function hashInput(input: unknown) {
  const canonical = canonicalInput(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareCreate(
  db: Db,
  userId: string,
  kind: MutationKind,
  operationId: string,
  input: unknown,
) {
  const requestHash = await hashInput(input);
  function resolve(saved: typeof mutationOperation.$inferSelect) {
    if (saved.status === "cancelled") {
      throw new ActionError({ code: "CONFLICT", message: "This submission was cancelled. Start a new submission to save your changes." });
    }
    if (saved.kind !== kind || saved.requestHash !== requestHash) {
      throw new ActionError({ code: "CONFLICT", message: "This submission was already used with different input. Check its save status before making changes." });
    }
    return saved.resourceId!;
  }
  const existing = await findMutationOutcome(db, userId, operationId);
  return {
    resourceId: existing ? resolve(existing) : undefined,
    async commit(resourceId: string, statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) {
      try {
        await db.batch([
          db.insert(mutationOperation).values({ userId, operationId, kind, requestHash, resourceId }),
          ...statements,
        ]);
        return resourceId;
      } catch (error) {
        // An expired request cannot safely perform more database work.
        if (getDatabaseBudget()?.error || error instanceof DatabaseTimeoutError) throw error;
        const saved = await findMutationOutcome(db, userId, operationId);
        if (saved) return resolve(saved);
        throw error;
      }
    },
  };
}
