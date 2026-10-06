import { describe, expect, it } from "vitest";
import {
  buildRecipeDocument,
  hashRecipeDocument,
  type RecipeDocumentInput,
} from "./recipe-document";

const base: RecipeDocumentInput = {
  id: "r1",
  userId: "u1",
  title: " Creamy Mushroom Risotto ",
  notes: "Finish with parmesan.",
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 30,
  totalTimeMinutes: 40,
  tags: ["vegetarian", "dinner"],
  ingredients: [
    { text: "300g arborio rice", name: "arborio rice" },
    { text: "1 can tomatoes", name: "canned tomatoes" },
    { text: "salt", name: null },
  ],
  instructions: ["Saute mushrooms.", "  ", "Add stock gradually."],
};

describe("buildRecipeDocument", () => {
  it("renders a user-scoped key, metadata, and readable Markdown", () => {
    const document = buildRecipeDocument(base);

    expect(document.key).toBe("users/u1/recipes/r1.md");
    expect(document.metadata).toEqual({ user_id: "u1", recipe_id: "r1" });
    expect(document.content).toBe(
      [
        "# Creamy Mushroom Risotto",
        "",
        "Tags: dinner, vegetarian",
        "Servings: 4",
        "Prep time: 10 minutes",
        "Cook time: 30 minutes",
        "Total time: 40 minutes",
        "",
        "## Ingredients",
        "- 300g arborio rice",
        "- 1 can tomatoes (canned tomatoes)",
        "- salt",
        "",
        "## Instructions",
        "1. Saute mushrooms.",
        "2. Add stock gradually.",
        "",
        "## Notes",
        "Finish with parmesan.",
        "",
      ].join("\n"),
    );
  });

  it("omits empty sections", () => {
    const document = buildRecipeDocument({
      ...base,
      notes: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      tags: [],
      ingredients: [],
      instructions: [],
    });
    expect(document.content).toBe("# Creamy Mushroom Risotto\n");
  });
});

describe("hashRecipeDocument", () => {
  it("is stable for equal content and ignores tag order", async () => {
    const a = await hashRecipeDocument(buildRecipeDocument(base));
    const b = await hashRecipeDocument(
      buildRecipeDocument({ ...base, tags: ["dinner", "vegetarian"] }),
    );
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
  });

  it("changes when searchable content changes", async () => {
    const a = await hashRecipeDocument(buildRecipeDocument(base));
    const b = await hashRecipeDocument(
      buildRecipeDocument({ ...base, notes: "Finish with pecorino." }),
    );
    expect(b).not.toBe(a);
  });
});
