import { useState } from "react";
import { actions } from "astro:actions";

/**
 * Phase 5 verification: exercises every action namespace end-to-end so
 * we can confirm auth + Zod + Drizzle all talk to each other on D1.
 *
 * Not meant for production — removed when the real recipe/ingredient UIs
 * land in Phase 6+.
 */

type LogEntry = { label: string; value: unknown; ok: boolean };

export function ActionsPlayground() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  async function run<T>(
    label: string,
    fn: () => Promise<{ data: T | undefined; error: unknown }>
  ): Promise<T | undefined> {
    setPending(label);
    try {
      const { data, error } = await fn();
      setLog((prev) => [
        { label, value: error ?? data, ok: !error },
        ...prev,
      ]);
      return error ? undefined : data;
    } finally {
      setPending(null);
    }
  }

  async function tagsRoundTrip() {
    const name = `pp-test-${Date.now()}`;
    const form = new FormData();
    form.append("name", name);
    const created = await run(`tags.create ${name}`, () =>
      actions.tags.create(form)
    );
    if (!created) return;
    await run("tags.list", () => actions.tags.list());
    await run(`tags.searchForPicker ${name.slice(0, 6)}`, () =>
      actions.tags.searchForPicker({ query: name.slice(0, 6) })
    );
    const del = new FormData();
    del.append("id", created.id);
    await run("tags.delete", () => actions.tags.delete(del));
  }

  async function ingredientsSearch() {
    await run("ingredients.searchForPicker 'flour'", () =>
      actions.ingredients.searchForPicker({ query: "flour" })
    );
    await run("ingredients.searchGlobalForBase 'sugar'", () =>
      actions.ingredients.searchGlobalForBase({ query: "sugar" })
    );
  }

  async function recipesRoundTrip() {
    const title = `Test Recipe ${Date.now()}`;
    const created = await run(`recipes.create "${title}"`, () =>
      actions.recipes.create({
        title,
        instructions: ["Mix things", "Bake"],
        ingredientsStructured: [
          {
            sortOrder: 0,
            displayText: "2 cups flour",
            quantity: 2,
            unit: "CUP",
          },
        ],
        ingredients: [],
        tagIds: [],
      })
    );
    if (!created) return;

    await run("recipes.update (rename)", () =>
      actions.recipes.update({
        id: created.id,
        title: `${title} (renamed)`,
        ingredients: [],
        tagIds: [],
      })
    );

    const dup = new FormData();
    dup.append("recipeId", created.id);
    const duplicated = await run("recipes.duplicate", () =>
      actions.recipes.duplicate(dup)
    );

    const del = new FormData();
    del.append("id", created.id);
    await run("recipes.delete (original)", () => actions.recipes.delete(del));
    if (duplicated) {
      const delDup = new FormData();
      delDup.append("id", duplicated.id);
      await run("recipes.delete (duplicate)", () =>
        actions.recipes.delete(delDup)
      );
    }
  }

  async function mealPlanRoundTrip() {
    const today = new Date().toISOString().slice(0, 10);
    const created = await run("mealPlan.upsert (custom label)", () =>
      actions.mealPlan.upsert({
        date: today,
        mealSlot: "DINNER",
        customLabel: "Leftovers",
      })
    );
    if (!created) return;

    await run("mealPlan.update (servings=2)", () =>
      actions.mealPlan.update({ id: created.id, servings: 2 })
    );

    const del = new FormData();
    del.append("id", created.id);
    await run("mealPlan.delete", () => actions.mealPlan.delete(del));
  }

  const Button = ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!!pending}
      className="btn-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
    >
      {pending === label ? "…" : label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button label="Tags round-trip" onClick={tagsRoundTrip} />
        <Button label="Ingredients search" onClick={ingredientsSearch} />
        <Button label="Recipes round-trip" onClick={recipesRoundTrip} />
        <Button label="Meal plan round-trip" onClick={mealPlanRoundTrip} />
        <Button label="Clear log" onClick={() => setLog([])} />
      </div>
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Click a button above to call an action. Most recent call shows first.
        </p>
      ) : (
        <ul className="space-y-2">
          {log.map((entry, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-card p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    entry.ok
                      ? "inline-flex h-2 w-2 rounded-full bg-success"
                      : "inline-flex h-2 w-2 rounded-full bg-destructive"
                  }
                  aria-hidden="true"
                />
                <span className="font-mono font-semibold">{entry.label}</span>
              </div>
              <pre className="mt-2 overflow-auto rounded bg-panel p-2">
                <code>{JSON.stringify(entry.value, null, 2)}</code>
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
