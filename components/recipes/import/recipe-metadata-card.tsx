"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  RecipeTagPicker,
  type TagOption,
} from "@/components/recipes/recipe-tag-picker";
import type { ManualFormState } from "./import-wizard-helpers";

type RecipeMetadataCardProps = {
  metadataForm: ManualFormState;
  setMetadataForm: React.Dispatch<React.SetStateAction<ManualFormState>>;
  existingTagsState: TagOption[];
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  onSearchTags: (query: string) => Promise<TagOption[]>;
  onCreateTag: (name: string) => Promise<TagOption | null>;
  onDeleteTag: (tagId: string) => Promise<boolean>;
  idPrefix?: string;
};

export function RecipeMetadataCard({
  metadataForm,
  setMetadataForm,
  existingTagsState,
  selectedTagIds,
  setSelectedTagIds,
  onSearchTags,
  onCreateTag,
  onDeleteTag,
  idPrefix = "mapping-",
}: RecipeMetadataCardProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
          Recipe Metadata
        </h2>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label
            htmlFor={`${idPrefix}title`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Title *
          </label>
          <Input
            id={`${idPrefix}title`}
            value={metadataForm.title}
            onChange={(e) =>
              setMetadataForm((p) => ({ ...p, title: e.target.value }))
            }
            placeholder="Recipe title"
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}sourceUrl`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Source URL
          </label>
          <Input
            id={`${idPrefix}sourceUrl`}
            type="url"
            value={metadataForm.sourceUrl}
            onChange={(e) =>
              setMetadataForm((p) => ({ ...p, sourceUrl: e.target.value }))
            }
            placeholder="https://..."
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}imageUrl`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Image URL
          </label>
          <Input
            id={`${idPrefix}imageUrl`}
            type="url"
            value={metadataForm.imageUrl}
            onChange={(e) =>
              setMetadataForm((p) => ({ ...p, imageUrl: e.target.value }))
            }
            placeholder="https://..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label
              htmlFor={`${idPrefix}servings`}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Servings
            </label>
            <Input
              id={`${idPrefix}servings`}
              type="number"
              min={0}
              value={metadataForm.servings}
              onChange={(e) =>
                setMetadataForm((p) => ({ ...p, servings: e.target.value }))
              }
              placeholder="—"
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}prep`}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Prep (min)
            </label>
            <Input
              id={`${idPrefix}prep`}
              type="number"
              min={0}
              value={metadataForm.prepTimeMinutes}
              onChange={(e) =>
                setMetadataForm((p) => ({
                  ...p,
                  prepTimeMinutes: e.target.value,
                }))
              }
              placeholder="—"
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}cook`}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Cook (min)
            </label>
            <Input
              id={`${idPrefix}cook`}
              type="number"
              min={0}
              value={metadataForm.cookTimeMinutes}
              onChange={(e) =>
                setMetadataForm((p) => ({
                  ...p,
                  cookTimeMinutes: e.target.value,
                }))
              }
              placeholder="—"
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}total`}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Total (min)
            </label>
            <Input
              id={`${idPrefix}total`}
              type="number"
              min={0}
              value={metadataForm.totalTimeMinutes}
              onChange={(e) =>
                setMetadataForm((p) => ({
                  ...p,
                  totalTimeMinutes: e.target.value,
                }))
              }
              placeholder="—"
            />
          </div>
        </div>
        <RecipeTagPicker
          existingTags={existingTagsState}
          selectedTagIds={selectedTagIds}
          onChange={setSelectedTagIds}
          onSearchTags={onSearchTags}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
        />
        <div>
          <label
            htmlFor={`${idPrefix}notes`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Notes
          </label>
          <Textarea
            id={`${idPrefix}notes`}
            rows={3}
            value={metadataForm.notes}
            onChange={(e) =>
              setMetadataForm((p) => ({ ...p, notes: e.target.value }))
            }
            placeholder="Optional notes"
          />
        </div>
      </CardContent>
    </Card>
  );
}
