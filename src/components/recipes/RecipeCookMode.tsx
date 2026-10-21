import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChefHat, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toggleCheckedItem } from "./cook-mode-state";
import { RecipeScaleControl } from "./RecipeScaleControl";
import {
  scaleRecipeIngredient,
  scaleRecipeServings,
  type RecipeIngredientForScaling,
  type RecipeScale,
} from "@/features/recipes/recipe-scaling";
import { formatIngredientQuantity } from "@/lib/ingredients/format-ingredient-line";

interface RecipeMetaItem {
  label: string;
  value: string;
}

interface RecipeCookModeProps {
  recipeId: string;
  title: string;
  servings: number | null;
  meta: RecipeMetaItem[];
  ingredients: RecipeIngredientForScaling[];
  instructions: string[];
}

export function RecipeCookMode({
  recipeId,
  title,
  servings,
  meta,
  ingredients,
  instructions,
}: RecipeCookModeProps) {
  const [isActive, setIsActive] = useState(false);
  const [scale, setScale] = useState<RecipeScale>(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<{ element: HTMLLabelElement; top: number } | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    () => new Set(),
  );
  const [checkedInstructions, setCheckedInstructions] = useState<Set<number>>(
    () => new Set(),
  );

  function changeScale(nextScale: RecipeScale) {
    const panel = panelRef.current;
    scrollAnchor.current = null;
    if (panel && panel.scrollTop > 0) {
      const headerBottom = panel.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const visibleLabels = Array.from(panel.querySelectorAll<HTMLLabelElement>("main label"))
        .filter((label) => {
          const bounds = label.getBoundingClientRect();
          return bounds.bottom > headerBottom && bounds.top < panel.clientHeight;
        });
      const anchor = visibleLabels.find((label) => label.contains(document.activeElement)) ?? visibleLabels[0];
      if (anchor) scrollAnchor.current = { element: anchor, top: anchor.getBoundingClientRect().top };
    }
    setScale(nextScale);
  }

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    scrollAnchor.current = null;
    if (anchor && panelRef.current) {
      panelRef.current.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
    }
  }, [scale]);

  function exitCookMode() {
    setIsActive(false);
    setScale(1);
    setCheckedIngredients(new Set());
    setCheckedInstructions(new Set());
  }

  useEffect(() => {
    if (!isActive) return;

    const previousOverflow = document.body.style.overflow;
    let wakeLock: WakeLockSentinel | null = null;
    let wakeLockRequest: Promise<WakeLockSentinel> | null = null;
    let disposed = false;

    document.body.style.overflow = "hidden";

    async function requestWakeLock() {
      if (!("wakeLock" in navigator)) {
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        wakeLock ||
        wakeLockRequest
      ) {
        return;
      }

      const request = navigator.wakeLock.request("screen");
      wakeLockRequest = request;
      try {
        const lock = await request;
        if (wakeLockRequest === request) wakeLockRequest = null;
        if (disposed) {
          await lock.release();
          return;
        }
        if (document.visibilityState !== "visible" || wakeLock) {
          await lock.release();
          return;
        }

        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock !== lock) return;
          wakeLock = null;
        });
      } catch {
        if (wakeLockRequest === request) wakeLockRequest = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        const lock = wakeLock;
        wakeLock = null;
        void lock?.release();
        return;
      }
      void requestWakeLock();
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const lock = wakeLock;
      wakeLock = null;
      void lock?.release();
      document.body.style.overflow = previousOverflow;
    };
  }, [isActive]);

  const scaledIngredients = ingredients.map((ingredient) => scaleRecipeIngredient(ingredient, scale));
  const scalableCount = scaledIngredients.filter((ingredient) => ingredient.status === "scalable").length;
  const reviewCount = scaledIngredients.filter((ingredient) => ingredient.status === "needs-review").length;
  const scaledServings = scaleRecipeServings(servings, scale);

  const panel = (
    <DialogPrimitive.Content
      ref={panelRef}
      className="fixed inset-0 z-[60] overflow-y-auto bg-background text-foreground [overflow-anchor:none]"
    >
      <DialogPrimitive.Description className="sr-only">
        A focused cooking view with checkable ingredients and instructions.
      </DialogPrimitive.Description>
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 py-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:items-center sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
          <div className="min-w-0">
            <p className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Cook mode
            </p>
            <DialogPrimitive.Title asChild>
              <h1 className="font-editorial mt-1 break-words text-2xl leading-tight sm:text-3xl">
                {title}
              </h1>
            </DialogPrimitive.Title>
            <p className="mt-1 font-ui text-sm text-muted-foreground">
              {scale === 1 ? "Original batch" : `${scale}× batch`}
            </p>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11 shrink-0 gap-1.5"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Exit
            </Button>
          </DialogPrimitive.Close>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:py-8 sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
        <div className="space-y-4 border-b border-divider pb-6 font-ui text-sm">
          <RecipeScaleControl value={scale} onChange={changeScale} disabled={scalableCount === 0} />
          <p role="status" aria-live="polite" aria-atomic="true" className="text-muted-foreground">
            {scaledServings != null
              ? `Makes ${formatIngredientQuantity(scaledServings, null)} servings${scale !== 1 ? ` · Original recipe serves ${servings}` : ""}`
              : scale === 1 ? "Original recipe" : `${scale}× original recipe`}
          </p>
          {scalableCount === 0 ? (
            <p className="text-muted-foreground">Add ingredient quantities to use batch scaling.</p>
          ) : scale !== 1 && (
            <p className="text-muted-foreground">
              {`${scalableCount} ingredient amount${scalableCount === 1 ? "" : "s"} adjusted.${reviewCount > 0 ? ` ${reviewCount} ${reviewCount === 1 ? "needs" : "need"} checking.` : ""}`}
            </p>
          )}
          {(scalableCount === 0 || (scale !== 1 && reviewCount > 0)) && (
            <a href={`/recipes/${recipeId}/edit#recipe-ingredients`} className="inline-flex min-h-11 items-center font-semibold text-primary-on-card underline underline-offset-4">
              Review quantities
            </a>
          )}
          {meta.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {scale === 1 ? "Recipe timing" : "Original recipe timing"}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {meta.map((item) => (
                  <div key={item.label} className="flex items-baseline gap-1.5">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
          <section className="lg:col-span-2" aria-labelledby="cook-ingredients-title">
            <h2 id="cook-ingredients-title" className="font-editorial text-3xl">
              Ingredients
            </h2>
            {ingredients.length === 0 ? (
              <p className="mt-4 text-muted-foreground">No ingredients listed.</p>
            ) : (
              <ul className="mt-4 divide-y divide-divider">
                {scaledIngredients.map((ingredient) => {
                  const checked = checkedIngredients.has(ingredient.id);
                  const needsReview = scale !== 1 && ingredient.status === "needs-review";
                  return (
                    <li key={ingredient.id}>
                      <label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-base leading-relaxed">
                        <input
                          type="checkbox"
                          aria-label={ingredient.text}
                          aria-describedby={needsReview ? `cook-review-${ingredient.id}` : undefined}
                          checked={checked}
                          onChange={() =>
                            setCheckedIngredients((current) =>
                              toggleCheckedItem(current, ingredient.id),
                            )
                          }
                          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                        />
                        <span
                          className={cn(
                            "transition-opacity",
                            checked && "text-muted-foreground line-through opacity-70",
                          )}
                        >
                          {ingredient.text}
                          {needsReview && (
                            <span id={`cook-review-${ingredient.id}`} className="mt-1 block text-xs font-normal text-muted-foreground">
                              <span className="font-semibold text-foreground">Check amount</span>
                              {" · Original amount shown for 1×"}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="lg:col-span-3" aria-labelledby="cook-instructions-title">
            <h2 id="cook-instructions-title" className="font-editorial text-3xl">
              Instructions
            </h2>
            {scale !== 1 && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Steps and timing are for the original batch. Use the adjusted ingredient amounts above; cooking times may vary.
              </p>
            )}
            {instructions.length === 0 ? (
              <p className="mt-4 text-muted-foreground">No instructions listed.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {instructions.map((instruction, index) => {
                  const checked = checkedInstructions.has(index);
                  return (
                    <li key={`${instruction}-${index}`}>
                      <label
                        className={cn(
                          "flex min-h-14 cursor-pointer gap-4 rounded-xl border border-divider bg-card px-4 py-4 text-card-foreground transition-colors hover:border-primary/35",
                          checked && "bg-secondary/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Step ${index + 1}: ${instruction}`}
                          checked={checked}
                          onChange={() =>
                            setCheckedInstructions((current) =>
                              toggleCheckedItem(current, index),
                            )
                          }
                          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                        />
                        <span className="flex min-w-0 gap-3">
                          <span className="font-ui font-bold tabular-nums text-primary">
                            {index + 1}
                          </span>
                          <span
                            className={cn(
                              "whitespace-pre-wrap text-base leading-relaxed transition-opacity",
                              checked && "text-muted-foreground opacity-70",
                            )}
                          >
                            {instruction}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </DialogPrimitive.Content>
  );

  return (
    <DialogPrimitive.Root
      open={isActive}
      onOpenChange={(open) => {
        if (open) setIsActive(true);
        else exitCookMode();
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button variant="primary" size="sm" className="gap-1.5">
          <ChefHat className="h-3.5 w-3.5" aria-hidden="true" />
          Cook mode
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>{panel}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
