import { defineAction } from "astro:actions";
import { z } from "zod";
import { mutationOperation } from "@/db";
import { MUTATION_KINDS, mutationInputSchema } from "@/features/mutations/mutations.schemas";
import { assertMutationAccount, findMutationOutcome } from "@/features/mutations/server";
import { getDb, queueSearchSync, requireUser } from "./_shared";
import { withSafeActionError } from "./action-error";

export const mutations = {
  outcome: defineAction({
    input: mutationInputSchema,
    handler: ({ operationId, accountId }, ctx) =>
      withSafeActionError(
        "mutations.outcome",
        "Couldn't check this save. Your original submission is still remembered; try again when your connection returns.",
        async () => {
          const user = requireUser(ctx);
          assertMutationAccount(user.id, accountId);
          const db = getDb();
          const saved = await findMutationOutcome(db, user.id, operationId);
          if (saved?.status === "completed" && saved.kind !== "orders.create") {
            await queueSearchSync(ctx, db, [saved.resourceId!]);
          }
          return saved
            ? saved.status === "cancelled"
              ? { status: "cancelled" as const }
              : { status: "completed" as const, id: saved.resourceId!, kind: saved.kind }
            : { status: "unknown" as const };
        },
      ),
  }),
  cancel: defineAction({
    input: mutationInputSchema.extend({ kind: z.enum(MUTATION_KINDS) }),
    handler: ({ operationId, accountId, kind }, ctx) =>
      withSafeActionError(
        "mutations.cancel",
        "Couldn't cancel this save. Your original submission is still remembered; try again when your connection returns.",
        async () => {
          const user = requireUser(ctx);
          assertMutationAccount(user.id, accountId);
          const db = getDb();
          // The receipt and cancellation compete for the same unique key. Only one
          // can commit, so a cancelled submission can never complete late.
          await db.insert(mutationOperation).values({
            userId: user.id, operationId, kind, requestHash: "", status: "cancelled",
          }).onConflictDoNothing();
          const saved = (await findMutationOutcome(db, user.id, operationId))!;
          if (saved.status === "completed") {
            if (saved.kind !== "orders.create") await queueSearchSync(ctx, db, [saved.resourceId!]);
            return { status: "completed" as const, id: saved.resourceId!, kind: saved.kind };
          }
          return { status: "cancelled" as const };
        },
      ),
  }),
};
