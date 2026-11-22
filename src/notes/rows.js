// The list on the notes page: rows on the page, one selected, the selection
// moved by keys. A heading is a row with no value: drawn, never selected.

/** What a row stands for: a note or a folder of the tree, a note the search
 * names, or a line found in one.
 * @typedef {{path: string, dir?: boolean, depth?: number, goto?: {line: number, ch: number}}} Value */
/** @typedef {{li: HTMLElement, value?: Value}} Row */

export class Rows {
  /** @param {HTMLElement} list */
  constructor(list) {
    this.list = list;
    /** @type {Row[]} */
    this.rows = [];
    this.sel = -1;
  }

  /** Puts `rows` on the page, the one at `sel` (or the nearest that can be)
   * selected. @param {Row[]} rows @param {number} sel */
  show(rows, sel) {
    this.rows = rows;
    this.list.replaceChildren(
      ...rows.map(({ li, value }, i) => {
        li.dataset.i = String(i);
        li.removeClass('is-selected');
        if (value) li.setAttribute('role', 'option');
        return li;
      }),
    );
    this.sel = -1;
    this.select(this.nearest(sel, 1));
  }

  /** The selected row's value. */
  get value() {
    return this.rows[this.sel]?.value;
  }

  /** The nearest row with a value, from `i` in direction `dir`, else the
   * other way. @param {number} i @param {number} dir */
  nearest(i, dir) {
    const n = this.rows.length;
    if (!n) return -1;
    i = Math.max(0, Math.min(n - 1, i));
    for (let j = i; j >= 0 && j < n; j += dir) if (this.rows[j].value) return j;
    for (let j = i; j >= 0 && j < n; j -= dir) if (this.rows[j].value) return j;
    return -1;
  }

  /** @param {number} i @param {{scroll?: boolean}} [opts] */
  select(i, { scroll = true } = {}) {
    const from = this.rows[this.sel]?.li;
    from?.removeClass('is-selected');
    from?.setAttribute('aria-selected', 'false');
    this.sel = i;
    const li = this.rows[i]?.li;
    if (!li) return;
    li.addClass('is-selected');
    li.setAttribute('aria-selected', 'true');
    if (scroll) li.scrollIntoView({ block: 'nearest' });
  }

  /** Selects the row of the note or folder at `path`. @param {string} path */
  selectPath(path) {
    const i = this.rows.findIndex((r) => r.value?.path === path && !r.value.goto);
    if (i >= 0) this.select(i);
  }

  /** Moves the selection `by` rows. The wheel scrolls the list as any page;
   * a step from a row scrolled out of sight starts from what is in sight, so
   * the list never jumps back. @param {number} by */
  move(by) {
    if (this.sel < 0) return;
    let from = this.sel;
    const box = this.list.getBoundingClientRect();
    /** @param {Row} r */
    const seen = (r) => {
      const b = r.li.getBoundingClientRect();
      return b.bottom > box.top && b.top < box.bottom;
    };
    if (Math.abs(by) === 1 && !seen(this.rows[from])) {
      const at = by > 0 ? this.rows.findIndex(seen) : this.rows.findLastIndex(seen);
      if (at >= 0) from = at - by;
    }
    this.select(this.nearest(from + by, by > 0 ? 1 : -1));
  }

  /** About a screenful of rows, for Page Up and Page Down. */
  get page() {
    const row = this.list.querySelector('li[role=option]');
    return Math.max(1, Math.floor(this.list.clientHeight / (row?.clientHeight || 40)) - 1);
  }
}
