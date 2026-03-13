"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SortableInstructionsList } from "@/components/ui/sortable-instructions-list";

type SimpleIngredientsListProps = {
  lines: string[];
  setLines: React.Dispatch<React.SetStateAction<string[]>>;
  idPrefix?: string;
};

export function SimpleIngredientsList({
  lines,
  setLines,
}: SimpleIngredientsListProps) {
  const list = lines.length === 0 ? [""] : lines;
  return (
    <Card>
      <CardContent>
        <SectionHeader variant="section" title="Ingredients" />
        <SortableInstructionsList
          items={list}
          onItemsChange={(next) =>
            setLines(next.length === 0 ? [""] : next)
          }
          placeholder="Ingredient line"
          removeLabel="Remove ingredient"
          addLabel="Add ingredient"
          minItems={1}
          onAdd={() => setLines((prev) => [...prev, ""])}
        />
      </CardContent>
    </Card>
  );
}
