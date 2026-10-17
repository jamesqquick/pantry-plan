import { createMcpHandler } from "agents/mcp/server";
import { McpServer, type Tool, type ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { user, type Db } from "@/db";
import { saveImportedRecipeTextOnlySchema } from "@/features/import/import.schemas";
import {
  createRecipeToolSchema,
  createdRecipeOutputSchema,
  createWeeklyMealPlanToolSchema,
  editRecipeToolSchema,
  getRecipeToolSchema,
  importRecipeFromUrlToolSchema,
  recipeDetailsOutputSchema,
  searchRecipesOutputSchema,
  searchRecipesToolSchema,
  weeklyMealPlanOutputSchema,
} from "@/features/mcp/mcp.schemas";
import { createTextOnlyRecipe } from "@/features/recipes/create-text-recipe";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { isSafeHttpUrl } from "@/lib/url";
import { authenticateMcpRequest, mcpAuthChallenge } from "./auth";
import { MCP_SCOPES } from "@/lib/oauth";
import { searchRecipes } from "./search-recipes";
import { createMcpRecipe } from "./create-recipe";
import { editMcpRecipe } from "./edit-recipe";
import { getMcpRecipe } from "./get-recipe";
import { RecipeNotFoundError, TagNotFoundError } from "./recipe-errors";
import { getBooleanFlag } from "@/lib/feature-flags";
import {
  getRecipeSearchInstance,
  queueRecipeIndexSync,
  type WaitUntil,
} from "@/lib/search/recipe-index";
import {
  createWeeklyMealPlan,
  WeeklyMealPlanValidationError,
} from "./create-weekly-meal-plan";

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function objectJsonSchema(schema: z.ZodObject, io: "input" | "output"): { type: "object"; [key: string]: unknown } {
  return { ...z.toJSONSchema(schema, { io }), type: "object" };
}

function createRecipeResult(origin: string, recipeId: string, title: string) {
  const recipeUrl = new URL(`/recipes/${recipeId}`, origin).toString();
  return {
    content: [
      {
        type: "text" as const,
        text: `Created recipe "${title}" in Quick Pantry: ${recipeUrl}`,
      },
    ],
    structuredContent: { recipeId, title, recipeUrl },
  };
}

function recipeDetailsResult(
  origin: string,
  recipe: Awaited<ReturnType<typeof getMcpRecipe>>,
  message: string,
) {
  const recipeUrl = new URL(`/recipes/${recipe.id}`, origin).toString();
  return {
    content: [
      {
        type: "text" as const,
        text: `${message} "${recipe.title}": ${recipeUrl}`,
      },
    ],
    structuredContent: { ...recipe, recipeUrl },
  };
}

export const RECIPE_AI_SEARCH_FLAG = "recipe-ai-search";

/** MCP keys only carry a user id, so load the email for email-targeted flag rules. */
export async function isRecipeAiSearchEnabled(
  db: Db,
  flags: Flagship | undefined,
  userId: string,
): Promise<boolean> {
  const [account] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return getBooleanFlag(flags, RECIPE_AI_SEARCH_FLAG, false, {
    userId,
    email: account?.email,
  });
}

/** Bindings for search indexing; absent in tests that only inspect schemas. */
export type McpSearchContext = {
  env: Pick<Cloudflare.Env, "AI_SEARCH" | "AI_SEARCH_INSTANCE" | "FLAGS">;
  waitUntil?: WaitUntil;
};

async function isRateLimited(
  binding: RateLimit | undefined,
  key: string,
): Promise<boolean> {
  if (!binding) return false;
  const { success } = await binding.limit({ key: `mcp:${key}` });
  return !success;
}

export function createServer(
  db: Db,
  userId: string,
  origin: string,
  rateLimit: RateLimit | undefined,
  search?: McpSearchContext,
  scopes: readonly string[] = MCP_SCOPES,
) {
  const server = new McpServer({ name: "quick-pantry", version: "1.0.0" });
  const advertisedTools: Array<Tool & { securitySchemes: { type: string; scopes: string[] }[] }> = [];
  function toolConfig<Input extends z.ZodObject, Output extends z.ZodObject>(
    name: string,
    scope: (typeof MCP_SCOPES)[number],
    config: { title: string; description: string; inputSchema: Input; outputSchema: Output; annotations: ToolAnnotations },
  ) {
    const securitySchemes = [{ type: "oauth2", scopes: [scope] }];
    const _meta = { securitySchemes };
    advertisedTools.push({
      ...config,
      name,
      inputSchema: objectJsonSchema(config.inputSchema, "input"),
      outputSchema: objectJsonSchema(config.outputSchema, "output"),
      securitySchemes,
      _meta,
    });
    return { ...config, _meta };
  }
  const permissionError = (scope: (typeof MCP_SCOPES)[number]) => scopes.includes(scope) ? null : {
    ...toolError(`Quick Pantry requires the ${scope} permission for this tool.`),
    _meta: { "mcp/www_authenticate": [mcpAuthChallenge(origin, scope)] },
  };

  const queueIndexSync = (recipeIds: string[]) =>
    search
      ? queueRecipeIndexSync(db, search.env, search.waitUntil, recipeIds)
      : Promise.resolve();

  server.registerTool(
    "create_recipe",
    toolConfig("create_recipe", "recipes:write", {
      title: "Create recipe",
      description:
        "Create a recipe in the authenticated user's Quick Pantry account.",
      inputSchema: createRecipeToolSchema,
      outputSchema: createdRecipeOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }),
    async (input) => {
      const denied = permissionError("recipes:write");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const result = await createMcpRecipe(db, userId, input);
        await queueIndexSync([result.recipeId]);
        return createRecipeResult(origin, result.recipeId, input.title);
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe creation failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError("Could not create the recipe.");
      }
    },
  );

  server.registerTool(
    "get_recipe",
    toolConfig("get_recipe", "recipes:read", {
      title: "Get recipe",
      description:
        "Get the complete editable recipe, including structured ingredients and ordered instructions, from the authenticated user's Quick Pantry account.",
      inputSchema: getRecipeToolSchema,
      outputSchema: recipeDetailsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }),
    async ({ recipeId }) => {
      const denied = permissionError("recipes:read");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const result = await getMcpRecipe(db, userId, recipeId);
        return recipeDetailsResult(origin, result, "Recipe");
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe lookup failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError(
          error instanceof RecipeNotFoundError
            ? error.message
            : "Could not get the recipe.",
        );
      }
    },
  );

  server.registerTool(
    "edit_recipe",
    toolConfig("edit_recipe", "recipes:write", {
      title: "Edit recipe",
      description:
        "Partially edit a recipe in the authenticated user's Quick Pantry account. Omitted fields remain unchanged, null clears optional metadata, and supplied ingredients or instructions replace the complete ordered list.",
      inputSchema: editRecipeToolSchema,
      outputSchema: recipeDetailsOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }),
    async (input) => {
      const denied = permissionError("recipes:write");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        await editMcpRecipe(db, userId, input);
        await queueIndexSync([input.recipeId]);
        const result = await getMcpRecipe(db, userId, input.recipeId);
        return recipeDetailsResult(origin, result, "Updated recipe");
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe edit failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError(
          error instanceof RecipeNotFoundError
            ? error.message
            : "Could not edit the recipe.",
        );
      }
    },
  );

  server.registerTool(
    "import_recipe_from_url",
    toolConfig("import_recipe_from_url", "recipes:write", {
      title: "Import recipe from URL",
      description:
        "Fetch a recipe URL, extract its structured recipe data, and save it in the authenticated user's Quick Pantry account.",
      inputSchema: importRecipeFromUrlToolSchema,
      outputSchema: createdRecipeOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }),
    async ({ url }) => {
      const denied = permissionError("recipes:write");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        if (!isSafeHttpUrl(url)) {
          return toolError("Only http and https recipe URLs are allowed.");
        }
        const parsed = await parseRecipeFromUrl(url);
        if (!parsed.ok) return toolError(parsed.error);

        const input = saveImportedRecipeTextOnlySchema.safeParse({
          recipe: {
            title: parsed.data.title,
            sourceUrl: parsed.data.sourceUrl,
            imageUrl: parsed.data.imageUrl,
            servings: parsed.data.servings,
            prepTimeMinutes: parsed.data.prepTimeMinutes,
            cookTimeMinutes: parsed.data.cookTimeMinutes,
            totalTimeMinutes: parsed.data.totalTimeMinutes,
            instructions: parsed.data.instructions,
            notes: parsed.data.notes,
            tagIds: [],
          },
          ingredients: parsed.data.ingredients,
        });
        if (!input.success) {
          return toolError(
            "The URL did not contain a complete recipe with ingredients and instructions.",
          );
        }

        const result = await createTextOnlyRecipe(db, userId, input.data);
        await queueIndexSync([result.recipeId]);
        return createRecipeResult(
          origin,
          result.recipeId,
          input.data.recipe.title,
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe URL import failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError("Could not import a recipe from that URL.");
      }
    },
  );

  server.registerTool(
    "search_recipes",
    toolConfig("search_recipes", "recipes:read", {
      title: "Search recipes",
      description:
        "Search the authenticated user's saved Quick Pantry recipes. Natural-language search includes ingredients, instructions, and notes when semantic search is available; otherwise results use title matching. Optionally filter by tag name. Search may update the account's background search index without changing saved recipes.",
      inputSchema: searchRecipesToolSchema,
      outputSchema: searchRecipesOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }),
    async ({ query, limit, tag }) => {
      const denied = permissionError("recipes:read");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const semanticEnabled = search
          ? await isRecipeAiSearchEnabled(db, search.env.FLAGS, userId).catch(() => false)
          : false;
        const { recipes: results, mode } = await searchRecipes(
          {
            db,
            instance: search ? getRecipeSearchInstance(search.env) : null,
            semanticEnabled,
            waitUntil: search?.waitUntil,
          },
          userId,
          { query, limit, tag },
        );
        const recipes = results.map((result) => ({
          ...result,
          recipeUrl: new URL(`/recipes/${result.id}`, origin).toString(),
        }));
        return {
          content: [
            {
              type: "text" as const,
              text:
                recipes.length === 0
                  ? `No recipes found for "${query}".`
                  : `Found ${recipes.length} recipe${recipes.length === 1 ? "" : "s"} matching "${query}".\n${recipes.map((recipe) => `- ${recipe.title}: ${recipe.recipeUrl}`).join("\n")}`,
            },
          ],
          structuredContent: { query, tag: tag ?? null, mode, count: recipes.length, recipes },
        };
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe search failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError(
          error instanceof TagNotFoundError
            ? error.message
            : "Could not search recipes.",
        );
      }
    },
  );

  server.registerTool(
    "create_weekly_meal_plan",
    toolConfig("create_weekly_meal_plan", "meal-plans:write", {
      title: "Replace weekly meal plan",
      description:
        "Replace the authenticated user's entire week of planned meals with their saved recipes. Ask the user to confirm the week and replacement before calling. An empty meals list clears that week.",
      inputSchema: createWeeklyMealPlanToolSchema,
      outputSchema: weeklyMealPlanOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }),
    async (input) => {
      const denied = permissionError("meal-plans:write");
      if (denied) return denied;
      if (await isRateLimited(rateLimit, userId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const result = await createWeeklyMealPlan(db, userId, input);
        const mealPlanUrl = new URL(
          `/meal-plan/${result.weekStart}`,
          origin,
        ).toString();
        return {
          content: [
            {
              type: "text" as const,
              text: `Replaced the week starting ${result.weekStart} with ${result.mealCount} meal${result.mealCount === 1 ? "" : "s"}: ${mealPlanUrl}`,
            },
          ],
          structuredContent: { ...result, mealPlanUrl },
        };
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP weekly meal plan creation failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError(
          error instanceof WeeklyMealPlanValidationError
            ? error.message
            : "Could not create the weekly meal plan.",
        );
      }
    },
  );

  // MCP SDK v2's registration config does not retain OpenAI's root securitySchemes extension.
  server.server.setRequestHandler("tools/list", async () => ({ tools: advertisedTools }));
  return server;
}

export async function handleMcpRequest(
  request: Request,
  db: Db,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await authenticateMcpRequest(db, env, request);
  if (!auth) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": mcpAuthChallenge(env.AUTH_URL), "Cache-Control": "no-store" },
    });
  }

  const origin = new URL(env.AUTH_URL).origin;
  const handler = createMcpHandler(
    () =>
      createServer(db, auth.userId, origin, env.AI_RATE_LIMIT, {
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      }, auth.scopes),
    {
      route: "/mcp",
      authContext: { props: { userId: auth.userId, scopes: auth.scopes } },
    },
  );
  return handler(request, env, ctx);
}
