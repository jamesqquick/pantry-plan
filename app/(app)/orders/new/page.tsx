import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listRecipesForUser } from "@/lib/queries/recipes";
import { Callout } from "@/components/ui/callout";
import { PageTitle } from "@/components/ui/page-title";
import { OrderForm } from "@/components/orders/order-form";

async function NewOrderPageData() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const recipeOptions = await listRecipesForUser(session.user.id);
  return (
    <div className="space-y-6">
      <PageTitle>New order</PageTitle>
      {recipeOptions.length === 0 ? (
        <p className="text-muted-foreground">
          Create at least one recipe first.{" "}
          <Link href="/recipes/new" className="underline">
            Add a recipe
          </Link>
          .
        </p>
      ) : (
        <>
          <Callout variant="info" className="text-info">
            <p className="font-medium">Tip: Enhanced ingredient data improves your orders</p>
            <p className="mt-1">
              When recipe ingredients are linked to enhanced ingredient records (with units, categories, and optional costs), the app can sum quantities across recipes, build smarter grocery lists, and estimate order costs. Consider{" "}
              <Link href="/ingredients" className="underline hover:text-info">
                managing your ingredients
              </Link>{" "}
              to get the most out of orders.
            </p>
          </Callout>
          <OrderForm mode="create" recipeOptions={recipeOptions} />
        </>
      )}
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <NewOrderPageData />
    </Suspense>
  );
}
