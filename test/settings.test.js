import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS, readSettings } from '../src/settings.js';

test('every setting starts on', () => {
  assert.deepEqual(Object.values(readSettings(null)), SETTINGS.map(() => true));
  assert.deepEqual(readSettings('junk'), readSettings(null));
});

test('saved settings keep known true or false, and drop the rest', () => {
  const s = readSettings({ onePage: false, hideTabs: 'no', stray: true, colourTags: false });
  assert.equal(s.onePage, false);
  assert.equal(s.hideTabs, true);
  assert.equal(s.colourTags, false);
  assert.equal('stray' in s, false);
});
