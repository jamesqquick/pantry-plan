/**
 * Heuristic parser: raw OCR text -> recipe-shaped object (title, ingredients, instructions, optional times/servings).
 * Output is untrusted; must be validated before use.
 */

export interface ParsedRecipeFromText {
  title: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  notes?: string;
}

const SECTION_HEADERS = [
  "ingredients",
  "instructions",
  "directions",
  "method",
  "steps",
  "preparation",
] as const;

const SERVINGS_REGEX = /\b(?:serves?|servings?|yield)\s*:?\s*(\d+)\b/i;
const PREP_TIME_REGEX =
  /\b(?:prep(?:aration)?\s*(?:time)?|prep time)\s*:?\s*(\d+)\s*(?:min(?:ute)?s?|mins?)?\b/i;
const COOK_TIME_REGEX =
  /\b(?:cook(?:ing)?\s*(?:time)?|cook time)\s*:?\s*(\d+)\s*(?:min(?:ute)?s?|mins?)?\b/i;
const TOTAL_TIME_REGEX =
  /\b(?:total\s*(?:time)?)\s*:?\s*(\d+)\s*(?:min(?:ute)?s?|mins?)?\b/i;

function splitSections(
  text: string,
): { beforeFirst: string; sections: Map<string, string> } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const sections = new Map<string, string>();
  let currentHeader: string | null = null;
  let currentLines: string[] = [];
  let beforeFirst = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    const matchedHeader = SECTION_HEADERS.find(
      (h) => lower === h || lower.startsWith(h + ":") || lower === h + "s",
    );

    if (matchedHeader) {
      if (currentHeader) {
        const content = currentLines
          .map((l) => l.trim())
          .filter(Boolean)
          .join("\n");
        if (content) sections.set(currentHeader, content);
      }
      currentHeader = matchedHeader;
      currentLines = [];
      if (beforeFirst === "" && i > 0) {
        beforeFirst = lines
          .slice(0, i)
          .map((l) => l.trim())
          .filter(Boolean)
          .join("\n");
      }
      continue;
    }
    if (currentHeader) {
      currentLines.push(line);
    }
  }
  if (currentHeader) {
    const content = currentLines
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    if (content) sections.set(currentHeader, content);
  }
  if (beforeFirst === "") beforeFirst = normalized;
  return { beforeFirst, sections };
}

function extractNumber(regex: RegExp, text: string): number | undefined {
  const m = text.match(regex);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? undefined : n;
}

function linesToArray(block: string): string[] {
  return block
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse raw OCR text into a recipe-shaped object. Returns null if we cannot extract
 * at least a title and one instruction.
 */
export function parseRecipeFromText(
  ocrText: string,
): ParsedRecipeFromText | null {
  const trimmed = ocrText.trim();
  if (!trimmed) return null;

  const { beforeFirst, sections } = splitSections(trimmed);

  let title = "";
  const beforeLines = linesToArray(beforeFirst);
  if (beforeLines.length > 0) title = beforeLines[0];

  const ingredientsKey = [...sections.keys()].find(
    (k) => k.includes("ingredient") || k === "ingredients",
  );
  const instructionsKey = [...sections.keys()].find(
    (k) =>
      k.includes("instruction") ||
      k.includes("direction") ||
      k.includes("method") ||
      k.includes("step") ||
      k.includes("preparation") ||
      k.includes("to make"),
  );

  let ingredients: string[] = [];
  if (ingredientsKey) {
    ingredients = linesToArray(sections.get(ingredientsKey) ?? "");
  }

  let instructions: string[] = [];
  if (instructionsKey) {
    instructions = linesToArray(sections.get(instructionsKey) ?? "");
  }

  if (instructions.length === 0 && beforeLines.length > 1) {
    const rest = beforeLines.slice(1).join("\n");
    const restLines = linesToArray(rest);
    if (restLines.length > 0) {
      instructions = restLines;
    }
  }
  if (instructions.length === 0 && ingredients.length > 0) {
    instructions = ["See ingredients and prepare as directed."];
  }
  if (instructions.length === 0) return null;

  if (!title || title.length > 500) {
    title = title || "Recipe from image";
    if (title.length > 500) title = title.slice(0, 497) + "...";
  }

  const servings = extractNumber(SERVINGS_REGEX, trimmed);
  const prepTimeMinutes = extractNumber(PREP_TIME_REGEX, trimmed);
  const cookTimeMinutes = extractNumber(COOK_TIME_REGEX, trimmed);
  const totalTimeMinutes = extractNumber(TOTAL_TIME_REGEX, trimmed);

  return {
    title,
    ingredients,
    instructions,
    ...(servings != null && { servings }),
    ...(prepTimeMinutes != null && { prepTimeMinutes }),
    ...(cookTimeMinutes != null && { cookTimeMinutes }),
    ...(totalTimeMinutes != null && { totalTimeMinutes }),
  };
}
