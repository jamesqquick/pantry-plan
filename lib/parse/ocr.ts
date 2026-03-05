/**
 * Server-side OCR using Tesseract.js. Used by parseRecipeFromImageAction.
 * Input buffer must be from a validated image (type and size already checked).
 */

import { createWorker } from "tesseract.js";

export interface OcrResult {
  ok: true;
  data: string;
}

export interface OcrError {
  ok: false;
  error: string;
}

/**
 * Extract text from an image buffer using Tesseract.js.
 * Caller must validate file type and size before passing the buffer.
 */
export async function extractTextFromImageBuffer(
  buffer: Buffer
): Promise<OcrResult | OcrError> {
  let worker;
  try {
    worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return { ok: true, data: text ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "OCR failed";
    return { ok: false, error: message };
  } finally {
    if (worker) await worker.terminate();
  }
}
