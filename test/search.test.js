// Finding notes (src/notes/search.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../src/notes/search.js';

test('findInText is smart case and gives one hit per line', () => {
  const text = 'Apple pie\napple\nnone\nAPPLE apple';
  assert.deepEqual(lib.findInText(text, 'apple').map((h) => [h.line, h.col]), [[1, 0], [2, 0], [4, 0]]);
  assert.deepEqual(lib.findInText(text, 'apple')[2].text, 'APPLE apple');
  assert.deepEqual(lib.findInText(text, 'Apple').map((h) => h.line), [1]);
  assert.deepEqual(lib.findInText(text, ''), []);
  assert.equal(lib.findInText('x\n'.repeat(1000), 'x', 500).length, 500);
});

test('fuzzyRank ranks as fixtures/fuzzy.json says', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/fuzzy.json', import.meta.url), 'utf8'));
  for (const c of cases) assert.deepEqual(lib.fuzzyRank(c.query, c.items), c.want, c.query);
  assert.deepEqual(lib.fuzzyRank('', ['b', 'a']), ['b', 'a']);
});

test('a hit snippet keeps 24 characters of context before the match', () => {
  assert.deepEqual(lib.snippet('short needle here', 6, 6), { pre: 'short ', hit: 'needle', post: ' here' });
  const long = 'x'.repeat(40) + 'needle';
  assert.deepEqual(lib.snippet(long, 40, 6), { pre: '…' + 'x'.repeat(24), hit: 'needle', post: '' });
  assert.equal(lib.snippet('a' + 'z'.repeat(1000), 0, 1).post.length, 400);
});

const VAULT = [
  'todo.md',
  'drafts/coffee.md',
  'drafts/oxford-trip.md',
  'live/202608171400 Coffee.md',
  'archive/Speaking Confidently and Effectively.md',
  'archive/Trip to Ostsee.md',
  'drafts/Trek Crossrip Elite.md',
  'books/meditations.md',
  'books/coffee/beans.md',
  'journal/iced-coffee notes.md',
];

const named = (q, paths = VAULT) => lib.rankNames(q, paths).map((m) => m.path);

test('a search names notes by what their names hold, never by scattered letters', () => {
  assert.deepEqual(named('coffee'), ['drafts/coffee.md', 'journal/iced-coffee notes.md', 'live/202608171400 Coffee.md', 'books/coffee/beans.md']);
  assert.ok(!named('coffee').some((p) => p.includes('Speaking')));
  assert.deepEqual(named('trip'), ['archive/Trip to Ostsee.md', 'drafts/oxford-trip.md']);
  assert.deepEqual(named('rip'), ['drafts/oxford-trip.md', 'archive/Trip to Ostsee.md', 'drafts/Trek Crossrip Elite.md']);
  assert.deepEqual(named('TRIP'), named('trip'));
  assert.deepEqual(named('  '), []);
  assert.deepEqual(named('zzz'), []);
});

test('every word must be there; a folder counts, after the names', () => {
  assert.deepEqual(named('books med'), ['books/meditations.md']);
  assert.deepEqual(named('trip ostsee'), ['archive/Trip to Ostsee.md']);
  assert.deepEqual(named('trip moon'), []);
  assert.deepEqual(named('md'), []);
  assert.deepEqual(named('todo'), ['todo.md']);
});

test('a word no name holds falls back to its letters in order: three notes at most, one word, three letters', () => {
  assert.deepEqual(named('cofee').slice(0, 1), ['drafts/coffee.md']);
  assert.ok(named('cofee').length <= 3);
  assert.deepEqual(lib.rankNames('cofee', VAULT)[0].words, []);
  assert.deepEqual(named('bks'), []);
  assert.deepEqual(named('cf'), []);
  assert.deepEqual(named('cofee beans'), []);
  assert.deepEqual(lib.rankNames('coffee', VAULT)[0].words, ['coffee']);
});

test('a search stops at 30 names', () => {
  const many = Array.from({ length: 50 }, (_, i) => `n/note ${String(i).padStart(2, '0')}.md`);
  const got = named('note', many);
  assert.equal(got.length, 30);
  assert.equal(got[0], 'n/note 00.md');
});

test('the words found in a name are marked, whatever their case, and the name is whole', () => {
  assert.deepEqual(lib.nameMarks('202608171400 Coffee', ['coffee']), [
    { text: '202608171400 ', on: false },
    { text: 'Coffee', on: true },
  ]);
  assert.deepEqual(lib.nameMarks('trip trip.md', ['trip']).map((p) => p.on), [true, false, true, false]);
  assert.deepEqual(lib.nameMarks('a.md', []), [{ text: 'a.md', on: false }]);
  assert.deepEqual(lib.nameMarks('', ['x']), []);
  for (const [name, words] of /** @type {[string, string[]][]} */ ([['Trip to Ostsee.md', ['to', 'trip']], ['ab', ['ab', 'b']], ['x', ['']]])) {
    assert.equal(lib.nameMarks(name, words).map((p) => p.text).join(''), name);
  }
});

test('lines are grouped a note at a time: a heading first, then the most lines, then the name', () => {
  const h = (path, text) => ({ path, line: 1, col: 0, text });
  const groups = lib.groupHits([h('a.md', 'x'), h('b.md', 'x'), h('b.md', 'x again'), h('c.md', '## x'), h('a.md', 'x too'), h('d.md', 'x')]);
  assert.deepEqual(groups.map((g) => g.path), ['c.md', 'a.md', 'b.md', 'd.md']);
  assert.deepEqual(groups[1].hits.map((x) => x.text), ['x', 'x too']);
  assert.deepEqual(lib.groupHits([]), []);
});

const notes = { 'b.md': 'one apple\ntwo', 'a.md': 'apple\napple pie', 'c.md': 'none' };

const read = async (p) => {
  if (!(p in notes)) throw new Error('gone');
  return notes[p];
};

test('searchNotes reads the notes in path order and finds every line', async () => {
  const res = await lib.searchNotes(Object.keys(notes), read, 'apple');
  assert.deepEqual(res?.hits.map((h) => [h.path, h.line, h.col]), [['a.md', 1, 0], ['a.md', 2, 0], ['b.md', 1, 4]]);
  assert.equal(res?.more, false);
});

test('searchNotes stops one past the limit and says there are more', async () => {
  const res = await lib.searchNotes(Object.keys(notes), read, 'apple', { limit: 2 });
  assert.equal(res?.hits.length, 2);
  assert.equal(res?.more, true);
});

test('searchNotes skips a note gone since it was listed, and stops when cancelled', async () => {
  const res = await lib.searchNotes(['gone.md', 'a.md'], read, 'pie');
  assert.deepEqual(res?.hits.map((h) => h.path), ['a.md']);
  let n = 0;
  assert.equal(await lib.searchNotes(Object.keys(notes), read, 'apple', { cancelled: () => ++n > 1 }), null);
});

test('searchNotes gives the page a turn when a slice runs long', async () => {
  let t = 0;
  let pauses = 0;
  await lib.searchNotes(Object.keys(notes), read, 'apple', { now: () => (t += 5), sliceMs: 8, pause: async () => { pauses++; } });
  assert.ok(pauses >= 1);
});
