import { isThemeName, themeNames, themeLabels } from '../src/themes';
import { MarkdownEditor } from './engine';
import { DocumentSync } from './sync';
import { caret, restoreSelection } from './selection';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();
const sync = new DocumentSync();
let eol = '\n';
let zoomLevel = 100;
let saveRequested = false;
let typoraRequested = false;

const app = document.getElementById('app')!;
app.innerHTML = `<div class="shell"><aside id="sidebar" class="closed"><div class="side-header"><span>Outline</span></div><div id="outline"></div></aside><div class="main"><header><button id="outlineToggle" aria-label="Toggle outline" title="Outline">☰</button><button id="openInTypora" type="button" hidden>Open in Typora</button><span class="spacer"></span><button id="zoomOut" title="Zoom out (Ctrl/Cmd+−)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5.5"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5"/></svg></button><span id="zoomLabel">100%</span><button id="zoomIn" title="Zoom in (Ctrl/Cmd++)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5.5"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="7" y1="4.5" x2="7" y2="9.5"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5"/></svg></button><select id="themePicker" aria-label="Writing theme" title="Writing theme"></select><div class="header-actions"><button data-action="heading" title="Heading">H</button><button data-action="bold" title="Bold (Ctrl/Cmd+B)"><b>B</b></button><button data-action="italic" title="Italic (Ctrl/Cmd+I)"><i>I</i></button><button data-action="code" title="Inline code">⟨⟩</button><button data-action="link" title="Insert link">↗</button><button data-action="list" title="Bullet list">≡</button><button data-action="quote" title="Blockquote">❞</button></div></header><div id="conflict" hidden>Changes from another editor overlap your unsaved changes. <button id="useDisk">Use latest file</button> <button id="keepMine">Keep my draft</button></div><div id="write" contenteditable="true" spellcheck="true"></div></div></div>`;


const write = document.getElementById('write')!;
write.setAttribute('role', 'textbox');
write.setAttribute('aria-label', 'Markdown editor');
write.setAttribute('aria-multiline', 'true');
const editor = new MarkdownEditor(write, () => { updateOutline(); sendChanges(); });
const themePicker = document.getElementById('themePicker') as HTMLSelectElement;
for (const theme of themeNames) {
  const option = document.createElement('option'); option.value = theme; option.textContent = themeLabels[theme]; themePicker.append(option);
}
function applyTheme(theme: unknown): void {
  if (!isThemeName(theme)) return;
  document.documentElement.dataset.theme = theme; themePicker.value = theme;
}
themePicker.addEventListener('change', () => { applyTheme(themePicker.value); vscode.postMessage({ type: 'theme', theme: themePicker.value }); });

function sendChanges(): void {
  const edit = sync.outgoing(editor.text);
  if (edit) vscode.postMessage({ ...edit, text: edit.text.replace(/\n/g, eol) });
  if (!sync.isSynchronized(editor.text)) return;
  if (typoraRequested) {
    typoraRequested = false;
    vscode.postMessage({ type: 'openInTypora' });
  }
  if (saveRequested) {
    saveRequested = false;
    vscode.postMessage({ type: 'save' });
  }
}

function updateOutline(): void {
  const outline = document.getElementById('outline')!;
  outline.replaceChildren();
  for (const block of editor.blocks) {
    if (block.type !== 'heading') continue;
    const button = document.createElement('button');
    button.className = 'outline-item level-' + block.level;
    button.textContent = block.raw.replace(/^#{1,6}\s+/, '');
    button.addEventListener('click', () => {
      restoreSelection(write, caret(block.id));
      write.querySelector('[data-cid="' + block.id + '"]')?.scrollIntoView({ block: 'start' });
    });
    outline.append(button);
  }
  if (!outline.childElementCount) outline.textContent = 'No headings yet';
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    switch (button.dataset.action) {
      case 'bold': editor.format('strong'); break;
      case 'italic': editor.format('em'); break;
      case 'code': editor.format('code'); break;
      case 'link': editor.format('a'); break;
      case 'heading': editor.cycleHeading(); break;
      case 'list': editor.changeBlock('- '); break;
      case 'quote': editor.changeBlock('> '); break;
    }
  });
}

function toggleOutline(): void { document.getElementById('sidebar')!.classList.toggle('closed'); }
function setZoom(value: number): void {
  zoomLevel = Math.max(50, Math.min(200, value));
  write.style.fontSize = 'calc(var(--writing-size) * ' + zoomLevel / 100 + ')';
  document.getElementById('zoomLabel')!.textContent = zoomLevel + '%';
}
document.getElementById('outlineToggle')!.addEventListener('click', toggleOutline);
const openInTypora = document.getElementById('openInTypora') as HTMLButtonElement;
openInTypora.addEventListener('click', () => { typoraRequested = true; sendChanges(); });
document.getElementById('zoomIn')!.addEventListener('click', () => setZoom(zoomLevel + 10));
document.getElementById('zoomOut')!.addEventListener('click', () => setZoom(zoomLevel - 10));
write.addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 's' && !event.shiftKey) {
    event.preventDefault(); event.stopPropagation(); saveRequested = true; sendChanges(); return;
  }
  if (['=', '+', '-'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setZoom(zoomLevel + (event.key === '-' ? -10 : 10)); }
  if (event.key === '\\') { event.preventDefault(); event.stopPropagation(); toggleOutline(); }
});
write.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a.md-link');
  if (!link) return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) vscode.postMessage({ type: 'openLink', href: link.getAttribute('href') });
});

for (const [id, useLatest] of [['useDisk', true], ['keepMine', false]] as const) {
  document.getElementById(id)!.addEventListener('click', () => {
    const text = sync.resolve(useLatest, editor.text);
    if (useLatest) editor.load(text);
    document.getElementById('conflict')!.hidden = true;
    sendChanges(); updateOutline();
  });
}
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'typoraAvailability') { openInTypora.hidden = message.available !== true; return; }
  if (message.type === 'theme') { applyTheme(message.theme); return; }
  if (message.type !== 'document' || typeof message.text !== 'string' || message.version < sync.version) return;
  const initial = sync.version < 0;
  if (initial) eol = message.text.includes('\r\n') ? '\r\n' : '\n';
  applyTheme(message.theme);
  editor.images = message.images ?? {};
  const next = sync.receive(message.text.replace(/\r\n/g, '\n'), message.version, editor.text);
  if (next && (initial || editor.text !== next.text)) editor.load(next.text, next.external || initial);
  document.getElementById('conflict')!.hidden = !sync.conflict;
  updateOutline(); sendChanges();
});
vscode.postMessage({ type: 'ready' });
