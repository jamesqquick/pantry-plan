import { describe, expect, it } from "vitest";
import { buildPreferredIngredientMap } from "./recipe-mapping";

describe("buildPreferredIngredientMap", () => {
  it("prefers a user-owned ingredient over a global ingredient", () => {
    const preferred = buildPreferredIngredientMap(
      [
        { id: "global", normalizedName: "salt", userId: null },
        { id: "custom", normalizedName: "salt", userId: "user-1" },
      ],
      "user-1",
    );

    expect(preferred.get("salt")?.id).toBe("custom");
  });

  it("uses the stable lowest id for equal-scope duplicates", () => {
    const preferred = buildPreferredIngredientMap(
      [
        { id: "global-z", normalizedName: "salt", userId: null },
        { id: "global-a", normalizedName: "salt", userId: null },
      ],
      "user-1",
    );

    expect(preferred.get("salt")?.id).toBe("global-a");
  });
});
