import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { chromium, expect } from '@playwright/test';
import { verifyCodeNavigation } from './code-navigation-checks.mjs';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const workspace = join(homedir(), 'tmp-workspaces', randomUUID(), 'tmp');
const profile = join(workspace, 'profile');
const file = join(workspace, 'editing.md');
await mkdir(join(profile, 'User'), { recursive: true });
await writeFile(join(profile, 'User/settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none', 'window.title': 'Tyler Editing Regression',
  'window.restoreWindows': 'none', 'security.workspace.trust.enabled': false,
  'chat.disableAIFeatures': true, 'files.autoSave': 'off', 'editor.formatOnSave': false,
  'tyler.theme': 'github', 'workbench.editorAssociations': { '*.md': 'tyler.editor' }
}));
await writeFile(file, '');
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const code = process.env.VSCODE_BIN ?? 'code';
if (process.env.TYLER_VSIX) await execute(code, ['--user-data-dir', profile, '--extensions-dir', join(workspace, 'extensions'), '--install-extension', resolve(process.env.TYLER_VSIX), '--force']);
await execute(code, [
  '--user-data-dir', profile, '--extensions-dir', join(workspace, 'extensions'),
  ...(process.env.TYLER_VSIX ? [] : ['--extensionDevelopmentPath=' + root]), '--remote-debugging-port=' + port,
  '--skip-welcome', '--skip-release-notes', '--new-window', file
]);
console.log('VS Code regression artifacts:', workspace);
let browser;
for (let attempt = 0; attempt < 40; attempt++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 250)); }
}
assert.ok(browser, 'VS Code debugging endpoint is available');
let page;
let frame;
for (let attempt = 0; attempt < 80 && !frame; attempt++) {
  for (const candidate of browser.contexts()[0].pages()) {
    for (const child of candidate.frames()) if (await child.locator('#write').count()) { page = candidate; frame = child; }
  }
  if (!frame) await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(frame, 'Tyler webview loaded in VS Code');
page.setDefaultTimeout(5000);
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const passed = [];
const clipboard = process.platform === 'darwin' ? (await execute('pbpaste')).stdout : null;
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function step(name, run) {
  await run(); passed.push(name); console.log('PASS:', name);
}
async function save(expected) {
  await page.keyboard.press(mod + '+s');
  await expect.poll(async () => readFile(file, 'utf8')).toBe(expected);
  await expect(page.locator('.tab.dirty')).toHaveCount(0);
  await page.waitForTimeout(200);
}
async function fixture(text, expectedText) {
  await writeFile(file, text);
  await expect(frame.locator('#write')).toContainText(expectedText);
  await page.waitForTimeout(150);
}
async function reloadEditor() {
  const previousFrame = frame;
  await page.keyboard.press('F1');
  const commandInput = page.locator('.quick-input-widget input').first();
  await expect(commandInput).toBeVisible();
  await expect(commandInput).toBeFocused();
  await page.keyboard.type('Developer: Reload Window');
  await expect(page.locator('.quick-input-list').getByText('Developer: Reload Window', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => previousFrame.isDetached(), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => {
    for (const child of page.frames()) if (await child.locator('#write > [data-cid]').count()) { frame = child; return true; }
    return false;
  }, { timeout: 15000 }).toBe(true);
}

async function bookmark() {
  return frame.evaluate(() => {
    const selection = getSelection();
    return { text: selection?.focusNode?.textContent, offset: selection?.focusOffset, scroll: document.getElementById('write').scrollTop };
  });
}

try {
  await step('empty file → heading → Enter → paragraph → save retains all text and caret', async () => {
    await frame.locator('#write p').click();
    await page.keyboard.type('# Hello', { delay: 30 });
    await expect(frame.locator('h1')).toHaveText('Hello');
    await page.keyboard.press('Enter');
    await page.keyboard.type('First paragraph', { delay: 20 });
    await expect(frame.locator('h1')).toHaveText('Hello');
    const before = await bookmark();
    await save('# Hello\nFirst paragraph');
    assert.deepEqual(await bookmark(), before);
    await page.screenshot({ path: join(workspace, 'heading-save.png') });
  });

  await step('rapid typing across multiple host acknowledgements never loses characters', async () => {
    await page.keyboard.type(' and rapid text 0123456789', { delay: 0 });
    await save('# Hello\nFirst paragraph and rapid text 0123456789');
  });

  await step('multiple undo and Shift+Cmd/Ctrl+Z redo restore edits and selection', async () => {
    await page.waitForTimeout(450);
    await page.keyboard.type('!');
    await page.keyboard.press(mod + '+z');
    await expect(frame.locator('#write')).not.toContainText('0123456789!');
    await page.keyboard.press(mod + '+Shift+z');
    await expect(frame.locator('#write')).toContainText('0123456789!');
    await save('# Hello\nFirst paragraph and rapid text 0123456789!');
  });

  await step('one Enter creates one visible paragraph and keeps source separation after reloading', async () => {
    await fixture('Paragraph one', 'Paragraph one');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Enter');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    const geometry = await frame.locator('#write').evaluate(root => {
      const [first, second] = root.children;
      const caretBlock = getSelection()?.focusNode;
      return { gap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom, caretInSecond: second.contains(caretBlock), lineHeight: parseFloat(getComputedStyle(root).lineHeight) };
    });
    assert.equal(geometry.caretInSecond, true);
    assert.ok(geometry.gap > 0 && geometry.gap < geometry.lineHeight, 'Paragraph margin adds modest spacing, not an empty separator row');
    await page.keyboard.type('Paragraph two');
    await save('Paragraph one\n\nParagraph two');
    await reloadEditor();
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    await expect(frame.locator('#write > p').last()).toHaveText('Paragraph two');
  });

  await step('repeated Enter preserves intentional empty paragraphs through undo, redo and reload', async () => {
    await fixture('Repeated Enter', 'Repeated Enter');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(3);
    await save('Repeated Enter\n\n\n\n');
    await page.keyboard.press(mod + '+z');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    await page.keyboard.press(mod + '+Shift+z');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(3);
    await save('Repeated Enter\n\n\n\n');
    await reloadEditor();
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(3);
    await frame.locator('#write > p').last().click();
    await page.keyboard.type('Last paragraph');
    await save('Repeated Enter\n\n\n\nLast paragraph');
  });

  await step('splitting a bold heading in the middle preserves formatting on both sides', async () => {
    await fixture('# **Hello** world\n\nTail\n', 'Tail');
    await frame.locator('h1 strong').click();
    await page.keyboard.press(mod + '+ArrowLeft');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await save('# **Hel**\n**lo** world\n\nTail\n');
    await expect(frame.locator('h1 strong')).toHaveText('Hel');
    await expect(frame.locator('p strong')).toHaveText('lo');
  });

  await step('clicking between existing blocks edits the clicked block, not stale focus', async () => {
    await frame.locator('p').filter({ hasText: 'Tail' }).click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.type('!');
    await save('# **Hel**\n**lo** world\n\nTail!\n');
    await frame.locator('h1').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.type('?');
    await expect(frame.locator('h1')).toContainText('?');
    await expect(frame.locator('p').filter({ hasText: 'Tail!' })).toHaveCount(1);
    await save('# **Hel?**\n**lo** world\n\nTail!\n');
  });

  await step('list continuation, empty-item exit and subsequent typing work', async () => {
    await fixture('- apples\n', 'apples');
    await frame.locator('.md-list-content').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type('oranges');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('After list');
    await save('- apples\n- oranges\nAfter list\n');
  });

  await step('list indentation survives edits and Shift+Tab removes the indentation', async () => {
    await fixture('- Indent me\n', 'Indent me');
    await frame.locator('.md-list-content').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Tab');
    await page.keyboard.type('!');
    await save('  - Indent me!\n');
    await page.keyboard.press('Shift+Tab');
    await save('- Indent me!\n');
  });

  await step('typing a fenced-code opener and Enter creates an editable code block', async () => {
    await fixture('Fence draft\n', 'Fence draft');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+a');
    await page.keyboard.type('```js');
    await page.keyboard.press('Enter');
    await page.keyboard.type('const typed = true;');
    await expect(frame.locator('pre code')).toHaveText('const typed = true;');
    await save('```js\nconst typed = true;\n```');
  });

  await step('only the active fence shows its inline language field; Enter, Escape and blur preserve Markdown', async () => {
    const body = 'const sample = "<tag>";';
    const source = language => '```' + language + '\n' + body + '\n```\n\nBelow the fence\n\n```json\n{}\n```';
    await fixture(source(''), body);
    const code = frame.locator('pre code').first();
    const para = frame.locator('.md-paragraph').filter({ hasText: 'Below the fence' });
    const input = frame.getByRole('textbox', { name: 'Code block language', exact: true });
    const paragraphTop = () => para.evaluate(el => el.getBoundingClientRect().top + el.closest('#write').scrollTop);
    await para.click(); await expect(input).toHaveCount(0);
    const inactiveTop = await paragraphTop();
    await code.click(); await expect(input).toHaveCount(1);
    assert.equal(await paragraphTop(), inactiveTop, 'Showing the field must not shift the next paragraph');
    assert.equal(await input.evaluate(el => el.list), null, 'No language suggestions dropdown');
    const panel = await frame.locator('.md-fence > pre').first().boundingBox();
    const field = await input.boundingBox();
    assert.ok(field.y >= panel.y + panel.height - 1 && Math.abs(field.x + field.width - panel.x - panel.width) < 10);
    const typeLanguage = async value => {
      await input.click();
      await expect(input).toBeFocused();
      await expect(input).toBeVisible();
      const length = (await input.inputValue()).length;
      await page.keyboard.press('End');
      if (length) await page.keyboard.press('ArrowLeft');
      const session = await page.context().newCDPSession(page);
      const shortcut = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: mod === 'Meta' ? 4 : 2 };
      try {
        await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...shortcut });
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...shortcut });
      } finally { await session.detach(); }
      await expect.poll(() => input.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, length]);
      if (value) await page.keyboard.type(value, { delay: 25 });
      else await page.keyboard.press('Backspace');
      await expect(input).toHaveValue(value);
      await expect(input).toBeFocused();
    };
    await typeLanguage('js'); await page.keyboard.press('Enter');
    await expect(code.locator('.hljs-keyword')).toHaveText('const');
    await expect(code).toHaveText(body); await save(source('js'));
    await typeLanguage('python'); await page.keyboard.press('Escape'); await expect(input).toHaveValue('js');
    await typeLanguage('my-language');
    await page.screenshot({ path: join(workspace, 'inline-language-focused.png') });
    await para.click(); await expect(input).toHaveCount(0);
    assert.equal(await paragraphTop(), inactiveTop, 'Hiding the field must not shift the next paragraph');
    await expect(code.locator('span')).toHaveCount(0); await save(source('my-language'));
    await frame.locator('pre code').last().click(); await expect(input).toHaveValue('json');
    await code.click(); await expect(input).toHaveValue('my-language');
    await typeLanguage(''); await page.keyboard.press('Enter'); await save(source(''));
    await page.keyboard.press(mod + '+z'); await save(source('my-language'));
    await page.keyboard.press('ArrowDown'); await expect(input).toHaveCount(0);
  });

  await verifyCodeNavigation({ frame, page, mod, fixture, save, step });

  await step('Shift+Enter persists a line break rather than deleting it', async () => {
    await fixture('Before break\n', 'Before break');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('After break');
    await save('Before break\nAfter break\n');
  });

  await step('fenced-code edits, Enter and literal Markdown characters persist', async () => {
    await fixture('```js\nconst n = 1;\n```\n', 'const n = 1;');
    await frame.locator('pre code').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type('// **literal**');
    await save('```js\nconst n = 1;\n// **literal**\n```\n');
    await expect(frame.locator('pre strong')).toHaveCount(0);
  });

  await step('checkbox toggles undo/redo and do not change surrounding text', async () => {
    await fixture('- [ ] Verify task\n', 'Verify task');
    await frame.locator('input[type=checkbox]').click();
    await save('- [x] Verify task\n');
    await frame.locator('.md-list-content').click();
    await page.keyboard.press(mod + '+z');
    await save('- [ ] Verify task\n');
    await expect(frame.locator('input[type=checkbox]')).not.toBeChecked();
    await page.keyboard.press(mod + '+Shift+z');
    await expect(frame.locator('input[type=checkbox]')).toBeChecked();
    await save('- [x] Verify task\n');
  });

  await step('select-all replacement and undo retain the entire document', async () => {
    await fixture('# Replace me\n\nSecond block\n', 'Second block');
    await frame.locator('h1').click();
    await page.keyboard.press(mod + '+a');
    await page.keyboard.type('Replacement');
    await save('Replacement');
    await page.keyboard.press(mod + '+z');
    await expect(frame.locator('#write')).toContainText('Second block');
    await save('# Replace me\n\nSecond block\n');
  });

  await step('toolbar bold keeps the selected text and creates persisted Markdown', async () => {
    await fixture('Format this\n', 'Format this');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowLeft');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
    await frame.locator('[data-action=bold]').click();
    await expect(frame.locator('strong')).toHaveText('Format');
    await save('**Format** this\n');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.type('!');
    await save('**Format** this!\n');
  });

  await step('italic, strikethrough and inline-code shortcuts preserve selected text', async () => {
    await fixture('one two\n', 'one two');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowLeft');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press(mod + '+i');
    await save('*one* two\n');
    await page.keyboard.press(mod + '+Shift+x');
    await save('*~~one~~* two\n');
    await fixture('code literal\n', 'code literal');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press(mod + '+`');
    await save('`code` literal\n');
  });

  await step('heading shortcuts and duplicate/delete block shortcuts dispatch distinct commands', async () => {
    await fixture('Heading shortcut\n', 'Heading shortcut');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+2');
    await expect(frame.locator('h2')).toHaveText('Heading shortcut');
    await page.keyboard.press(mod + '+Shift+d');
    await expect(frame.locator('h2')).toHaveCount(2);
    await page.keyboard.press(mod + '+Shift+k');
    await expect(frame.locator('h2')).toHaveCount(1);
    await page.keyboard.press(mod + '+s');
    await page.waitForTimeout(300);
    assert.match(await readFile(file, 'utf8'), /^## Heading shortcut/);
  });

  await step('Backspace at a paragraph boundary joins text without losing either side', async () => {
    await fixture('# Join test\nLeft\n\nRight\n', 'Join test');
    await frame.locator('p').filter({ hasText: 'Right' }).click();
    await page.keyboard.press(mod + '+ArrowLeft');
    await page.keyboard.press('Backspace');
    await save('# Join test\nLeftRight\n');
    await page.keyboard.press(mod + '+z');
    await expect(frame.locator('#write')).toContainText('Right');
    await page.keyboard.press(mod + '+s');
    await page.waitForTimeout(250);
  });

  await step('copy, cut and paste preserve selected plain text', async () => {
    await fixture('Copy these words\n', 'Copy these words');
    await frame.locator('.md-paragraph').click();
    await page.keyboard.press(mod + '+ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press(mod + '+x');
    await page.keyboard.press(mod + '+v');
    await save('Copy these words\n');
    await page.keyboard.press(mod + '+a');
    await page.keyboard.press(mod + '+c');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(mod + '+v');
    await expect(frame.locator('#write')).toContainText('Copy these words');
    await page.keyboard.press(mod + '+s');
    await page.waitForTimeout(300);
    const saved = await readFile(file, 'utf8');
    assert.equal((saved.match(/Copy these words/g) ?? []).length, 2);
  });

  await step('table cell edits persist while frontmatter is protected from unsaved DOM-only edits', async () => {
    await fixture('---\nname: test\n---\n\n| Key | Value |\n| --- | --- |\n| first | original |\n', 'original');
    await expect(frame.locator('.md-frontmatter')).toHaveAttribute('contenteditable', 'false');
    await frame.locator('.md-table td').last().click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.type('!');
    await save('---\nname: test\n---\n\n| Key | Value |\n| --- | --- |\n| first | original! |\n');
  });

  await step('all themes give paragraphs modest spacing and headings larger margins without extra rows', async () => {
    const source = 'Line one\nLine two\n\nNext paragraph\n\n' + Array.from({ length: 6 }, (_, index) => '#'.repeat(index + 1) + ' Heading ' + (index + 1) + '\n\nFollowing paragraph ' + (index + 1)).join('\n\n');
    const fencedSource = source + '\n\n```js\nfirst()\n```\n```js\nsecond()\n```\n\nAfter fences';
    await fixture(fencedSource, 'After fences');
    for (const theme of ['github', 'gothic', 'newsprint', 'night', 'pixyll', 'pixyll-night', 'whitey']) {
      await frame.locator('#themePicker').selectOption(theme);
      await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
      const metrics = await frame.locator('#write').evaluate(async root => {
        await document.fonts.ready;
        const paragraphs = root.querySelectorAll('.md-paragraph');
        const paragraphGap = paragraphs[1].getBoundingClientRect().top - paragraphs[0].getBoundingClientRect().bottom;
        const lineHeight = parseFloat(getComputedStyle(paragraphs[0]).lineHeight);
        const headings = Array.from(root.querySelectorAll('.md-heading'), heading => ({
          before: heading.getBoundingClientRect().top - heading.previousElementSibling.getBoundingClientRect().bottom,
          after: heading.nextElementSibling.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
          topPadding: parseFloat(getComputedStyle(heading).paddingTop)
        }));
        const [first, second] = root.querySelectorAll('.md-fence');
        const fenceStyle = getComputedStyle(first);
        const expectedFenceGap = Math.max(parseFloat(fenceStyle.marginBottom), parseFloat(getComputedStyle(second).marginTop));
        const fenceGap = second.getBoundingClientRect().top - first.getBoundingClientRect().bottom;
        return { paragraphGap, lineHeight, headings, count: root.children.length, fenceGap, expectedFenceGap, fenceInset: parseFloat(getComputedStyle(first.querySelector('pre')).paddingLeft) };
      });
      assert.equal(metrics.count, 17, theme + ': no source-only separator rows');
      assert.ok(metrics.fenceGap > 0 && Math.abs(metrics.fenceGap - metrics.expectedFenceGap) < 1, theme + ': adjacent fences have their themed visual gap');
      assert.ok(metrics.fenceInset > 0, theme + ': code retains its inner padding');
      assert.ok(metrics.paragraphGap > 0 && metrics.paragraphGap < metrics.lineHeight, theme + ': paragraph spacing');
      for (const heading of metrics.headings) {
        assert.ok(heading.before > metrics.paragraphGap, theme + ': extra space above headings');
        assert.ok(heading.after > 0 && heading.after < heading.before, theme + ': balanced space below headings');
        assert.equal(heading.topPadding, 0, theme + ': margins do not stack with old heading padding');
      }
      await page.screenshot({ path: join(workspace, theme + '-spacing.png') });
    }
    assert.equal(await readFile(file, 'utf8'), fencedSource, 'Theme spacing does not change Markdown');
  });

  await step('zoom controls work without editing Markdown', async () => {
    const before = await readFile(file, 'utf8');
    await frame.locator('#zoomIn').click();
    await expect(frame.locator('#zoomLabel')).toHaveText('110%');
    await frame.locator('#zoomOut').click();
    await expect(frame.locator('#zoomLabel')).toHaveText('100%');
    assert.equal(await readFile(file, 'utf8'), before);
  });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(workspace, 'passed.png') });
} catch (error) {
  await page.screenshot({ path: join(workspace, 'failure.png') });
  await writeFile(join(workspace, 'failure.html'), await frame.locator('#write').innerHTML());
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(join(workspace, 'results.json'), JSON.stringify({ passed, errors, success: !process.exitCode }, null, 2));
  if (clipboard !== null) await new Promise((resolve, reject) => {
    const copy = spawn('pbcopy'); copy.on('error', reject); copy.on('close', resolve); copy.stdin.end(clipboard);
  });
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(() => {});
  await browser.close();
}
