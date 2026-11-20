// Tags in colour. Each tag is a pale chip in a hue of its own, from its name
// alone (tagHue), so a tag looks the same in every note: in the editor, in
// reading view and in the properties. Obsidian draws the chip; this sets its
// colours, through a class whose hue styles.css turns into Obsidian's
// --tag-color and --tag-background.

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { linkTag, tagClass } from './lib.js';

/** @typedef {import('@codemirror/view').EditorView} EditorView */
/** @typedef {import('@codemirror/view').ViewUpdate} ViewUpdate */
/** @typedef {import('@codemirror/view').DecorationSet} DecorationSet */

/** Every tag on screen, in its hue. Obsidian's parser has already found them
 * (so a # in code is not one): a tag is its `#` token (hashtag-begin) and
 * the name after it (hashtag-end). CodeMirror draws the hue inside
 * Obsidian's own spans for the tag, one in each; styles.css reaches the chip
 * through :has.
 * @param {EditorView} view @returns {DecorationSet} */
function tagMarks(view) {
  /** @type {RangeSetBuilder<Decoration>} */
  const marks = new RangeSetBuilder();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    /** @type {number | null} */
    let start = null;
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        if (name.includes('hashtag-begin')) start = node.from;
        else if (start !== null && name.includes('hashtag-end')) {
          const tag = view.state.doc.sliceString(start, node.to);
          marks.add(start, node.to, Decoration.mark({ class: `mdom-tag ${tagClass(tag)}` }));
          start = null;
        } else if (start !== null && !name.includes('hashtag')) start = null;
      },
    });
  }
  return marks.finish();
}

/** The editor's part: a CodeMirror extension. */
export const editorTags = ViewPlugin.fromClass(
  class {
    /** @param {EditorView} view */
    constructor(view) {
      this.tree = syntaxTree(view.state);
      this.decorations = tagMarks(view);
    }

    /** @param {ViewUpdate} u */
    update(u) {
      const tree = syntaxTree(u.state);
      if (u.docChanged || u.viewportChanged || tree !== this.tree) {
        this.tree = tree;
        this.decorations = tagMarks(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** @param {Element} el @param {string} tag */
function paint(el, tag) {
  const want = tagClass(tag);
  if (el.classList.contains(want)) return;
  unpaint(el);
  el.classList.add(want);
}

/** @param {Element} el */
function unpaint(el) {
  for (const c of [...el.classList]) if (c.startsWith('mdom-tag-h')) el.classList.remove(c);
}

/** A reading view's tags, under `el` (a markdown post-processor).
 * @param {HTMLElement} el */
export function paintLinks(el) {
  el.querySelectorAll('a.tag').forEach((a) => paint(a, linkTag(a.textContent ?? '')));
}

/** The pills of a tags property, under `root`. @param {ParentNode} root */
const pillsIn = (root) =>
  root.querySelectorAll('.metadata-property:is([data-property-key="tags"], [data-property-key="tag"]) .multi-select-pill');

/** @param {Element} pill */
const paintPill = (pill) => paint(pill, pill.querySelector('.multi-select-pill-content')?.textContent ?? '');

/** The properties' tags, now and as Obsidian draws and redraws them, and the
 * reading view's already drawn. Gives back what undoes it all. */
export function paintPage() {
  const seen = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('.multi-select-pill') && node.closest('.metadata-property')) paintPill(node);
        pillsIn(node).forEach(paintPill);
      }
      // A pill's text edited in place.
      const pill = r.target instanceof Element ? r.target.closest('.multi-select-pill') : r.target.parentElement?.closest('.multi-select-pill');
      if (pill?.closest('.metadata-property')) paintPill(pill);
    }
  });
  pillsIn(document).forEach(paintPill);
  paintLinks(document.body);
  seen.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => {
    seen.disconnect();
    document.querySelectorAll('[class*="mdom-tag-h"]').forEach(unpaint);
  };
}
