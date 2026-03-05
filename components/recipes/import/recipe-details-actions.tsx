"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { OrDivider } from "@/components/ui/or-divider";

type RecipeDetailsActionsProps = {
  useSimpleIngredients: boolean;
  linesWithContentLength: number;
  onSaveAndEnhance?: () => void | Promise<void>;
  onSave: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
  saveAndEnhanceLoading?: boolean;
};

export function RecipeDetailsActions({
  useSimpleIngredients,
  linesWithContentLength,
  onSaveAndEnhance,
  onSave,
  saveDisabled,
  saveLoading,
  saveAndEnhanceLoading = false,
}: RecipeDetailsActionsProps) {
  const anySaveLoading = saveLoading || saveAndEnhanceLoading;
  const rightAlignActions = !(
    useSimpleIngredients &&
    onSaveAndEnhance != null &&
    linesWithContentLength === 0
  );

  return (
    <div
      className={
        rightAlignActions
          ? "flex flex-wrap flex-col lg:items-end gap-4 w-full"
          : "flex flex-wrap flex-col items-center gap-4 w-full"
      }
    >
      {useSimpleIngredients && onSaveAndEnhance != null ? (
        <>
          {linesWithContentLength === 0 && (
            <Callout
              variant="info"
              className="w-full text-center text-info"
            >
              Enhancing ingredients maps them to your catalog which enables
              recipe scaling, cost tracking, and smart planning. It&apos;s one
              extra step, but it enables lots of functionality.
            </Callout>
          )}
          <Button
            variant="default"
            disabled={saveDisabled || anySaveLoading}
            onClick={() => onSaveAndEnhance()}
            className="lg:w-96 w-full"
            aria-busy={saveAndEnhanceLoading}
          >
            {saveAndEnhanceLoading ? "Saving…" : "Save and enhance"}
          </Button>
          <OrDivider />
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={saveDisabled || anySaveLoading}
            className="lg:w-96 w-full"
            aria-busy={saveLoading}
          >
            {saveLoading ? "Saving…" : "Save"}
          </Button>
        </>
      ) : (
        <Button onClick={onSave} disabled={saveDisabled || anySaveLoading}>
          {saveLoading ? "Saving…" : "Save recipe"}
        </Button>
      )}
    </div>
  );
}
