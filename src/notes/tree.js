// The vault as a tree, and where a note goes in it. Pure: nothing here
// imports Obsidian, so Node tests it directly (test/tree.test.js).

/** A note's path as shown: without `.md`. @param {string} path */
export const bare = (path) => path.replace(/\.md$/, '');

/** @param {string} path */
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

/** The folder a path is in, '' at the top. @param {string} path */
export const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** Every folder a path is in, the outermost first: 'a/b/c.md' → a, a/b.
 * @param {string} path */
export function foldersOf(path) {
  const out = [];
  for (let cut = path.indexOf('/'); cut >= 0; cut = path.indexOf('/', cut + 1)) out.push(path.slice(0, cut));
  return out;
}

/** Where a typed name puts a note, new or renamed: `.md` added unless it
 * ends in .md, folders kept, nothing hidden or outside the vault. Obsidian
 * opens only markdown as a note, so every note made here is markdown.
 * @param {string} typed @returns {string | null} */
export function notePath(typed) {
  const name = typed.trim().replace(/\/+$/, '');
  if (!name || name.startsWith('/')) return null;
  const path = /\.md$/i.test(name) ? name : `${name}.md`;
  return path.split('/').some((seg) => !seg || seg.startsWith('.')) ? null : path;
}

/** Where moving `path` into `folder` puts it: the same name there. Null if
 * the folder can't be one (`..`, a hidden name) or the note is there already.
 * @param {string} path @param {string} folder @returns {string | null} */
export function movePath(path, folder) {
  const name = nameOf(path);
  const dir = folder.trim().replace(/^\/+|\/+$/g, '');
  if (dir && dir.split('/').some((p) => !p.trim() || p.startsWith('.'))) return null;
  const to = dir ? `${dir}/${name}` : name;
  return to === path ? null : to;
}

/** Where a copy of `path` lands in `folder`: under its own name, or where
 * that is `taken`, "name copy", "name copy 2", and so on.
 * @param {string} path @param {string} folder @param {Set<string>} taken */
export function copyPath(path, folder, taken) {
  const name = nameOf(path);
  const dot = name.lastIndexOf('.') < 1 ? name.length : name.lastIndexOf('.');
  const pre = folder ? `${folder}/` : '';
  for (let n = 0; ; n++) {
    const to = `${pre}${name.slice(0, dot)}${n ? ` copy${n > 1 ? ` ${n}` : ''}` : ''}${name.slice(dot)}`;
    if (!taken.has(to)) return to;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A note's last edit, quietly and short: the time today, else the date with
 * its year, "12 Nov 26".
 * @param {number} ms @param {number} [now] */
export function editedLabel(ms, now = Date.now()) {
  const d = new Date(ms);
  /** @param {number} x */
  const pad = (x) => String(x).padStart(2, '0');
  if (d.toDateString() === new Date(now).toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getFullYear() % 100)}`;
}

/** @typedef {{name: string, path: string, depth: number, dir: boolean, end: number}} TreeNode */

/** The vault as a tree: in each folder its notes, then its folders, each by
 * name (in byte order). Folders start closed but those holding `current`. Each node knows where its subtree
 * ends, so a closed folder is passed in one step however much it holds.
 * @param {string[]} paths @param {string | null} current */
export function buildTree(paths, current) {
  /** @typedef {{notes: {name: string, path: string}[], dirs: Map<string, Folder>}} Folder */
  /** @type {Folder} */
  const root = { notes: [], dirs: new Map() };
  for (const path of paths.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    let folder = root;
    let from = 0;
    for (let cut = path.indexOf('/'); cut >= 0; cut = path.indexOf('/', from)) {
      const name = path.slice(from, cut);
      let next = folder.dirs.get(name);
      if (!next) folder.dirs.set(name, (next = { notes: [], dirs: new Map() }));
      folder = next;
      from = cut + 1;
    }
    folder.notes.push({ name: path.slice(from), path });
  }
  /** @type {TreeNode[]} */
  const nodes = [];
  /** @param {Folder} folder @param {string} at @param {number} depth */
  const flatten = (folder, at, depth) => {
    for (const n of folder.notes) nodes.push({ name: n.name, path: n.path, depth, dir: false, end: nodes.length + 1 });
    for (const name of [...folder.dirs.keys()].sort()) {
      const path = at ? `${at}/${name}` : name;
      const node = { name, path, depth, dir: true, end: 0 };
      nodes.push(node);
      flatten(/** @type {Folder} */ (folder.dirs.get(name)), path, depth + 1);
      node.end = nodes.length;
    }
  };
  flatten(root, '', 0);
  const expanded = new Set(current ? foldersOf(current) : []);
  return {
    nodes,
    expanded,
    /** The rows to draw: every node not inside a closed folder. */
    visible() {
      const out = [];
      for (let i = 0; i < nodes.length; ) {
        const n = nodes[i];
        out.push(n);
        i = n.dir && !expanded.has(n.path) ? n.end : i + 1;
      }
      return out;
    },
    /** @param {string} path */
    toggle(path) {
      if (!expanded.delete(path)) expanded.add(path);
    },
  };
}
