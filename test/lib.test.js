import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, readSettings, pathPrefix, extraLeaves } from '../src/lib.js';

test('readSettings keeps known booleans and drops the rest', () => {
  assert.deepEqual(readSettings(null), DEFAULTS);
  assert.deepEqual(readSettings('junk'), DEFAULTS);
  const s = readSettings({ onePage: false, hideTabs: 'no', stray: true });
  assert.equal(s.onePage, false);
  assert.equal(s.hideTabs, true);
  assert.equal('stray' in s, false);
  assert.equal(s.colourTags, true);
  assert.equal(readSettings({ colourTags: false }).colourTags, false);
});

test('pathPrefix is the vault and folders, each with a slash', () => {
  assert.equal(pathPrefix('thinkslow', 'One.md'), 'thinkslow / ');
  assert.equal(pathPrefix('thinkslow', 'a/b/One.md'), 'thinkslow / a / b / ');
  assert.equal(pathPrefix('v', 'a//One.md'), 'v / a / ');
});

test('extraLeaves leaves one page', () => {
  assert.deepEqual(extraLeaves([], 'a'), []);
  assert.deepEqual(extraLeaves(['a'], 'b'), []);
  assert.deepEqual(extraLeaves(['a', 'b', 'c'], 'b'), ['a', 'c']);
  // focus elsewhere: the newest stays
  assert.deepEqual(extraLeaves(['a', 'b', 'c'], null), ['a', 'b']);
  assert.deepEqual(extraLeaves(['a', 'b'], 'sidebar'), ['a']);
});
