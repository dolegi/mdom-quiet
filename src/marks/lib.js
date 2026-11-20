// Pure logic for mdom-marks: nothing here imports Obsidian, so Node tests it
// directly (test/lib.test.js).

/** The hues a tag can have; styles.css has a class for each. */
export const TAG_HUES = 16;

/** A tag's hue, 0 to TAG_HUES - 1, from its name alone (FNV-1a), so it is the
 * same in every note. Tags ignore case, and a property writes bare what the
 * text writes with a `#`: all one tag.
 * @param {string} tag */
export function tagHue(tag) {
  const name = tag.trim().replace(/^["']|["']$/g, '').replace(/^#/, '').toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return ((h ^ (h >>> 15)) >>> 0) % TAG_HUES;
}

/** The class that paints a tag in its hue. @param {string} tag */
export const tagClass = (tag) => `mdom-tag-h${tagHue(tag)}`;

/** A reading view's tag link (`#garden`, href `#garden`) as its tag.
 * @param {string} text */
export const linkTag = (text) => text.replace(/^#/, '');
