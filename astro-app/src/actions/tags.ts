import { ActionError, defineAction } from "astro:actions";
import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import {
  createTagSchema,
  deleteTagSchema,
  tagSearchQuerySchema,
} from "@/features/tags/tags.schemas";
import { tag } from "@/db";
import { getDb, requireUser } from "./_shared";

const PICKER_SEARCH_TAKE = 10;

export const tags = {
  /**
   * Create a new tag scoped to the current user. Enforces the (userId, name)
   * uniqueness from the schema at the app layer so we can return a clean
   * fieldError rather than surfacing a SQLite constraint error.
   */
  create: defineAction({
    accept: "form",
    input: createTagSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();
      const name = input.name.trim();

      const existing = await db
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.userId, user.id), eq(tag.name, name)))
        .limit(1);

      if (existing.length > 0) {
        throw new ActionError({
          code: "CONFLICT",
          message: "A tag with this name already exists",
        });
      }

      const [row] = await db
        .insert(tag)
        .values({ userId: user.id, name })
        .returning({ id: tag.id, name: tag.name });

      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create tag",
        });
      }
      return row;
    },
  }),

  /**
   * Soft wrapper: delete a tag the user owns. Ownership check is explicit
   * so we return NOT_FOUND on unauthorized id instead of leaking existence.
   */
  delete: defineAction({
    accept: "form",
    input: deleteTagSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: tag.id, userId: tag.userId })
        .from(tag)
        .where(eq(tag.id, input.id))
        .limit(1);

      if (existing.length === 0 || existing[0]!.userId !== user.id) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Tag not found.",
        });
      }

      await db.delete(tag).where(eq(tag.id, input.id));
      return { id: input.id };
    },
  }),

  /** List all tags for the current user, sorted by name. */
  list: defineAction({
    handler: async (_input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();
      return db
        .select({ id: tag.id, name: tag.name })
        .from(tag)
        .where(eq(tag.userId, user.id))
        .orderBy(asc(tag.name));
    },
  }),

  /** Tag picker search — prefix match, up to 10 results. Empty query = []. */
  searchForPicker: defineAction({
    input: z.object({ query: tagSearchQuerySchema }),
    handler: async ({ query }, ctx) => {
      const user = requireUser(ctx);
      if (query.length === 0) return [];
      const db = getDb();
      return db
        .select({ id: tag.id, name: tag.name })
        .from(tag)
        .where(and(eq(tag.userId, user.id), like(tag.name, `%${query}%`)))
        .orderBy(asc(tag.name))
        .limit(PICKER_SEARCH_TAKE);
    },
  }),
};
