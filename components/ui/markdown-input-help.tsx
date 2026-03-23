"use client";

import { cn } from "@/lib/utils";

const MARKDOWN_DOCS_URL = "https://www.markdownguide.org/basic-syntax/";

type MarkdownInputHelpProps = {
  className?: string;
};

export function MarkdownInputHelp({ className }: MarkdownInputHelpProps) {
  return (
    <p
      className={cn("mt-1 text-xs text-muted-foreground", className)}
    >
      <a
        href={MARKDOWN_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="underline hover:no-underline"
      >
        Markdown
      </a>{" "}
      is supported: **bold**, lists, links, and `inline code`.
    </p>
  );
}

