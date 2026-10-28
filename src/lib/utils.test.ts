import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("preserves custom text-size classes alongside text colors", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe(
      "text-body text-muted-foreground",
    );
    expect(cn("text-meta", "text-destructive")).toBe(
      "text-meta text-destructive",
    );
  });

  it("resolves custom text-size conflicts", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body");
    expect(cn("text-body", "text-sm")).toBe("text-sm");
  });
});
