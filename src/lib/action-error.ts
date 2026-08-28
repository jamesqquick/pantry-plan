interface ActionResult {
  error?: { message?: string } | null;
}

interface ActionRecoveryOptions {
  action: () => Promise<ActionResult>;
  fallback: string;
  onError: (message: string) => void;
  onSuccess: () => void | Promise<void>;
  onSettled: () => void;
}

export async function getActionErrorMessage(
  action: () => Promise<ActionResult>,
  fallback: string,
): Promise<string | null> {
  try {
    const { error } = await action();
    return error ? error.message || fallback : null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}

export async function runActionWithRecovery({
  action,
  fallback,
  onError,
  onSuccess,
  onSettled,
}: ActionRecoveryOptions): Promise<void> {
  try {
    const errorMessage = await getActionErrorMessage(action, fallback);
    if (errorMessage) {
      onError(errorMessage);
      return;
    }
    await onSuccess();
  } finally {
    onSettled();
  }
}
