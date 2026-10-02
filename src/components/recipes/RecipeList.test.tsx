// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeList, { type RecipeCardData } from "./RecipeList";

afterEach(cleanup);

const allTags = Array.from({ length: 8 }, (_, i) => ({ id: `tag-${i}`, name: `tag ${i}`, n: 8 - i }));
const recipes: RecipeCardData[] = [
  {
    id: "cake", title: "Chocolate Cake", imageUrl: null,
    sourceUrl: "https://www.example.com/cake", servings: 8,
    prepTimeMinutes: 20, cookTimeMinutes: 40, totalTimeMinutes: 75,
    lastViewedAt: null, updatedAt: 1, tags: allTags,
  },
  {
    id: "pasta", title: "Tomato Pasta", imageUrl: "/pasta.jpg",
    sourceUrl: null, servings: null,
    prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null,
    lastViewedAt: null, updatedAt: 2, tags: [allTags[0]],
  },
];

describe("RecipeList", () => {
  it("combines fuzzy title search with exact tag filtering and resets both", async () => {
    const user = userEvent.setup();
    render(<RecipeList recipes={recipes} allTags={allTags} />);
    await user.type(screen.getByRole("searchbox"), "choclate");
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 2");
    expect(screen.queryByRole("heading", { name: "Tomato Pasta" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tag 1 7" }));
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "pasta");
    expect(screen.getByRole("heading", { name: "Nothing here yet." })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByRole("status").textContent).toBe("Showing 2 of 2");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });

  it("expands tags and keeps a selected overflow tag visible after collapsing", async () => {
    const user = userEvent.setup();
    render(<RecipeList recipes={recipes} allTags={[...allTags, { id: "unused", name: "unused", n: 0 }]} />);
    expect(screen.queryByRole("button", { name: "Tag 7 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Unused/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "+2 more" }));
    await user.click(screen.getByRole("button", { name: "Tag 7 1" }));
    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByRole("button", { name: "Tag 7 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "+1 more" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 2");
    await user.click(screen.getByRole("button", { name: "All 2" }));
    expect(screen.getByRole("status").textContent).toBe("Showing 2 of 2");
  });

  it("focuses search with slash but leaves editable fields and modified shortcuts alone", async () => {
    const user = userEvent.setup();
    render(<><input aria-label="Another field" /><textarea aria-label="Notes" /><div contentEditable="true" role="textbox" aria-label="Editable notes" /><RecipeList recipes={recipes} allTags={[]} /></>);
    const search = screen.getByRole("searchbox");
    await user.keyboard("/");
    expect(document.activeElement).toBe(search);
    const other = screen.getByRole("textbox", { name: "Another field" });
    await user.click(other);
    await user.keyboard("/");
    expect(document.activeElement).toBe(other);
    expect((other as HTMLInputElement).value).toBe("/");
    for (const name of ["Notes", "Editable notes"]) {
      const field = screen.getByRole("textbox", { name });
      await user.click(field);
      await user.keyboard("/");
      expect(document.activeElement).toBe(field);
    }
    await user.click(screen.getByRole("button", { name: "All 2" }));
    await user.keyboard("{Control>}/{/Control}");
    expect(document.activeElement).not.toBe(search);
  });

  it("shows source, total time and bounded tags with a separate edit-photo link", () => {
    render(<RecipeList recipes={recipes} allTags={[]} />);
    const cake = screen.getByRole("heading", { name: "Chocolate Cake" }).closest("article")!;
    expect(within(cake).getByText("example.com")).toBeDefined();
    expect(within(cake).getByText("1 hr 15 min")).toBeDefined();
    expect(within(cake).getByText("8 servings")).toBeDefined();
    expect(within(cake).getByText("+6")).toBeDefined();
    expect(within(cake).queryByText("Tag 2")).toBeNull();
    const photo = within(cake).getByRole("link", { name: "Add photo to Chocolate Cake" });
    expect(photo.getAttribute("href")).toBe("/recipes/cake/edit");
    expect(photo.parentElement?.closest("a")).toBeNull();
    const pasta = screen.getByRole("heading", { name: "Tomato Pasta" }).closest("article")!;
    expect(within(pasta).getByText("Your recipe")).toBeDefined();
    expect(within(pasta).queryByRole("link", { name: /Add photo/ })).toBeNull();
    expect(within(pasta).queryByText(/No timing|servings/)).toBeNull();
  });

  it("offers recipe creation when the collection is empty", () => {
    render(<RecipeList recipes={[]} allTags={[]} />);
    expect(screen.getByRole("heading", { name: "Your recipe box is empty" })).toBeDefined();
    expect(screen.getByRole("link", { name: "New recipe" }).getAttribute("href")).toBe("/recipes/new");
  });
});
