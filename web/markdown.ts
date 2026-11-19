import { escapeHtml, fenceCode, fenceLanguage, highlightedCode } from './fences';

export interface BlockNode {
  id: string;
  type: 'paragraph' | 'heading' | 'blockquote' | 'bullet' | 'ordered' | 'task' | 'fence' | 'rule' | 'table' | 'blank' | 'frontmatter';
  level?: number;
  lang?: string;
  checked?: boolean;
  raw: string;
  separatorBefore?: string;
  children?: BlockNode[];
}

let nextId = 1;
export function generateId(): string { return 'b' + (nextId++); }

export function parseMarkdownToBlocks(markdown: string): BlockNode[] {
  const lines = markdown.split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  if (lines[0] === '---' && lines.indexOf('---', 1) > 0) {
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
      const lang = fenceLanguage(line);
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
      blocks.push({ id: generateId(), type: 'blank', raw: line });
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
  return separateSourceWhitespace(blocks);
}

function separateSourceWhitespace(blocks: BlockNode[]): BlockNode[] {
  const visible: BlockNode[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === 'blank' && visible.length && index + 1 < blocks.length) {
      const next = blocks[++index];
      visible.push({ ...next, separatorBefore: '\n' + block.raw + '\n' });
    } else {
      visible.push(block);
    }
  }
  return visible;
}

export function blocksToMarkdown(blocks: BlockNode[]): string {
  return blocks.map((block, index) => (index ? block.separatorBefore ?? '\n' : '') + block.raw).join('');
}

export function renderInline(text: string, images: Record<string, string> = {}, depth = 0): string {
  if (depth > 12) return escapeHtml(text);
  let html = '';
  while (text) {
    const escaped = /^\\([\\`*_[\]~!<>])/.exec(text);
    const code = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(text);
    const link = /^(!?)\[([^\]]*)\]\(([^\s)]+)\)/.exec(text);
    const emphasis = /^(\*\*\*|\*\*|__|~~|\*|_)(?=\S)([\s\S]*?\S)\1/.exec(text);
    if (escaped) {
      html += escapeHtml(escaped[1]); text = text.slice(escaped[0].length);
    } else if (code) {
      html += '<code class="md-code">' + escapeHtml(code[2]) + '</code>';
      text = text.slice(code[0].length);
    } else if (link) {
      const [, image, label, url] = link;
      const safe = !/^[a-z][\w+.-]*:/i.test(url) || /^(https?:|mailto:)/i.test(url);
      if (image && images[url]) html += '<img class="md-image" src="' + escapeHtml(images[url]) + '" data-original-src="' + escapeHtml(url) + '" alt="' + escapeHtml(label) + '">';
      else if (!image && safe) html += '<a class="md-link" href="' + escapeHtml(url) + '">' + renderInline(label, images, depth + 1) + '</a>';
      else html += escapeHtml(link[0]);
      text = text.slice(link[0].length);
    } else if (emphasis) {
      const tag = emphasis[1] === '~~' ? 'del' : emphasis[1].length >= 2 ? 'strong' : 'em';
      let inner = renderInline(emphasis[2], images, depth + 1);
      if (emphasis[1] === '***') inner = '<em>' + inner + '</em>';
      html += '<' + tag + '>' + inner + '</' + tag + '>';
      text = text.slice(emphasis[0].length);
    } else {
      html += escapeHtml(text[0]); text = text.slice(1);
    }
  }
  return html;
}

export function renderBlockToHtml(block: BlockNode, images: Record<string, string> = {}): string {
  const indentation = ['bullet', 'ordered', 'task'].includes(block.type) ? (block.raw.match(/^ */)?.[0].length ?? 0) : 0;
  const cid = ` data-cid="${block.id}"${indentation ? ` style="padding-left:${indentation * 0.75}em"` : ''}`;
  const focusClass = '';

  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`;
      const text = block.raw.replace(/^#{1,6}\s/, '');
      return `<${tag}${cid} class="md-heading${focusClass}" data-raw="${escapeHtml(block.raw)}">${renderInline(text, images)}</${tag}>`;
    }
    case 'paragraph':
      return `<p${cid} class="md-paragraph${focusClass}">${renderInline(block.raw, images) || '<br>'}</p>`;
    case 'blockquote': {
      const text = block.raw.replace(/^>\s?/gm, '');
      return `<blockquote${cid} class="md-blockquote${focusClass}">${renderInline(text, images)}</blockquote>`;
    }
    case 'bullet': {
      const text = block.raw.replace(/^\s*[-+*]\s+/, '');
      return `<div${cid} class="md-list-item md-bullet${focusClass}"><span class="md-list-marker" contenteditable="false">•</span><span class="md-list-content">${renderInline(text, images) || '<br>'}</span></div>`;
    }
    case 'ordered': {
      const match = block.raw.match(/^\s*(\d+)[.)]\s+/);
      const num = match ? match[1] : '1';
      const text = block.raw.replace(/^\s*\d+[.)]\s+/, '');
      return `<div${cid} class="md-list-item md-ordered${focusClass}"><span class="md-list-marker" contenteditable="false">${num}.</span><span class="md-list-content">${renderInline(text, images) || '<br>'}</span></div>`;
    }
    case 'task': {
      const text = block.raw.replace(/^\s*[-+*]\s+\[[ xX]\]\s*/, '');
      const checked = block.checked ? 'checked' : '';
      return `<div${cid} class="md-list-item md-task${focusClass}"><input type="checkbox" ${checked} class="md-task-checkbox"><span class="md-list-content">${renderInline(text, images) || '<br>'}</span></div>`;
    }
    case 'fence': {
      const language = block.lang ?? '';
      const picker = `<span class="md-language-control" contenteditable="false"><input type="text" class="md-fence-lang" aria-label="Code block language" value="${escapeHtml(language)}" placeholder="Set language…" pattern="[^\\s\x60]+" autocomplete="off" spellcheck="false" title="Code block language (blank for plain text)"></span>`;
      return `<div${cid} class="md-fence${focusClass}" data-lang="${escapeHtml(language)}"><pre><code>${highlightedCode(fenceCode(block.raw), language)}</code></pre>${picker}</div>`;
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
      html += '<thead><tr>' + header.map((c, i) => `<th${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${renderInline(c, images)}</th>`).join('') + '</tr></thead>';
      if (bodyRows.length) {
        html += '<tbody>' + bodyRows.map(row => '<tr>' + row.map((c, i) => `<td${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${renderInline(c, images)}</td>`).join('') + '</tr>').join('') + '</tbody>';
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
      return `<table${cid} class="md-frontmatter${focusClass}" contenteditable="false" title="Edit frontmatter in VS Code’s Text Editor"><tbody>${tableRows}</tbody></table>`;
    }
    case 'blank':
      return `<p${cid} class="md-blank"><br></p>`;
    default:
      return `<p${cid}>${escapeHtml(block.raw)}</p>`;
  }
}

