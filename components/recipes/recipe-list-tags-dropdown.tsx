"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TRIGGER_CLASS =
  "rounded-input border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type RecipeListTagsDropdownProps = {
  tags: { id: string; name: string }[];
  currentTagId: string | null;
};

export function RecipeListTagsDropdown({
  tags,
  currentTagId,
}: RecipeListTagsDropdownProps) {
  const router = useRouter();

  if (tags.length === 0) return null;

  return (
    <div className="w-full sm:w-auto">
      <label htmlFor="recipe-tag-filter" className="sr-only">
        Filter by tag
      </label>
      <Select
        value={currentTagId ?? "__none__"}
        onValueChange={(v) => {
          router.push(
            v && v !== "__none__"
              ? `/recipes?tagId=${encodeURIComponent(v)}`
              : "/recipes"
          );
        }}
      >
        <SelectTrigger id="recipe-tag-filter" className={cn("w-full sm:w-auto", TRIGGER_CLASS)}>
          <SelectValue placeholder="All tags" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">All tags</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              {tag.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
