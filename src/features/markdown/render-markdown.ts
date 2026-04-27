/** Server-only in practice (called from .astro files and actions).
 * Not marked "server-only" — Astro has no analogous directive. */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize)
  .use(rehypeStringify);

/** Markdown → sanitized HTML for trusted display only (user content, XSS-stripped). */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
