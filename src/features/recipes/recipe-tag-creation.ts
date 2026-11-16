import { sql } from "drizzle-orm";
import { recipeTag, tag, type Db } from "@/db";
import { chunkRows } from "@/db/chunked-insert";

export function newRecipeTagStatements(
  db: Db,
  userId: string,
  recipeId: string,
  names: readonly string[],
) {
  const uniqueNames = [...new Set(names.map((name) => name.trim()))];
  const tags = uniqueNames.map((name) => ({ userId, name }));
  const associations = uniqueNames.map((name) => ({
    recipeId,
    tagId: sql<string>`(SELECT ${tag.id} FROM ${tag}
      WHERE ${tag.userId} = ${userId} AND ${tag.name} = ${name})`,
  }));

  return [
    ...chunkRows(tags, 4).map((rows) =>
      db.insert(tag).values(rows).onConflictDoNothing({ target: [tag.userId, tag.name] }),
    ),
    ...chunkRows(associations, 4).map((rows) =>
      db.insert(recipeTag).values(rows).onConflictDoNothing({
        target: [recipeTag.recipeId, recipeTag.tagId],
      }),
    ),
  ];
}
