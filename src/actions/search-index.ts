import { env } from "cloudflare:workers";
import { ActionError, defineAction } from "astro:actions";
import { z } from "zod";
import {
  getRecipeSearchInstance,
  reindexAll,
  syncNextBatch,
} from "@/lib/search/recipe-index";
import { getIngredientSearchInstance, reindexIngredients, syncNextIngredientBatch } from "@/lib/search/ingredient-index";
import { getDb, requireAdmin } from "./_shared";

export const searchIndex = {
  /**
   * Admin-only. Uploads one batch of recipes to AI Search per call; repeat
   * until `remaining` is 0. Pass `restart: true` on the first call to force
   * every recipe to re-upload (e.g. after changing the document format).
   */
  reindex: defineAction({
    input: z.object({ restart: z.boolean().default(false) }),
    handler: async (input, ctx) => {
      requireAdmin(ctx);
      const instance = getRecipeSearchInstance(env);
      if (!instance) {
        throw new ActionError({
          code: "PRECONDITION_FAILED",
          message: "AI Search is not configured.",
        });
      }
      const deps = { db: getDb(), instance };
      return input.restart ? reindexAll(deps) : syncNextBatch(deps);
    },
  }),
  reindexIngredients: defineAction({
    input: z.object({ restart: z.boolean().default(false) }),
    handler: async (input, ctx) => {
      requireAdmin(ctx);
      const instance = getIngredientSearchInstance(env);
      if (!instance) {
        throw new ActionError({ code: "PRECONDITION_FAILED", message: "Ingredient AI Search is not configured." });
      }
      const cf = ctx.locals.cfContext;
      const deps = { db: getDb(), instance, waitUntil: cf?.waitUntil.bind(cf) };
      return input.restart ? reindexIngredients(deps) : syncNextIngredientBatch(deps);
    },
  }),
};
