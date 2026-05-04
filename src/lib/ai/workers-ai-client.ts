/**
 * Thin wrapper around the Workers AI binding (`env.AI`).
 *
 * Provides typed helpers for the two patterns we need:
 *   1. Text chat completion with JSON mode (ingredient mapping)
 *   2. Vision chat completion with JSON mode (image → recipe)
 *
 * Model: Gemma 3 12B — multimodal with strong vision/OCR/document
 *   parsing and JSON mode support.
 *
 * All methods are pure functions that accept the `Ai` binding so they
 * can be tested and never import from `cloudflare:workers` at module scope.
 */

import { logLlmRequest, type LlmUsage } from "@/lib/log-llm";

export const WORKERS_AI_MODEL =
  "@cf/google/gemma-3-12b-it" as const;

const AI_GATEWAY_ID = "pantry-plan" as const;
const DEFAULT_VISION_TIMEOUT_MS = 15_000;

/** Race a promise against a timeout. Rejects with a clear message on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

/** Gateway options shared across all Workers AI calls. */
const gatewayOptions = {
  gateway: {
    id: AI_GATEWAY_ID,
    skipCache: false,
    cacheTtl: 3600,
  },
} as const;

/** Convert ArrayBuffer to data-URI (Workers-compatible, no Node Buffer). */
function arrayBufferToDataUri(
  buffer: ArrayBuffer,
  mimeType: string,
): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export type WorkersAiTextResult = {
  response: string;
  usage?: LlmUsage;
};

/**
 * Run a text-only chat completion with JSON mode.
 * Returns the raw response string (caller parses/validates).
 */
export async function workersAiTextJson(
  ai: Ai,
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number; context?: string },
): Promise<WorkersAiTextResult> {
  const context = opts?.context ?? "workers-ai-text";
  const startTime = Date.now();

  try {
    const result = (await ai.run.call(
      ai,
      WORKERS_AI_MODEL,
      {
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: opts?.maxTokens ?? 4096,
        temperature: opts?.temperature ?? 0.15,
      },
      gatewayOptions,
    )) as { response?: string; usage?: LlmUsage };

    const response = result.response ?? "";

    logLlmRequest({
      context,
      model: WORKERS_AI_MODEL,
      success: true,
      durationMs: Date.now() - startTime,
      usage: result.usage,
    });

    return { response, usage: result.usage };
  } catch (err) {
    logLlmRequest({
      context,
      model: WORKERS_AI_MODEL,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

/**
 * Run a vision chat completion with JSON mode.
 * Sends an image (as ArrayBuffer + MIME type) plus a text prompt.
 * Returns the raw response string.
 */
export async function workersAiVisionJson(
  ai: Ai,
  imageData: ArrayBuffer,
  mimeType: string,
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number; context?: string; timeoutMs?: number },
): Promise<WorkersAiTextResult> {
  const context = opts?.context ?? "workers-ai-vision";
  const dataUri = arrayBufferToDataUri(imageData, mimeType);
  const startTime = Date.now();

  try {
    const result = (await withTimeout(
      ai.run.call(ai, WORKERS_AI_MODEL, {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: opts?.maxTokens ?? 4096,
        temperature: opts?.temperature ?? 0.15,
      }, gatewayOptions),
      opts?.timeoutMs ?? DEFAULT_VISION_TIMEOUT_MS,
      "Recipe extraction timed out. The image may be too complex or the model is temporarily overloaded. Please try again.",
    )) as { response?: string; usage?: LlmUsage };

    const response = result.response ?? "";

    logLlmRequest({
      context,
      model: WORKERS_AI_MODEL,
      success: true,
      durationMs: Date.now() - startTime,
      usage: result.usage,
    });

    return { response, usage: result.usage };
  } catch (err) {
    logLlmRequest({
      context,
      model: WORKERS_AI_MODEL,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
