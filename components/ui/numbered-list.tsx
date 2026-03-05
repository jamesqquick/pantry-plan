export function NumberedList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="mt-2 list-none space-y-4 pl-0 text-foreground" role="list">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-3">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">{item || "—"}</span>
        </li>
      ))}
    </ol>
  );
}
