import { getDb } from "@/lib/db";

export async function listOrdersForUser(userId: string) {
  const db = getDb();
  return db.order.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOrderForUser(orderId: string, userId: string) {
  const db = getDb();
  return db.order.findFirst({
    where: { id: orderId, userId },
    include: {
      orderItems: {
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              recipeIngredients: {
                orderBy: { sortOrder: "asc" },
                include: {
                  ingredient: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

/** Order with recipes and recipeIngredients + ingredient for grocery list aggregation. */
export async function getOrderWithGroceryData(orderId: string, userId: string) {
  const db = getDb();
  return db.order.findFirst({
    where: { id: orderId, userId },
    include: {
      orderItems: {
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              userId: true,
              recipeIngredients: {
                include: {
                  ingredient: {
                    select: {
                      id: true,
                      name: true,
                      costBasisUnit: true,
                      estimatedCentsPerBasisUnit: true,
                      gramsPerCup: true,
                      cupsPerEach: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
