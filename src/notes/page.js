// The notes: a page of their own over the note, the vault as a tree
// open along the note you are in, and the search always above it. Nothing is
// typed in the tree, so every key acts on the selected row, as in neo-tree
// (NOTES_KEYS, which the Keys page lists). The search finds notes by name at
// once, then the lines inside every note. Notes are added, renamed (a folder
// in the name moves them), copied, cut and pasted, and trashed, the trash
// asked in the row and never in a dialog. Escape stops what is under way,
// then goes back to the note exactly as it was: it was never closed.
//
// It is an Obsidian Modal drawn as a page (styles.css), because a modal
// leaves the note underneath untouched (caret, scroll, undo) where a view in
// the note's pane would replace it. Files change through Obsidian's own
// FileManager, so links follow a rename and the trash is the one set in
// Obsidian's settings.

import { MarkdownView, Modal, Platform, TFile, normalizePath } from 'obsidian';
import {
  HITS_A_NOTE,
  buildTree,
  copyPath,
  dirOf,
  editedLabel,
  foldersOf,
  groupHits,
  movePath,
  nameMarks,
  newNotePath,
  rankNames,
  renamePath,
  renameQuery,
  renamedPath,
  searchNotes,
  snippet,
} from './lib.js';

/** How long typing must pause before the notes' lines are read. */
const SEARCH_DELAY = 150;
const SEARCH_HINT = 'Search notes';

/** What the page remembers in each vault while Obsidian runs: the folders
 * open, and the note copied or cut. @type {Map<string, {expanded: Set<string>, clip: {path: string, cut: boolean} | null}>} */
const kept = new Map();

/** Forgets what the page remembered (the plugin unloading). */
export const forget = () => kept.clear();

/** The keys of the tree, which the Keys page lists from this same table:
 * `keys` as the event names them, `show` as drawn, `run` on the page.
 * @type {{keys: string[], show: string, what: string, run?: (p: NotesPage) => void}[]} */
export const NOTES_KEYS = [
  { keys: ['ArrowDown', 'j'], show: '↓  J', what: 'Down', run: (p) => p.move(1) },
  { keys: ['ArrowUp', 'k'], show: '↑  K', what: 'Up', run: (p) => p.move(-1) },
  { keys: ['g'], show: 'G', what: 'To the first row', run: (p) => p.select(p.selectable(0, 1)) },
  { keys: ['G'], show: 'Shift G', what: 'To the last row', run: (p) => p.select(p.selectable(p.rows.length - 1, -1)) },
  { keys: ['PageDown'], show: 'Page down', what: 'A screen down', run: (p) => p.move(p.pageRows()) },
  { keys: ['PageUp'], show: 'Page up', what: 'A screen up', run: (p) => p.move(-p.pageRows()) },
  { keys: ['Enter'], show: 'Enter', what: 'Open the note; open or close the folder', run: (p) => p.openSelected() },
  { keys: ['ArrowRight', 'l'], show: '→  L', what: 'Open the folder', run: (p) => p.expand() },
  { keys: ['ArrowLeft', 'h'], show: '←  H', what: 'Close the folder, or the one the note is in', run: (p) => p.collapse() },
  { keys: ['/'], show: '/', what: 'Search: notes by name, then inside them', run: (p) => p.startSearch() },
  { keys: ['a'], show: 'A', what: 'Add a note in the selected folder', run: (p) => p.add() },
  { keys: ['r', 'F2'], show: 'R', what: 'Rename; a folder in the name moves it', run: (p) => p.rename() },
  { keys: ['d', 'Delete'], show: 'D', what: 'Trash', run: (p) => p.askTrash() },
  { keys: ['y'], show: 'Y', what: 'Copy', run: (p) => p.clip(false) },
  { keys: ['x'], show: 'X', what: 'Cut', run: (p) => p.clip(true) },
  { keys: ['p'], show: 'P', what: 'Paste into the selected row’s folder', run: (p) => void p.paste() },
  { keys: ['?'], show: '?', what: 'These keys', run: (p) => p.showKeys() },
  { keys: ['Escape'], show: 'Escape', what: 'Back to the note' },
];

/** A row's value: a note or a folder of the tree, a note named by the
 * search, or a line found in one; a heading's path is ''.
 * @typedef {{path: string, dir?: boolean, depth?: number, goto?: {line: number, ch: number}}} Value */
/** @typedef {{value: Value, li: HTMLElement}} Row */

/** @param {unknown} err */
const message = (err) => (err instanceof Error ? err.message : String(err));

export class NotesPage extends Modal {
  /** @param {import('obsidian').App} app */
  constructor(app) {
    super(app);
    const vault = app.vault.getName();
    if (!kept.has(vault)) kept.set(vault, { expanded: new Set(), clip: null });
    this.memo = /** @type {{expanded: Set<string>, clip: {path: string, cut: boolean} | null}} */ (kept.get(vault));
    this.q = ''; // what is searched for; empty, the tree shows
    /** @type {{kind: 'add'} | {kind: 'rename', path: string, sel: number} | null} a name being typed */
    this.prompt = null;
    /** @type {{path: string, li: HTMLElement, kids: Node[]} | null} the row asking before its note is trashed */
    this.asking = null;
    this.keysShown = false;
    /** @type {Row[]} */
    this.rows = [];
    this.sel = -1;
    this.tok = 0;
    /** @type {number | undefined} */
    this.timer = undefined;
    /** @type {Promise<void> | null} the lines on their way */
    this.pending = null;
    this.closed = false;
    this.busy = false;
    this.current = app.workspace.getActiveFile()?.path ?? null;
    /** @type {ReturnType<typeof buildTree>} */
    this.tree = buildTree([], null);
    /** @type {import('obsidian').EventRef[]} */
    this.refs = [];
    /** @type {import('obsidian').EventRef | null} */
    this.fileRef = null;
    /** @type {HTMLInputElement} */ this.input = createEl('input');
    /** @type {HTMLElement} */ this.title = createDiv();
    /** @type {HTMLButtonElement} */ this.keysButton = createEl('button');
    /** @type {HTMLElement} */ this.info = createDiv();
    /** @type {HTMLOListElement} */ this.list = createEl('ol');
  }

  onOpen() {
    const page = this.modalEl;
    page.empty();
    page.removeClass('modal');
    page.addClass('mdom-notes');
    if (Platform.isMobile) page.addClass('is-touch');
    this.containerEl.addClass('mdom-notes-container');

    const head = page.createDiv('mdom-notes-head');
    this.input = head.createEl('input', {
      cls: 'mdom-notes-query',
      type: 'text',
      attr: { placeholder: SEARCH_HINT, 'aria-label': SEARCH_HINT, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go' },
    });
    this.title = head.createDiv({ cls: 'mdom-notes-title', text: 'Keys' });
    this.title.hide();
    this.keysButton = head.createEl('button', { cls: 'mdom-notes-word mdom-notes-keys-button', text: 'Keys', attr: { title: 'The keys (?)' } });
    this.keysButton.addEventListener('click', () => this.showKeys());
    const done = head.createEl('button', { cls: 'mdom-notes-word mdom-notes-done', text: 'Done' });
    done.addEventListener('click', () => (this.keysShown ? this.hideKeys() : this.close()));
    this.info = page.createDiv('mdom-notes-info');
    this.list = page.createEl('ol', { cls: 'mdom-notes-rows', attr: { role: 'listbox', 'aria-label': 'Notes', tabindex: '-1' } });

    this.input.addEventListener('input', () => {
      if (this.prompt) return;
      this.keep();
      this.q = this.input.value;
      this.render();
    });
    this.input.addEventListener('focus', () => this.keep());
    // A row's button never takes the focus from where it is.
    this.list.addEventListener('mousedown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) e.preventDefault();
    });
    this.list.addEventListener('click', (e) => this.click(e));

    // Escape is the Modal's (onEscapeKey); every other key comes here first.
    this.scope.register(null, null, (e) => (this.key(e) ? false : undefined));

    const reload = () => {
      if (!this.prompt && !this.asking && !this.busy) this.refresh();
    };
    const vault = this.app.vault;
    this.refs = [vault.on('create', reload), vault.on('delete', reload), vault.on('rename', reload)];
    // The note under the page changed (a trash went back to the one before).
    this.fileRef = this.app.workspace.on('file-open', (file) => {
      this.current = file?.path ?? null;
      reload();
    });

    this.build();
    this.render();
    // The list has the focus, not the search: no keyboard on a phone, and
    // every key is a row's.
    this.list.focus({ preventScroll: true });
  }

  /** Obsidian puts the focus in the first field once the page is open (the
   * search); here it goes to the list, where every key is a row's. */
  open() {
    super.open();
    this.list.focus({ preventScroll: true });
  }

  onClose() {
    this.closed = true;
    this.tok++;
    window.clearTimeout(this.timer);
    for (const ref of this.refs) this.app.vault.offref(ref);
    this.refs = [];
    if (this.fileRef) this.app.workspace.offref(this.fileRef);
  }

  /** Escape stops a question, a name, the keys, or the search, before it
   * leaves the page. The key is the page's either way: let through, it
   * would put the focus in the note underneath.
   * @param {KeyboardEvent} [e] */
  onEscapeKey(e) {
    e?.preventDefault();
    if (this.asking) this.keep();
    else if (this.prompt) this.endPrompt();
    else if (this.keysShown) this.hideKeys();
    else if (this.searching() || this.q) {
      this.clearSearch();
      this.render();
    } else this.close();
  }

  // ---- the rows -------------------------------------------------------------------

  /** The notes. */
  files() {
    return this.app.vault.getMarkdownFiles();
  }

  build() {
    this.tree = buildTree(
      this.files().map((f) => f.path),
      this.current,
    );
    for (const p of this.memo.expanded) this.tree.expanded.add(p);
    this.memo.expanded = this.tree.expanded;
  }

  /** The vault changed (here or elsewhere): the rows again, the selection
   * kept on the same note where it still is. */
  refresh() {
    if (this.closed || this.keysShown) return;
    const was = this.rows[this.sel]?.value.path;
    this.build();
    if (this.q.trim()) return this.render();
    this.render(this.sel);
    if (was) this.selectPath(was);
  }

  render(/** @type {number | null} */ sel = null) {
    if (this.keysShown) return;
    if (this.q.trim()) return this.renderSearch();
    window.clearTimeout(this.timer);
    this.tok++;
    this.pending = null;
    const mtimes = new Map(this.files().map((f) => [f.path, f.stat.mtime]));
    /** @type {Row[]} */
    const rows = this.tree.visible().map((n) => {
      if (n.dir) {
        const open = this.tree.expanded.has(n.path);
        const li = this.rowEl('mdom-notes-folder', n.depth);
        const label = li.createSpan('mdom-notes-label');
        label.createSpan({ cls: 'mdom-notes-arrow', text: open ? '↓' : '→' });
        label.appendText(n.name);
        li.setAttribute('aria-expanded', String(open));
        return { value: { path: n.path, dir: true, depth: n.depth }, li };
      }
      const li = this.noteRow(n.path, mtimes.get(n.path), n.depth, (label) => {
        label.createSpan({ cls: 'mdom-notes-arrow' });
        label.appendText(n.name.replace(/\.md$/, ''));
      });
      return { value: { path: n.path, depth: n.depth }, li };
    });
    // It opens on the note you are in.
    const here = rows.findIndex((r) => !r.value.dir && r.value.path === this.current);
    this.show(rows, [this.idleInfo() || (rows.length ? '' : 'No notes in this vault')], sel ?? Math.max(0, here));
  }

  /** One search. At once, the notes the query names, the best first; then,
   * under them, what holds it inside the notes, each note once with its
   * first lines found. A name no note has can be made. */
  renderSearch() {
    window.clearTimeout(this.timer);
    const tok = ++this.tok;
    const q = this.q.trim();
    const files = new Map(this.files().map((f) => [f.path, f]));
    /** @returns {Row[]} */
    const names = () =>
      rankNames(q, [...files.keys()]).map((m) => {
        const li = this.noteRow(m.path, files.get(m.path)?.stat.mtime, null, (label) => {
          const cut = m.path.lastIndexOf('/') + 1;
          if (cut) label.createSpan({ cls: 'mdom-notes-dir', text: m.path.slice(0, cut) });
          for (const part of nameMarks(m.path.slice(cut).replace(/\.md$/, ''), m.words)) {
            if (part.on) label.createEl('mark', { text: part.text });
            else label.appendText(part.text);
          }
        });
        return { value: { path: m.path }, li };
      });
    const named = names();
    const path = newNotePath(q);
    const make = path && !files.has(path) ? path : null;
    const wait = q.length >= 2;
    this.show(named, [make ? this.createButton(make) : null, named.length ? '' : wait ? 'Searching…' : 'No note is named so'], 0);
    this.pending = null;
    if (!wait) return;

    this.pending = new Promise((done) => {
      this.timer = window.setTimeout(async () => {
        const res = await searchNotes(
          [...files.keys()],
          async (p) => {
            const f = this.app.vault.getAbstractFileByPath(p);
            if (!(f instanceof TFile)) throw new Error('gone');
            return this.app.vault.cachedRead(f);
          },
          q,
          { cancelled: () => tok !== this.tok || this.closed },
        ).catch(() => ({ hits: [], more: false })); // the names stand
        done();
        if (!res || tok !== this.tok || this.closed) return;
        /** @type {Row[]} */
        const rows = [];
        for (const g of groupHits(res.hits)) {
          const more = g.hits.length > HITS_A_NOTE ? ` · ${g.hits.length}${res.more ? '+' : ''} lines, the first ${HITS_A_NOTE}` : '';
          rows.push({ value: { path: '' }, li: createEl('li', { cls: 'mdom-notes-heading', text: `${g.path.replace(/\.md$/, '')}${more}` }) });
          for (const h of g.hits.slice(0, HITS_A_NOTE)) {
            const cut = snippet(h.text, h.col, q.length);
            const li = this.rowEl('mdom-notes-hit', null);
            const line = li.createSpan('mdom-notes-snippet');
            line.appendText(cut.pre);
            line.createEl('mark', { text: cut.hit });
            line.appendText(cut.post);
            rows.push({ value: { path: h.path, goto: { line: h.line - 1, ch: h.col } }, li });
          }
        }
        const named = names();
        const none = named.length || rows.length ? '' : make ? 'Nothing found: Enter creates it' : 'Nothing found';
        // The selection stays where it was moved to while the lines were read.
        this.show([...named, ...rows], [make ? this.createButton(make) : null, none], Math.max(0, this.sel));
      }, SEARCH_DELAY);
    });
  }

  /** @param {string} cls @param {number | null} depth */
  rowEl(cls, depth) {
    const li = createEl('li', { cls: `mdom-notes-row ${cls}` });
    if (depth) li.addClass(`mdom-notes-d${Math.min(depth, 8)}`);
    return li;
  }

  /** A note's row: the dot on the one you are in, one cut drawn faint, when
   * it was last edited at the end, and under a finger a × to trash it.
   * @param {string} path @param {number | undefined} mtime @param {number | null} depth
   * @param {(label: HTMLElement) => void} fill */
  noteRow(path, mtime, depth, fill) {
    const li = this.rowEl('mdom-notes-note', depth);
    if (path === this.current) li.addClass('is-here');
    const clip = this.memo.clip;
    if (clip?.cut && clip.path === path) li.addClass('is-cut');
    fill(li.createSpan('mdom-notes-label'));
    if (mtime) li.createSpan({ cls: 'mdom-notes-when', text: editedLabel(mtime) });
    if (Platform.isMobile) li.createEl('button', { cls: 'mdom-notes-remove', text: '×', attr: { 'aria-label': `Move ${path} to the trash` } });
    return li;
  }

  /** @param {string} path */
  createButton(path) {
    const b = createEl('button', { cls: 'mdom-notes-word mdom-notes-create', text: `Create ${path.replace(/\.md$/, '')}` });
    b.addEventListener('click', () => void this.create(this.q));
    return b;
  }

  /** Puts rows on the page, and the line under the search.
   * @param {Row[]} rows @param {(string | HTMLElement | null)[]} info @param {number} sel */
  show(rows, info, sel) {
    this.asking = null;
    this.rows = rows;
    this.list.replaceChildren(
      ...rows.map(({ li }, i) => {
        li.dataset.i = String(i);
        if (!li.hasClass('mdom-notes-heading')) li.setAttribute('role', 'option');
        return li;
      }),
    );
    this.setInfo(...info);
    this.sel = -1;
    this.select(this.selectable(sel, 1));
  }

  /** @param {(string | HTMLElement | null)[]} parts */
  setInfo(...parts) {
    this.info.empty();
    for (const p of parts) {
      if (!p) continue;
      if (typeof p === 'string') this.info.createSpan({ text: p });
      else this.info.appendChild(p);
    }
  }

  /** What the line under the search says while nothing else does. */
  idleInfo() {
    const clip = this.memo.clip;
    return clip ? `${clip.cut ? 'Cut' : 'Copied'} ${clip.path.replace(/\.md$/, '')} · P pastes it into the selected row’s folder` : '';
  }

  // ---- moving -------------------------------------------------------------------

  /** The nearest row that can be chosen, from `i` in direction `dir`.
   * @param {number} i @param {number} dir */
  selectable(i, dir) {
    const n = this.rows.length;
    if (!n) return -1;
    i = Math.max(0, Math.min(n - 1, i));
    const ok = (/** @type {number} */ j) => !this.rows[j].li.hasClass('mdom-notes-heading');
    for (let j = i; j >= 0 && j < n; j += dir) if (ok(j)) return j;
    for (let j = i; j >= 0 && j < n; j -= dir) if (ok(j)) return j;
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

  /** @param {string} path */
  selectPath(path) {
    const i = this.rows.findIndex((r) => r.value.path === path && !r.value.goto);
    if (i >= 0) this.select(i);
    return i >= 0;
  }

  /** The wheel scrolls the list as any page; a step from a row scrolled out
   * of sight starts from what is in sight, so the list never jumps back.
   * @param {number} by */
  move(by) {
    if (this.sel < 0) return;
    let from = this.sel;
    const box = this.list.getBoundingClientRect();
    const seen = (/** @type {Row} */ r) => {
      const b = r.li.getBoundingClientRect();
      return b.bottom > box.top && b.top < box.bottom;
    };
    if (Math.abs(by) === 1 && this.rows[from] && !seen(this.rows[from])) {
      let at = -1;
      if (by > 0) at = this.rows.findIndex(seen);
      else for (let n = this.rows.length - 1; n >= 0 && at < 0; n--) if (seen(this.rows[n])) at = n;
      if (at >= 0) from = at - by;
    }
    this.select(this.selectable(from + by, by > 0 ? 1 : -1));
  }

  /** About a screenful of rows, for Page Up and Page Down. */
  pageRows() {
    const row = this.list.querySelector('li.mdom-notes-row');
    return Math.max(1, Math.floor(this.list.clientHeight / (row?.clientHeight || 40)) - 1);
  }

  /** Right, or L: a closed folder opens; an open one is stepped into. */
  expand() {
    const v = this.rows[this.sel]?.value;
    if (!v?.dir) return;
    if (this.tree.expanded.has(v.path)) this.move(1);
    else this.openSelected();
  }

  /** Left, or H: an open folder closes; anything else closes the folder it
   * is in, and the selection goes to that folder. */
  collapse() {
    const v = this.rows[this.sel]?.value;
    if (!v || v.depth == null) return; // a search's row
    if (v.dir && this.tree.expanded.has(v.path)) return this.openSelected();
    const up = dirOf(v.path);
    if (!up) return;
    this.tree.expanded.delete(up);
    this.render();
    this.selectPath(up);
  }

  // ---- keys ---------------------------------------------------------------------

  /** Typing in the search (and not a name for a new or renamed note). */
  searching() {
    return !this.prompt && document.activeElement === this.input;
  }

  /** Every key but Escape, before Obsidian's own. True when it was the page's.
   * @param {KeyboardEvent} e */
  key(e) {
    if (e.isComposing) return false;
    const mod = Platform.isMacOS ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (this.keysShown) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') this.move(e.key === 'ArrowDown' ? 1 : -1);
      else return false;
      return true;
    }
    if (this.prompt) {
      if (e.key !== 'Enter') return false;
      void this.finishPrompt();
      return true;
    }
    if (this.asking) {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return false;
      // Y, D or Enter trashes it; any other key, and it stays.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && ['y', 'd', 'Delete', 'Enter'].includes(e.key)) void this.trash();
      else this.keep();
      return true;
    }
    if (e.key === 'Enter' && mod) {
      void this.accept(true);
      return true;
    }
    // With a modifier, a key is Obsidian's (or the search box's).
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (this.searching()) {
      const plain = !e.shiftKey;
      if (plain && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) this.move(e.key === 'ArrowDown' ? 1 : -1);
      else if (plain && e.key === 'PageDown') this.move(this.pageRows());
      else if (plain && e.key === 'PageUp') this.move(-this.pageRows());
      else if (e.key === 'Enter') void this.accept(false);
      else return false;
      return true;
    }
    // A key typed into some other field is its own.
    const t = /** @type {HTMLElement | null} */ (e.target);
    if (t && t !== this.list && t.closest('input, textarea, [contenteditable]')) return false;
    const k = NOTES_KEYS.find((k) => k.run && k.keys.includes(e.key));
    if (!k?.run) return false;
    if (e.key === 'Enter' && this.q.trim()) void this.accept(false);
    else k.run(this);
    return true;
  }

  /** A click or a tap: a row's own buttons, else the row opens.
   * @param {MouseEvent} e */
  click(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const li = /** @type {HTMLElement | null} */ (target.closest('li[data-i]'));
    if (!li || li.hasClass('mdom-notes-heading')) return;
    if (this.asking) {
      if (li === this.asking.li) {
        if (target.closest('.mdom-notes-yes')) void this.trash();
        else if (target.closest('.mdom-notes-no')) this.keep();
        return;
      }
      this.keep();
    }
    if (this.keysShown) return;
    this.select(Number(li.dataset.i), { scroll: false });
    if (target.closest('.mdom-notes-remove')) this.askTrash();
    else this.openSelected();
  }

  // ---- the search ---------------------------------------------------------------

  startSearch() {
    this.keep();
    this.input.focus();
    this.input.select();
  }

  clearSearch() {
    this.input.value = this.q = '';
    this.input.placeholder = SEARCH_HINT;
    this.list.focus({ preventScroll: true });
  }

  /** Enter. In the search, on a name nothing was found for, it makes the
   * note; Mod+Enter makes it whatever was found. Straight after typing, it
   * waits for what was typed. @param {boolean} create */
  async accept(create) {
    const q = this.q.trim();
    await this.pending;
    if (this.closed) return;
    const chosen = this.rows.some((r) => !r.li.hasClass('mdom-notes-heading'));
    if (q && (create || !chosen) && newNotePath(q)) return this.create(q);
    this.openSelected();
  }

  /** Enter on a row: a note opens, a folder opens or closes. */
  openSelected() {
    const v = this.rows[this.sel]?.value;
    if (!v || !v.path) return;
    if (!v.dir) return void this.openPath(v.path, v.goto ?? null);
    this.tree.toggle(v.path);
    this.render(this.sel);
  }

  /** Opens a note in the pane in front, at a line if given, and leaves.
   * @param {string} path @param {{line: number, ch: number} | null} at */
  async openPath(path, at) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    this.close();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
    if (at && leaf.view instanceof MarkdownView) {
      const editor = leaf.view.editor;
      editor.setCursor(at);
      editor.scrollIntoView({ from: at, to: at }, true);
      editor.focus();
    }
  }

  // ---- the vault ----------------------------------------------------------------

  /** The folder `path` is to be in, made if it is not there.
   * @param {string} path */
  async ensureFolder(path) {
    const dir = dirOf(path);
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
  }

  /** Makes the note a name names, its folders too, and opens it; one that is
   * there already just opens. @param {string} q */
  async create(q) {
    const want = newNotePath(q);
    if (!want) return;
    const path = normalizePath(want);
    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) return this.openPath(path, null);
    this.busy = true;
    try {
      await this.ensureFolder(path);
      await this.app.vault.create(path, '');
    } catch (err) {
      return this.setInfo(message(err));
    } finally {
      this.busy = false;
    }
    return this.openPath(path, null);
  }

  /** Renames or moves a note through Obsidian, so its links follow.
   * @param {string} from @param {string} to */
  async renameFile(from, to) {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!(file instanceof TFile)) throw new Error(`${from.replace(/\.md$/, '')} is gone`);
    if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`${to.replace(/\.md$/, '')} is taken`);
    this.busy = true;
    try {
      await this.ensureFolder(to);
      await this.app.fileManager.renameFile(file, normalizePath(to));
    } finally {
      this.busy = false;
    }
    if (this.current) this.current = renamedPath(this.current, from, to);
    if (this.memo.clip) this.memo.clip.path = renamedPath(this.memo.clip.path, from, to);
  }

  /** The list again after a note was made, moved or trashed, the selection
   * on `select` (its folders opened) or else at `sel`.
   * @param {string | null} select @param {number} [sel] */
  reload(select, sel = this.sel) {
    if (select) for (const f of foldersOf(select)) this.memo.expanded.add(f);
    this.build();
    this.render(sel);
    if (select) this.selectPath(select);
  }

  /** The folder a new or pasted note goes into: the selected folder, or the
   * selected note's. */
  folder() {
    const v = this.rows[this.sel]?.value;
    return !v?.path ? '' : v.dir ? v.path : dirOf(v.path);
  }

  /** The selected note; on a folder, the line says it can't.
   * @param {string} verb */
  note(verb) {
    const v = this.rows[this.sel]?.value;
    if (v?.path && !v.dir) return v.path;
    if (v?.dir) this.setInfo(`Only a note can be ${verb}, not a folder`);
    return null;
  }

  /** The search line, borrowed for a name. @param {string} value @param {string} placeholder */
  showPrompt(value, placeholder) {
    this.q = '';
    this.input.placeholder = placeholder;
    this.input.value = value;
    this.input.focus();
  }

  add() {
    const folder = this.folder();
    this.prompt = { kind: 'add' };
    this.showPrompt(folder ? `${folder}/` : '', 'A new note’s name');
    this.setInfo(`New note in ${folder || 'the top of the vault'}: Enter makes it, Escape stops`);
  }

  rename() {
    const path = this.note('renamed');
    if (!path) return;
    this.prompt = { kind: 'rename', path, sel: this.sel };
    const name = renameQuery(path);
    this.showPrompt(name, '');
    // The name selected, as a file manager does: typing keeps the folder.
    this.input.setSelectionRange(name.lastIndexOf('/') + 1, name.length);
    this.setInfo(`Rename ${name}: Enter renames, Escape stops`);
  }

  endPrompt() {
    const sel = this.prompt?.kind === 'rename' ? this.prompt.sel : this.sel;
    this.prompt = null;
    this.clearSearch();
    this.render(sel);
  }

  async finishPrompt() {
    const p = this.prompt;
    if (!p) return;
    const typed = this.input.value;
    if (p.kind === 'add') {
      if (!newNotePath(typed) || typed.trim().endsWith('/')) return this.setInfo('That can’t be a note’s name');
      return this.create(typed);
    }
    const to = renamePath(p.path, typed);
    if (!to) return this.setInfo('That can’t be a note’s name');
    if (to === p.path) return this.endPrompt();
    try {
      await this.renameFile(p.path, to);
    } catch (err) {
      return this.setInfo(message(err));
    }
    this.prompt = null;
    this.clearSearch();
    this.reload(to, p.sel);
  }

  /** Y or X: the note waits to be pasted. @param {boolean} cut */
  clip(cut) {
    const path = this.note(cut ? 'cut' : 'copied');
    if (!path) return;
    this.memo.clip = { path, cut };
    this.render(this.sel);
  }

  /** P: the note cut moves into the selected row's folder (a rename, so its
   * links follow); the note copied is made again there, under a free name. */
  async paste() {
    const clip = this.memo.clip;
    if (!clip) return this.setInfo('Nothing copied: Y copies the selected note, X cuts it');
    const folder = this.folder();
    const file = this.app.vault.getAbstractFileByPath(clip.path);
    if (!(file instanceof TFile)) {
      this.memo.clip = null;
      return this.setInfo(`${clip.path.replace(/\.md$/, '')} is gone`);
    }
    try {
      let to;
      if (clip.cut) {
        to = movePath(clip.path, folder);
        if (!to) {
          this.memo.clip = null; // it is there already
          return this.render(this.sel);
        }
        await this.renameFile(clip.path, to);
        this.memo.clip = null;
      } else {
        to = copyPath(clip.path, folder, new Set(this.app.vault.getAllLoadedFiles().map((f) => f.path)));
        this.busy = true;
        try {
          await this.app.vault.copy(file, to);
        } finally {
          this.busy = false;
        }
      }
      this.reload(to);
    } catch (err) {
      this.setInfo(/taken/.test(message(err)) ? 'A note of that name is already there' : message(err));
    }
  }

  /** The row asks first, in place and never in a dialog. */
  askTrash() {
    this.keep();
    const path = this.note('trashed');
    if (!path) return;
    const li = this.rows[this.sel].li;
    this.asking = { path, li, kids: Array.from(li.childNodes) };
    li.addClass('is-asking');
    const label = createSpan({ cls: 'mdom-notes-label', text: `Trash ${path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')}?` });
    const yes = createEl('button', { cls: 'mdom-notes-yes', text: 'Trash', attr: { title: 'Move to the trash (Y, D or Enter)' } });
    const no = createEl('button', { cls: 'mdom-notes-no', text: 'Keep', attr: { title: 'Keep it (any other key)' } });
    li.replaceChildren(label, yes, no);
  }

  /** The question answered no: the row as it was. */
  keep() {
    const a = this.asking;
    if (!a) return;
    this.asking = null;
    a.li.removeClass('is-asking');
    a.li.replaceChildren(...a.kids);
  }

  /** Into the trash Obsidian is set to use. If it was the note you were in,
   * Obsidian goes back to the one before it, under the page, and the dot
   * follows (onOpen's file-open). */
  async trash() {
    const a = this.asking;
    if (!a) return;
    const sel = this.sel;
    const file = this.app.vault.getAbstractFileByPath(a.path);
    this.busy = true;
    try {
      if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    } catch (err) {
      this.keep();
      return this.setInfo(message(err));
    } finally {
      this.busy = false;
    }
    this.asking = null;
    if (this.memo.clip?.path === a.path) this.memo.clip = null;
    this.reload(null, sel);
  }

  // ---- the keys -----------------------------------------------------------------

  /** ? or Keys: every key of the tree, from the table its handler uses. */
  showKeys() {
    this.keep();
    this.keysShown = true;
    this.input.hide();
    this.keysButton.hide();
    this.title.show();
    this.rows = NOTES_KEYS.map((k) => {
      const li = this.rowEl('mdom-notes-command', null);
      li.createSpan({ cls: 'mdom-notes-label', text: k.what });
      li.createSpan({ cls: 'mdom-notes-keys', text: k.show });
      return { value: { path: '' }, li };
    });
    this.list.replaceChildren(
      ...this.rows.map((r, i) => {
        r.li.dataset.i = String(i);
        return r.li;
      }),
    );
    this.setInfo('In the notes. Escape goes back to them');
    this.sel = -1;
    this.select(0);
    this.list.focus({ preventScroll: true });
  }

  hideKeys() {
    this.keysShown = false;
    this.title.hide();
    this.input.show();
    this.keysButton.show();
    this.build();
    this.render();
    this.list.focus({ preventScroll: true });
  }
}
