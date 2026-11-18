import { rebaseDraft } from '../src/diff';

export class DocumentSync {
  version = -1;
  base = '';
  private pending: string | null = null;
  conflict = false;

  outgoing(draft: string): { type: 'edit'; text: string; version: number } | undefined {
    if (this.version < 0 || this.pending !== null || this.conflict || draft === this.base) return;
    this.pending = draft;
    return { type: 'edit', text: draft, version: this.version };
  }

  receive(text: string, version: number, draft: string): { text: string; external: boolean } | null {
    if (version < this.version) return null;
    const first = this.version < 0;
    const ack = this.pending === text;
    const unchanged = text === this.base;
    if (unchanged && !first && this.pending !== null) {
      this.version = version;
      return null;
    }
    const merged = first ? text : ack ? draft : text === draft ? draft : rebaseDraft(this.base, draft, text);
    this.base = text;
    this.version = version;
    this.pending = null;
    if (merged === null || this.conflict) { this.conflict = true; return null; }
    return { text: merged, external: !ack && !unchanged && !first };
  }

  resolve(useLatest: boolean, draft: string): string {
    this.conflict = false;
    return useLatest ? this.base : draft;
  }
}
