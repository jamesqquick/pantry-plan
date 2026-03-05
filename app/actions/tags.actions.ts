"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { createTagSchema, deleteTagSchema, tagSearchQuerySchema } from "@/features/tags/tags.schemas";
import { listTagsForUser } from "@/lib/queries/tags";

export async function createTagAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string; name: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = createTagSchema.safeParse({
    name: formData.get("name"),
  });
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

  const db = getDb();
  const name = parsed.data.name.trim();
  const existing = await db.tag.findUnique({
    where: {
      userId_name: { userId: user.id, name },
    },
  });
  if (existing) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "A tag with this name already exists",
        fieldErrors: { name: ["A tag with this name already exists"] },
      },
    };
  }

  const tag = await db.tag.create({
    data: { userId: user.id, name },
    select: { id: true, name: true },
  });

  revalidatePath("/recipes");
  revalidatePath("/");
  return { ok: true, data: tag };
}

export async function deleteTagAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = deleteTagSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid tag id",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const db = getDb();
  const tag = await db.tag.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, userId: true },
  });
  if (!tag || tag.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Tag not found." } };
  }

  await db.tag.delete({ where: { id: parsed.data.id } });

  revalidatePath("/recipes");
  revalidatePath("/");
  return { ok: true, data: { id: parsed.data.id } };
}

export async function listTagsAction(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const tags = await listTagsForUser(userResult.data.id);
  return { ok: true, data: tags };
}

const PICKER_SEARCH_TAKE = 10;

export async function searchTagsForPickerAction(
  raw: unknown
): Promise<ActionResult<{ id: string; name: string }[]>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = tagSearchQuerySchema.safeParse(raw);
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

  const query = parsed.data;
  if (query.length === 0) {
    return { ok: true, data: [] };
  }

  const db = getDb();
  const tags = await db.tag.findMany({
    where: {
      userId: user.id,
      name: { contains: query },
    },
    orderBy: { name: "asc" },
    take: PICKER_SEARCH_TAKE,
    select: { id: true, name: true },
  });

  return { ok: true, data: tags };
}
