import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWeekStartString } from "@/lib/meal-plan/week-dates";

async function MealPlanRedirect(): Promise<React.ReactNode> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const weekStart = getWeekStartString(new Date());
  redirect(`/meal-plan/${weekStart}`);
  return null;
}

export default function MealPlanPage() {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-input bg-muted h-16" />}>
      <MealPlanRedirect />
    </Suspense>
  );
}
