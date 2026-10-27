import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("responsive typography tokens", () => {
  it("uses larger body and supporting text sizes on phones", () => {
    expect(globalStyles).toMatch(
      /:root\s*\{[^}]*--font-size-body:\s*1rem;[^}]*--line-height-body:\s*1\.5rem;[^}]*--font-size-meta:\s*0\.875rem;[^}]*--line-height-meta:\s*1\.25rem;/,
    );
  });

  it("restores existing desktop sizes at the 640px breakpoint", () => {
    expect(globalStyles).toMatch(
      /@media\s*\(min-width:\s*40rem\)\s*\{\s*:root\s*\{[^}]*--font-size-body:\s*0\.875rem;[^}]*--line-height-body:\s*1\.25rem;[^}]*--font-size-meta:\s*0\.75rem;[^}]*--line-height-meta:\s*1rem;/,
    );
  });

  it("exposes the responsive tokens as Tailwind text utilities", () => {
    expect(globalStyles).toContain("--text-body: var(--font-size-body);");
    expect(globalStyles).toContain("--text-meta: var(--font-size-meta);");
  });
});
