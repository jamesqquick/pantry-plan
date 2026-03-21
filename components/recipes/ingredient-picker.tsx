"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CatalogItem = { id: string; name: string };

export function IngredientPicker({
  catalog,
  value,
  onChange,
  placeholder = "Choose ingredient",
}: {
  catalog: CatalogItem[];
  value: string;
  onChange: (ingredientId: string, name: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-[180px] w-full flex-col gap-1">
      <Select
        value={value || "__none__"}
        onValueChange={(id) => {
          if (id === "__none__") {
            onChange("", "");
            return;
          }
          const name = catalog.find((i) => i.id === id)?.name ?? "";
          onChange(id, name);
        }}
      >
        <SelectTrigger className="min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{placeholder}</SelectItem>
          {catalog.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
