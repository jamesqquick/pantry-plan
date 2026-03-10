import { Suspense } from "react";
import { PageTitle } from "@/components/ui/page-title";
import { MealPlanShell } from "@/components/meal-plan/meal-plan-shell";

export default function MealPlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <PageTitle>Meal Planner</PageTitle>
      <Suspense
        fallback={
          <div
            className="animate-pulse rounded-input bg-muted/50"
            style={{ minHeight: 120 }}
            aria-busy="true"
          />
        }
      >
        <MealPlanShell />
      </Suspense>
      {children}
    </div>
  );
}
