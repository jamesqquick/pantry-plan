"use client";

import { cn } from "@/lib/utils";

const proseNotes =
  "prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-a:text-primary dark:prose-invert";

type SanitizedHtmlContentProps = {
  /** HTML produced server-side via `renderMarkdownToHtml` (or equivalent sanitize). */
  html: string;
  className?: string;
};

export function SanitizedHtmlContent({ html, className }: SanitizedHtmlContentProps) {
  if (!html.trim()) return null;
  return (
    <div
      className={cn(proseNotes, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
