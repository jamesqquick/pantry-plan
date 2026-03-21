import { cn } from "@/lib/utils";
import { renderMarkdownToHtml } from "@/features/markdown/render-markdown";

const proseNotes =
  "prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-a:text-primary dark:prose-invert";

type MarkdownContentProps = {
  source: string;
  className?: string;
};

/** Server-only: renders user Markdown with GFM + sanitization. */
export async function MarkdownContent({ source, className }: MarkdownContentProps) {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const html = await renderMarkdownToHtml(source);
  return (
    <div
      className={cn(proseNotes, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
