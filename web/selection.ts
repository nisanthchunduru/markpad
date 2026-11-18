export interface CaretPoint { id: string; offset: number }
export interface SelectionBookmark { anchor: CaretPoint; focus: CaretPoint }

export function contentElement(block: HTMLElement): HTMLElement {
  return block.querySelector<HTMLElement>('.md-list-content, .md-fence > code') ?? block;
}

export function plainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.matches('.md-meta, .md-list-marker, .md-fence-lang, input, [data-placeholder]')) return '';
  if (node instanceof HTMLBRElement) return '\n';
  return Array.from(node.childNodes, plainText).join('');
}

function pointAt(root: HTMLElement, node: Node | null, offset: number): CaretPoint | null {
  if (!node || !root.contains(node)) return null;
  const block = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-cid]');
  if (!block || !root.contains(block)) return null;
  const content = contentElement(block);
  if (!content.contains(node)) return { id: block.dataset.cid!, offset: 0 };
  const range = document.createRange();
  range.selectNodeContents(content);
  range.setEnd(node, offset);
  return { id: block.dataset.cid!, offset: plainText(range.cloneContents()).length };
}

export function captureSelection(root: HTMLElement): SelectionBookmark | null {
  const selection = window.getSelection();
  if (!selection) return null;
  const anchor = pointAt(root, selection.anchorNode, selection.anchorOffset);
  const focus = pointAt(root, selection.focusNode, selection.focusOffset);
  return anchor && focus ? { anchor, focus } : null;
}

function resolvePoint(root: HTMLElement, point: CaretPoint): { node: Node; offset: number } | null {
  const block = Array.from(root.querySelectorAll<HTMLElement>('[data-cid]')).find(el => el.dataset.cid === point.id);
  if (!block) return null;
  const content = contentElement(block);
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node instanceof Element) return node.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      return node.parentElement?.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  let remaining = Math.max(0, point.offset);
  let node: Node | null;
  let last: Node | null = null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
      last = node;
    } else {
      if (remaining === 0) return { node: node.parentNode!, offset: Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode) };
      remaining--;
    }
  }
  return last ? { node: last, offset: last.textContent?.length ?? 0 } : { node: content, offset: 0 };
}

export function restoreSelection(root: HTMLElement, bookmark: SelectionBookmark | null, focus = true): void {
  if (!bookmark) return;
  const anchor = resolvePoint(root, bookmark.anchor);
  const end = resolvePoint(root, bookmark.focus);
  if (!anchor || !end) return;
  if (focus) root.focus({ preventScroll: true });
  window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, end.node, end.offset);
}

export function caret(id: string, offset = 0): SelectionBookmark {
  return { anchor: { id, offset }, focus: { id, offset } };
}
