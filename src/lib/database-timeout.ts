import { AsyncLocalStorage } from "node:async_hooks";

const DATABASE_TIMEOUT_MS = 5_000;

export class DatabaseTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    public readonly operation = "database.operation",
  ) {
    super(`Database operation exceeded ${timeoutMs}ms`);
    this.name = "DatabaseTimeoutError";
  }
}

/** Bounds waiting only. In particular, a timed-out write may still commit. */
export async function withDatabaseTimeout<T>(
  query: PromiseLike<T>,
  timeoutMs = DATABASE_TIMEOUT_MS,
  operation?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DatabaseTimeoutError(timeoutMs, operation)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class DatabaseBudget {
  readonly startedAt = Date.now();
  readonly timedOut: Promise<DatabaseTimeoutError>;
  error?: DatabaseTimeoutError;
  writeStarted = false;
  private notifyTimeout!: (error: DatabaseTimeoutError) => void;
  private consumedMs = 0;
  private active = 0;
  private activeSince = 0;

  constructor(
    private readonly context: { route?: string; requestId?: string; databaseTimeOnly?: boolean } = {},
    readonly timeoutMs = DATABASE_TIMEOUT_MS,
  ) {
    this.timedOut = new Promise((resolve) => { this.notifyTimeout = resolve; });
  }

  private timeout(operation: string): DatabaseTimeoutError {
    if (!this.error) {
      this.error = new DatabaseTimeoutError(this.timeoutMs, operation);
      console.error(JSON.stringify({
        event: "database_timeout",
        operation,
        route: this.context.route,
        requestId: this.context.requestId,
        elapsedMs: Date.now() - this.startedAt,
        budgetMs: this.timeoutMs,
        writeStarted: this.writeStarted,
      }));
      this.notifyTimeout(this.error);
    }
    return this.error;
  }

  async run<T>(operation: string, start: () => PromiseLike<T>, write = false): Promise<T> {
    const now = Date.now();
    const elapsed = this.context.databaseTimeOnly
      ? this.consumedMs + (this.active ? now - this.activeSince : 0)
      : now - this.startedAt;
    if (this.error) throw this.error;
    const remaining = this.timeoutMs - elapsed;
    if (remaining <= 0) throw this.timeout(operation);

    if (this.active++ === 0) this.activeSince = now;
    this.writeStarted ||= write;
    try {
      const result = await withDatabaseTimeout(start(), remaining, operation);
      // Another concurrent step may have exhausted the same budget.
      if (this.error) throw this.error;
      return result;
    } catch (error) {
      if (error instanceof DatabaseTimeoutError) throw this.timeout(operation);
      throw error;
    } finally {
      if (--this.active === 0) this.consumedMs += Date.now() - this.activeSince;
    }
  }
}

const databaseContext = new AsyncLocalStorage<DatabaseBudget>();

export function getDatabaseBudget(): DatabaseBudget | undefined {
  return databaseContext.getStore();
}

export function withDatabaseBudget<T>(budget: DatabaseBudget, operation: () => T): T {
  return databaseContext.run(budget, operation);
}
