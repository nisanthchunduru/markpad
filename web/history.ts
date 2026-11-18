export class EditHistory<T> {
  private past: Array<{ before: T; after: T }> = [];
  private future: Array<{ before: T; after: T }> = [];
  private group: string | null = null;
  private lastChange = 0;

  record(before: T, after: T, group: string | null = null, now = Date.now()): void {
    const previous = this.past.at(-1);
    if (previous && group && group === this.group && now - this.lastChange < 400 && !this.future.length) previous.after = after;
    else {
      this.past.push({ before, after });
      if (this.past.length > 300) this.past.shift();
    }
    this.future = [];
    this.group = group;
    this.lastChange = now;
  }

  undo(): T | undefined {
    const entry = this.past.pop();
    this.group = null;
    if (!entry) return;
    this.future.push(entry);
    return entry.before;
  }

  redo(): T | undefined {
    const entry = this.future.pop();
    this.group = null;
    if (!entry) return;
    this.past.push(entry);
    return entry.after;
  }

  reset(): void { this.past = []; this.future = []; this.group = null; }
}
