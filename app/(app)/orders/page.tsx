import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listOrdersForUser } from "@/lib/queries/orders";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { PrimaryList, type PrimaryListItem } from "@/components/ui/primary-list";
import { OrderListSkeleton } from "@/components/orders/order-list-skeleton";

async function OrdersListData() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const orders = await listOrdersForUser(session.user.id);
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No orders yet.{" "}
        <Link href="/orders/new" className="underline">
          Create one
        </Link>
        .
      </p>
    );
  }
  return (
    <PrimaryList
      items={orders.map(
        (order): PrimaryListItem => ({
          id: order.id,
          primaryText: order.name?.trim() || "Untitled order",
          secondaryText: new Date(order.updatedAt).toLocaleDateString(),
          href: `/orders/${order.id}`,
        })
      )}
      aria-label="Orders"
    />
  );
}

export default function OrdersListPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle>Orders</PageTitle>
        <Link href="/orders/new">
          <Button className={ICON_LABEL_GAP_CLASS}>
            <AppIcon name="add" size={18} aria-hidden />
            New order
          </Button>
        </Link>
      </div>
      <Suspense fallback={<OrderListSkeleton />}>
        <OrdersListData />
      </Suspense>
    </div>
  );
}
