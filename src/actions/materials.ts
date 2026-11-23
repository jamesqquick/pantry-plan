import { ActionError, defineAction } from "astro:actions";
import { and, eq } from "drizzle-orm";
import { material } from "@/db";
import { materialCreateSchema, materialUpdateSchema } from "@/features/materials/materials.schemas";
import { getDb, requireUser } from "./_shared";
import { withSafeActionError } from "./action-error";

const SAVE_ERROR = "Couldn't save the material. Check your connection and try again.";

export const materials = {
  create: defineAction({
    input: materialCreateSchema,
    handler: (input, ctx) => withSafeActionError("materials.create", SAVE_ERROR, async () => {
      const user = requireUser(ctx);
      const [saved] = await getDb().insert(material).values({ ...input, userId: user.id }).returning();
      return saved!;
    }),
  }),
  update: defineAction({
    input: materialUpdateSchema,
    handler: (input, ctx) => withSafeActionError("materials.update", SAVE_ERROR, async () => {
      const user = requireUser(ctx);
      const { id, ...values } = input;
      const [saved] = await getDb().update(material).set(values)
        .where(and(eq(material.id, id), eq(material.userId, user.id))).returning();
      if (!saved) throw new ActionError({ code: "NOT_FOUND", message: "Material not found." });
      return saved;
    }),
  }),
};
