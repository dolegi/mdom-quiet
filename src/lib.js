// Pure logic for the page itself (settings, one page, the path): nothing here
// imports Obsidian, so Node tests it directly (test/lib.test.js). The notes'
// logic is in notes/lib.js, the tags' in marks/lib.js.

/** @typedef {{
 *   onePage: boolean,
 *   closeSidebars: boolean,
 *   hideTabs: boolean,
 *   pathTitle: boolean,
 *   colourTags: boolean,
 * }} Settings */

/** @type {Settings} */
export const DEFAULTS = {
  onePage: true,       // one note on screen: a new tab or split replaces it
  closeSidebars: true, // sidebars start closed
  hideTabs: true,      // no tab bar over the note
  pathTitle: true,     // the vault and folders before the note's name
  colourTags: true,    // each tag a chip in a hue from its name
};

/** Saved settings over the defaults, keeping only known keys of the right type.
 * @param {unknown} saved
 * @returns {Settings} */
export function readSettings(saved) {
  const out = { ...DEFAULTS };
  if (saved && typeof saved === 'object') {
    for (const k of /** @type {(keyof Settings)[]} */ (Object.keys(DEFAULTS))) {
      const v = /** @type {Record<string, unknown>} */ (saved)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

/** What is drawn before a note's name: its vault, then its folders, each
 * followed by " / ". A note at the top of the vault gets just the vault.
 * @param {string} vault
 * @param {string} path the note's vault path, "a/b/note.md"
 * @returns {string} */
export function pathPrefix(vault, path) {
  const folders = path.split('/').slice(0, -1).filter(Boolean);
  return [vault, ...folders].map((p) => p + ' / ').join('');
}

/** The leaves to close so one page is left: every one but `keep`. When `keep`
 * is not among them (focus is in a sidebar), the last one opened stays.
 * @template T
 * @param {T[]} leaves in the order they were opened
 * @param {T | null | undefined} keep
 * @returns {T[]} */
export function extraLeaves(leaves, keep) {
  if (leaves.length < 2) return [];
  const stay = keep && leaves.includes(keep) ? keep : leaves[leaves.length - 1];
  return leaves.filter((l) => l !== stay);
}
