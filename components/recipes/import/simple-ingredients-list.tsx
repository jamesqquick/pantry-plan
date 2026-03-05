"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EditableNumberedList } from "@/components/ui/editable-numbered-list";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type SimpleIngredientsListProps = {
  lines: string[];
  setLines: React.Dispatch<React.SetStateAction<string[]>>;
  idPrefix?: string;
};

export function SimpleIngredientsList({
  lines,
  setLines,
  idPrefix = "ingredient",
}: SimpleIngredientsListProps) {
  const list = lines.length === 0 ? [""] : lines;
  return (
    <Card>
      <CardContent>
        <SectionHeader
          variant="section"
          title="Ingredients"
          action={
            <Button
              type="button"
              variant="secondary"
              aria-label="Add ingredient"
              onClick={() => setLines((prev) => [...prev, ""])}
              className={cn(ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
            >
              <AppIcon name="add" size={18} aria-hidden />
            </Button>
          }
        />
        <EditableNumberedList
          items={list}
          onItemsChange={(next) =>
            setLines(next.length === 0 ? [""] : next)
          }
          placeholder="Ingredient line"
          removeLabel="Remove ingredient"
          minItems={1}
        />
      </CardContent>
    </Card>
  );
}
