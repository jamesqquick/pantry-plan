import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChefHat, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { getCheckedProgress, toggleCheckedItem } from "./cook-mode-state";

interface RecipeMetaItem {
  label: string;
  value: string;
}

interface RecipeCookModeProps {
  title: string;
  meta: RecipeMetaItem[];
  ingredients: string[];
  instructions: string[];
}

type WakeLockStatus = "idle" | "requesting" | "active" | "unavailable";

export function RecipeCookMode({
  title,
  meta,
  ingredients,
  instructions,
}: RecipeCookModeProps) {
  const [isActive, setIsActive] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    () => new Set(),
  );
  const [checkedInstructions, setCheckedInstructions] = useState<Set<number>>(
    () => new Set(),
  );
  const [wakeLockStatus, setWakeLockStatus] =
    useState<WakeLockStatus>("idle");
  function exitCookMode() {
    setIsActive(false);
    setCheckedIngredients(new Set());
    setCheckedInstructions(new Set());
    setWakeLockStatus("idle");
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
        setWakeLockStatus("unavailable");
        return;
      }
      if (
        document.visibilityState !== "visible" ||
        wakeLock ||
        wakeLockRequest
      ) {
        return;
      }

      setWakeLockStatus("requesting");
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
        setWakeLockStatus("active");
        lock.addEventListener("release", () => {
          if (wakeLock !== lock) return;
          wakeLock = null;
          if (!disposed && document.visibilityState === "visible") {
            setWakeLockStatus("unavailable");
          }
        });
      } catch {
        if (wakeLockRequest === request) wakeLockRequest = null;
        if (!disposed) setWakeLockStatus("unavailable");
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

  const panel = (
    <DialogPrimitive.Content
      className="fixed inset-0 z-[60] overflow-y-auto bg-background text-foreground"
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-divider pb-6 font-ui text-sm">
          {meta.map((item) => (
            <div key={item.label} className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold tabular-nums">{item.value}</span>
            </div>
          ))}
          <span
            aria-live="polite"
            className={cn(
              "ml-auto rounded-full px-2.5 py-1 text-xs font-semibold",
              wakeLockStatus === "active"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {wakeLockStatus === "active"
              ? "Screen awake"
              : wakeLockStatus === "requesting"
                ? "Keeping screen awake..."
                : "Screen may sleep"}
          </span>
        </div>

        <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
          <section className="lg:col-span-2" aria-labelledby="cook-ingredients-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cook-ingredients-title" className="font-editorial text-3xl">
                Ingredients
              </h2>
              <span className="font-ui text-xs text-muted-foreground">
                {getCheckedProgress(checkedIngredients, ingredients.length)}
              </span>
            </div>
            {ingredients.length === 0 ? (
              <p className="mt-4 text-muted-foreground">No ingredients listed.</p>
            ) : (
              <ul className="mt-4 divide-y divide-divider">
                {ingredients.map((ingredient, index) => {
                  const checked = checkedIngredients.has(index);
                  return (
                    <li key={`${ingredient}-${index}`}>
                      <label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-base leading-relaxed">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCheckedIngredients((current) =>
                              toggleCheckedItem(current, index),
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
                          {ingredient}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="lg:col-span-3" aria-labelledby="cook-instructions-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cook-instructions-title" className="font-editorial text-3xl">
                Instructions
              </h2>
              <span className="font-ui text-xs text-muted-foreground">
                {getCheckedProgress(checkedInstructions, instructions.length)}
              </span>
            </div>
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
