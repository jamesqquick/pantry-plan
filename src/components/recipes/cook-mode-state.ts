export function toggleCheckedItem<T>(
  current: ReadonlySet<T>,
  item: T,
): Set<T> {
  const next = new Set(current);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}
