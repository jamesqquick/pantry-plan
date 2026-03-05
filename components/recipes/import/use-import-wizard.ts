"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  parseRecipeFromUrlAction,
  parseRecipeFromImageAction,
  type ParsedRecipeDraft,
} from "@/app/actions/parse.actions";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import {
  saveImportedRecipeWithMappingsAction,
  saveImportedRecipeTextOnlyAction,
} from "@/app/actions/import.actions";
import {
  createTagAction,
  deleteTagAction,
  searchTagsForPickerAction,
} from "@/app/actions/tags.actions";
import { searchIngredientsForPickerAction } from "@/app/actions/ingredients.actions";
import { parseQuantityText } from "@/lib/quantity/quantity";
import type { MappingRow } from "./ingredient-mapping-table";
import {
  defaultInstruction,
  draftToManualForm,
  emptyManualForm,
} from "./import-wizard-helpers";
import type { ManualFormState } from "./import-wizard-helpers";
import type { RecipeDetailsSectionProps } from "./recipe-details-section";
import type { TagOption } from "@/components/recipes/recipe-tag-picker";

export type InputMethod = "url" | "image" | "manual";
export type CatalogItem = { id: string; name: string };

const EMPTY_TAGS: TagOption[] = [];

export type UseImportWizardOptions = {
  ingredientsCatalog: CatalogItem[];
  existingTags?: TagOption[];
};

export function useImportWizard({
  ingredientsCatalog,
  existingTags = EMPTY_TAGS,
}: UseImportWizardOptions) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [imageParseLoading, setImageParseLoading] = useState(false);
  const [imageParseError, setImageParseError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [existingTagsState, setExistingTagsState] =
    useState<TagOption[]>(existingTags);
  const [saveState, setSaveState] = useState<Awaited<
    ReturnType<typeof saveImportedRecipeWithMappingsAction>
  > | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveAndEnhanceLoading, setSaveAndEnhanceLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [inputMethod, setInputMethod] = useState<InputMethod>("url");
  const mappingSectionRef = useRef<HTMLDivElement>(null);
  const firstNeedsAttentionRef = useRef<HTMLDivElement>(null);

  const [urlDraft, setUrlDraft] = useState<ParsedRecipeDraft | null>(null);
  const [urlMetadataForm, setUrlMetadataForm] =
    useState<ManualFormState>(emptyManualForm);
  const [urlIngredientLines, setUrlIngredientLines] = useState<string[]>([]);
  const [urlInstructionsList, setUrlInstructionsList] = useState<string[]>([
    defaultInstruction,
  ]);
  const [urlSuggestions, setUrlSuggestions] = useState<SuggestionItem[]>([]);
  const [urlRows, setUrlRows] = useState<MappingRow[]>([]);
  const [urlIngredientsEnhanced, setUrlIngredientsEnhanced] = useState(false);

  const [imageDraft, setImageDraft] = useState<ParsedRecipeDraft | null>(null);
  const [imageMetadataForm, setImageMetadataForm] =
    useState<ManualFormState>(emptyManualForm);
  const [imageIngredientLines, setImageIngredientLines] = useState<string[]>(
    [],
  );
  const [imageSuggestions, setImageSuggestions] = useState<SuggestionItem[]>(
    [],
  );
  const [imageRows, setImageRows] = useState<MappingRow[]>([]);
  const [imageIngredientsEnhanced, setImageIngredientsEnhanced] =
    useState(false);
  const [imageInstructionsList, setImageInstructionsList] = useState<string[]>([
    defaultInstruction,
  ]);

  const [manualForm, setManualForm] =
    useState<ManualFormState>(emptyManualForm);
  const [manualIngredientLines, setManualIngredientLines] = useState<string[]>([
    "",
  ]);
  const [manualRows, setManualRows] = useState<MappingRow[]>([]);
  const [manualIngredientsEnhanced, setManualIngredientsEnhanced] =
    useState(false);
  const [manualInstructionsList, setManualInstructionsList] = useState<
    string[]
  >([defaultInstruction]);

  const resetWizardState = useCallback(() => {
    setUrl("");
    setParseError(null);
    setImageParseError(null);
    setSelectedTagIds([]);
    setUrlDraft(null);
    setUrlMetadataForm(emptyManualForm);
    setUrlIngredientLines([]);
    setUrlSuggestions([]);
    setUrlRows([]);
    setUrlIngredientsEnhanced(false);
    setUrlInstructionsList([defaultInstruction]);
    setImageDraft(null);
    setImageMetadataForm(emptyManualForm);
    setImageIngredientLines([]);
    setImageSuggestions([]);
    setImageRows([]);
    setImageIngredientsEnhanced(false);
    setImageInstructionsList([defaultInstruction]);
    setManualForm(emptyManualForm);
    setManualIngredientLines([""]);
    setManualRows([]);
    setManualIngredientsEnhanced(false);
    setManualInstructionsList([defaultInstruction]);
    setSaveState(null);
    setToast(null);
    setInputMethod("url");
  }, []);

  useEffect(() => {
    setExistingTagsState((prev) =>
      existingTags.length >= prev.length ? existingTags : prev,
    );
  }, [existingTags]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetWizardState();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resetWizardState]);

  useEffect(() => {
    const hasDetails =
      inputMethod === "manual" || urlDraft !== null || imageDraft !== null;
    if (hasDetails) {
      mappingSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [inputMethod, urlDraft, imageDraft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleParse = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setParseError(null);
      setParseLoading(true);
      try {
        const formData = new FormData();
        formData.set("url", url);
        const result = await parseRecipeFromUrlAction(null, formData);
        if (result.ok) {
          const data = result.data;
          setUrlDraft(data);
          const nextMetadata = draftToManualForm(data, url);
          setUrlMetadataForm(nextMetadata);
          setUrlIngredientLines(data.ingredients ?? []);
          setUrlInstructionsList(
            data.instructions?.length
              ? data.instructions
              : nextMetadata.instructions.trim()
                ? nextMetadata.instructions.split(/\n/).map((s) => s.trim())
                : [defaultInstruction],
          );
          setUrlSuggestions([]);
          setUrlRows([]);
          setUrlIngredientsEnhanced(false);
          setToast({
            message: "Recipe import successful. Review and save.",
            variant: "success",
          });
          setUrl("");
          mappingSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        } else {
          setParseError(result.error.message);
          setToast({ message: result.error.message, variant: "error" });
        }
      } finally {
        setParseLoading(false);
      }
    },
    [url],
  );

  const handleImageParse = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setImageParseError(null);
      const form = e.currentTarget;
      const imageInput = form.elements.namedItem("image");
      const file =
        imageInput instanceof HTMLInputElement && imageInput.files?.[0]
          ? imageInput.files[0]
          : null;
      if (!file) {
        setImageParseError("Please select an image.");
        setToast({ message: "Please select an image.", variant: "error" });
        return;
      }
      setImageParseLoading(true);
      try {
        const formData = new FormData();
        formData.set("image", file);
        const result = await parseRecipeFromImageAction(null, formData);
        if (result.ok) {
          const data = result.data;
          setImageDraft(data);
          const nextMetadata = draftToManualForm(data);
          setImageMetadataForm(nextMetadata);
          setImageInstructionsList(
            data.instructions?.length
              ? data.instructions
              : nextMetadata.instructions.trim()
                ? nextMetadata.instructions.split(/\n/).map((s) => s.trim())
                : [defaultInstruction],
          );
          setImageIngredientLines(data.ingredients ?? []);
          setImageSuggestions([]);
          setImageRows([]);
          setImageIngredientsEnhanced(false);
          setToast({
            message: "Recipe import successful. Review and save.",
            variant: "success",
          });
          if (imageInput instanceof HTMLInputElement) imageInput.value = "";
          mappingSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        } else {
          setImageParseError(result.error.message);
          setToast({ message: result.error.message, variant: "error" });
        }
      } finally {
        setImageParseLoading(false);
      }
    },
    [],
  );

  const buildRecipePayload = useCallback(() => {
    if (inputMethod === "url" && urlDraft != null) {
      const instructions = urlInstructionsList
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        title: (urlMetadataForm.title.trim() || urlDraft.title) ?? "",
        sourceUrl: urlMetadataForm.sourceUrl.trim() || "",
        imageUrl: urlMetadataForm.imageUrl.trim() || undefined,
        servings: urlMetadataForm.servings.trim()
          ? parseInt(urlMetadataForm.servings, 10)
          : undefined,
        prepTimeMinutes: urlMetadataForm.prepTimeMinutes.trim()
          ? parseInt(urlMetadataForm.prepTimeMinutes, 10)
          : undefined,
        cookTimeMinutes: urlMetadataForm.cookTimeMinutes.trim()
          ? parseInt(urlMetadataForm.cookTimeMinutes, 10)
          : undefined,
        totalTimeMinutes: urlMetadataForm.totalTimeMinutes.trim()
          ? parseInt(urlMetadataForm.totalTimeMinutes, 10)
          : undefined,
        instructions:
          instructions.length > 0
            ? instructions
            : (urlDraft.instructions ?? ["See source."]),
        notes: urlMetadataForm.notes.trim() || undefined,
        tagIds: selectedTagIds,
      };
    }
    if (inputMethod === "image" && imageDraft != null) {
      const instructions = imageInstructionsList
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        title: (imageMetadataForm.title.trim() || imageDraft.title) ?? "",
        sourceUrl: imageMetadataForm.sourceUrl.trim() || "",
        imageUrl: imageMetadataForm.imageUrl.trim() || undefined,
        servings: imageMetadataForm.servings.trim()
          ? parseInt(imageMetadataForm.servings, 10)
          : undefined,
        prepTimeMinutes: imageMetadataForm.prepTimeMinutes.trim()
          ? parseInt(imageMetadataForm.prepTimeMinutes, 10)
          : undefined,
        cookTimeMinutes: imageMetadataForm.cookTimeMinutes.trim()
          ? parseInt(imageMetadataForm.cookTimeMinutes, 10)
          : undefined,
        totalTimeMinutes: imageMetadataForm.totalTimeMinutes.trim()
          ? parseInt(imageMetadataForm.totalTimeMinutes, 10)
          : undefined,
        instructions:
          instructions.length > 0
            ? instructions
            : (imageDraft.instructions ?? ["See source."]),
        notes: imageMetadataForm.notes.trim() || undefined,
        tagIds: selectedTagIds,
      };
    }
    const instructions = manualInstructionsList
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: manualForm.title.trim() ?? "",
      sourceUrl: manualForm.sourceUrl.trim() || "",
      imageUrl: manualForm.imageUrl.trim() || undefined,
      servings: manualForm.servings.trim()
        ? parseInt(manualForm.servings, 10)
        : undefined,
      prepTimeMinutes: manualForm.prepTimeMinutes.trim()
        ? parseInt(manualForm.prepTimeMinutes, 10)
        : undefined,
      cookTimeMinutes: manualForm.cookTimeMinutes.trim()
        ? parseInt(manualForm.cookTimeMinutes, 10)
        : undefined,
      totalTimeMinutes: manualForm.totalTimeMinutes.trim()
        ? parseInt(manualForm.totalTimeMinutes, 10)
        : undefined,
      instructions: instructions.length > 0 ? instructions : ["See source."],
      notes: manualForm.notes.trim() || undefined,
      tagIds: selectedTagIds,
    };
  }, [
    inputMethod,
    urlDraft,
    urlMetadataForm,
    urlInstructionsList,
    imageDraft,
    imageMetadataForm,
    imageInstructionsList,
    manualForm,
    manualInstructionsList,
    selectedTagIds,
  ]);

  const getCurrentRows = useCallback((): MappingRow[] => {
    if (inputMethod === "url") return urlRows;
    if (inputMethod === "image") return imageRows;
    return manualRows;
  }, [inputMethod, urlRows, imageRows, manualRows]);

  const handleSave = useCallback(async () => {
    const payload = buildRecipePayload();
    if (!payload.title.trim()) return;
    setSaveLoading(true);
    setSaveState(null);
    try {
      if (inputMethod === "url") {
        if (urlIngredientsEnhanced) {
          const rowsToSave = getCurrentRows().filter((r) => r.rawText.trim());
          if (rowsToSave.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeWithMappingsAction({
            recipe: payload,
            ingredientLines: rowsToSave.map((r, idx) => ({
              originalLine: r.rawText.trim(),
              displayText: r.displayText?.trim() || undefined,
              ingredientId: r.ingredientId || undefined,
              createName: r.createName?.trim() || undefined,
              quantity: parseQuantityText(r.quantityText) ?? undefined,
              unit: r.unit,
              sortOrder: idx,
            })),
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        } else {
          const ingredients = urlIngredientLines
            .map((s) => s.trim())
            .filter(Boolean);
          if (ingredients.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeTextOnlyAction({
            recipe: payload,
            ingredients,
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        }
      } else if (inputMethod === "image") {
        if (imageIngredientsEnhanced) {
          const rowsToSave = getCurrentRows().filter((r) => r.rawText.trim());
          if (rowsToSave.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeWithMappingsAction({
            recipe: payload,
            ingredientLines: rowsToSave.map((r, idx) => ({
              originalLine: r.rawText.trim(),
              displayText: r.displayText?.trim() || undefined,
              ingredientId: r.ingredientId || undefined,
              createName: r.createName?.trim() || undefined,
              quantity: parseQuantityText(r.quantityText) ?? undefined,
              unit: r.unit,
              sortOrder: idx,
            })),
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        } else {
          const ingredients = imageIngredientLines
            .map((s) => s.trim())
            .filter(Boolean);
          if (ingredients.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeTextOnlyAction({
            recipe: payload,
            ingredients,
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        }
      } else {
        if (manualIngredientsEnhanced) {
          const rowsToSave = getCurrentRows().filter((r) => r.rawText.trim());
          if (rowsToSave.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeWithMappingsAction({
            recipe: payload,
            ingredientLines: rowsToSave.map((r, idx) => ({
              originalLine: r.rawText.trim(),
              displayText: r.displayText?.trim() || undefined,
              ingredientId: r.ingredientId || undefined,
              createName: r.createName?.trim() || undefined,
              quantity: parseQuantityText(r.quantityText) ?? undefined,
              unit: r.unit,
              sortOrder: idx,
            })),
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        } else {
          const ingredients = manualIngredientLines
            .map((s) => s.trim())
            .filter(Boolean);
          if (ingredients.length === 0) {
            setSaveState({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "At least one ingredient required",
                fieldErrors: {
                  ingredients: ["At least one ingredient required"],
                },
              },
            });
            return;
          }
          const result = await saveImportedRecipeTextOnlyAction({
            recipe: payload,
            ingredients,
          });
          setSaveState(result);
          if (result.ok) {
            resetWizardState();
            router.push(`/recipes/${result.data.recipeId}`);
            router.refresh();
          }
        }
      }
    } finally {
      setSaveLoading(false);
    }
  }, [
    router,
    buildRecipePayload,
    getCurrentRows,
    resetWizardState,
    inputMethod,
    urlIngredientLines,
    urlIngredientsEnhanced,
    imageIngredientLines,
    imageIngredientsEnhanced,
    manualIngredientLines,
    manualIngredientsEnhanced,
  ]);

  const handleMethodChange = useCallback((value: string) => {
    const next = value as InputMethod;
    setInputMethod(next);
    if (next === "manual") {
      setManualForm(emptyManualForm);
      setManualIngredientLines([""]);
      setManualRows([]);
      setManualIngredientsEnhanced(false);
      setManualInstructionsList([defaultInstruction]);
    }
  }, []);

  const handleSearchIngredients = useCallback(async (query: string) => {
    const res = await searchIngredientsForPickerAction(query);
    return res.ok ? res.data : [];
  }, []);

  const handleSearchTags = useCallback(async (query: string) => {
    const res = await searchTagsForPickerAction(query);
    return res.ok ? res.data : [];
  }, []);

  const handleCreateTag = useCallback(async (name: string) => {
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
  }, []);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    const formData = new FormData();
    formData.set("id", tagId);
    const result = await deleteTagAction(null, formData);
    if (result.ok) {
      setExistingTagsState((prev) => prev.filter((t) => t.id !== tagId));
      return true;
    }
    return false;
  }, []);

  const handleSaveAndEnhance = useCallback(async () => {
    const payload = buildRecipePayload();
    if (!payload.title.trim()) return;
    setSaveAndEnhanceLoading(true);
    setSaveState(null);
    try {
      if (inputMethod === "url") {
        const ingredients = urlIngredientLines
          .map((s) => s.trim())
          .filter(Boolean);
        if (ingredients.length === 0) {
          setSaveState({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "At least one ingredient required",
              fieldErrors: {
                ingredients: ["At least one ingredient required"],
              },
            },
          });
          return;
        }
        const result = await saveImportedRecipeTextOnlyAction({
          recipe: payload,
          ingredients,
        });
        setSaveState(result);
        if (result.ok) {
          resetWizardState();
          router.push(`/recipes/${result.data.recipeId}/enhance`);
          router.refresh();
        }
      } else if (inputMethod === "image") {
        const ingredients = imageIngredientLines
          .map((s) => s.trim())
          .filter(Boolean);
        if (ingredients.length === 0) {
          setSaveState({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "At least one ingredient required",
              fieldErrors: {
                ingredients: ["At least one ingredient required"],
              },
            },
          });
          return;
        }
        const result = await saveImportedRecipeTextOnlyAction({
          recipe: payload,
          ingredients,
        });
        setSaveState(result);
        if (result.ok) {
          resetWizardState();
          router.push(`/recipes/${result.data.recipeId}/enhance`);
          router.refresh();
        }
      } else {
        const ingredients = manualIngredientLines
          .map((s) => s.trim())
          .filter(Boolean);
        if (ingredients.length === 0) {
          setSaveState({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "At least one ingredient required",
              fieldErrors: {
                ingredients: ["At least one ingredient required"],
              },
            },
          });
          return;
        }
        const result = await saveImportedRecipeTextOnlyAction({
          recipe: payload,
          ingredients,
        });
        setSaveState(result);
        if (result.ok) {
          resetWizardState();
          router.push(`/recipes/${result.data.recipeId}/enhance`);
          router.refresh();
        }
      }
    } finally {
      setSaveAndEnhanceLoading(false);
    }
  }, [
    buildRecipePayload,
    inputMethod,
    urlIngredientLines,
    imageIngredientLines,
    manualIngredientLines,
    router,
    resetWizardState,
  ]);

  const urlSectionProps: RecipeDetailsSectionProps = {
    metadataForm: urlMetadataForm,
    setMetadataForm: setUrlMetadataForm,
    rows: urlRows,
    setRows: setUrlRows,
    suggestions: urlSuggestions,
    instructionsList: urlInstructionsList,
    setInstructionsList: setUrlInstructionsList,
    existingTagsState,
    setExistingTagsState,
    selectedTagIds,
    setSelectedTagIds,
    onSearchTags: handleSearchTags,
    onCreateTag: handleCreateTag,
    onDeleteTag: handleDeleteTag,
    ingredientsCatalog,
    onSearchIngredients: handleSearchIngredients,
    saveState,
    saveLoading,
    saveAndEnhanceLoading,
    onSave: handleSave,
    saveDisabled:
      !urlMetadataForm.title.trim() ||
      urlIngredientLines.filter((s) => s.trim()).length === 0,
    firstNeedsAttentionRef,
    simpleIngredientLines: urlIngredientLines,
    setSimpleIngredientLines: setUrlIngredientLines,
    onSaveAndEnhance: urlIngredientsEnhanced ? undefined : handleSaveAndEnhance,
  };

  const imageSectionProps: RecipeDetailsSectionProps = {
    metadataForm: imageMetadataForm,
    setMetadataForm: setImageMetadataForm,
    rows: imageRows,
    setRows: setImageRows,
    suggestions: imageSuggestions,
    instructionsList: imageInstructionsList,
    setInstructionsList: setImageInstructionsList,
    existingTagsState,
    setExistingTagsState,
    selectedTagIds,
    setSelectedTagIds,
    onSearchTags: handleSearchTags,
    onCreateTag: handleCreateTag,
    onDeleteTag: handleDeleteTag,
    ingredientsCatalog,
    onSearchIngredients: handleSearchIngredients,
    saveState,
    saveLoading,
    saveAndEnhanceLoading,
    onSave: handleSave,
    saveDisabled:
      !imageMetadataForm.title.trim() ||
      (!imageIngredientsEnhanced &&
        imageIngredientLines.filter((s) => s.trim()).length === 0),
    firstNeedsAttentionRef,
    simpleIngredientLines: imageIngredientLines,
    setSimpleIngredientLines: setImageIngredientLines,
    onSaveAndEnhance: imageIngredientsEnhanced ? undefined : handleSaveAndEnhance,
  };

  const manualSectionProps: RecipeDetailsSectionProps = {
    metadataForm: manualForm,
    setMetadataForm: setManualForm,
    rows: manualRows,
    setRows: setManualRows,
    suggestions: [],
    instructionsList: manualInstructionsList,
    setInstructionsList: setManualInstructionsList,
    existingTagsState,
    setExistingTagsState,
    selectedTagIds,
    setSelectedTagIds,
    onSearchTags: handleSearchTags,
    onCreateTag: handleCreateTag,
    onDeleteTag: handleDeleteTag,
    ingredientsCatalog,
    onSearchIngredients: handleSearchIngredients,
    saveState,
    saveLoading,
    saveAndEnhanceLoading,
    onSave: handleSave,
    saveDisabled:
      !manualForm.title.trim() ||
      (!manualIngredientsEnhanced &&
        manualIngredientLines.filter((s) => s.trim()).length === 0),
    firstNeedsAttentionRef,
    simpleIngredientLines: manualIngredientLines,
    setSimpleIngredientLines: setManualIngredientLines,
    onSaveAndEnhance: manualIngredientsEnhanced ? undefined : handleSaveAndEnhance,
  };

  return {
    url,
    setUrl,
    parseLoading,
    parseError,
    handleParse,
    urlDraft,
    imageParseLoading,
    imageParseError,
    handleImageParse,
    imageDraft,
    inputMethod,
    handleMethodChange,
    mappingSectionRef,
    toast,
    urlSectionProps,
    imageSectionProps,
    manualSectionProps,
  };
}
