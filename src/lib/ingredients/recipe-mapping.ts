export const NEW_INGREDIENT_INSERT_PARAMS_PER_ROW = 5;

export type IngredientResolutionRow = {
  id: string;
  normalizedName: string;
  userId: string | null;
};

export function buildPreferredIngredientMap(
  rows: readonly IngredientResolutionRow[],
  userId: string,
): Map<string, IngredientResolutionRow> {
  const preferred = new Map<string, IngredientResolutionRow>();

  for (const row of rows) {
    if (row.userId !== null && row.userId !== userId) continue;

    const current = preferred.get(row.normalizedName);
    if (!current) {
      preferred.set(row.normalizedName, row);
      continue;
    }

    const rowIsUserOwned = row.userId === userId;
    const currentIsUserOwned = current.userId === userId;
    if (
      (rowIsUserOwned && !currentIsUserOwned) ||
      (rowIsUserOwned === currentIsUserOwned && row.id < current.id)
    ) {
      preferred.set(row.normalizedName, row);
    }
  }

  return preferred;
}
