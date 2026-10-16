import { describe, expect, it } from "vitest";
import {
  buildIngredientDocument,
  hashIngredientDocument,
  ingredientScopeKey,
  IngredientDocumentValidationError,
  INGREDIENT_DOCUMENT_VERSION,
  MAX_INGREDIENT_DOCUMENT_ALIASES,
  MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH,
  MAX_INGREDIENT_DOCUMENT_NAME_LENGTH,
  MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH,
  type IngredientDocumentInput,
} from "./ingredient-document";

const input: IngredientDocumentInput = {
  id: "tomato",
  userId: null,
  name: " Canned tomatoes ",
  normalizedName: "canned tomato",
  aliases: ["tinned tomatoes", " canned tomato ", "tinned tomatoes", ""],
  category: " Vegetables ",
  notes: " Keep the juice. ",
};

describe("ingredient documents", () => {
  it("uses a stable ingredient key with explicit global or private scope metadata", () => {
    const document = buildIngredientDocument(input);
    expect(document).toEqual({
      key: "ingredients/tomato.md",
      metadata: { ingredient_id: "tomato", scope_key: "global" },
      content: "# Canned tomatoes\n\nNormalized name: canned tomato\nCategory: Vegetables\n\n## Aliases\n- canned tomato\n- tinned tomatoes\n\n## Notes\nKeep the juice.\n",
    });
    expect(buildIngredientDocument({ ...input, userId: "u1" })).toMatchObject({
      key: document.key,
      metadata: { ingredient_id: "tomato", scope_key: "user:u1" },
    });
    expect(ingredientScopeKey(null)).toBe("global");
    expect(ingredientScopeKey("global")).toBe("user:global");
  });

  it("omits optional empty sections and fields unrelated to ingredient identity", () => {
    const document = buildIngredientDocument({ ...input, aliases: [], category: " ", notes: null });
    expect(document.content).toBe("# Canned tomatoes\n\nNormalized name: canned tomato\n");
    const withFinancialFields = {
      ...input,
      costBasisUnit: "G",
      estimatedCentsPerBasisUnit: 123,
      gramsPerCup: 200,
      cupsPerEach: 0.5,
      conversionConfidence: "High",
      preferredDisplayUnit: "CUP",
    };
    expect(buildIngredientDocument(withFinancialFields)).toEqual(buildIngredientDocument(input));
  });

  it("bounds sorted, deduplicated aliases and notes without truncating canonical names", () => {
    expect(MAX_INGREDIENT_DOCUMENT_NAME_LENGTH).toBe(500);
    const name = "n".repeat(MAX_INGREDIENT_DOCUMENT_NAME_LENGTH);
    const aliases = Array.from({ length: 100 }, (_, index) => `alias-${String(index).padStart(3, "0")}`);
    const document = buildIngredientDocument({
      ...input,
      name,
      normalizedName: name,
      aliases: [...aliases.reverse(), "x".repeat(MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH + 1), "alias-000"],
      notes: "z".repeat(MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH + 1),
    });
    expect(document.content).toContain(`# ${name}\n`);
    expect(document.content).toContain(`Normalized name: ${name}\n`);
    expect(document.content.match(/^- alias-/gm)).toHaveLength(MAX_INGREDIENT_DOCUMENT_ALIASES);
    expect(document.content).toContain("- alias-000\n- alias-001");
    expect(document.content).not.toContain("alias-020");
    expect(document.content).not.toContain("x".repeat(MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH));
    expect(document.content.split("## Notes\n")[1]).toBe(`${"z".repeat(MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH)}\n`);
  });

  it.each([
    { field: "name", length: 501 },
    { field: "normalizedName", length: 501 },
    { field: "name", length: 100_000 },
    { field: "normalizedName", length: 100_000 },
  ] as const)("rejects an oversized $field of length $length without retaining private text", ({ field, length }) => {
    const privateText = "private-name-" + "x".repeat(length - "private-name-".length);
    let error: unknown;
    try {
      buildIngredientDocument({ ...input, [field]: privateText });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(IngredientDocumentValidationError);
    expect(error).toMatchObject({ name: "IngredientDocumentValidationError", ingredientId: input.id, field, length });
    expect(JSON.stringify(error)).not.toContain("private-name-");
    expect(error instanceof Error ? error.message : "").not.toContain("private-name-");
  });

  it("hashes the version, content, key, and metadata deterministically", async () => {
    const document = buildIngredientDocument(input);
    const hash = await hashIngredientDocument(document);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIngredientDocument(buildIngredientDocument({ ...input, aliases: ["canned tomato", "tinned tomatoes"] }))).toBe(hash);
    expect(await hashIngredientDocument(buildIngredientDocument({ ...input, userId: "u1" }))).not.toBe(hash);
    expect(await hashIngredientDocument(buildIngredientDocument({ ...input, notes: "Drain the juice." }))).not.toBe(hash);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify({ version: INGREDIENT_DOCUMENT_VERSION, ...document })),
    );
    expect(hash).toBe(Buffer.from(digest).toString("hex"));
  });
});
