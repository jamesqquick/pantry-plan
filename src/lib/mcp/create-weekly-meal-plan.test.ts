import { describe, expect, it, vi } from "vitest";
import { createWeeklyMealPlan } from "./create-weekly-meal-plan";

function createFakeDb(ownedRecipeIds: string[]) {
  const batch = vi.fn();
  const deletes: unknown[] = [];
  const inserts: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: async () => ownedRecipeIds.map((id) => ({ id })),
      }),
    }),
    delete: () => ({
      where: (predicate: unknown) => {
        deletes.push(predicate);
        return { type: "delete" };
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        inserts.push(value);
        return { type: "insert", value };
      },
    }),
    batch,
  };
  return { db: db as never, batch, deletes, inserts };
}

describe("createWeeklyMealPlan", () => {
  it("validates ownership before replacing a week", async () => {
    const { db, batch } = createFakeDb([]);

    await expect(
      createWeeklyMealPlan(db, "user-1", {
        weekStart: "2026-09-02",
        meals: [
          { date: "2026-09-05", mealSlot: "DINNER", recipeId: "recipe-1" },
        ],
      }),
    ).rejects.toThrow("do not belong");
    expect(batch).not.toHaveBeenCalled();
  });

  it("normalizes week start and batches deletion plus inserts", async () => {
    const { db, batch, deletes, inserts } = createFakeDb(["recipe-1"]);

    const result = await createWeeklyMealPlan(db, "user-1", {
      weekStart: "2026-09-02",
      meals: [
        { date: "2026-09-05", mealSlot: "DINNER", recipeId: "recipe-1" },
      ],
    });

    expect(result).toEqual({ weekStart: "2026-08-30", mealCount: 1 });
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0]![0]).toHaveLength(2);
    expect(deletes).toHaveLength(1);
    expect(inserts).toEqual([
      {
        userId: "user-1",
        date: new Date("2026-09-05T00:00:00.000Z"),
        mealSlot: "DINNER",
        recipeId: "recipe-1",
        customLabel: null,
        servings: null,
      },
    ]);
  });
});
