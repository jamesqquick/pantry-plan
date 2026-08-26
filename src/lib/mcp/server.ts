import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { Db } from "@/db";
import { saveImportedRecipeTextOnlySchema } from "@/features/import/import.schemas";
import {
  createRecipeToolSchema,
  importRecipeFromUrlToolSchema,
  searchRecipesToolSchema,
} from "@/features/mcp/mcp.schemas";
import { createTextOnlyRecipe } from "@/features/recipes/create-text-recipe";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { isSafeHttpUrl } from "@/lib/url";
import { authenticateMcpApiKey } from "./api-keys";
import { searchRecipes } from "./search-recipes";

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function createRecipeResult(origin: string, recipeId: string, title: string) {
  const recipeUrl = new URL(`/recipes/${recipeId}`, origin).toString();
  return {
    content: [
      {
        type: "text" as const,
        text: `Created recipe "${title}" in Pantry Plan: ${recipeUrl}`,
      },
    ],
    structuredContent: { recipeId, title, recipeUrl },
  };
}

async function isRateLimited(
  binding: RateLimit | undefined,
  key: string,
): Promise<boolean> {
  if (!binding) return false;
  const { success } = await binding.limit({ key: `mcp:${key}` });
  return !success;
}

function createServer(
  db: Db,
  userId: string,
  origin: string,
  keyId: string,
  rateLimit: RateLimit | undefined,
) {
  const server = new McpServer({ name: "pantry-plan", version: "1.0.0" });

  server.registerTool(
    "create_recipe",
    {
      description:
        "Create a recipe in the authenticated user's Pantry Plan account.",
      inputSchema: createRecipeToolSchema.shape,
    },
    async (input) => {
      if (await isRateLimited(rateLimit, keyId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const result = await createTextOnlyRecipe(db, userId, {
          recipe: {
            title: input.title,
            sourceUrl: input.sourceUrl,
            imageUrl: input.imageUrl,
            servings: input.servings,
            prepTimeMinutes: input.prepTimeMinutes,
            cookTimeMinutes: input.cookTimeMinutes,
            totalTimeMinutes: input.totalTimeMinutes,
            instructions: input.instructions,
            notes: input.notes,
            tagIds: [],
          },
          ingredients: input.ingredients,
        });
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
    "import_recipe_from_url",
    {
      description:
        "Fetch a recipe URL, extract its structured recipe data, and save it in the authenticated user's Pantry Plan account.",
      inputSchema: importRecipeFromUrlToolSchema.shape,
    },
    async ({ url }) => {
      if (await isRateLimited(rateLimit, keyId)) {
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
    {
      description:
        "Search the authenticated user's Pantry Plan recipes by title.",
      inputSchema: searchRecipesToolSchema.shape,
    },
    async ({ query, limit }) => {
      if (await isRateLimited(rateLimit, keyId)) {
        return toolError("Too many requests. Please try again later.");
      }
      try {
        const results = await searchRecipes(db, userId, query, limit);
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
          structuredContent: { query, count: recipes.length, recipes },
        };
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "MCP recipe search failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return toolError("Could not search recipes.");
      }
    },
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  db: Db,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await authenticateMcpApiKey(
    db,
    request.headers.get("Authorization"),
  );
  if (!auth) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="Pantry Plan MCP"' },
    });
  }

  const origin = new URL(request.url).origin;
  const handler = createMcpHandler(
    () => createServer(db, auth.userId, origin, auth.id, env.AI_RATE_LIMIT),
    {
      route: "/mcp",
      authContext: { props: { userId: auth.userId, keyId: auth.id } },
    },
  );
  return handler(request, env, ctx);
}
