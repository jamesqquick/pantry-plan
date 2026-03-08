import React, { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { LandingSkeleton } from "@/components/landing/landing-skeleton";

export const metadata = {
  title: "Pantry Plan – Recipes, ingredients, and grocery lists in one place",
  description:
    "Turn recipe URLs and meal plans into merged grocery lists and cost estimates. One catalog, less manual work.",
};

async function HomePageContent(): Promise<React.ReactNode> {
  const session = await auth();
  if (session?.user) redirect("/recipes");
  return <LandingPage />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<LandingSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}
