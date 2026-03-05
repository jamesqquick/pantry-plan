import { getDb } from "@/lib/db";

export async function listTagsForUser(userId: string) {
  const db = getDb();
  return db.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
