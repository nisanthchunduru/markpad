import hljs from 'highlight.js/lib/common';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fenceCode(raw: string): string {
  const lines = raw.split('\n');
  return lines.slice(1, lines.length > 1 && /^\s*```\s*$/.test(lines.at(-1)!) ? -1 : undefined).join('\n');
}

export function fenceLanguage(raw: string): string {
  return /^\s*```[ \t]*([^\s`]*)/.exec(raw)?.[1] ?? '';
}

export function withFenceLanguage(raw: string, language: string): string {
  if (!language) return raw.replace(/^([ \t]*```)[^\n]*/, '$1');
  return raw.replace(/^([ \t]*```)([ \t]*)([^\s`]*)/, (_, ticks, space) => ticks + space + language);
}

export function highlightedCode(code: string, language: string): string {
  const name = language.toLowerCase();
  const highlighted = name && hljs.getLanguage(name) && code.length <= 100_000
    ? hljs.highlight(code, { language: name, ignoreIllegals: true }).value : escapeHtml(code);
  return highlighted + (!code || code.endsWith('\n') ? '<br data-placeholder="true">' : '');
}
