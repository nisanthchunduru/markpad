import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({ stdin: { contents: "export * from './web/history'; export * from './web/sync'; export * from './web/markdown'; export * from './web/list-content';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { EditHistory, DocumentSync, parseMarkdownToBlocks, blocksToMarkdown, renderInline, listContent, listMarkdown } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

test('list breaks round-trip inside the item without absorbing sibling bullets or unindented paragraphs', () => {
  for (const [prefix, indent] of [['- ', '  '], ['  * ', '    '], ['10. ', '    '], ['- [x] ', '  ']]) {
    const content = 'First\n**Second**\n\nThird';
    const raw = prefix + 'First  \n' + indent + '**Second**\n\n' + indent + 'Third';
    assert.equal(listMarkdown(prefix, content), raw);
    assert.equal(listContent(raw, prefix), content);
    const source = raw + '\n- Sibling\n\nOutside';
    const blocks = parseMarkdownToBlocks(source);
    assert.deepEqual(blocks.map(block => block.raw), [raw, '- Sibling', 'Outside']);
    assert.equal(blocksToMarkdown(blocks), source);
  }
});

test('an empty file is an initial document, not an acknowledgement to skip', () => {
  const sync = new DocumentSync();
  assert.deepEqual(sync.receive('', 1, ''), { text: '', external: false });
  assert.equal(parseMarkdownToBlocks('')[0].type, 'blank');
});

test('a delayed acknowledgement retains subsequent typing and sends it next', () => {
  const sync = new DocumentSync();
  sync.receive('', 1, '');
  assert.equal(sync.outgoing('# H').text, '# H');
  assert.equal(sync.outgoing('# Hello'), undefined);
  assert.equal(sync.receive('# H', 2, '# Hello').text, '# Hello');
  assert.deepEqual(sync.outgoing('# Hello'), { type: 'edit', text: '# Hello', version: 2 });
});

test('identical save notifications do not replace text or create a conflict', () => {
  const sync = new DocumentSync();
  sync.receive('# Hello', 1, '');
  assert.deepEqual(sync.receive('# Hello', 2, '# Hello'), { text: '# Hello', external: false });
  assert.equal(sync.conflict, false);
});

test('concurrent non-overlapping edits are merged; overlapping edits require a choice', () => {
  const sync = new DocumentSync();
  sync.receive('abc', 1, '');
  assert.equal(sync.receive('abc!', 2, 'Xabc').text, 'Xabc!');
  assert.equal(sync.receive('Ybc!', 3, 'Zbc!'), null);
  assert.equal(sync.conflict, true);
  assert.equal(sync.resolve(false, 'Zbc!'), 'Zbc!');
  assert.equal(sync.outgoing('Zbc!').version, 3);
});

test('typing groups undo together, redo survives repeated undo, and edits clear redo', () => {
  const history = new EditHistory();
  history.record('a', 'ab', 'typing', 100);
  history.record('ab', 'abc', 'typing', 200);
  history.record('abc', 'abcd', 'typing', 800);
  assert.equal(history.undo(), 'abc');
  assert.equal(history.undo(), 'a');
  assert.equal(history.redo(), 'abc');
  assert.equal(history.redo(), 'abcd');
  history.undo();
  history.record('abc', 'abc!');
  assert.equal(history.redo(), undefined);
});

test('inline code is literal and Markdown is never parsed inside generated attributes', () => {
  assert.equal(renderInline('`**literal** <tag>`'), '<code class="md-code">**literal** &lt;tag&gt;</code>');
  assert.match(renderInline('[a *label*](https://example.com/a_b)'), /href="https:\/\/example.com\/a_b"/);
  assert.doesNotMatch(renderInline('[bad](javascript:alert)'), /href=/);
});

test('unclosed frontmatter does not consume the entire document', () => {
  const parsed = parseMarkdownToBlocks('---\n\n# Hello');
  assert.equal(parsed[0].type, 'rule');
  assert.equal(parsed.at(-1).type, 'heading');
});

test('a Markdown paragraph separator is metadata, not an editable blank row', () => {
  const blocks = parseMarkdownToBlocks('First\n\nSecond');
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'paragraph']);
  assert.equal(blocks[1].separatorBefore, '\n\n');
  assert.equal(blocksToMarkdown(blocks), 'First\n\nSecond');
});

test('trailing and repeated paragraph breaks retain intentional empty paragraphs', () => {
  for (const [source, expectedCount] of [['First\n\n', 2], ['First\n\n\n\n', 3], ['First\n\n\n\nLast', 3]]) {
    const blocks = parseMarkdownToBlocks(source);
    assert.equal(blocks.length, expectedCount);
    assert.equal(blocksToMarkdown(blocks), source);
  }
});

test('leading blank lines, space-only separators, and structural blocks round-trip without normalization', () => {
  for (const source of ['', '\n', '\n\nFirst\n', 'First\n \nSecond\n', '# H\n\n- item\n\n> quote\n\n```\na\n```\n']) {
    assert.equal(blocksToMarkdown(parseMarkdownToBlocks(source)), source);
  }
});

test('parsing leaves untouched source, whitespace and trailing newline intact', () => {
  const source = '# H\n\n  ```md\n  **not bold**\n  ```\n \n- [x] Done\n';
  assert.equal(blocksToMarkdown(parseMarkdownToBlocks(source)), source);
});
