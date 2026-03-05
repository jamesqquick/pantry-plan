import { IngredientRow } from "./ingredient-row";

export type RecipeIngredientForList = {
  id: string;
  displayText: string;
  displayLine?: string;
  ingredient?: { id: string; name: string };
  matchType?: string;
  confidence?: number;
  source?: "base" | "override" | "add";
};

type RecipeIngredientListProps = {
  recipeId: string;
  recipeIngredients: RecipeIngredientForList[];
  rawIngredients?: string[];
};

export function RecipeIngredientList({
  recipeId,
  recipeIngredients,
  rawIngredients = [],
}: RecipeIngredientListProps) {
  const mappedLines = new Set(recipeIngredients.map((ri) => ri.displayText));
  const unmappedLines = rawIngredients.filter((line) => !mappedLines.has(line));

  const rows: Array<{
    key: string;
    originalLine: string;
    displayLine?: string;
    mappedIngredientName?: string;
    matchType?: string;
    confidence?: number;
    isMapped: boolean;
    source?: "base" | "override" | "add";
  }> = [
    ...recipeIngredients.map((ri) => ({
      key: ri.id,
      originalLine: ri.displayText,
      displayLine: ri.displayLine,
      mappedIngredientName: ri.ingredient?.name,
      matchType: ri.matchType,
      confidence: ri.confidence,
      isMapped: Boolean(ri.ingredient),
      source: ri.source,
    })),
    ...unmappedLines.map((line, i) => ({
      key: `unmapped-${i}-${line.slice(0, 20)}`,
      originalLine: line,
      isMapped: false,
    })),
  ];

  return (
    <ol className="mt-2 list-none space-y-0 pl-0" role="list">
      {rows.map((row, index) => (
        <IngredientRow
          key={row.key}
          number={index + 1}
          originalLine={row.originalLine}
          displayLine={row.displayLine}
          mappedIngredientName={row.mappedIngredientName}
          matchType={row.matchType}
          confidence={row.confidence}
          recipeId={recipeId}
          isMapped={row.isMapped}
          isLast={index === rows.length - 1}
          source={row.source}
        />
      ))}
    </ol>
  );
}
