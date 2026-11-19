import { captureSelection, restoreSelection, caret, type SelectionBookmark } from './selection';

export function installFenceLanguageInputs(root: HTMLElement, change: (id: string, language: string) => void): void {
  let bookmark: SelectionBookmark | null = null;
  function updateActiveFence(): void {
    const active = document.activeElement;
    const selection = window.getSelection();
    const node = selection?.focusNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const inputFence = active instanceof HTMLInputElement && active.matches('.md-fence-lang') ? active.closest('.md-fence') : null;
    const fence = inputFence ?? (active === root && selection?.isCollapsed ? element?.closest('.md-fence > pre > code')?.closest('.md-fence') : null);
    for (const previous of root.querySelectorAll('.md-language-active')) if (previous !== fence) previous.classList.remove('md-language-active');
    if (fence && root.contains(fence)) {
      fence.classList.add('md-language-active');
      if (!inputFence) bookmark = captureSelection(root);
    }
  }
  document.addEventListener('selectionchange', updateActiveFence);
  root.addEventListener('focusin', updateActiveFence);
  root.addEventListener('focusout', event => {
    if (event.relatedTarget instanceof Element && root.contains(event.relatedTarget)) return;
    requestAnimationFrame(updateActiveFence);
  });

  function apply(input: HTMLInputElement): void {
    const fence = input.closest<HTMLElement>('.md-fence')!;
    const value = input.value.trim();
    if (/\s|`/.test(value)) input.value = fence.dataset.lang ?? '';
    else change(fence.dataset.cid!, value);
  }
  root.addEventListener('focusout', event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('.md-fence-lang')) apply(input);
  });
  root.addEventListener('keydown', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement && input.matches('.md-fence-lang'))) return;
    event.stopImmediatePropagation();
    if (event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      input.select();
      return;
    }
    if (!['Escape', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    const fence = input.closest<HTMLElement>('.md-fence')!;
    if (event.key === 'Escape') input.value = fence.dataset.lang ?? '';
    else if (!input.reportValidity()) return;
    const target = bookmark?.focus.id === fence.dataset.cid ? bookmark : caret(fence.dataset.cid!);
    apply(input);
    restoreSelection(root, target);
  });
  for (const type of ['beforeinput', 'input', 'compositionstart', 'compositionend', 'change', 'paste']) {
    root.addEventListener(type, event => {
      if (event.target instanceof HTMLInputElement && event.target.matches('.md-fence-lang')) event.stopImmediatePropagation();
    });
  }
}
