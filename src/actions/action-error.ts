import { ActionError } from "astro:actions";
import { DatabaseTimeoutError } from "@/lib/database-timeout";

export async function withSafeActionError<T>(
  operation: string,
  message: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    if (cause instanceof DatabaseTimeoutError) throw cause;
    if (cause instanceof ActionError && cause.code !== "INTERNAL_SERVER_ERROR") {
      throw cause;
    }

    console.error(`Unexpected error in ${operation}`, cause);
    throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}
