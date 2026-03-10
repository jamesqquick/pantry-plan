"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppIcon } from "@/components/ui/icons";
import {
  getWeekDates,
  prevWeek,
  nextWeek,
} from "@/lib/meal-plan/week-dates";
import {
  getMealPlanWeekDataAction,
  type MealPlanWeekData,
} from "@/app/actions/meal-plan.actions";
import { MealPlanWeekClient } from "./meal-plan-week-client";

function parseWeekStartFromPath(pathname: string | null): string | null {
  if (!pathname?.startsWith("/meal-plan/")) return null;
  const segment = pathname.replace("/meal-plan/", "").split("?")[0];
  return segment && /^\d{4}-\d{2}-\d{2}$/.test(segment) ? segment : null;
}

export function MealPlanShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekStart = parseWeekStartFromPath(pathname);
  const addRecipe = searchParams?.get("addRecipe") ?? undefined;

  const [data, setData] = useState<MealPlanWeekData | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!weekStart) return;
    getMealPlanWeekDataAction(weekStart).then((r) => {
      if (r.ok) setData(r.data);
    });
  }, [weekStart]);

  useEffect(() => {
    if (!weekStart) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getMealPlanWeekDataAction(weekStart).then((r) => {
      if (r.ok) setData(r.data);
      setLoading(false);
    });
  }, [weekStart]);

  if (pathname === "/meal-plan" || !weekStart) {
    return null;
  }

  const weekDates = getWeekDates(weekStart);
  const weekStartDate = new Date(weekStart + "T12:00:00");
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const monthName = weekStartDate.toLocaleDateString("en-US", { month: "long" });
  const year = weekStartDate.getUTCFullYear();
  const startDay = weekStartDate.getUTCDate();
  const endDay = weekEndDate.getUTCDate();
  const weekRangeText = `${monthName} ${startDay}-${endDay}, ${year}`;
  const prevWeekStart = prevWeek(weekStart);
  const nextWeekStart = nextWeek(weekStart);

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4"
        aria-label="Previous and next week"
      >
        <p className="order-1 text-center text-muted-foreground text-sm sm:order-2 sm:text-base">
          {weekRangeText}
        </p>
        <div className="order-2 flex justify-center gap-3 sm:contents sm:gap-4">
          <Link
            href={`/meal-plan/${prevWeekStart}`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-input border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground sm:order-1"
            aria-label="Previous week"
          >
            <AppIcon name="back" size={18} aria-hidden />
          </Link>
          <Link
            href={`/meal-plan/${nextWeekStart}`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-input border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground sm:order-3"
            aria-label="Next week"
          >
            <span className="sr-only">Next</span>
            <AppIcon name="back" size={18} className="rotate-180" aria-hidden />
          </Link>
        </div>
      </nav>

      {loading ? (
        <div
          className="animate-pulse rounded-input bg-muted/50"
          style={{ minHeight: 280 }}
          aria-busy="true"
          aria-label="Loading meal plan"
        />
      ) : data ? (
        <MealPlanWeekClient
          weekStart={data.weekStart}
          weekDates={data.weekDates}
          plannedMeals={data.plannedMeals}
          recipeOptions={data.recipeOptions}
          groceryTotals={data.groceryTotals}
          groceryLines={data.groceryLines}
          groceryIssues={data.groceryIssues ?? undefined}
          totalEstimatedCostCents={data.totalEstimatedCostCents}
          initialAddRecipeId={addRecipe}
          onRefresh={refetch}
        />
      ) : null}
    </div>
  );
}
