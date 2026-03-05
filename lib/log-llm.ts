/**
 * Structured logging for LLM (OpenAI) requests. Use at each call site to track
 * context, outcome, duration, and token usage. Do not log API keys or user content.
 */

export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LogLlmRequestParams {
  context: string;
  model: string;
  success: boolean;
  durationMs: number;
  usage?: LlmUsage | null;
  errorMessage?: string;
}

/**
 * Log one LLM request completion. Single line, consistent format for filtering and aggregation.
 */
export function logLlmRequest(params: LogLlmRequestParams): void {
  const { context, model, success, durationMs, usage, errorMessage } = params;
  const parts = [
    "[LLM]",
    `context=${context}`,
    `model=${model}`,
    `success=${success}`,
    `durationMs=${durationMs}`,
  ];
  if (usage != null) {
    if (usage.prompt_tokens != null) parts.push(`prompt_tokens=${usage.prompt_tokens}`);
    if (usage.completion_tokens != null) parts.push(`completion_tokens=${usage.completion_tokens}`);
    if (usage.total_tokens != null) parts.push(`total_tokens=${usage.total_tokens}`);
  }
  if (errorMessage != null && !success) parts.push(`errorMessage=${errorMessage}`);
  console.info(parts.join(" "));
}
