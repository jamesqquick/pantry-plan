import { describe, it, expect } from "vitest";
import { normalizeRecipe } from "./normalize-recipe";

describe("normalizeRecipe", () => {
  it("splits single HowToStep with concatenated numbered steps and strips number bullets", () => {
    const recipe = {
      "@type": "Recipe",
      name: "Test Recipe",
      recipeInstructions: [
        {
          "@type": "HowToStep",
          text: "1. Preheat the oven to 425\u00b0 F.2. In a baking dish, add the butter and chicken.3. Shred the chicken and serve.",
        },
      ],
    };
    const out = normalizeRecipe(recipe as Record<string, unknown>);
    expect(out).not.toBeNull();
    expect(out!.instructions).toHaveLength(3);
    expect(out!.instructions[0]).toBe("Preheat the oven to 425\u00b0 F.");
    expect(out!.instructions[1]).toBe(
      "In a baking dish, add the butter and chicken.",
    );
    expect(out!.instructions[2]).toBe("Shred the chicken and serve.");
  });

  it("keeps already separate HowToSteps unchanged", () => {
    const recipe = {
      "@type": "Recipe",
      name: "Test",
      recipeInstructions: [
        { "@type": "HowToStep", text: "Step one." },
        { "@type": "HowToStep", text: "Step two." },
      ],
    };
    const out = normalizeRecipe(recipe as Record<string, unknown>);
    expect(out!.instructions).toHaveLength(2);
    expect(out!.instructions[0]).toBe("Step one.");
    expect(out!.instructions[1]).toBe("Step two.");
  });

  it("splits string instruction with numbered steps and strips number bullets", () => {
    const recipe = {
      "@type": "Recipe",
      name: "Test",
      recipeInstructions: "1. First step. 2. Second step. 3. Third.",
    };
    const out = normalizeRecipe(recipe as Record<string, unknown>);
    expect(out!.instructions).toHaveLength(3);
    expect(out!.instructions[0]).toBe("First step.");
    expect(out!.instructions[1]).toBe("Second step.");
    expect(out!.instructions[2]).toBe("Third.");
  });

  it("returns null for missing name", () => {
    const out = normalizeRecipe({ recipeIngredient: ["flour"] });
    expect(out).toBeNull();
  });

  it("parses ISO 8601 durations into minutes", () => {
    const recipe = {
      name: "Timed Recipe",
      prepTime: "PT15M",
      cookTime: "PT1H30M",
    };
    const out = normalizeRecipe(recipe);
    expect(out!.prepTimeMinutes).toBe(15);
    expect(out!.cookTimeMinutes).toBe(90);
    expect(out!.totalTimeMinutes).toBe(105);
  });

  it("handles ItemList-wrapped instructions", () => {
    const recipe = {
      name: "Wrapped",
      recipeInstructions: {
        itemListElement: [
          { "@type": "HowToStep", text: "Do this." },
          { "@type": "HowToStep", text: "Then that." },
        ],
      },
    };
    const out = normalizeRecipe(recipe as Record<string, unknown>);
    expect(out!.instructions).toEqual(["Do this.", "Then that."]);
  });

  it("extracts image URL from object with url property", () => {
    const recipe = {
      name: "With Image",
      image: { url: "https://example.com/photo.jpg" },
    };
    const out = normalizeRecipe(recipe as Record<string, unknown>);
    expect(out!.imageUrl).toBe("https://example.com/photo.jpg");
  });
});
