import { sql } from "drizzle-orm";
import { recipeTag, tag, type Db } from "@/db";
import { chunkRows } from "@/db/chunked-insert";

export function mcpRecipeTagStatements(
  db: Db,
  userId: string,
  recipeId: string,
  names: string[],
) {
  const uniqueNames = [...new Set(names.map((name) => name.trim()))];
  const tagRows = uniqueNames.map((name) => ({ userId, name }));
  const associationRows = uniqueNames.map((name) => ({
    recipeId,
    // Resolve after the upserts in the same batch, including concurrent inserts.
    tagId: sql<string>`(SELECT ${tag.id} FROM ${tag}
      WHERE ${tag.userId} = ${userId} AND ${tag.name} = ${name})`,
  }));

  return [
    ...chunkRows(tagRows, 4).map((chunk) =>
      db.insert(tag).values(chunk).onConflictDoNothing({
        target: [tag.userId, tag.name],
      }),
    ),
    ...chunkRows(associationRows, 4).map((chunk) =>
      db.insert(recipeTag).values(chunk).onConflictDoNothing({
        target: [recipeTag.recipeId, recipeTag.tagId],
      }),
    ),
  ];
}
