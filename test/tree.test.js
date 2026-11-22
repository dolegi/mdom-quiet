// The tree, and where a note goes in it (src/notes/tree.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/notes/tree.js';

test('notePath: .md added, folders kept, nothing outside or hidden', () => {
  const ok = { idea: 'idea.md', ' projects/idea/ ': 'projects/idea.md', 'todo.txt': 'todo.txt.md', 'a.md': 'a.md', 'v1.2': 'v1.2.md', 'dir/b': 'dir/b.md' };
  for (const [q, want] of Object.entries(ok)) assert.equal(lib.notePath(q), want, q);
  for (const bad of ['', '  ', '/', '../out', '/etc/x', 'a/../../b', '.hidden', 'notes/.x', './a', 'a//b']) {
    assert.equal(lib.notePath(bad), null, bad);
  }
});

test("a note's last edit, quietly and short: the time today, else the date with its year", () => {
  const now = new Date(2026, 10, 13, 18, 0).getTime();
  assert.equal(lib.editedLabel(new Date(2026, 10, 13, 9, 5).getTime(), now), '09:05');
  assert.equal(lib.editedLabel(new Date(2026, 10, 12, 23, 59).getTime(), now), '12 Nov 26');
  assert.equal(lib.editedLabel(new Date(2026, 0, 1).getTime(), now), '1 Jan 26');
  assert.equal(lib.editedLabel(new Date(2025, 11, 31).getTime(), now), '31 Dec 25');
  assert.equal(lib.editedLabel(new Date(2009, 4, 6).getTime(), now), '6 May 09');
});

test("the tree: a folder's notes, then its folders; closed but for the current note's", () => {
  const tree = lib.buildTree(['b.md', 'a.md', 'z/y/x.md', 'z/w.md', 'c/d.md'], 'z/y/x.md');
  const show = () => tree.visible().map((n) => `${'  '.repeat(n.depth)}${n.dir ? '+' : ''}${n.name}`);
  assert.deepEqual(show(), ['a.md', 'b.md', '+c', '+z', '  w.md', '  +y', '    x.md']);
  tree.toggle('z');
  assert.deepEqual(show(), ['a.md', 'b.md', '+c', '+z']);
  tree.toggle('c');
  assert.deepEqual(show(), ['a.md', 'b.md', '+c', '  d.md', '+z']);
  assert.equal(tree.expanded.has('c'), true);
  assert.deepEqual(lib.buildTree([], null).visible(), []);
});

test('the tree is in byte order', () => {
  const tree = lib.buildTree(['b.md', 'B.md', 'a.md', 'Zed/x.md', 'alpha/y.md'], null);
  assert.deepEqual(tree.visible().map((n) => n.name), ['B.md', 'a.md', 'b.md', 'Zed', 'alpha']);
});

test('the tree handles a hundred thousand notes quickly', () => {
  const paths = [];
  for (let i = 0; i < 100000; i++) paths.push(`area-${i % 40}/topic-${(i / 40) % 25 | 0}/note-${i}.md`);
  const t0 = performance.now();
  const tree = lib.buildTree(paths, paths[500]);
  const rows = tree.visible();
  const ms = performance.now() - t0;
  assert.ok(rows.length < 200, `${rows.length} rows`);
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
});

test('moving: where a note goes in a folder', () => {
  assert.equal(lib.movePath('a/n.md', ''), 'n.md');
  assert.equal(lib.movePath('n.md', 'a/b'), 'a/b/n.md');
  assert.equal(lib.movePath('n.md', '/a/b/'), 'a/b/n.md');
  assert.equal(lib.movePath('a/n.md', 'a'), null);
  assert.equal(lib.movePath('n.md', '../out'), null);
  assert.equal(lib.movePath('n.md', '.hidden'), null);
  assert.equal(lib.movePath('n.md', 'a//b'), null);
});

test('a copy keeps its name in another folder, and takes "copy" where the name is taken', () => {
  const taken = new Set(['a/n.md', 'a/n copy.md', 'top.md', 'a/noext']);
  assert.equal(lib.copyPath('a/n.md', 'b', taken), 'b/n.md');
  assert.equal(lib.copyPath('a/n.md', '', taken), 'n.md');
  assert.equal(lib.copyPath('a/n.md', 'a', taken), 'a/n copy 2.md');
  assert.equal(lib.copyPath('top.md', '', taken), 'top copy.md');
  assert.equal(lib.copyPath('a/noext', 'a', taken), 'a/noext copy');
  assert.equal(lib.copyPath('x/v1.2.md', 'x', new Set(['x/v1.2.md'])), 'x/v1.2 copy.md');
});

test('a path: its folders, and as shown', () => {
  assert.deepEqual(lib.foldersOf('a/b/c.md'), ['a', 'a/b']);
  assert.deepEqual(lib.foldersOf('c.md'), []);
  assert.equal(lib.dirOf('a/b/c.md'), 'a/b');
  assert.equal(lib.dirOf('c.md'), '');
  assert.equal(lib.bare('a/b/c.md'), 'a/b/c');
});
