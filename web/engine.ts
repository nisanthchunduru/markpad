import { type BlockNode, blocksToMarkdown, parseMarkdownToBlocks, renderBlockToHtml, generateId } from './markdown';
import { blockPrefix, classifyBlock, fromContent, inlineMarkdown, readBlock } from './serialize';
import { type SelectionBookmark, captureSelection, contentElement, restoreSelection, caret, plainText } from './selection';
import { EditHistory } from './history';
import { fenceCode, highlightedCode, withFenceLanguage } from './fences';
import { installFenceLanguageInputs } from './language-picker';

interface Snapshot { blocks: BlockNode[]; html: string; selection: SelectionBookmark | null; scroll: number }

export class MarkdownEditor {
  blocks: BlockNode[] = [];
  images: Record<string, string> = {};
  private history = new EditHistory<Snapshot>();
  private baseline = new Map<string, string>();
  private beforeInput: Snapshot | null = null;
  private composition = false;
  private lastSelection: SelectionBookmark | null = null;

  constructor(readonly root: HTMLElement, private changed: () => void) {
    installFenceLanguageInputs(root, (id, language) => this.changeFenceLanguage(id, language));
    root.addEventListener('beforeinput', event => this.onBeforeInput(event));
    root.addEventListener('input', event => this.onInput(event as InputEvent));
    root.addEventListener('compositionstart', () => { this.beforeInput = this.snapshot(); this.composition = true; });
    root.addEventListener('compositionend', () => { this.composition = false; this.onInput(new InputEvent('input')); });
    root.addEventListener('keydown', event => this.onKeyDown(event));
    root.addEventListener('paste', event => {
      if (!event.clipboardData) return;
      event.preventDefault();
      this.insertText(event.clipboardData.getData('text/plain'));
    });
    root.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const before = this.snapshot();
      const block = event.target.closest<HTMLElement>('[data-cid]');
      if (!block) return;
      this.baseline.delete(block.dataset.cid!);
      this.syncDom();
      event.target.toggleAttribute('checked', event.target.checked);
      this.rememberDom();
      this.commit(before);
    });
    document.addEventListener('selectionchange', () => {
      const bookmark = captureSelection(root);
      if (bookmark) this.lastSelection = bookmark;
    });
  }

  get text(): string { return blocksToMarkdown(this.blocks); }

  load(text: string, resetHistory = true): void {
    const selection = captureSelection(this.root);
    const wasFocused = document.activeElement === this.root;
    const indices = selection ? [selection.anchor, selection.focus].map(point => ({ index: this.blocks.findIndex(block => block.id === point.id), offset: point.offset })) : null;
    const scroll = this.root.scrollTop;
    this.blocks = parseMarkdownToBlocks(text);
    this.render();
    if (indices) {
      const points = indices.map(point => ({ id: this.blocks[Math.max(0, Math.min(point.index, this.blocks.length - 1))].id, offset: point.offset }));
      restoreSelection(this.root, { anchor: points[0], focus: points[1] }, wasFocused);
    }
    this.root.scrollTop = scroll;
    if (resetHistory) this.history.reset();
  }

  private snapshot(): Snapshot {
    return { blocks: structuredClone(this.blocks), html: this.root.innerHTML, selection: captureSelection(this.root) ?? this.lastSelection, scroll: this.root.scrollTop };
  }

  private rememberDom(): void {
    this.baseline = new Map(Array.from(this.root.children, element => [(element as HTMLElement).dataset.cid!, element.innerHTML]));
  }

  private render(): void {
    this.root.innerHTML = this.blocks.map(block => renderBlockToHtml(block, this.images)).join('');
    this.rememberDom();
  }

  private restore(snapshot: Snapshot): void {
    this.blocks = structuredClone(snapshot.blocks);
    this.root.innerHTML = snapshot.html;
    this.rememberDom();
    restoreSelection(this.root, snapshot.selection);
    this.root.scrollTop = snapshot.scroll;
    this.lastSelection = snapshot.selection;
    this.changed();
  }

  undo(): void { const snapshot = this.history.undo(); if (snapshot) this.restore(snapshot); }
  redo(): void { const snapshot = this.history.redo(); if (snapshot) this.restore(snapshot); }

  private commit(before: Snapshot, group: string | null = null): void {
    const after = this.snapshot();
    if (blocksToMarkdown(before.blocks) !== this.text) this.history.record(before, after, group);
    this.changed();
  }

  private syncDom(): void {
    const old = new Map(this.blocks.map(block => [block.id, block]));
    const seen = new Set<string>();
    const next: BlockNode[] = [];
    for (const child of Array.from(this.root.childNodes)) {
      let element: HTMLElement;
      if (!(child instanceof HTMLElement)) {
        if (!child.textContent) continue;
        element = document.createElement('p');
        child.replaceWith(element); element.append(child);
      } else element = child;
      let id = element.dataset.cid;
      if (!id || seen.has(id)) { id = generateId(); element.dataset.cid = id; }
      seen.add(id);
      const previous = old.get(id) ?? classifyBlock('', id);
      if (this.baseline.get(id) === element.innerHTML) { next.push(previous); continue; }
      const raw = readBlock(previous, element);
      const protectedType = ['fence', 'table', 'frontmatter', 'rule'].includes(previous.type);
      const block = protectedType ? { ...previous, raw } : { ...classifyBlock(raw, id), separatorBefore: previous.separatorBefore };
      next.push(block);
    }
    this.blocks = next.length ? next : [classifyBlock('')];
    if (!next.length) this.render();
  }

  private refreshChangedType(before: Snapshot): void {
    const bookmark = captureSelection(this.root);
    const old = new Map(before.blocks.map(block => [block.id, block]));
    let rendered = false;
    for (const block of this.blocks) {
      const previous = old.get(block.id);
      const element = this.root.querySelector<HTMLElement>(`[data-cid="${block.id}"]`);
      if (!element || !previous) continue;
      if (block.type === 'fence' && previous.type === 'fence' && block.raw !== previous.raw && block.lang) {
        const code = contentElement(element);
        const html = highlightedCode(fenceCode(block.raw), block.lang);
        if (code.innerHTML !== html) { code.innerHTML = html; rendered = true; }
      }
      if (previous.type === block.type && previous.level === block.level) continue;
      const difference = blockPrefix(block).length - blockPrefix(previous).length;
      if (bookmark) for (const point of [bookmark.anchor, bookmark.focus]) if (point.id === block.id) point.offset = Math.max(0, point.offset - difference);
      element.outerHTML = renderBlockToHtml(block, this.images);
      rendered = true;
    }
    if (rendered) restoreSelection(this.root, bookmark, false);
    this.rememberDom();
  }

  private onBeforeInput(event: InputEvent): void {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault(); event.inputType === 'historyUndo' ? this.undo() : this.redo(); return;
    }
    if (this.composition || event.isComposing) return;
    const range = this.activeRange();
    if (event.inputType === 'insertText' && range && range.startContainer === this.root && range.endContainer === this.root && range.startOffset === 0 && range.endOffset === this.root.childNodes.length) {
      event.preventDefault();
      const before = this.snapshot();
      const block = classifyBlock(event.data ?? '');
      this.blocks = [block]; this.render();
      restoreSelection(this.root, caret(block.id, block.raw.length));
      this.commit(before, 'typing:' + block.id);
      return;
    }
    if (event.inputType === 'insertParagraph') { event.preventDefault(); this.enter(); return; }
    if (event.inputType === 'insertLineBreak') { event.preventDefault(); this.insertText('\n'); return; }
    this.beforeInput = this.snapshot();
  }

  private onInput(event: InputEvent): void {
    if (this.composition || event.isComposing) return;
    const before = this.beforeInput;
    this.beforeInput = null;
    if (!before) return;
    this.syncDom();
    this.refreshChangedType(before);
    const current = captureSelection(this.root);
    this.commit(before, event.inputType === 'insertText' && current ? 'typing:' + current.focus.id : null);
  }

  private selectedBlock(): BlockNode | undefined {
    const selection = captureSelection(this.root);
    return this.blocks.find(block => block.id === selection?.focus.id);
  }

  private activeRange(): Range | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return this.root.contains(range.startContainer) && this.root.contains(range.endContainer) ? range : null;
  }

  enter(): void {
    const range = this.activeRange();
    const block = this.selectedBlock();
    if (!range || !block) return;
    if (block.type === 'fence') { this.insertText('\n'); return; }
    const openingFence = /^\s*```([\w+-]*)\s*$/.exec(block.raw);
    if (openingFence && range.collapsed) {
      const before = this.snapshot();
      this.blocks[this.blocks.indexOf(block)] = { ...block, type: 'fence', lang: openingFence[1], raw: block.raw + '\n\n```' };
      this.render(); restoreSelection(this.root, caret(block.id)); this.commit(before); return;
    }
    if (block.type === 'table' || block.type === 'frontmatter') return;
    const element = this.root.querySelector<HTMLElement>(`[data-cid="${block.id}"]`)!;
    const content = contentElement(element);
    if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return;
    const before = this.snapshot();
    const leftRange = range.cloneRange(); leftRange.selectNodeContents(content); leftRange.setEnd(range.startContainer, range.startOffset);
    const rightRange = range.cloneRange(); rightRange.selectNodeContents(content); rightRange.setStart(range.endContainer, range.endOffset);
    const empty = content.innerHTML.toLowerCase() === '<br>' || !content.hasChildNodes();
    const left = empty ? '' : inlineMarkdown(leftRange.cloneContents());
    const right = empty ? '' : inlineMarkdown(rightRange.cloneContents());
    const index = this.blocks.indexOf(block);
    const list = ['bullet', 'ordered', 'task', 'blockquote'].includes(block.type);
    let target: BlockNode;
    if (list && !plainText(content).trim()) {
      target = { ...classifyBlock('', block.id), separatorBefore: block.separatorBefore }; this.blocks[index] = target;
    } else {
      this.blocks[index] = { ...block, raw: fromContent(block, left) };
      let prefix = list ? blockPrefix(block) : '';
      if (block.type === 'task') prefix = prefix.replace(/\[[xX]\]/, '[ ]');
      if (block.type === 'ordered') prefix = prefix.replace(/\d+/, number => String(Number(number) + 1));
      target = { ...classifyBlock(prefix + right), separatorBefore: list || block.type === 'heading' ? '\n' : '\n\n' };
      this.blocks.splice(index + 1, 0, target);
    }
    this.render();
    restoreSelection(this.root, caret(target.id));
    this.commit(before);
  }

  insertText(text: string): void {
    const range = this.activeRange();
    if (!range || range.startContainer.parentElement?.closest('[contenteditable="false"]')) return;
    const before = this.snapshot();
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    if (text.endsWith('\n') && (!node.nextSibling || !node.nextSibling.textContent && !node.nextSibling.nextSibling)) {
      const placeholder = document.createElement('br'); placeholder.dataset.placeholder = 'true'; node.after(placeholder);
    }
    range.setStart(node, node.length); range.collapse(true);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    this.syncDom(); this.refreshChangedType(before); this.commit(before);
  }

  format(tag: 'strong' | 'em' | 'code' | 'del' | 'a'): void {
    const range = this.activeRange();
    const bookmark = captureSelection(this.root);
    if (!range || !bookmark || bookmark.anchor.id !== bookmark.focus.id) return;
    if (range.collapsed) {
      const marker = tag === 'code' ? '`' : tag === 'strong' ? '**' : tag === 'em' ? '*' : '~~';
      this.insertText(tag === 'a' ? '[link text](https://)' : marker + marker);
      if (tag !== 'a') {
        const bookmark = captureSelection(this.root);
        if (bookmark) { bookmark.anchor.offset -= marker.length; bookmark.focus.offset -= marker.length; restoreSelection(this.root, bookmark); }
      }
      return;
    }
    const before = this.snapshot();
    const wrapper = document.createElement(tag);
    if (tag === 'code') { wrapper.className = 'md-code'; wrapper.textContent = range.toString(); range.deleteContents(); }
    else wrapper.append(range.extractContents());
    if (tag === 'a') { wrapper.className = 'md-link'; wrapper.setAttribute('href', 'https://'); }
    range.insertNode(wrapper); range.selectNodeContents(wrapper);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    this.syncDom(); this.rememberDom(); this.commit(before);
  }

  private changeFenceLanguage(id: string, language: string): void {
    const block = this.blocks.find(block => block.id === id && block.type === 'fence');
    if (!block || (block.lang ?? '') === language) return;
    const before = this.snapshot();
    block.lang = language;
    block.raw = withFenceLanguage(block.raw, language);
    const fence = this.root.querySelector<HTMLElement>(`[data-cid="${id}"]`)!;
    fence.dataset.lang = language;
    fence.querySelector('input')!.defaultValue = language;
    const code = contentElement(fence);
    const selection = window.getSelection();
    const bookmark = selection?.focusNode && code.contains(selection.focusNode) ? captureSelection(this.root) : null;
    code.innerHTML = highlightedCode(fenceCode(block.raw), language);
    if (bookmark) restoreSelection(this.root, bookmark, false);
    this.baseline.set(id, fence.innerHTML);
    this.commit(before);
  }

  cycleHeading(): void {
    const block = this.selectedBlock();
    const level = block?.type === 'heading' ? ((block.level ?? 1) + 1) % 7 : 1;
    this.changeBlock(level ? '#'.repeat(level) + ' ' : '');
  }

  changeBlock(prefix: string): void {
    const block = this.selectedBlock(); if (!block || ['fence', 'frontmatter', 'table'].includes(block.type)) return;
    const before = this.snapshot(); const bookmark = captureSelection(this.root);
    const element = this.root.querySelector<HTMLElement>(`[data-cid="${block.id}"]`)!;
    const text = inlineMarkdown(contentElement(element));
    this.blocks[this.blocks.indexOf(block)] = { ...classifyBlock(prefix + text, block.id), separatorBefore: block.separatorBefore };
    this.render(); restoreSelection(this.root, bookmark); this.commit(before);
  }

  blockAction(action: 'duplicate' | 'delete' | 'up' | 'down'): void {
    const block = this.selectedBlock(); if (!block) return;
    const before = this.snapshot(); const index = this.blocks.indexOf(block);
    let target = block;
    if (action === 'duplicate') { target = { ...block, id: generateId(), separatorBefore: '\n\n' }; this.blocks.splice(index + 1, 0, target); }
    if (action === 'delete') { this.blocks.splice(index, 1); if (!this.blocks.length) this.blocks.push(classifyBlock('')); target = this.blocks[Math.max(0, index - 1)]; }
    if (action === 'up' && index > 0) [this.blocks[index - 1], this.blocks[index]] = [block, this.blocks[index - 1]];
    if (action === 'down' && index + 1 < this.blocks.length) [this.blocks[index], this.blocks[index + 1]] = [this.blocks[index + 1], block];
    this.render(); restoreSelection(this.root, caret(target.id)); this.commit(before);
  }

  private indentList(outdent: boolean): void {
    const block = this.selectedBlock(); if (!block || !['bullet', 'ordered', 'task'].includes(block.type)) return;
    const before = this.snapshot(); const bookmark = captureSelection(this.root);
    block.raw = outdent ? block.raw.replace(/^ {1,2}/, '') : '  ' + block.raw;
    this.render(); restoreSelection(this.root, bookmark); this.commit(before);
  }

  private demoteHeadingAtStart(): boolean {
    const range = this.activeRange();
    if (!range?.collapsed) return false;
    const block = this.selectedBlock();
    if (block?.type !== 'heading') return false;
    const heading = this.root.querySelector<HTMLElement>(`[data-cid="${block.id}"]`)!;
    const preceding = range.cloneRange();
    preceding.selectNodeContents(heading);
    preceding.setEnd(range.startContainer, range.startOffset);
    const prefix = preceding.cloneContents();
    if (plainText(prefix) || prefix.querySelector('img')) return false;

    const before = this.snapshot();
    const index = this.blocks.indexOf(block);
    const raw = block.raw.replace(/^#{1,6}\s/, '');
    const paragraph: BlockNode = { id: block.id, type: 'paragraph', raw, separatorBefore: block.separatorBefore };
    const next = this.blocks[index + 1];
    if (this.blocks[index - 1]?.type === 'paragraph' && (paragraph.separatorBefore ?? '\n') === '\n') paragraph.separatorBefore = '\n\n';
    if (next?.type === 'paragraph' && (next.separatorBefore ?? '\n') === '\n') next.separatorBefore = '\n\n';
    this.blocks[index] = paragraph;
    this.render(); restoreSelection(this.root, caret(block.id)); this.commit(before);
    return true;
  }

  private leaveCodeBlockDown(): boolean {
    const block = this.selectedBlock();
    const range = this.activeRange();
    if (block?.type !== 'fence' || !range?.collapsed) return false;
    const element = this.root.querySelector<HTMLElement>(`[data-cid="${block.id}"]`)!;
    const code = contentElement(element);
    if (!code.contains(range.startContainer)) return false;
    const remaining = range.cloneRange();
    remaining.selectNodeContents(code);
    remaining.setStart(range.endContainer, range.endOffset);
    if (code.innerHTML.toLowerCase() !== '<br>' && plainText(remaining.cloneContents()).includes('\n')) return false;

    const before = this.snapshot();
    const index = this.blocks.indexOf(block);
    const lines = block.raw.split('\n');
    const needsClosingFence = lines.length < 2 || !/^\s*```\s*$/.test(lines.at(-1)!);
    if (needsClosingFence) block.raw += '\n```';
    let target = this.blocks[index + 1];
    const needsParagraph = !target || !['paragraph', 'blank'].includes(target.type);
    if (needsParagraph) {
      target = { ...classifyBlock(''), separatorBefore: '\n\n' };
      this.blocks.splice(index + 1, 0, target);
      this.render();
    }
    restoreSelection(this.root, caret(target.id));
    this.root.querySelector(`[data-cid="${target.id}"]`)?.scrollIntoView({ block: 'nearest' });
    if (needsParagraph || needsClosingFence) this.commit(before);
    return true;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if ((event.target as Element).closest('.md-fence-lang') || event.isComposing || this.composition || event.keyCode === 229) return;
    const mod = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase();
    if (key === 'backspace' && !mod && !event.altKey && !event.shiftKey && this.demoteHeadingAtStart()) {
      event.preventDefault(); event.stopPropagation(); return;
    }
    if (key === 'arrowdown' && !mod && !event.altKey && !event.shiftKey && this.leaveCodeBlockDown()) {
      event.preventDefault(); event.stopPropagation(); return;
    }
    let action: (() => void) | undefined;
    if (mod && key === 'z') action = () => event.shiftKey ? this.redo() : this.undo();
    else if (mod && key === 'y') action = () => this.redo();
    else if (mod && event.shiftKey && key === 'k') action = () => this.blockAction('delete');
    else if (mod && event.shiftKey && key === 'd') action = () => this.blockAction('duplicate');
    else if (mod && event.shiftKey && key === 'x') action = () => this.format('del');
    else if (mod && key === 'b') action = () => this.format('strong');
    else if (mod && key === 'i') action = () => this.format('em');
    else if (mod && key === '`') action = () => this.format('code');
    else if (mod && key === 'k') action = () => this.format('a');
    else if (mod && /^[1-6]$/.test(key)) action = () => this.changeBlock('#'.repeat(Number(key)) + ' ');
    else if (mod && key === '0') action = () => this.changeBlock('');
    else if (mod && key === 'a') action = () => { const range = document.createRange(); range.selectNodeContents(this.root); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); };
    else if (event.altKey && event.shiftKey && key === 'arrowup') action = () => this.blockAction('up');
    else if (event.altKey && event.shiftKey && key === 'arrowdown') action = () => this.blockAction('down');
    else if (key === 'tab' && !mod && ['bullet', 'ordered', 'task'].includes(this.selectedBlock()?.type ?? '')) action = () => this.indentList(event.shiftKey);
    else if (key === 'tab' && !mod && this.selectedBlock()?.type === 'fence') action = () => this.insertText('\t');
    else if (key === 'enter') action = () => event.shiftKey ? this.insertText('\n') : this.enter();
    if (action) { event.preventDefault(); event.stopPropagation(); action(); }
  }
}
