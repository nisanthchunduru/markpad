const listMarker = /^([ \t]*(?:[-+*]|\d+[.)])[ \t]+)/;

export function listPrefix(raw: string): string {
  return raw.match(listMarker)?.[1] ?? '';
}

export function listItemEnd(lines: string[], start: number): number {
  const indent = listPrefix(lines[start]).length;
  let end = start + 1;
  for (let i = end; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() && line.length < indent) continue;
    if (line.slice(0, indent).trim() || line.length < indent) break;
    if (/^(?:[-+*]\s|\d+[.)]\s|```|#{1,6}\s|>\s?|\|)/.test(line.trimStart())) break;
    end = i + 1;
  }
  return end;
}

export function listContent(raw: string, prefix: string): string {
  const indentation = new RegExp(`^[ \\t]{0,${listPrefix(raw).length}}`);
  return raw.slice(prefix.length).split('\n').map((line, i, lines) => {
    const content = i ? line.replace(indentation, '') : line;
    return i < lines.length - 1 ? content.replace(/ {2,}$/, '') : content;
  }).join('\n');
}

export function listMarkdown(prefix: string, content: string): string {
  const indent = ' '.repeat(listPrefix(prefix).length);
  const lines = content.split('\n');
  return prefix + lines.map((line, i) => {
    const continuation = i && (line || i === lines.length - 1) ? indent : '';
    const hardBreak = line && i + 1 < lines.length && (lines[i + 1] || i + 1 === lines.length - 1) ? '  ' : '';
    return continuation + line + hardBreak;
  }).join('\n');
}
