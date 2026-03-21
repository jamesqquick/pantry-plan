"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="min-w-0 flex-1">
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
        <SelectTrigger id="recipe-tag-filter" className="min-w-0">
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
