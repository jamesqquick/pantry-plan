"use client";

import { saveImportedRecipeWithMappingsAction } from "@/app/actions/import.actions";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import { RecipeMetadataCard } from "./recipe-metadata-card";
import { SimpleIngredientsList } from "./simple-ingredients-list";
import { InstructionsListCard } from "./instructions-list-card";
import { IngredientMappingCard } from "./ingredient-mapping-card";
import { RecipeDetailsActions } from "./recipe-details-actions";
import type { ManualFormState } from "./import-wizard-helpers";
import type { MappingRow } from "./ingredient-mapping-table";
import type { TagOption } from "@/components/recipes/recipe-tag-picker";

type CatalogItem = { id: string; name: string };

export type RecipeDetailsSectionProps = {
  metadataForm: ManualFormState;
  setMetadataForm: React.Dispatch<React.SetStateAction<ManualFormState>>;
  rows: MappingRow[];
  setRows: React.Dispatch<React.SetStateAction<MappingRow[]>>;
  suggestions: SuggestionItem[];
  instructionsList: string[];
  setInstructionsList: React.Dispatch<React.SetStateAction<string[]>>;
  existingTagsState: TagOption[];
  setExistingTagsState: React.Dispatch<React.SetStateAction<TagOption[]>>;
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  onSearchTags: (query: string) => Promise<TagOption[]>;
  onCreateTag: (name: string) => Promise<TagOption | null>;
  onDeleteTag: (tagId: string) => Promise<boolean>;
  ingredientsCatalog: CatalogItem[];
  onSearchIngredients: (query: string) => Promise<CatalogItem[]>;
  saveState: Awaited<
    ReturnType<typeof saveImportedRecipeWithMappingsAction>
  > | null;
  saveLoading: boolean;
  saveAndEnhanceLoading?: boolean;
  onSave: () => void;
  saveDisabled: boolean;
  firstNeedsAttentionRef: React.RefObject<HTMLDivElement | null>;
  simpleIngredientLines?: string[];
  setSimpleIngredientLines?: React.Dispatch<React.SetStateAction<string[]>>;
  onSaveAndEnhance?: () => void | Promise<void>;
};

export function RecipeDetailsSection(props: RecipeDetailsSectionProps) {
  const {
    metadataForm,
    setMetadataForm,
    rows,
    setRows,
    suggestions,
    instructionsList,
    setInstructionsList,
    existingTagsState,
    selectedTagIds,
    setSelectedTagIds,
    onSearchTags,
    onCreateTag,
    onDeleteTag,
    ingredientsCatalog,
    onSearchIngredients,
    saveState,
    saveLoading,
    saveAndEnhanceLoading,
    onSave,
    saveDisabled,
    firstNeedsAttentionRef,
    simpleIngredientLines,
    setSimpleIngredientLines,
    onSaveAndEnhance,
  } = props;

  const useSimpleIngredients =
    simpleIngredientLines != null && setSimpleIngredientLines != null;
  const linesWithContent = rows.filter((r) => r.rawText.trim());
  const needsAttentionCount = linesWithContent.filter(
    (r) =>
      (!r.ingredientId && !r.createName?.trim()) ||
      !r.quantityText?.trim() ||
      !r.unit,
  ).length;
  const completeCount = Math.max(
    0,
    linesWithContent.length - needsAttentionCount,
  );
  const firstNeedsAttentionIndex = linesWithContent.findIndex(
    (r) =>
      (!r.ingredientId && !r.createName?.trim()) ||
      !r.quantityText?.trim() ||
      !r.unit,
  );
  const fieldErrors =
    saveState && !saveState.ok && saveState.error?.fieldErrors
      ? saveState.error.fieldErrors
      : undefined;

  return (
    <div className="space-y-6">
      <RecipeMetadataCard
        metadataForm={metadataForm}
        setMetadataForm={setMetadataForm}
        existingTagsState={existingTagsState}
        selectedTagIds={selectedTagIds}
        setSelectedTagIds={setSelectedTagIds}
        onSearchTags={onSearchTags}
        onCreateTag={onCreateTag}
        onDeleteTag={onDeleteTag}
      />
      {useSimpleIngredients ? (
        <SimpleIngredientsList
          lines={simpleIngredientLines!}
          setLines={setSimpleIngredientLines!}
        />
      ) : (
        <IngredientMappingCard
          title="Ingredients"
          rows={rows}
          setRows={setRows}
          suggestions={suggestions}
          catalog={ingredientsCatalog}
          onSearchIngredients={onSearchIngredients}
          fieldErrors={fieldErrors}
          firstNeedsAttentionIndex={firstNeedsAttentionIndex}
          firstNeedsAttentionRef={firstNeedsAttentionRef}
          completeCount={completeCount}
          needsAttentionCount={needsAttentionCount}
          linesWithContentLength={linesWithContent.length}
        />
      )}
      <InstructionsListCard
        instructionsList={instructionsList}
        setInstructionsList={setInstructionsList}
      />
      {useSimpleIngredients && linesWithContent.length > 0 && (
        <IngredientMappingCard
          title="Ingredient mapping"
          rows={rows}
          setRows={setRows}
          suggestions={suggestions}
          catalog={ingredientsCatalog}
          onSearchIngredients={onSearchIngredients}
          fieldErrors={fieldErrors}
          firstNeedsAttentionIndex={firstNeedsAttentionIndex}
          firstNeedsAttentionRef={firstNeedsAttentionRef}
          completeCount={completeCount}
          needsAttentionCount={needsAttentionCount}
          linesWithContentLength={linesWithContent.length}
        />
      )}
      {saveState &&
        !saveState.ok &&
        saveState.error?.message &&
        !saveState.error?.fieldErrors && (
          <p className="text-sm text-destructive" role="alert">
            {saveState.error.message}
          </p>
        )}
      <RecipeDetailsActions
        useSimpleIngredients={useSimpleIngredients}
        linesWithContentLength={linesWithContent.length}
        onSaveAndEnhance={onSaveAndEnhance}
        onSave={onSave}
        saveDisabled={saveDisabled}
        saveLoading={saveLoading}
        saveAndEnhanceLoading={saveAndEnhanceLoading}
      />
    </div>
  );
}
