"use server";

import { getAuthenticatedUser } from "@/app/actions/_shared";
import { estimateOrderSchema } from "@/features/estimate/estimate.schemas";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { runOrderEstimate } from "@/lib/estimate/run-estimate";

export type OrderEstimateData = {
  groceryList: { normalizedName: string; displayName: string; qty?: number; unit?: string; sources?: { recipeTitle: string; line: string }[] }[];
  totalCents: number;
  missing: { normalizedName: string; reason: string }[];
  perLine: { normalizedName: string; displayName: string; qty?: number; unit?: string; estimatedCents: number }[];
};

export async function estimateOrderAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<OrderEstimateData>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = estimateOrderSchema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const result = await runOrderEstimate(parsed.data.orderId, user.id);
  if (!result) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Order not found." } };
  }

  return {
    ok: true,
    data: {
      groceryList: result.groceryList,
      totalCents: result.totalCents,
      missing: result.missing,
      perLine: result.perLine,
    },
  };
}
