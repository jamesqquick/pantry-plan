export function toggleCheckedItem(
  current: ReadonlySet<number>,
  index: number,
): Set<number> {
  const next = new Set(current);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}
