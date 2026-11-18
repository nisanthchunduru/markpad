import { type BlockNode, generateId } from './markdown';
import { contentElement, plainText } from './selection';

export function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.matches('.md-meta, .md-list-marker, .md-fence-lang, input, [data-placeholder]')) return '';
  if (node instanceof HTMLBRElement) return '\n';
  const inner = Array.from(node.childNodes, inlineMarkdown).join('');
  if (!(node instanceof HTMLElement)) return inner;
  switch (node.tagName) {
    case 'STRONG': case 'B': return '**' + inner + '**';
    case 'EM': case 'I': return '*' + inner + '*';
    case 'DEL': case 'S': case 'STRIKE': return '~~' + inner + '~~';
    case 'CODE': {
      const text = node.textContent ?? '';
      const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
      const fence = '`'.repeat(longestRun + 1);
      return fence + text + fence;
    }
    case 'A': return '[' + inner + '](' + (node.getAttribute('href') ?? '') + ')';
    case 'IMG': return '![' + (node.getAttribute('alt') ?? '') + '](' + (node.getAttribute('data-original-src') ?? node.getAttribute('src') ?? '') + ')';
    case 'DIV': case 'P': return inner + (node.nextSibling ? '\n' : '');
    default: return inner;
  }
}

export function blockPrefix(block: BlockNode): string {
  if (block.type === 'heading') return '#'.repeat(block.level ?? 1) + ' ';
  if (block.type === 'blockquote') return '> ';
  if (block.type === 'task') return block.raw.match(/^\s*[-+*]\s+\[[ xX]\]\s*/)?.[0] ?? '- [ ] ';
  if (block.type === 'bullet') return block.raw.match(/^\s*[-+*]\s+/)?.[0] ?? '- ';
  if (block.type === 'ordered') return block.raw.match(/^\s*\d+[.)]\s+/)?.[0] ?? '1. ';
  return '';
}

export function fromContent(block: BlockNode, content: string): string {
  return block.type === 'blockquote' ? content.split('\n').map(line => '> ' + line).join('\n') : blockPrefix(block) + content;
}

export function readBlock(block: BlockNode, element: HTMLElement): string {
  if (block.type === 'frontmatter' || block.type === 'rule') return block.raw;
  if (block.type === 'fence') {
    const lines = block.raw.split('\n');
    const code = element.querySelector('code');
    const close = /^\s*```\s*$/.test(lines.at(-1) ?? '') && lines.length > 1 ? lines.at(-1)! : '```';
    return lines[0] + '\n' + (code && code.innerHTML.toLowerCase() !== '<br>' ? plainText(code) : '') + '\n' + close;
  }
  if (block.type === 'table') {
    const rows = Array.from(element.querySelectorAll('tr'), row => '| ' + Array.from(row.children, cell => inlineMarkdown(cell).replace(/\|/g, '\\|')).join(' | ') + ' |');
    rows.splice(1, 0, block.raw.split('\n')[1] ?? '| --- |');
    return rows.join('\n');
  }
  const content = contentElement(element);
  const text = content.innerHTML.toLowerCase() === '<br>' ? '' : Array.from(content.childNodes, inlineMarkdown).join('');
  if (block.type === 'task') {
    return blockPrefix(block).replace(/\[[ xX]\]/, element.querySelector<HTMLInputElement>('input')?.checked ? '[x]' : '[ ]') + text;
  }
  return fromContent(block, text);
}

export function classifyBlock(raw: string, id = generateId()): BlockNode {
  const heading = /^(#{1,6})\s/.exec(raw);
  if (heading) return { id, raw, type: 'heading', level: heading[1].length };
  if (/^>\s?/.test(raw)) return { id, raw, type: 'blockquote' };
  if (/^\s*[-+*]\s+\[[ xX]\]\s/.test(raw)) return { id, raw, type: 'task', checked: /\[[xX]\]/.test(raw) };
  if (/^\s*[-+*]\s+/.test(raw)) return { id, raw, type: 'bullet' };
  if (/^\s*\d+[.)]\s+/.test(raw)) return { id, raw, type: 'ordered' };
  return { id, raw, type: raw === '' ? 'blank' : 'paragraph' };
}
