import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/marks/lib.js';

// Pinned: were a tag's hue to change, every tag in every vault would change colour.
const HUES = { garden: 10, plan: 5, soil: 6, Garden: 10, '#garden': 10, '"garden"': 10, 'projects/atlas': 10, a: 4, über: 11, 日本: 13, 'x-y_z': 3 };

test("a tag's hue never changes", () => {
  for (const [tag, hue] of Object.entries(HUES)) assert.equal(lib.tagHue(tag), hue, tag);
});

test('one tag, one hue: case, a #, quotes and spaces are nothing', () => {
  const hues = ['garden', 'GARDEN', '#garden', ' garden ', "'garden'"].map(lib.tagHue);
  assert.equal(new Set(hues).size, 1);
});

test('every hue is in range, and they spread', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const h = lib.tagHue(`tag${i}`);
    assert.ok(Number.isInteger(h) && h >= 0 && h < lib.TAG_HUES);
    seen.add(h);
  }
  assert.equal(seen.size, lib.TAG_HUES);
});

test('the class and a link’s tag', () => {
  assert.equal(lib.tagClass('#garden'), 'mdom-tag-h10');
  assert.equal(lib.linkTag('#garden'), 'garden');
});
