// Finding notes: by name, then the lines inside them. Pure: nothing here
// imports Obsidian, so Node tests it directly (test/search.test.js).

/** Of the lines a note holds, the search shows this many. */
export const HITS_A_NOTE = 3;
/** The search stops after this many lines. */
const HIT_LIMIT = 500;
/** A line's text past the match is cut to this; the row ellipsizes anyway. */
const POST_MAX = 400;

/** @param {string} s */
const hasUpper = (s) => /\p{Lu}/u.test(s);

/** Find in a note: the first match on each line, smart case (an upper-case
 * letter makes it exact).
 * @param {string} text @param {string} needle @param {number} [limit]
 * @returns {{line: number, col: number, text: string}[]} line is 1-based */
export function findInText(text, needle, limit = HIT_LIMIT) {
  if (!needle) return [];
  const exact = hasUpper(needle);
  const want = exact ? needle : needle.toLowerCase();
  const hits = [];
  let line = 0;
  let start = 0;
  while (start <= text.length && hits.length < limit) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const s = text.slice(start, end);
    const col = (exact ? s : s.toLowerCase()).indexOf(want);
    if (col >= 0) hits.push({ line: line + 1, col, text: s });
    line++;
    start = end + 1;
  }
  return hits;
}

const WORD_START = '/_-. ';
/** @param {string} ch */
const low = (ch) => ch.toLowerCase();

/** The fuzzy match of a mistyped search: subsequence matches, runs and word
 * starts first; smart case. Held to test/fixtures/fuzzy.json.
 * @param {string} needle @param {string[]} items @returns {string[]} */
export function fuzzyRank(needle, items) {
  if (!needle) return items.slice();
  const exact = hasUpper(needle);
  const want = [...needle].map((c) => (exact ? c : low(c)));
  const ranked = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let score = 0;
    let n = 0;
    /** @type {string | null} */
    let prev = null;
    let last = false;
    for (const ch of item) {
      if (n === want.length) break;
      if ((exact ? ch : low(ch)) === want[n]) {
        score += 1 + (last ? 10 : 0) + (prev === null || WORD_START.includes(prev) ? 8 : 0);
        n++;
        last = true;
      } else {
        score--;
        last = false;
      }
      prev = ch;
    }
    if (n === want.length) ranked.push({ i, score });
  }
  ranked.sort((a, b) => b.score - a.score || items[a.i].length - items[b.i].length || a.i - b.i);
  return ranked.map((r) => items[r.i]);
}

/** @param {string} path */
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

/** The notes a query names, the best first. Every word must be in the note's
 * name: an exact name, then a name starting so, a word starting so, anywhere
 * in the name; after those, notes whose folders make up the words. Case is
 * nothing. Only when none is named so does a single word of three letters or
 * more fall back to the names that hold its letters in order (a typo, an
 * abbreviation), three at most. At most 30. `words` are to mark in the name;
 * none for a fallback.
 * @param {string} query @param {string[]} paths
 * @returns {{path: string, words: string[]}[]} */
export function rankNames(query, paths) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const path of paths) {
    const lowPath = path.toLowerCase().replace(/\.md$/, ''); // the extension is not the name
    const name = nameOf(lowPath);
    let score;
    if (words.every((w) => name.includes(w))) {
      const at = name.indexOf(words[0]);
      score = name === words.join(' ') ? 500 : at === 0 ? 400 : /[^\p{L}\p{N}]/u.test(name[at - 1]) ? 300 : 200;
    } else if (words.every((w) => lowPath.includes(w))) score = 100;
    else continue;
    found.push({ path, words, score, len: name.length });
  }
  found.sort((a, b) => b.score - a.score || a.len - b.len || (a.path < b.path ? -1 : 1));
  if (found.length) return found.slice(0, 30).map(({ path, words }) => ({ path, words }));
  if (words.length !== 1 || words[0].length < 3) return [];
  /** @param {string} path */
  const inName = (path) => {
    let n = 0;
    for (const ch of nameOf(path).toLowerCase()) if (ch === words[0][n]) n++;
    return n === words[0].length;
  };
  return fuzzyRank(words[0], paths.filter(inName))
    .slice(0, 3)
    .map((path) => ({ path, words: [] }));
}

/** A name cut where `words` (lower case) are in it, to mark them, in order,
 * the whole name.
 * @param {string} name @param {string[]} words
 * @returns {{text: string, on: boolean}[]} */
export function nameMarks(name, words) {
  const lowName = name.toLowerCase();
  const on = new Array(name.length).fill(false);
  for (const w of words) {
    if (!w) continue;
    for (let at = lowName.indexOf(w); at >= 0; at = lowName.indexOf(w, at + w.length)) on.fill(true, at, at + w.length);
  }
  const parts = [];
  for (let i = 0; i < name.length; ) {
    let j = i;
    while (j < name.length && on[j] === on[i]) j++;
    parts.push({ text: name.slice(i, j), on: on[i] });
    i = j;
  }
  return parts;
}

/** @typedef {{path: string, line: number, col: number, text: string}} Hit */

/** A search's lines, a note at a time: the notes with the word in a heading
 * first, then the ones with the most lines, then by name. Each note's lines
 * stay in the order given.
 * @param {Hit[]} hits @returns {{path: string, hits: Hit[]}[]} */
export function groupHits(hits) {
  /** @type {Map<string, {path: string, hits: Hit[], head: boolean}>} */
  const by = new Map();
  for (const h of hits) {
    let g = by.get(h.path);
    if (!g) by.set(h.path, (g = { path: h.path, hits: [], head: false }));
    g.hits.push(h);
    if (/^#{1,6} /.test(h.text)) g.head = true;
  }
  return [...by.values()]
    .sort((a, b) => Number(b.head) - Number(a.head) || b.hits.length - a.hits.length || (a.path < b.path ? -1 : 1))
    .map(({ path, hits }) => ({ path, hits }));
}

/** A hit's line, cut to keep 24 characters before the match.
 * @param {string} text @param {number} col @param {number} len */
export function snippet(text, col, len) {
  const from = Math.max(0, col - 24);
  return {
    pre: (from > 0 ? '…' : '') + text.slice(from, col),
    hit: text.slice(col, col + len),
    post: text.slice(col + len, col + len + POST_MAX),
  };
}

/** Every line in the notes that holds `q`: the notes in path order, the
 * first match on each line, up to `limit`; `more` says there were others. Reads one note at a time and gives the page a
 * turn every few milliseconds, so typing never waits on it; `cancelled`
 * stops it (the query changed).
 * @param {string[]} paths
 * @param {(path: string) => Promise<string>} read
 * @param {string} q
 * @param {{limit?: number, cancelled?: () => boolean, pause?: () => Promise<void>, sliceMs?: number, now?: () => number}} [opts]
 * @returns {Promise<{hits: Hit[], more: boolean} | null>} null when cancelled */
export async function searchNotes(paths, read, q, opts = {}) {
  const limit = opts.limit ?? HIT_LIMIT;
  const cancelled = opts.cancelled ?? (() => false);
  const pause = opts.pause ?? (() => new Promise((r) => setTimeout(r, 0)));
  const now = opts.now ?? (() => performance.now());
  const sliceMs = opts.sliceMs ?? 8;
  const sorted = paths.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  /** @type {Hit[]} */
  const hits = [];
  let slice = now();
  for (const path of sorted) {
    if (cancelled()) return null;
    let text;
    try {
      text = await read(path);
    } catch {
      continue; // gone since it was listed
    }
    for (const h of findInText(text, q, limit + 1 - hits.length)) hits.push({ path, ...h });
    if (hits.length > limit) return { hits: hits.slice(0, limit), more: true };
    if (now() - slice > sliceMs) {
      await pause();
      slice = now();
    }
  }
  return cancelled() ? null : { hits, more: false };
}
