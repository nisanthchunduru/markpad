import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimalPatch, rebaseDraft } from '../build/diff.cjs';

test('a no-op produces no patch', () => {
  assert.equal(minimalPatch('abc', 'abc'), undefined);
});

test('the smallest single replacement preserves shared context', () => {
  assert.deepEqual(minimalPatch('before\nold\nafter', 'before\nnew\nafter'), { from: 7, to: 10, insert: 'new' });
});

test('insertions and deletions retain correct offsets', () => {
  assert.deepEqual(minimalPatch('abc', 'abXYc'), { from: 2, to: 2, insert: 'XY' });
  assert.deepEqual(minimalPatch('abc', 'ac'), { from: 1, to: 2, insert: '' });
});

test('disjoint edits rebase in either order', () => {
  assert.equal(rebaseDraft('abcd', 'aXbcd', 'abcYd'), 'aXbcYd');
  assert.equal(rebaseDraft('abcd', 'abcYd', 'aXbcd'), 'aXbcYd');
});

test('overlapping edits require an explicit choice', () => {
  assert.equal(rebaseDraft('abcd', 'aXd', 'aYd'), null);
});
