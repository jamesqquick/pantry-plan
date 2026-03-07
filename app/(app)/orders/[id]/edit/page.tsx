import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrderForUser } from "@/lib/queries/orders";
import { listRecipesForUser } from "@/lib/queries/recipes";
import { PageTitle } from "@/components/ui/page-title";
import { OrderForm } from "@/components/orders/order-form";

async function EditOrderPageData({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const [order, recipeOptions] = await Promise.all([
    getOrderForUser(id, session.user.id),
    listRecipesForUser(session.user.id),
  ]);
  if (!order) notFound();
  type OrderItemRow = NonNullable<
    Awaited<ReturnType<typeof getOrderForUser>>
  >["orderItems"][number];
  const initialItems = order.orderItems.map((item: OrderItemRow) => ({
    recipeId: item.recipeId,
    batches: item.batches,
  }));
  return (
    <div className="space-y-6">
      <Link
        href={`/orders/${id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to order
      </Link>
      <PageTitle>Edit order</PageTitle>
      <OrderForm
        mode="edit"
        orderId={id}
        recipeOptions={recipeOptions}
        initialName={order.name ?? ""}
        initialNotes={order.notes ?? ""}
        initialItems={initialItems}
      />
    </div>
  );
}

export default function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <EditOrderPageData params={params} />
    </Suspense>
  );
}
