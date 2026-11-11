import { actions } from "astro:actions";
import { z } from "zod";
import { MUTATION_KINDS, type MutationKind } from "./mutations.schemas";
import { canonicalInput } from "./canonical";

export const PENDING_CREATES_CHANGED = "pantry:pending-creates-changed";
const PREFIX = "pantry:pending-create:";
const active = new Set<string>();
const pendingCreateSchema = z.object({
  accountId: z.string(),
  operationId: z.uuid(),
  kind: z.enum(MUTATION_KINDS),
  payload: z.record(z.string(), z.unknown()),
  destination: z.enum(["detail", "map"]),
});
export type PendingCreate = z.infer<typeof pendingCreateSchema>;

interface CreateResult {
  data?: { id: string };
  error?: { message: string; code?: string; fields?: unknown };
}

export class SubmissionStorageError extends Error {
  constructor() {
    super("Your browser could not remember this submission. Enable session storage before saving so a retry cannot create a duplicate.");
    this.name = "SubmissionStorageError";
  }
}

function accountId() {
  const id = document.querySelector<HTMLElement>("[data-account-id]")?.dataset.accountId;
  if (!id) throw new SubmissionStorageError();
  return id;
}

function storageKey(entry: Pick<PendingCreate, "accountId" | "kind" | "payload">) {
  const scope = entry.kind === "recipes.duplicate" ? `:${entry.payload.recipeId}` : "";
  return `${PREFIX}${entry.accountId}:${entry.kind}${scope}`;
}

function changed() {
  window.dispatchEvent(new Event(PENDING_CREATES_CHANGED));
}

function clientStateError(message: string): CreateResult {
  return { error: { code: "CLIENT_STATE", message } };
}

export function readPendingCreates(): PendingCreate[] {
  const id = accountId();
  const entries: PendingCreate[] = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index)!;
    if (!key.startsWith(`${PREFIX}${id}:`)) continue;
    try {
      const parsed = pendingCreateSchema.safeParse(JSON.parse(sessionStorage.getItem(key)!));
      if (parsed.success && parsed.data.accountId === id && storageKey(parsed.data) === key && !active.has(key)) {
        entries.push(parsed.data);
      }
    } catch {
      // A malformed record cannot be used to retry a submission.
    }
  }
  return entries;
}

function clear(entry: PendingCreate) {
  const key = storageKey(entry);
  const current = sessionStorage.getItem(key);
  if (current && pendingCreateSchema.parse(JSON.parse(current)).operationId === entry.operationId) {
    sessionStorage.removeItem(key);
  }
  changed();
}

async function invoke(entry: PendingCreate): Promise<CreateResult> {
  const input = { ...entry.payload, operationId: entry.operationId, accountId: entry.accountId };
  switch (entry.kind) {
    case "recipes.create":
      return actions.recipes.create(input as Parameters<typeof actions.recipes.create>[0]);
    case "recipes.duplicate": {
      const form = new FormData();
      form.set("recipeId", String(entry.payload.recipeId));
      form.set("operationId", entry.operationId);
      form.set("accountId", entry.accountId);
      return actions.recipes.duplicate(form);
    }
    case "recipeImport.saveTextOnly": {
      const result = await actions.recipeImport.saveTextOnly(input as Parameters<typeof actions.recipeImport.saveTextOnly>[0]);
      return result.error ? { error: result.error } : { data: { id: result.data.recipeId } };
    }
  }
}

async function lookupOutcome(entry: PendingCreate): Promise<CreateResult> {
  const result = await actions.mutations.outcome({ operationId: entry.operationId, accountId: entry.accountId });
  if (result.error) return { error: result.error };
  if (result.data.status === "cancelled") {
    clear(entry);
    return clientStateError("The original submission was cancelled. You can now save your changes as a new submission.");
  }
  if (result.data.status !== "completed") return {};
  if (result.data.kind !== entry.kind) {
    return clientStateError("This submission belongs to a different action. Its original tracking key has been retained.");
  }
  clear(entry);
  return { data: { id: result.data.id } };
}

async function withActive(entry: PendingCreate, run: () => Promise<CreateResult>): Promise<CreateResult> {
  if (entry.accountId !== accountId()) throw new SubmissionStorageError();
  const key = storageKey(entry);
  if (active.has(key)) return clientStateError("This submission is already being saved.");
  active.add(key);
  changed();
  try {
    return await run();
  } finally {
    active.delete(key);
    changed();
  }
}

export function confirmCreate(entry: PendingCreate) {
  return withActive(entry, () => lookupOutcome(entry));
}

export function cancelCreate(entry: PendingCreate) {
  return withActive(entry, async () => {
    const result = await actions.mutations.cancel({
      operationId: entry.operationId, accountId: entry.accountId, kind: entry.kind,
    });
    if (result.error) return { error: result.error };
    if (result.data.status === "completed" && result.data.kind !== entry.kind) {
      return clientStateError("This submission belongs to a different action. Its original tracking key has been retained.");
    }
    clear(entry);
    return result.data.status === "completed"
      ? { data: { id: result.data.id } }
      : clientStateError("The original submission was cancelled. You can now save your changes as a new submission.");
  });
}

async function send(entry: PendingCreate, confirmFirst: boolean): Promise<CreateResult> {
  return withActive(entry, async () => {
    if (confirmFirst) {
      const confirmed = await lookupOutcome(entry);
      if (confirmed.data || confirmed.error) return confirmed;
    }
    const result = await invoke(entry);
    // A rejected retry says nothing about an earlier, still-running request.
    if (result.data || (!confirmFirst && result.error?.code && ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(result.error.code))) {
      clear(entry);
    }
    return result;
  });
}

export async function submitCreate(
  kind: MutationKind,
  payload: Record<string, unknown>,
  destination: PendingCreate["destination"] = "detail",
): Promise<CreateResult> {
  const id = accountId();
  const key = storageKey({ accountId: id, kind, payload });
  let existing: PendingCreate | undefined;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const parsed = pendingCreateSchema.safeParse(JSON.parse(stored));
      if (!parsed.success || parsed.data.accountId !== id || storageKey(parsed.data) !== key) {
        throw new SubmissionStorageError();
      }
      existing = parsed.data;
    }
  } catch {
    throw new SubmissionStorageError();
  }
  if (existing) {
    // Never turn an uncertain submission into a new create, even after edits.
    if (canonicalInput(existing.payload) !== canonicalInput(payload)) {
      return clientStateError("Your earlier save has an unknown outcome. Use Check save status or Retry original save before saving these changes.");
    }
    return send(existing, true);
  }
  const entry: PendingCreate = {
    accountId: id, operationId: crypto.randomUUID(), kind,
    payload: JSON.parse(JSON.stringify(payload)), destination,
  };
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    throw new SubmissionStorageError();
  }
  return send(entry, false);
}

export function retryCreate(entry: PendingCreate) {
  return send(entry, true);
}

export function createdResourcePath(entry: Pick<PendingCreate, "kind" | "destination">, id: string) {
  return `/recipes/${id}${entry.destination === "map" ? "/map-ingredients" : ""}`;
}
