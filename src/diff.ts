export interface TextPatch {
  from: number;
  to: number;
  insert: string;
}

export function minimalPatch(before: string, after: string): TextPatch | undefined {
  if (before === after) return undefined;
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > from && afterEnd > from && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  return { from, to: beforeEnd, insert: after.slice(from, afterEnd) };
}

export function rebaseDraft(oldBase: string, draft: string, latest: string): string | null {
  const mine = minimalPatch(oldBase, draft);
  const theirs = minimalPatch(oldBase, latest);
  if (!mine) return latest;
  if (!theirs) return draft;
  if (mine.to <= theirs.from) return latest.slice(0, mine.from) + mine.insert + latest.slice(mine.to);
  if (theirs.to <= mine.from) {
    const offset = theirs.insert.length - (theirs.to - theirs.from);
    return latest.slice(0, mine.from + offset) + mine.insert + latest.slice(mine.to + offset);
  }
  return null;
}
