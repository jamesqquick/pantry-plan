"use client";

import {
  useActionState,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  createRecipeAction,
  updateRecipeAction,
} from "@/app/actions/recipes.actions";
import {
  createTagAction,
  deleteTagAction,
  searchTagsForPickerAction,
} from "@/app/actions/tags.actions";
import {
  createIngredientAction,
  searchIngredientsForPickerAction,
} from "@/app/actions/ingredients.actions";
import type { ParsedRecipeDraft } from "@/app/actions/parse.actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { IngredientEditorRow } from "@/components/recipes/ingredient-editor-row";
import { RecipeIngredientList } from "@/components/recipes/ingredient-list";
import {
  RecipeTagPicker,
  type TagOption,
} from "@/components/recipes/recipe-tag-picker";
import type { IngredientUnit } from "@/generated/prisma/client";
import { formatQuantity, parseQuantityText } from "@/lib/quantity/quantity";
import { formatIngredientLineFromStructured } from "@/lib/ingredientLineFormat";
import { cn } from "@/lib/cn";

type CreateProps = {
  mode: "create";
  initialValues?: ParsedRecipeDraft | null;
  existingTags?: TagOption[];
  initialStructuredItems?: StructuredItem[];
  ingredientsCatalog?: { id: string; name: string }[];
  preserveDisplayText?: boolean;
};

type StructuredItem = {
  ingredientId: string;
  ingredientName: string;
  quantity?: number | null;
  unit?: IngredientUnit | null;
  displayText: string;
  rawText?: string | null;
  isLineTextOverridden?: boolean;
  sortOrder: number;
};

type EditProps = {
  mode: "edit";
  recipeId: string;
  initialValues: {
    title: string;
    sourceUrl?: string;
    imageUrl?: string;
    servings?: number;
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    totalTimeMinutes?: number;
    ingredients: string[];
    instructions: string[];
    notes?: string;
  };
  initialStructuredItems?: StructuredItem[];
  ingredientsCatalog?: { id: string; name: string }[];
  ingredientsEnhanced?: boolean;
  preserveDisplayText?: boolean;
  existingTags?: TagOption[];
  initialTagIds?: string[];
};

type Props = CreateProps | EditProps;

const defaultIngredient = "";
const defaultInstruction = "";

type MergedIngredientRow = {
  displayText: string;
  isLineTextOverridden: boolean;
  ingredientId: string;
  ingredientName: string;
  quantityText: string;
  unit: IngredientUnit | null;
  rawText?: string | null;
};

function defaultMergedRow(displayText = ""): MergedIngredientRow {
  return {
    displayText,
    isLineTextOverridden: false,
    ingredientId: "",
    ingredientName: "",
    quantityText: "",
    unit: null,
  };
}

export function RecipeForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const ingredientsEnhanced = isEdit
    ? ((props as EditProps).ingredientsEnhanced ?? true)
    : true;
  const hasStructured =
    (isEdit &&
      "initialStructuredItems" in props &&
      "ingredientsCatalog" in props &&
      props.initialStructuredItems != null &&
      props.ingredientsCatalog != null) ||
    (!isEdit &&
      "initialStructuredItems" in props &&
      (props as CreateProps).initialStructuredItems != null);

  const [ingredients, setIngredients] = useState<string[]>([defaultIngredient]);
  const [instructions, setInstructions] = useState<string[]>([
    defaultInstruction,
  ]);
  const [mergedIngredients, setMergedIngredients] = useState<
    MergedIngredientRow[]
  >([]);
  const [ingredientsCatalogState, setIngredientsCatalogState] = useState<
    { id: string; name: string }[]
  >([]);
  const existingTagsProp = isEdit
    ? ((props as EditProps).existingTags ?? [])
    : ((props as CreateProps).existingTags ?? []);
  const initialTagIds =
    isEdit && (props as EditProps).initialTagIds
      ? (props as EditProps).initialTagIds!
      : [];
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds);
  const [existingTagsState, setExistingTagsState] =
    useState<TagOption[]>(existingTagsProp);

  const initial = isEdit ? props.initialValues : (props.initialValues ?? null);
  const hasInitial =
    initial &&
    (initial.ingredients?.length > 0 || initial.instructions?.length > 0);

  useEffect(() => {
    if (!hasInitial || !initial) return;
    queueMicrotask(() => {
      setIngredients(
        initial.ingredients.length > 0
          ? [...initial.ingredients]
          : [defaultIngredient],
      );
      setInstructions(
        initial.instructions.length > 0
          ? [...initial.instructions]
          : [defaultInstruction],
      );
    });
  }, [hasInitial, initial?.ingredients?.length, initial?.instructions?.length]);

  useEffect(() => {
    if (!hasStructured) return;
    const catalog =
      isEdit && "ingredientsCatalog" in props
        ? (props as EditProps).ingredientsCatalog
        : !isEdit && "ingredientsCatalog" in props
          ? (props as CreateProps).ingredientsCatalog
          : undefined;
    if (catalog && catalog.length > 0) {
      queueMicrotask(() => {
        setIngredientsCatalogState((prev) =>
          prev.length > catalog!.length ? prev : catalog!,
        );
      });
    }
  }, [hasStructured, isEdit, props]);

  useEffect(() => {
    queueMicrotask(() => {
      setExistingTagsState((prev) =>
        existingTagsProp.length >= prev.length ? existingTagsProp : prev,
      );
    });
  }, [existingTagsProp]);

  useEffect(() => {
    if (isEdit && initialTagIds.length > 0) {
      queueMicrotask(() => setSelectedTagIds(initialTagIds));
    }
  }, [isEdit, initialTagIds.length]);

  const mergedInitializedRef = useRef(false);
  const initialStructuredItemsForMerge =
    isEdit && "initialStructuredItems" in props
      ? (props as EditProps).initialStructuredItems
      : !isEdit && "initialStructuredItems" in props
        ? (props as CreateProps).initialStructuredItems
        : null;
  useEffect(() => {
    if (!hasStructured || !initial) return;
    const initialStructuredItems = initialStructuredItemsForMerge;
    if (!initialStructuredItems?.length) return;
    if (mergedInitializedRef.current) return;
    mergedInitializedRef.current = true;
    const structured = initialStructuredItems
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const raw = initial.ingredients ?? [];
    const preserveDisplayText =
      (isEdit && (props as EditProps).preserveDisplayText) ||
      (!isEdit && (props as CreateProps).preserveDisplayText) ||
      false;
    const structuredToMerged = (
      s: StructuredItem,
      displayText: string,
      rawText?: string | null,
    ) => {
      const quantityText =
        s.quantity != null && Number.isFinite(s.quantity)
          ? formatQuantity(s.quantity)
          : "";
      return {
        ...defaultMergedRow(displayText),
        displayText: displayText || s.displayText?.trim() || "",
        isLineTextOverridden:
          preserveDisplayText || (s.isLineTextOverridden ?? false),
        ingredientId: s.ingredientId ?? "",
        ingredientName: s.ingredientName ?? "",
        quantityText,
        unit: s.unit ?? null,
        rawText: rawText ?? s.rawText ?? undefined,
      };
    };

    const rows: MergedIngredientRow[] =
      raw.length > 0
        ? raw.map((line, i) => {
            const s = structured.find((st) => st.sortOrder === i);
            const displayText = s?.displayText?.trim() || line || "";
            if (!s)
              return {
                ...defaultMergedRow(displayText),
                displayText: displayText || line,
                rawText: line || undefined,
              };
            return {
              ...structuredToMerged(s, displayText, line),
              displayText: displayText || s.displayText,
            };
          })
        : structured.map((s) =>
            structuredToMerged(s, s.displayText?.trim() || "", s.rawText),
          );
    queueMicrotask(() =>
      setMergedIngredients(rows.length > 0 ? rows : [defaultMergedRow()]),
    );
  }, [
    hasStructured,
    initial?.ingredients,
    isEdit,
    initialStructuredItemsForMerge,
  ]);

  const [createState, createFormAction] = useActionState(
    createRecipeAction,
    null,
  );
  const [updateState, updateFormAction] = useActionState(
    updateRecipeAction,
    null,
  );
  const state = isEdit ? updateState : createState;

  useEffect(() => {
    if (state && state.ok && "data" in state && state.data?.id) {
      router.push(`/recipes/${state.data.id}`);
      router.refresh();
    }
  }, [state, router]);

  const formAction = isEdit ? updateFormAction : createFormAction;

  const addIngredient = () =>
    setIngredients((prev) => [...prev, defaultIngredient]);
  const removeIngredient = (i: number) =>
    setIngredients((prev) =>
      prev.length > 1 ? prev.filter((_, j) => j !== i) : prev,
    );

  const addMergedIngredient = useCallback(() => {
    setMergedIngredients((prev) => [...prev, defaultMergedRow()]);
  }, []);
  const removeMergedIngredient = useCallback((index: number) => {
    setMergedIngredients((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
  }, []);
  const updateMergedIngredient = useCallback(
    (index: number, patch: Partial<MergedIngredientRow>) => {
      setMergedIngredients((prev) =>
        prev.map((row, i) => {
          if (i !== index) return row;
          const next = { ...row, ...patch };
          const qtyChanged = patch.quantityText !== undefined;
          if (
            !next.isLineTextOverridden &&
            (qtyChanged ||
              patch.unit !== undefined ||
              patch.ingredientName !== undefined)
          ) {
            const qty = parseQuantityText(next.quantityText);
            next.displayText = formatIngredientLineFromStructured({
              quantity: qty ?? null,
              unit: next.unit,
              nameNormalized: null,
              ingredientName: next.ingredientName || null,
            });
          }
          return next;
        }),
      );
    },
    [],
  );

  const handleSearchIngredients = useCallback(async (query: string) => {
    const res = await searchIngredientsForPickerAction(query);
    return res.ok ? res.data : [];
  }, []);

  const handleSearchTags = useCallback(async (query: string) => {
    const res = await searchTagsForPickerAction(query);
    return res.ok ? res.data : [];
  }, []);

  const addInstruction = () =>
    setInstructions((prev) => [...prev, defaultInstruction]);
  const removeInstruction = (i: number) =>
    setInstructions((prev) =>
      prev.length > 1 ? prev.filter((_, j) => j !== i) : prev,
    );

  const fieldErrors =
    state && !state.ok ? (state.error?.fieldErrors ?? {}) : {};

  const structuredPayload =
    hasStructured && mergedIngredients.length > 0
      ? mergedIngredients.map((row, i) => ({
          ingredientId: row.ingredientId?.trim() || "",
          quantity: parseQuantityText(row.quantityText) ?? null,
          unit: row.unit ?? null,
          displayText: row.displayText.trim() || row.ingredientName || "—",
          isLineTextOverridden: row.isLineTextOverridden,
          rawText: row.rawText?.trim() || null,
          sortOrder: i,
        }))
      : [];

  return (
    <form action={formAction} className="space-y-6">
      {isEdit && <input type="hidden" name="id" value={props.recipeId} />}
      {selectedTagIds.map((id) => (
        <input key={id} type="hidden" name="tagIds" value={id} readOnly />
      ))}
      <Card>
        <CardContent>
          <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
            Recipe Metadata
          </h2>
          <div className="space-y-6">
            <div>
              <label
                htmlFor="title"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Title *
              </label>
              <Input
                id="title"
                name="title"
                required
                defaultValue={initial?.title}
                error={!!fieldErrors.title}
              />
              {fieldErrors.title && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {fieldErrors.title[0]}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="sourceUrl"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Source URL
              </label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://..."
                defaultValue={initial?.sourceUrl}
              />
            </div>
            <div>
              <label
                htmlFor="imageUrl"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Image URL
              </label>
              <Input
                id="imageUrl"
                name="imageUrl"
                type="url"
                placeholder="https://..."
                defaultValue={initial?.imageUrl}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label
                  htmlFor="servings"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Servings
                </label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min={0}
                  defaultValue={initial?.servings}
                />
              </div>
              <div>
                <label
                  htmlFor="prepTimeMinutes"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Prep (min)
                </label>
                <Input
                  id="prepTimeMinutes"
                  name="prepTimeMinutes"
                  type="number"
                  min={0}
                  defaultValue={initial?.prepTimeMinutes}
                />
              </div>
              <div>
                <label
                  htmlFor="cookTimeMinutes"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Cook (min)
                </label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min={0}
                  defaultValue={initial?.cookTimeMinutes}
                />
              </div>
              <div>
                <label
                  htmlFor="totalTimeMinutes"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Total (min)
                </label>
                <Input
                  id="totalTimeMinutes"
                  name="totalTimeMinutes"
                  type="number"
                  min={0}
                  defaultValue={initial?.totalTimeMinutes}
                />
              </div>
            </div>
            <RecipeTagPicker
              existingTags={existingTagsState}
              selectedTagIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onSearchTags={handleSearchTags}
              onCreateTag={async (name) => {
                const formData = new FormData();
                formData.set("name", name);
                const result = await createTagAction(null, formData);
                if (result.ok) {
                  setExistingTagsState((prev) =>
                    prev.some((t) => t.id === result.data.id)
                      ? prev
                      : [result.data, ...prev],
                  );
                  return result.data;
                }
                return null;
              }}
              onDeleteTag={async (tagId) => {
                const formData = new FormData();
                formData.set("id", tagId);
                const result = await deleteTagAction(null, formData);
                if (result.ok) {
                  setExistingTagsState((prev) =>
                    prev.filter((t) => t.id !== tagId),
                  );
                  return true;
                }
                return false;
              }}
            />
            <div>
              <label
                htmlFor="notes"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Notes
              </label>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={initial?.notes}
                placeholder="Optional notes"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card id="ingredients">
        <CardContent>
          <SectionHeader variant="section" title="Ingredients" />
          {isEdit && !ingredientsEnhanced ? (
            <div className="space-y-4">
              <Callout variant="info" className="text-info">
                Ingredient lines are not yet enhanced. Click the button below to
                parse and map them to your ingredient catalog.
              </Callout>
              <RecipeIngredientList
                recipeId={(props as EditProps).recipeId}
                recipeIngredients={ingredients.map((line, i) => ({
                  id: `raw-${i}`,
                  displayText: line || "—",
                }))}
                rawIngredients={[]}
              />
              <div className="mt-2">
                <Button asChild variant="primary">
                  <Link href={`/recipes/${(props as EditProps).recipeId}/enhance`}>
                    Enhance ingredients
                  </Link>
                </Button>
              </div>
            </div>
          ) : hasStructured && mergedIngredients.length > 0 ? (
            <div className="space-y-5">
              {(() => {
                const needAttentionCount = mergedIngredients.filter(
                  (r) => !r.quantityText?.trim() || !r.unit || !r.ingredientId,
                ).length;
                return needAttentionCount > 0 ? (
                  <div className="rounded-input border border-amber-200/60 bg-amber-50/30 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/20">
                    <p className="text-foreground">
                      {needAttentionCount} ingredient
                      {needAttentionCount !== 1 ? "s" : ""} need attention. Cost
                      and scaling results may be partially inaccurate. Complete
                      the fields below.
                    </p>
                  </div>
                ) : null;
              })()}
              {mergedIngredients.map((row, index) => {
                const needsQuantityOutline = !row.quantityText?.trim();
                const needsUnitOutline = !row.unit;
                const needsPickerOutline = !row.ingredientId;
                return (
                  <div key={index}>
                    {row.rawText?.trim() && (
                      <p
                        className="mb-3 text-sm text-muted-foreground"
                        aria-label="Original ingredient line"
                      >
                        <span className="not-italic">Original:</span>{" "}
                        <span className="italic">{row.rawText}</span>
                      </p>
                    )}
                    <IngredientEditorRow
                      mode="edit"
                      compact
                      hideLabels
                      outlineQuantity={needsQuantityOutline}
                      outlineUnit={needsUnitOutline}
                      outlinePicker={needsPickerOutline}
                      displayText={row.displayText}
                      onDisplayTextChange={(v) =>
                        updateMergedIngredient(index, {
                          displayText: v,
                          isLineTextOverridden: true,
                        })
                      }
                      isLineTextOverridden={row.isLineTextOverridden}
                      quantityText={row.quantityText}
                      onQuantityTextChange={(v) =>
                        updateMergedIngredient(index, { quantityText: v })
                      }
                      unit={row.unit}
                      onUnitChange={(v) =>
                        updateMergedIngredient(index, { unit: v })
                      }
                      catalog={ingredientsCatalogState}
                      onSearchIngredients={handleSearchIngredients}
                      ingredientId={row.ingredientId}
                      onChangeIngredient={(id, name) =>
                        updateMergedIngredient(index, {
                          ingredientId: id,
                          ingredientName: name,
                        })
                      }
                      selectedIngredientName={row.ingredientName}
                      placeholder="Search or type to create"
                      onSelectNew={async (name) => {
                        const formData = new FormData();
                        formData.set("name", name.trim());
                        formData.set("costBasisUnit", "GRAM");
                        const result = await createIngredientAction(
                          null,
                          formData,
                        );
                        if (result.ok) {
                          const newItem = {
                            id: result.data.id,
                            name: name.trim(),
                          };
                          setIngredientsCatalogState((prev) => [
                            newItem,
                            ...prev,
                          ]);
                          return newItem;
                        }
                        return null;
                      }}
                      onRemove={() => removeMergedIngredient(index)}
                      canRemove={mergedIngredients.length > 1}
                    />
                  </div>
                );
              })}
              <input
                type="hidden"
                name="ingredientsStructured"
                value={JSON.stringify(structuredPayload)}
              />
              <Button
                type="button"
                variant="secondary"
                aria-label="Add ingredient"
                onClick={hasStructured ? addMergedIngredient : addIngredient}
                className={cn("mt-3", ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
              >
                <AppIcon name="add" size={18} aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {ingredients.map((_, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    name="ingredients"
                    defaultValue={ingredients[i]}
                    placeholder="e.g. 2 cups flour"
                    error={!!fieldErrors.ingredients}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className={ICON_BUTTON_CLASS}
                    onClick={() => removeIngredient(i)}
                    aria-label="Remove ingredient"
                    disabled={ingredients.length === 1}
                  >
                    <AppIcon name="delete" size={18} aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                aria-label="Add ingredient"
                onClick={hasStructured ? addMergedIngredient : addIngredient}
                className={cn("mt-2", ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
              >
                <AppIcon name="add" size={18} aria-hidden />
              </Button>
            </div>
          )}
          {fieldErrors.ingredients && (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {fieldErrors.ingredients[0]}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <SectionHeader variant="section" title="Instructions" />
          <ol className="mt-2 list-none space-y-4 p-0">
            {instructions.map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 flex gap-2">
                  <Input
                    name="instructions"
                    defaultValue={instructions[i]}
                    placeholder="Step description"
                    error={!!fieldErrors.instructions}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className={ICON_BUTTON_CLASS}
                    onClick={() => removeInstruction(i)}
                    aria-label="Remove step"
                    disabled={instructions.length === 1}
                  >
                    <AppIcon name="delete" size={18} aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
            <Button
              type="button"
              variant="secondary"
              aria-label="Add step"
              onClick={addInstruction}
              className={cn("mt-2", ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
            >
              <AppIcon name="add" size={18} aria-hidden />
            </Button>
          </ol>
          {fieldErrors.instructions && (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {fieldErrors.instructions[0]}
            </p>
          )}
        </CardContent>
      </Card>
      {state &&
        !state.ok &&
        state.error?.message &&
        !state.error?.fieldErrors && (
          <p className="text-sm text-destructive" role="alert">
            {state.error.message}
          </p>
        )}
      <div className="flex gap-2">
        <Button type="submit">
          {isEdit ? "Save changes" : "Create recipe"}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/recipes/${props.recipeId}`)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
