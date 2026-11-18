import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyCodeNavigation({ frame, page, mod, fixture, save, step }) {
  async function selectionIn(selector) {
    return frame.evaluate(selector => {
      const node = getSelection()?.focusNode;
      return Boolean(node && document.querySelector(selector)?.contains(node));
    }, selector);
  }

  await step('Down Arrow leaves a final code line, creates one paragraph, and supports undo/redo', async () => {
    const source = '```js\nconst finish = true;\n```';
    await fixture(source, 'const finish = true;');
    await frame.locator('pre code').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    assert.equal(await selectionIn('#write > p'), true);
    await page.keyboard.press('ArrowDown');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    await page.keyboard.type('Outside code');
    await save(source + '\n\nOutside code');
    await expect(frame.locator('pre code')).toHaveText('const finish = true;');
    await page.keyboard.press(mod + '+z');
    await page.keyboard.press(mod + '+z');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(1);
    assert.equal(await selectionIn('pre code'), true);
    await page.keyboard.press(mod + '+Shift+z');
    await page.keyboard.press(mod + '+Shift+z');
    await save(source + '\n\nOutside code');
  });

  await step('Down Arrow reuses the following paragraph without editing the document', async () => {
    const source = '```\nkeep me\n```\n\nFollowing paragraph';
    await fixture(source, 'Following paragraph');
    await frame.locator('pre code').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(frame.locator('#write > [data-cid]')).toHaveCount(2);
    assert.equal(await selectionIn('.md-paragraph'), true);
    await save(source);
    await page.keyboard.type('New ');
    await save('```\nkeep me\n```\n\nNew Following paragraph');
  });

  await step('Down Arrow navigates earlier code lines and Shift+Down still extends selection', async () => {
    const source = '```\nfirst line\nsecond line\nthird line\n```';
    await fixture(source, 'third line');
    await frame.locator('pre code').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(mod + '+ArrowLeft');
    await page.keyboard.press('ArrowDown');
    assert.equal(await selectionIn('pre code'), true);
    await expect(frame.locator('#write > p')).toHaveCount(0);
    await page.keyboard.press('Shift+ArrowDown');
    assert.equal(await frame.evaluate(() => getSelection()?.isCollapsed), false);
    await expect(frame.locator('#write > p')).toHaveCount(0);
    await save(source);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    assert.equal(await selectionIn('#write > p'), true);
    await page.keyboard.type('Next paragraph');
    await save(source + '\n\nNext paragraph');
  });

  await step('Down Arrow leaves an empty code block', async () => {
    const source = '# Empty code sample\n\n```\n```';
    await fixture(source, 'Empty code sample');
    await frame.locator('pre code').click();
    await page.keyboard.press('ArrowDown');
    assert.equal(await selectionIn('#write > p'), true);
    await page.keyboard.type('After empty code');
    await save(source + '\n\nAfter empty code');
  });

  await step('Down Arrow inserts a paragraph before a following heading without changing the heading', async () => {
    const source = '```\ncode before heading\n```\n\n## Keep this heading';
    await fixture(source, 'Keep this heading');
    await frame.locator('pre code').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('Between blocks');
    await save('```\ncode before heading\n```\n\nBetween blocks\n\n## Keep this heading');
    await expect(frame.locator('h2')).toHaveText('Keep this heading');
  });

  await step('leaving an unclosed code block closes its fence before adding a paragraph', async () => {
    await fixture('```js\nunclosed code', 'unclosed code');
    await frame.locator('pre code').click();
    await page.keyboard.press(mod + '+ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('Outside the fence');
    await save('```js\nunclosed code\n```\n\nOutside the fence');
  });
}
