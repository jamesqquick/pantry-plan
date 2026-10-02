import { describe, expect, it } from "vitest";
import { formatTotalTime, monogram, sourceLabel, toneFor, topTags } from "./recipe-card-utils";

describe("formatTotalTime", () => {
  it.each([
    [90, 10, 20, "1 hr 30 min"],
    [60, null, null, "1 hr"],
    [null, 20, 25, "45 min"],
    [null, 15, null, "15 min"],
    [null, null, 70, "1 hr 10 min"],
    [0, 10, 20, "0 min"],
    [null, null, null, null],
  ])("formats total %s with prep %s and cook %s", (totalTimeMinutes, prepTimeMinutes, cookTimeMinutes, expected) => {
    expect(formatTotalTime({ totalTimeMinutes, prepTimeMinutes, cookTimeMinutes })).toBe(expected);
  });
});

describe("sourceLabel", () => {
  it.each([
    ["https://www.example.com/recipes/cake", "example.com"],
    ["https://recipes.example.com/cake", "recipes.example.com"],
    [null, "Your recipe"],
    ["not a url", "Your recipe"],
    ["javascript:alert(1)", "Your recipe"],
  ])("labels %s", (url, expected) => {
    expect(sourceLabel(url)).toBe(expected);
  });
});

describe("fallback tiles", () => {
  it.each([
    ["Chocolate Icing", "Ci"],
    ["The Churros with Chocolate Sauce", "Cs"],
    ["  brownies  ", "B"],
    ["Éclair à la Vanille", "Év"],
    ["", "?"],
    ["and the", "?"],
  ])("creates a monogram for %s", (title, expected) => {
    expect(monogram(title)).toBe(expected);
  });

  it("keeps each title's tone stable when recipe order changes", () => {
    const titles = ["Chocolate Icing", "Vanilla Cake", "Brownies"];
    const original = new Map(titles.map((title) => [title, toneFor(title)]));
    for (const title of titles.toReversed()) {
      expect(toneFor(title)).toBe(original.get(title));
      expect(["butter", "tomato", "olive"]).toContain(toneFor(title));
    }
  });
});

describe("topTags", () => {
  it("excludes unused tags and sorts by usage, then name, without mutating input", () => {
    const tags = [
      { id: "b", name: "breakfast", n: 2 },
      { id: "d", name: "dessert", n: 5 },
      { id: "a", name: "appetizer", n: 2 },
      { id: "u", name: "unused", n: 0 },
    ];
    expect(topTags(tags).map((tag) => tag.id)).toEqual(["d", "a", "b"]);
    expect(tags.map((tag) => tag.id)).toEqual(["b", "d", "a", "u"]);
  });
});
