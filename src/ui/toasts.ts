/**
 * Folds the notices waiting to be shown into a few lines, so a burst of news reads as one
 * notice instead of a queue that keeps covering the screen. Notices of the same kind
 * ("Новое улучшение: …") share a line.
 */
export function bundle(messages: readonly string[], maxLines = 3, maxItems = 3): string[] {
  const groups = new Map<string, string[]>();
  for (const m of messages) {
    const at = m.indexOf(': ');
    // A short prefix before ": " names the kind of news; anything else stands alone.
    const kind = at > 0 && at <= 30 ? m.slice(0, at) : m;
    const what = at > 0 && at <= 30 ? m.slice(at + 2) : '';
    const items = groups.get(kind);
    if (items && what) items.push(what);
    else if (!items) groups.set(kind, what ? [what] : []);
  }
  const list = (items: string[]) =>
    items.length > maxItems ? `${items.slice(0, maxItems).join(', ')} и ещё ${items.length - maxItems}` : items.join(', ');
  const lines = [...groups].map(([kind, items]) => (items.length ? `${kind}: ${list(items)}` : kind));
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), `и ещё ${lines.length - maxLines + 1}`];
}
