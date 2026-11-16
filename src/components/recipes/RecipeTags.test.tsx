// @vitest-environment jsdom

import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeTags } from "./RecipeTags";

afterEach(cleanup);

const allTags = [
  { id: "dinner", name: "Dinner" },
  { id: "dessert", name: "Dessert" },
  { id: "weekday", name: "Weekday" },
];

function TagHarness({ selected = [] }: { selected?: string[] }) {
  const [selectedTagIds, setSelectedTagIds] = useState(new Set(selected));
  const [newTagNames, setNewTagNames] = useState<string[]>([]);

  return <RecipeTags
    allTags={allTags}
    selectedTagIds={selectedTagIds}
    newTagNames={newTagNames}
    onToggleTag={(id) => setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    })}
    onNewTagNamesChange={setNewTagNames}
  />;
}

it("starts with no tags shown and filters existing tags only while searching", async () => {
  const user = userEvent.setup();
  render(<TagHarness />);

  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByRole("group", { name: "Selected tags" })).toBeNull();

  const search = screen.getByRole("combobox", { name: "Search tags" });
  await user.type(search, "din");
  expect(screen.getByRole("option", { name: "Dinner" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Dessert" })).toBeNull();
  expect(screen.getByRole("option", { name: "Create “din”" })).toBeTruthy();

  await user.click(screen.getByRole("option", { name: "Dinner" }));
  expect(search).toHaveProperty("value", "");
  expect(screen.queryByRole("listbox")).toBeNull();
  const selected = screen.getByRole("group", { name: "Selected tags" });
  const removeDinner = within(selected).getByRole("button", { name: "Remove Dinner from recipe" });
  expect(removeDinner.querySelector("svg")).toBeTruthy();
  expect(within(selected).queryByRole("button", { name: "Remove Dessert from recipe" })).toBeNull();

  await user.click(removeDinner);
  expect(screen.queryByRole("group", { name: "Selected tags" })).toBeNull();
});

it("offers create beside partial matches, but not for an existing or staged exact name", async () => {
  const user = userEvent.setup();
  render(<TagHarness />);
  const search = screen.getByRole("combobox", { name: "Search tags" });

  await user.type(search, "Dinner party");
  await user.click(screen.getByRole("option", { name: "Create “Dinner party”" }));
  const removeStaged = within(screen.getByRole("group", { name: "Selected tags" }))
    .getByRole("button", { name: "Remove Dinner party from recipe" });
  expect(removeStaged.querySelector("svg")).toBeTruthy();

  await user.type(search, "Dinner party");
  expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  expect(screen.getByText("Tag already selected.")).toBeTruthy();
  await user.clear(search);
  await user.type(search, "DINNER");
  expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();

  await user.click(removeStaged);
  expect(screen.queryByRole("group", { name: "Selected tags" })).toBeNull();
  await user.clear(search);
  await user.type(search, "Dinner party");
  expect(screen.getByRole("option", { name: "Create “Dinner party”" })).toBeTruthy();
});

it("supports keyboard selection and Escape without submitting the recipe form", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><TagHarness selected={["weekday"]} /></form>);
  const search = screen.getByRole("combobox", { name: "Search tags" });

  expect(within(screen.getByRole("group", { name: "Selected tags" }))
    .getByRole("button", { name: "Remove Weekday from recipe" })).toBeTruthy();
  await user.type(search, "dess");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(within(screen.getByRole("group", { name: "Selected tags" }))
    .getByRole("button", { name: "Remove Dessert from recipe" })).toBeTruthy();

  await user.type(search, "Cake");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(within(screen.getByRole("group", { name: "Selected tags" }))
    .getByRole("button", { name: "Remove Cake from recipe" })).toBeTruthy();
  await user.type(search, "Cake");
  await user.keyboard("{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();

  await user.clear(search);
  await user.type(search, " ");
  await user.keyboard("{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.clear(search);
  await user.type(search, "din");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.type(search, "ner");
  expect(screen.getByRole("option", { name: "Dinner" })).toBeTruthy();
});
