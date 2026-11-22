// The settings: one table, which the settings tab draws and readSettings
// keeps to. Pure: nothing here imports Obsidian, so Node tests it directly
// (test/settings.test.js).

export const SETTINGS = /** @type {const} */ ([
  { key: 'onePage', name: 'One page', desc: 'Opening a note in a new tab or split replaces the one in front instead.' },
  { key: 'closeSidebars', name: 'Start with sidebars closed', desc: 'They can still be opened; they start shut.' },
  { key: 'hideTabs', name: 'Hide the tab bar', desc: 'With one page, the tab bar has nothing to show.' },
  { key: 'pathTitle', name: 'Show the path above the note', desc: 'The vault and folders, quietly, before the note’s name. Needs the inline title (Settings → Appearance).' },
  { key: 'colourTags', name: 'Colour tags', desc: 'Each tag a pale chip in a hue of its own, from its name, the same in every note.' },
]);

/** Every setting is a toggle, on unless turned off.
 * @typedef {Record<(typeof SETTINGS)[number]['key'], boolean>} Settings */

/** Saved settings over the defaults (all on), keeping only known keys that
 * are true or false.
 * @param {unknown} saved @returns {Settings} */
export function readSettings(saved) {
  const s = /** @type {Record<string, unknown>} */ (saved && typeof saved === 'object' ? saved : {});
  return /** @type {Settings} */ (Object.fromEntries(SETTINGS.map(({ key }) => [key, typeof s[key] === 'boolean' ? s[key] : true])));
}
