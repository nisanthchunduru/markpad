import { isThemeName, themeNames, themeLabels, type ThemeName } from '../src/themes';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

let documentVersion = -1;
let baseText = '';
let pendingEdit = false;
let images: Record<string, string> = {};
let undoStack: string[] = [];
let redoStack: string[] = [];
let undoTimer: ReturnType<typeof setTimeout> | null = null;
let zoomLevel = 100;

const app = document.getElementById('app')!;
app.innerHTML = `<div class="shell"><aside id="sidebar" class="closed"><div class="side-header"><span>Outline</span></div><div id="outline"></div></aside><div class="main"><header><button id="outlineToggle" aria-label="Toggle outline" title="Outline">☰</button><span class="spacer"></span><button id="zoomOut" title="Zoom out (Ctrl/Cmd+−)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5.5"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5"/></svg></button><span id="zoomLabel">100%</span><button id="zoomIn" title="Zoom in (Ctrl/Cmd++)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5.5"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="7" y1="4.5" x2="7" y2="9.5"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5"/></svg></button><select id="themePicker" aria-label="Writing theme" title="Writing theme"></select><div class="header-actions"><button data-action="heading" title="Heading">H</button><button data-action="bold" title="Bold (Ctrl/Cmd+B)"><b>B</b></button><button data-action="italic" title="Italic (Ctrl/Cmd+I)"><i>I</i></button><button data-action="code" title="Inline code">⟨⟩</button><button data-action="link" title="Insert link">↗</button><button data-action="list" title="Bullet list">≡</button><button data-action="quote" title="Blockquote">❞</button></div></header><div id="conflict" hidden>Changes from another editor overlap your unsaved changes. <button id="useDisk">Use latest file</button> <button id="keepMine">Keep my draft</button></div><div id="write" contenteditable="true" spellcheck="true"></div></div></div>`;

const write = document.getElementById('write')!;
const themePicker = document.getElementById('themePicker') as HTMLSelectElement;
for (const theme of themeNames) {
  const option = document.createElement('option');
  option.value = theme;
  option.textContent = themeLabels[theme];
  themePicker.append(option);
}

function applyTheme(theme: unknown): void {
  if (!isThemeName(theme)) return;
  document.documentElement.dataset.theme = theme;
  themePicker.value = theme;
}

themePicker.addEventListener('change', () => {
  applyTheme(themePicker.value);
  vscode.postMessage({ type: 'theme', theme: themePicker.value });
});

interface BlockNode {
  id: string;
  type: 'paragraph' | 'heading' | 'blockquote' | 'bullet' | 'ordered' | 'task' | 'fence' | 'rule' | 'table' | 'blank' | 'frontmatter';
  level?: number;
  lang?: string;
  checked?: boolean;
  raw: string;
  children?: BlockNode[];
}

let nextId = 1;
function generateId(): string { return 'b' + (nextId++); }

function parseMarkdownToBlocks(markdown: string): BlockNode[] {
  const lines = markdown.split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  if (i === 0 && lines[0] === '---') {
    const fmLines = ['---'];
    i = 1;
    while (i < lines.length && lines[i] !== '---') { fmLines.push(lines[i]); i++; }
    if (i < lines.length) { fmLines.push(lines[i]); i++; }
    blocks.push({ id: generateId(), type: 'frontmatter', raw: fmLines.join('\n') });
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^(#{1,6})\s/)![1].length;
      blocks.push({ id: generateId(), type: 'heading', level, raw: line });
      i++;
    } else if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      const fenceLines = [line];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { fenceLines.push(lines[i]); i++; }
      if (i < lines.length) { fenceLines.push(lines[i]); i++; }
      blocks.push({ id: generateId(), type: 'fence', lang, raw: fenceLines.join('\n') });
    } else if (/^\s*[-+*]\s+\[[ xX]\]\s/.test(line)) {
      const checked = /\[[xX]\]/.test(line);
      blocks.push({ id: generateId(), type: 'task', checked, raw: line });
      i++;
    } else if (/^\s*[-+*]\s+/.test(line)) {
      blocks.push({ id: generateId(), type: 'bullet', raw: line });
      i++;
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      blocks.push({ id: generateId(), type: 'ordered', raw: line });
      i++;
    } else if (/^>\s?/.test(line)) {
      const quoteLines = [line];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) { i++; quoteLines.push(lines[i]); }
      blocks.push({ id: generateId(), type: 'blockquote', raw: quoteLines.join('\n') });
      i++;
    } else if (/^\|/.test(line)) {
      const tableLines = [line];
      while (i + 1 < lines.length && /^\|/.test(lines[i + 1])) { i++; tableLines.push(lines[i]); }
      blocks.push({ id: generateId(), type: 'table', raw: tableLines.join('\n') });
      i++;
    } else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ id: generateId(), type: 'rule', raw: line });
      i++;
    } else if (line.trim() === '') {
      blocks.push({ id: generateId(), type: 'blank', raw: '' });
      i++;
    } else {
      const paraLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^#{1,6}\s|^\s*```|^>\s?|^\s*[-+*]\s|^\s*\d+[.)]\s|^\||^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i + 1])) {
        i++;
        paraLines.push(lines[i]);
      }
      blocks.push({ id: generateId(), type: 'paragraph', raw: paraLines.join('\n') });
      i++;
    }
  }
  return blocks;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const resolved = images[src] || src;
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" class="md-image">`;
  });
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>');
  result = result.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return result;
}

function renderBlockToHtml(block: BlockNode, focused: boolean): string {
  const cid = ` data-cid="${block.id}"`;
  const focusClass = focused ? ' md-focus' : '';

  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`;
      const text = block.raw.replace(/^#{1,6}\s/, '');
      if (focused) return `<${tag}${cid} class="md-heading md-focus" data-raw="${escapeHtml(block.raw)}"><span class="md-meta">${'#'.repeat(block.level!)} </span>${renderInline(text)}</${tag}>`;
      return `<${tag}${cid} class="md-heading${focusClass}" data-raw="${escapeHtml(block.raw)}">${renderInline(text)}</${tag}>`;
    }
    case 'paragraph':
      return `<p${cid} class="md-paragraph${focusClass}">${renderInline(block.raw)}</p>`;
    case 'blockquote': {
      const text = block.raw.replace(/^>\s?/gm, '');
      if (focused) return `<blockquote${cid} class="md-blockquote md-focus" data-raw="${escapeHtml(block.raw)}"><span class="md-meta">&gt; </span>${renderInline(text)}</blockquote>`;
      return `<blockquote${cid} class="md-blockquote${focusClass}">${renderInline(text)}</blockquote>`;
    }
    case 'bullet': {
      const text = block.raw.replace(/^\s*[-+*]\s+/, '');
      return `<div${cid} class="md-list-item md-bullet${focusClass}"><span class="md-list-marker">•</span><span class="md-list-content">${renderInline(text)}</span></div>`;
    }
    case 'ordered': {
      const match = block.raw.match(/^\s*(\d+)[.)]\s+/);
      const num = match ? match[1] : '1';
      const text = block.raw.replace(/^\s*\d+[.)]\s+/, '');
      return `<div${cid} class="md-list-item md-ordered${focusClass}"><span class="md-list-marker">${num}.</span><span class="md-list-content">${renderInline(text)}</span></div>`;
    }
    case 'task': {
      const text = block.raw.replace(/^\s*[-+*]\s+\[[ xX]\]\s*/, '');
      const checked = block.checked ? 'checked' : '';
      return `<div${cid} class="md-list-item md-task${focusClass}"><input type="checkbox" ${checked} class="md-task-checkbox"><span class="md-list-content">${renderInline(text)}</span></div>`;
    }
    case 'fence': {
      const lines = block.raw.split('\n');
      const codeLines = lines.slice(1, lines[lines.length - 1]?.trimStart().startsWith('```') ? -1 : undefined);
      const lang = block.lang ? ` data-lang="${escapeHtml(block.lang)}"` : '';
      const langLabel = block.lang ? `<span class="md-fence-lang">${escapeHtml(block.lang)}</span>` : '';
      return `<pre${cid} class="md-fence${focusClass}"${lang}>${langLabel}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
    }
    case 'table': {
      const rows = block.raw.split('\n').filter(r => r.trim());
      if (rows.length < 2) return `<div${cid} class="md-table-raw${focusClass}">${escapeHtml(block.raw)}</div>`;
      const headerCells = rows[0].split('|').filter(c => c.trim() !== '' || rows[0].startsWith('|'));
      const parseRow = (row: string) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const header = parseRow(rows[0]);
      const alignRow = parseRow(rows[1]);
      const aligns = alignRow.map(c => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : '');
      const bodyRows = rows.slice(2).map(parseRow);
      let html = `<figure${cid} class="md-table${focusClass}"><table>`;
      html += '<thead><tr>' + header.map((c, i) => `<th${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${renderInline(c)}</th>`).join('') + '</tr></thead>';
      if (bodyRows.length) {
        html += '<tbody>' + bodyRows.map(row => '<tr>' + row.map((c, i) => `<td${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${renderInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
      }
      html += '</table></figure>';
      return html;
    }
    case 'rule':
      return `<hr${cid} class="md-rule${focusClass}">`;
    case 'frontmatter': {
      const lines = block.raw.split('\n').slice(1, -1);
      const rows: Array<{key: string; value: string}> = [];
      let currentKey = '';
      let currentValue = '';
      for (const line of lines) {
        const kvMatch = line.match(/^([\w-]+)\s*:\s*(.*)/);
        if (kvMatch) {
          if (currentKey) rows.push({ key: currentKey, value: currentValue.trim() });
          currentKey = kvMatch[1];
          currentValue = kvMatch[2].replace(/^[>|]\s*$/, '');
        } else if (currentKey) {
          currentValue += (currentValue ? ' ' : '') + line.trim();
        }
      }
      if (currentKey) rows.push({ key: currentKey, value: currentValue.trim() });
      const tableRows = rows.map(r => `<tr><td class="fm-key">${escapeHtml(r.key)}</td><td class="fm-value">${escapeHtml(r.value)}</td></tr>`).join('');
      return `<table${cid} class="md-frontmatter${focusClass}"><tbody>${tableRows}</tbody></table>`;
    }
    case 'blank':
      return `<p${cid} class="md-blank">\u200B</p>`;
    default:
      return `<p${cid}>${escapeHtml(block.raw)}</p>`;
  }
}

let blocks: BlockNode[] = [];
let focusedBlockId: string | null = null;

function renderAllBlocks(): void {
  write.innerHTML = blocks.map(block => renderBlockToHtml(block, block.id === focusedBlockId)).join('');
  attachBlockListeners();
  updateOutline();
  updateWordCount();
}

function renderSingleBlock(blockId: string): void {
  const element = write.querySelector(`[data-cid="${blockId}"]`);
  const block = blocks.find(b => b.id === blockId);
  if (!element || !block) return;
  const temp = document.createElement('div');
  temp.innerHTML = renderBlockToHtml(block, block.id === focusedBlockId);
  const replacement = temp.firstElementChild!;
  element.replaceWith(replacement);
  attachSingleBlockListener(replacement as HTMLElement);
}

function attachSingleBlockListener(element: HTMLElement): void {
  element.addEventListener('focus', handleBlockFocus, true);
  const checkbox = element.querySelector('.md-task-checkbox') as HTMLInputElement | null;
  if (checkbox) checkbox.addEventListener('change', handleCheckboxToggle);
}

function attachBlockListeners(): void {
  for (const element of write.querySelectorAll<HTMLElement>('[data-cid]')) {
    attachSingleBlockListener(element);
  }
}

function handleBlockFocus(event: FocusEvent): void {
  const target = (event.target as HTMLElement).closest('[data-cid]') as HTMLElement | null;
  if (!target) return;
  const cid = target.dataset.cid!;
  if (cid === focusedBlockId) return;
  const previousFocusedId = focusedBlockId;
  focusedBlockId = cid;
  if (previousFocusedId) renderSingleBlock(previousFocusedId);
  renderSingleBlock(cid);
  restoreCursorInBlock(cid);
}

function handleCheckboxToggle(event: Event): void {
  const checkbox = event.target as HTMLInputElement;
  const cid = checkbox.closest('[data-cid]')?.getAttribute('data-cid');
  if (!cid) return;
  const block = blocks.find(b => b.id === cid);
  if (!block || block.type !== 'task') return;
  block.checked = checkbox.checked;
  block.raw = block.raw.replace(/\[[ xX]\]/, block.checked ? '[x]' : '[ ]');
  sendMarkdownToHost();
}

function restoreCursorInBlock(cid: string, atStart = false): void {
  const element = write.querySelector(`[data-cid="${cid}"]`) as HTMLElement | null;
  if (!element) return;
  const selection = window.getSelection()!;
  const range = document.createRange();
  if (atStart) {
    const target = findContentTextNode(element, true);
    if (target) { range.setStart(target, 0); range.collapse(true); }
    else { range.selectNodeContents(element); range.collapse(true); }
  } else {
    const target = findContentTextNode(element, false);
    if (target) { range.setStart(target, target.textContent?.length ?? 0); range.collapse(true); }
    else { range.selectNodeContents(element); range.collapse(false); }
  }
  selection.removeAllRanges();
  selection.addRange(range);
  element.focus();
}

function findContentTextNode(element: HTMLElement, first: boolean): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('.md-meta, .md-list-marker, .md-fence-lang')) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || node.textContent === '\u200B') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let result: Text | null = null;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (first) return node;
    result = node;
  }
  return result;
}

function findFirstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent !== '\u200B') return node as Text;
  for (const child of node.childNodes) {
    const found = findFirstTextNode(child);
    if (found) return found;
  }
  return null;
}

function blocksToMarkdown(blockList: BlockNode[]): string {
  return blockList.map(b => b.raw).join('\n');
}

function readBlockFromDom(cid: string): string | null {
  const element = write.querySelector(`[data-cid="${cid}"]`) as HTMLElement | null;
  if (!element) return null;
  const block = blocks.find(b => b.id === cid);
  if (!block) return null;

  switch (block.type) {
    case 'heading': {
      const prefix = '#'.repeat(block.level!) + ' ';
      const textContent = extractTextContent(element, '.md-meta');
      return prefix + textContent;
    }
    case 'paragraph':
      return extractInlineContent(element);
    case 'blockquote': {
      const textContent = extractTextContent(element, '.md-meta');
      return textContent.split('\n').map(line => '> ' + line).join('\n');
    }
    case 'bullet': {
      const content = element.querySelector('.md-list-content');
      return '- ' + (content ? extractInlineContent(content as HTMLElement) : '');
    }
    case 'ordered': {
      const marker = element.querySelector('.md-list-marker')?.textContent || '1.';
      const content = element.querySelector('.md-list-content');
      return marker + ' ' + (content ? extractInlineContent(content as HTMLElement) : '');
    }
    case 'task': {
      const checked = (element.querySelector('.md-task-checkbox') as HTMLInputElement)?.checked;
      const content = element.querySelector('.md-list-content');
      return `- [${checked ? 'x' : ' '}] ` + (content ? extractInlineContent(content as HTMLElement) : '');
    }
    case 'fence':
    case 'frontmatter':
    case 'table':
    case 'rule':
      return block.raw;
    case 'blank': {
      const text = (element.textContent || '').replace(/\u200B/g, '');
      return text;
    }
    default:
      return element.textContent || '';
  }
}

function extractTextContent(element: HTMLElement, excludeSelector?: string): string {
  const clone = element.cloneNode(true) as HTMLElement;
  if (excludeSelector) clone.querySelectorAll(excludeSelector).forEach(el => el.remove());
  clone.querySelectorAll('img.md-image').forEach(img => {
    const alt = (img as HTMLImageElement).alt;
    const src = (img as HTMLImageElement).getAttribute('data-original-src') || (img as HTMLImageElement).src;
    img.replaceWith(`![${alt}](${src})`);
  });
  return clone.textContent || '';
}

function extractInlineContent(element: HTMLElement): string {
  let result = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'STRONG' && el.querySelector('em')) {
        result += '***' + (el.textContent || '') + '***';
      } else if (el.tagName === 'STRONG') {
        result += '**' + (el.textContent || '') + '**';
      } else if (el.tagName === 'EM') {
        result += '*' + (el.textContent || '') + '*';
      } else if (el.tagName === 'DEL') {
        result += '~~' + (el.textContent || '') + '~~';
      } else if (el.tagName === 'CODE' && el.classList.contains('md-code')) {
        result += '`' + (el.textContent || '') + '`';
      } else if (el.tagName === 'A' && el.classList.contains('md-link')) {
        result += `[${el.textContent || ''}](${el.getAttribute('href') || ''})`;
      } else if (el.tagName === 'IMG' && el.classList.contains('md-image')) {
        const alt = (el as HTMLImageElement).alt;
        const src = el.getAttribute('data-original-src') || (el as HTMLImageElement).src;
        result += `![${alt}](${src})`;
      } else {
        result += el.textContent || '';
      }
    }
  }
  return result;
}

function syncFocusedBlockToDom(): void {
  if (!focusedBlockId) detectFocusedBlockFromSelection();
  if (!focusedBlockId) return;
  const updatedRaw = readBlockFromDom(focusedBlockId);
  if (updatedRaw === null) return;
  const block = blocks.find(b => b.id === focusedBlockId);
  if (!block || block.raw === updatedRaw) return;
  block.raw = updatedRaw;

  const newType = detectBlockType(updatedRaw);
  if (newType.type !== block.type || newType.level !== block.level) {
    block.type = newType.type;
    block.level = newType.level;
    block.lang = newType.lang;
    renderSingleBlock(block.id);
    restoreCursorInBlock(block.id);
  }
}

function detectBlockType(raw: string): { type: BlockNode['type']; level?: number; lang?: string } {
  if (/^#{1,6}\s/.test(raw)) return { type: 'heading', level: raw.match(/^(#{1,6})\s/)![1].length };
  if (/^>\s?/.test(raw)) return { type: 'blockquote' };
  if (/^\s*[-+*]\s+\[[ xX]\]\s/.test(raw)) return { type: 'task' };
  if (/^\s*[-+*]\s+/.test(raw)) return { type: 'bullet' };
  if (/^\s*\d+[.)]\s+/.test(raw)) return { type: 'ordered' };
  if (/^\s*```/.test(raw)) return { type: 'fence', lang: raw.replace(/^\s*```/, '').trim() };
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) return { type: 'rule' };
  if (raw.trim() === '' || raw === '\u200B') return { type: 'blank' };
  return { type: 'paragraph' };
}

function sendMarkdownToHost(): void {
  if (documentVersion < 0 || pendingEdit) return;
  const text = blocksToMarkdown(blocks);
  if (text === baseText) return;
  pendingEdit = true;
  vscode.postMessage({ type: 'edit', text, version: documentVersion });
}

function pushUndo(): void {
  const text = blocksToMarkdown(blocks);
  if (undoStack[undoStack.length - 1] !== text) {
    undoStack.push(text);
    if (undoStack.length > 300) undoStack.shift();
    redoStack.length = 0;
  }
}

function debouncedPushUndo(): void {
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(pushUndo, 400);
}

function performUndo(): void {
  syncFocusedBlockToDom();
  pushUndo();
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop()!);
    applySnapshot(undoStack[undoStack.length - 1]);
  }
}

function performRedo(): void {
  if (redoStack.length > 0) {
    const text = redoStack.pop()!;
    undoStack.push(text);
    applySnapshot(text);
  }
}

function applySnapshot(text: string): void {
  const savedScrollTop = write.scrollTop;
  blocks = parseMarkdownToBlocks(text);
  focusedBlockId = null;
  renderAllBlocks();
  write.scrollTop = savedScrollTop;
  sendMarkdownToHost();
}

write.addEventListener('input', () => {
  syncFocusedBlockToDom();
  debouncedPushUndo();
  sendMarkdownToHost();
  updateWordCount();
});

function setZoom(level: number): void {
  zoomLevel = Math.max(50, Math.min(200, level));
  write.style.fontSize = `calc(var(--writing-size) * ${zoomLevel / 100})`;
  document.getElementById('zoomLabel')!.textContent = zoomLevel + '%';
}

function focusedBlock(): BlockNode | undefined {
  if (!focusedBlockId) detectFocusedBlockFromSelection();
  return focusedBlockId ? blocks.find(b => b.id === focusedBlockId) : undefined;
}

function detectFocusedBlockFromSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const node = selection.focusNode;
  if (!node) return;
  const blockEl = (node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement)?.closest('[data-cid]') as HTMLElement | null;
  if (blockEl?.dataset.cid) focusedBlockId = blockEl.dataset.cid;
}

function convertBlock(block: BlockNode, toType: BlockNode['type'], prefix: string): void {
  pushUndo();
  const oldContent = block.raw.replace(/^(#{1,6}\s|>\s?|\s*[-+*]\s+(\[[ xX]\]\s*)?|\s*\d+[.)]\s+)/, '');
  block.type = toType;
  block.raw = prefix + oldContent;
  block.level = toType === 'heading' ? prefix.replace(/[^#]/g, '').length || undefined : undefined;
  block.checked = toType === 'task' ? false : undefined;
  renderSingleBlock(block.id);
  restoreCursorInBlock(block.id);
  sendMarkdownToHost();
}

function setHeadingLevel(level: number): void {
  const block = focusedBlock();
  if (!block) return;
  pushUndo();
  const text = block.raw.replace(/^(#{1,6}\s|>\s?|\s*[-+*]\s+(\[[ xX]\]\s*)?|\s*\d+[.)]\s+)/, '');
  block.type = 'heading';
  block.level = level;
  block.raw = '#'.repeat(level) + ' ' + text;
  renderSingleBlock(block.id);
  restoreCursorInBlock(block.id);
  sendMarkdownToHost();
}

function clearBlockFormatting(): void {
  const block = focusedBlock();
  if (!block || block.type === 'paragraph') return;
  convertBlock(block, 'paragraph', '');
}

function insertHorizontalRule(): void {
  syncFocusedBlockToDom();
  pushUndo();
  const currentBlock = focusedBlock();
  const currentIndex = currentBlock ? blocks.indexOf(currentBlock) : blocks.length - 1;
  const ruleBlock: BlockNode = { id: generateId(), type: 'rule', raw: '---' };
  const afterBlock: BlockNode = { id: generateId(), type: 'paragraph', raw: '' };
  blocks.splice(currentIndex + 1, 0, ruleBlock, afterBlock);
  focusedBlockId = afterBlock.id;
  renderAllBlocks();
  restoreCursorInBlock(afterBlock.id);
  sendMarkdownToHost();
}

function duplicateLine(): void {
  const block = focusedBlock();
  if (!block) return;
  syncFocusedBlockToDom();
  pushUndo();
  const index = blocks.indexOf(block);
  const clone: BlockNode = { ...block, id: generateId() };
  blocks.splice(index + 1, 0, clone);
  focusedBlockId = clone.id;
  renderAllBlocks();
  restoreCursorInBlock(clone.id);
  sendMarkdownToHost();
}

function deleteBlock(): void {
  const block = focusedBlock();
  if (!block) return;
  pushUndo();
  handleDeleteEmptyBlock(block);
}

function moveBlockUp(): void {
  const block = focusedBlock();
  if (!block) return;
  const index = blocks.indexOf(block);
  if (index <= 0) return;
  pushUndo();
  [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
  renderAllBlocks();
  restoreCursorInBlock(block.id);
  sendMarkdownToHost();
}

function moveBlockDown(): void {
  const block = focusedBlock();
  if (!block) return;
  const index = blocks.indexOf(block);
  if (index >= blocks.length - 1) return;
  pushUndo();
  [blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]];
  renderAllBlocks();
  restoreCursorInBlock(block.id);
  sendMarkdownToHost();
}

function selectAllInBlock(): void {
  const block = focusedBlock();
  if (!block) return;
  const element = write.querySelector(`[data-cid="${block.id}"]`) as HTMLElement;
  if (!element) return;
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

write.addEventListener('keydown', event => {
  const mod = event.metaKey || event.ctrlKey;
  const shift = event.shiftKey;
  const alt = event.altKey;
  const key = event.key;

  if (mod && key === 'z' && !shift) { event.preventDefault(); performUndo(); return; }
  if (mod && (key === 'y' || (key === 'z' && shift))) { event.preventDefault(); performRedo(); return; }

  if (mod && key === 'b') { event.preventDefault(); wrapSelectionWith('**'); return; }
  if (mod && key === 'i') { event.preventDefault(); wrapSelectionWith('*'); return; }
  if (mod && key === '`') { event.preventDefault(); wrapSelectionWith('`'); return; }
  if (mod && key === 'k') { event.preventDefault(); insertLink(); return; }
  if (mod && shift && key === 'x') { event.preventDefault(); wrapSelectionWith('~~'); return; }

  if (mod && key >= '1' && key <= '6') { event.preventDefault(); setHeadingLevel(parseInt(key)); return; }
  if (mod && key === '0') { event.preventDefault(); clearBlockFormatting(); return; }

  if (mod && key === '=') { event.preventDefault(); setZoom(zoomLevel + 10); return; }
  if (mod && key === '-') { event.preventDefault(); setZoom(zoomLevel - 10); return; }
  if (mod && key === '\\') { event.preventDefault(); toggleOutline(); return; }

  if (mod && shift && key === 'd') { event.preventDefault(); duplicateLine(); return; }
  if (mod && shift && key === 'k') { event.preventDefault(); deleteBlock(); return; }
  if (alt && shift && key === 'ArrowUp') { event.preventDefault(); moveBlockUp(); return; }
  if (alt && shift && key === 'ArrowDown') { event.preventDefault(); moveBlockDown(); return; }

  if (mod && key === 'a') {
    const selection = window.getSelection();
    const isAllSelected = selection?.toString().trim() === write.textContent?.trim();
    if (!isAllSelected) { event.preventDefault(); selectAllInBlock(); return; }
  }

  if (key === 'Tab' && !mod) {
    event.preventDefault();
    const block = focusedBlock();
    if (block && (block.type === 'bullet' || block.type === 'ordered' || block.type === 'task')) {
      pushUndo();
      block.raw = shift ? block.raw.replace(/^  /, '') : '  ' + block.raw;
      renderSingleBlock(block.id);
      restoreCursorInBlock(block.id);
      sendMarkdownToHost();
    } else {
      document.execCommand('insertText', false, '\t');
    }
    return;
  }

  if (key === 'Enter' && !shift) {
    event.preventDefault();
    pushUndo();
    handleEnterKey();
    return;
  }
  if (key === 'Enter' && shift) {
    event.preventDefault();
    document.execCommand('insertLineBreak');
    return;
  }

  if (key === 'Backspace') {
    const block = focusedBlock();
    if (block && isBlockEmpty(block)) {
      event.preventDefault();
      pushUndo();
      handleDeleteEmptyBlock(block);
      return;
    }
  }
});

write.addEventListener('focusout', () => {
  pushUndo();
});

function isBlockEmpty(block: BlockNode): boolean {
  const element = write.querySelector(`[data-cid="${block.id}"]`);
  const text = element?.textContent?.replace(/\u200B/g, '').trim() || '';
  return text === '' || text === '•' || /^\d+\.$/.test(text);
}

function handleEnterKey(): void {
  syncFocusedBlockToDom();
  const currentBlock = focusedBlock();
  if (!currentBlock) return;
  const currentIndex = blocks.indexOf(currentBlock);

  let beforeRaw = currentBlock.raw;
  let afterRaw = '';

  const element = write.querySelector(`[data-cid="${currentBlock.id}"]`) as HTMLElement | null;
  const selection = window.getSelection();
  if (element && selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const beforeRange = document.createRange();
    beforeRange.setStart(element, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const visibleBefore = beforeRange.cloneContents().textContent || '';

    const fullVisible = element.textContent || '';
    const cursorOffset = visibleBefore.length;

    const contentRaw = currentBlock.type === 'heading'
      ? currentBlock.raw.replace(/^#{1,6}\s/, '')
      : currentBlock.type === 'blockquote'
      ? currentBlock.raw.replace(/^>\s?/gm, '')
      : currentBlock.type === 'bullet'
      ? currentBlock.raw.replace(/^\s*[-+*]\s+/, '')
      : currentBlock.type === 'ordered'
      ? currentBlock.raw.replace(/^\s*\d+[.)]\s+/, '')
      : currentBlock.type === 'task'
      ? currentBlock.raw.replace(/^\s*[-+*]\s+\[[ xX]\]\s*/, '')
      : currentBlock.raw;

    const prefix = currentBlock.raw.slice(0, currentBlock.raw.length - contentRaw.length);
    const visiblePrefix = fullVisible.length - contentRaw.length;
    const contentOffset = Math.max(0, Math.min(cursorOffset - Math.max(0, visiblePrefix), contentRaw.length));
    const contentBefore = contentRaw.slice(0, contentOffset);
    const contentAfter = contentRaw.slice(contentOffset);
    beforeRaw = prefix + contentBefore;
    afterRaw = contentAfter;
  }

  currentBlock.raw = beforeRaw;
  const newType = detectBlockType(beforeRaw);
  currentBlock.type = newType.type;
  currentBlock.level = newType.level;

  const newBlock: BlockNode = { id: generateId(), type: 'paragraph', raw: afterRaw };
  blocks.splice(currentIndex + 1, 0, newBlock);
  focusedBlockId = newBlock.id;
  renderAllBlocks();
  restoreCursorInBlock(newBlock.id, true);
  sendMarkdownToHost();
}

function handleDeleteEmptyBlock(block: BlockNode): void {
  const index = blocks.indexOf(block);
  if (blocks.length <= 1) return;
  blocks.splice(index, 1);
  const targetIndex = Math.max(0, index - 1);
  focusedBlockId = blocks[targetIndex].id;
  renderAllBlocks();
  restoreCursorInBlock(focusedBlockId);
  sendMarkdownToHost();
}

function insertLink(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  pushUndo();
  const range = selection.getRangeAt(0);
  const text = range.toString() || 'link text';
  range.deleteContents();
  range.insertNode(document.createTextNode(`[${text}](url)`));
  syncFocusedBlockToDom();
  sendMarkdownToHost();
}

function wrapSelectionWith(wrapper: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  pushUndo();
  const range = selection.getRangeAt(0);
  const text = range.toString();
  if (text) {
    range.deleteContents();
    range.insertNode(document.createTextNode(wrapper + text + wrapper));
  } else {
    range.insertNode(document.createTextNode(wrapper + wrapper));
    range.setStart(range.startContainer, range.startOffset + wrapper.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  syncFocusedBlockToDom();
  sendMarkdownToHost();
}

function updateWordCount(): void {}

function updateOutline(): void {
  const outline = document.getElementById('outline')!;
  outline.replaceChildren();
  for (const block of blocks) {
    if (block.type !== 'heading') continue;
    const text = block.raw.replace(/^#{1,6}\s+/, '');
    const item = document.createElement('button');
    item.className = `outline-item level-${block.level}`;
    item.textContent = text;
    item.addEventListener('click', () => {
      focusedBlockId = block.id;
      renderAllBlocks();
      const element = write.querySelector(`[data-cid="${block.id}"]`) as HTMLElement;
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      restoreCursorInBlock(block.id);
    });
    outline.append(item);
  }
  if (!outline.childElementCount) outline.textContent = 'No headings yet';
}

write.addEventListener('click', event => {
  const link = (event.target as HTMLElement).closest('.md-link') as HTMLAnchorElement | null;
  if (link && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    vscode.postMessage({ type: 'openLink', href: link.getAttribute('href') || '' });
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', () => {
    const action = button.dataset.action!;
    if (action === 'bold') wrapSelectionWith('**');
    else if (action === 'italic') wrapSelectionWith('*');
    else if (action === 'code') wrapSelectionWith('`');
    else if (action === 'link') insertLink();
    else if (action === 'heading') {
      const block = focusedBlock();
      if (block) {
        if (block.type === 'heading' && block.level! < 6) setHeadingLevel(block.level! + 1);
        else if (block.type === 'heading') clearBlockFormatting();
        else setHeadingLevel(1);
      }
    } else if (action === 'list') {
      const block = focusedBlock();
      if (block && block.type !== 'bullet') convertBlock(block, 'bullet', '- ');
    } else if (action === 'quote') {
      const block = focusedBlock();
      if (block && block.type !== 'blockquote') convertBlock(block, 'blockquote', '> ');
    }
  });
}

function toggleOutline(): void { document.getElementById('sidebar')!.classList.toggle('closed'); }
document.getElementById('outlineToggle')!.addEventListener('click', toggleOutline);
document.getElementById('zoomIn')!.addEventListener('click', () => setZoom(zoomLevel + 10));
document.getElementById('zoomOut')!.addEventListener('click', () => setZoom(zoomLevel - 10));

document.getElementById('useDisk')!.addEventListener('click', () => {
  blocks = parseMarkdownToBlocks(baseText);
  focusedBlockId = null;
  renderAllBlocks();
  document.getElementById('conflict')!.hidden = true;
});
document.getElementById('keepMine')!.addEventListener('click', () => {
  document.getElementById('conflict')!.hidden = true;
  sendMarkdownToHost();
});

window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'theme') { applyTheme(message.theme); return; }
  if (message.type !== 'document' || message.version < documentVersion) return;
  applyTheme(message.theme);
  images = message.images || {};
  
  const currentText = blocksToMarkdown(blocks);
  const isAck = pendingEdit && message.text === currentText;
  const isIdentical = message.text === currentText;
  documentVersion = message.version;
  baseText = message.text;
  pendingEdit = false;

  if (!isAck && !isIdentical) {
    const savedFocusId = focusedBlockId;
    const savedScrollTop = write.scrollTop;
    blocks = parseMarkdownToBlocks(message.text);
    focusedBlockId = savedFocusId && blocks.some(b => b.id === savedFocusId) ? savedFocusId : null;
    renderAllBlocks();
    write.scrollTop = savedScrollTop;
    if (focusedBlockId) restoreCursorInBlock(focusedBlockId);
    undoStack = [message.text];
    redoStack = [];
  }
  updateWordCount();
});

vscode.postMessage({ type: 'ready' });
