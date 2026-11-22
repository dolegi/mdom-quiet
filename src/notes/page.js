// The notes: a page of their own over the note, the vault as a tree open
// along the note you are in, and the search always above it. Nothing is
// typed in the tree, so every key acts on the selected row (KEYS, which the
// Keys page lists). The search finds notes by name at once, then the lines
// inside every note. Notes are added, renamed (a folder in the name moves
// them), copied, cut and pasted, and trashed, the trash asked in the row and
// never in a dialog. Escape stops what is under way, then goes back to the
// note exactly as it was: it was never closed.
//
// It is an Obsidian Modal drawn as a page (styles.css), because a modal
// leaves the note underneath untouched (caret, scroll, undo) where a view in
// the note's pane would replace it. Files change through Obsidian's own
// FileManager, so links follow a rename and the trash is the one set in
// Obsidian's settings.

import { Component, MarkdownView, Modal, Platform, TFile, normalizePath } from 'obsidian';
import { Rows } from './rows.js';
import { HITS_A_NOTE, groupHits, nameMarks, rankNames, searchNotes, snippet } from './search.js';
import { bare, buildTree, copyPath, dirOf, editedLabel, foldersOf, movePath, notePath } from './tree.js';

/** @typedef {import('./rows.js').Row} Row */

/** What the page remembers while Obsidian runs (the plugin keeps it): the
 * folders open, and the note copied or cut.
 * @typedef {{expanded: Set<string>, clip: {path: string, cut: boolean} | null}} Memory */

/** How long typing must pause before the notes' lines are read. */
const SEARCH_DELAY = 150;
const SEARCH_HINT = 'Search notes';

/** The keys of the tree, which the Keys page lists from this same table:
 * `keys` as the event names them, `show` as drawn, `run` on the page.
 * @type {{keys: string[], show: string, what: string, run?: (p: NotesPage) => void}[]} */
const KEYS = [
  { keys: ['ArrowDown', 'j'], show: '↓  J', what: 'Down', run: (p) => p.rows.move(1) },
  { keys: ['ArrowUp', 'k'], show: '↑  K', what: 'Up', run: (p) => p.rows.move(-1) },
  { keys: ['g'], show: 'G', what: 'To the first row', run: (p) => p.rows.select(p.rows.nearest(0, 1)) },
  { keys: ['G'], show: 'Shift G', what: 'To the last row', run: (p) => p.rows.select(p.rows.nearest(Infinity, -1)) },
  { keys: ['PageDown'], show: 'Page down', what: 'A screen down', run: (p) => p.rows.move(p.rows.page) },
  { keys: ['PageUp'], show: 'Page up', what: 'A screen up', run: (p) => p.rows.move(-p.rows.page) },
  { keys: ['Enter'], show: 'Enter', what: 'Open the note; open or close the folder', run: (p) => void p.accept(false) },
  { keys: ['ArrowRight', 'l'], show: '→  L', what: 'Open the folder', run: (p) => p.expand() },
  { keys: ['ArrowLeft', 'h'], show: '←  H', what: 'Close the folder, or the one the note is in', run: (p) => p.collapse() },
  { keys: ['/'], show: '/', what: 'Search: notes by name, then inside them', run: (p) => p.startSearch() },
  { keys: ['a'], show: 'A', what: 'Add a note in the selected folder', run: (p) => p.add() },
  { keys: ['r', 'F2'], show: 'R', what: 'Rename; a folder in the name moves it', run: (p) => p.rename() },
  { keys: ['d', 'Delete'], show: 'D', what: 'Trash', run: (p) => p.askTrash() },
  { keys: ['y'], show: 'Y', what: 'Copy', run: (p) => p.clip(false) },
  { keys: ['x'], show: 'X', what: 'Cut', run: (p) => p.clip(true) },
  { keys: ['p'], show: 'P', what: 'Paste into the selected row’s folder', run: (p) => void p.paste() },
  { keys: ['?'], show: '?', what: 'These keys', run: (p) => p.showKeys(true) },
  { keys: ['Escape'], show: 'Escape', what: 'Back to the note' },
];

/** @param {unknown} err */
const message = (err) => (err instanceof Error ? err.message : String(err));

export class NotesPage extends Modal {
  /** @param {import('obsidian').App} app @param {Memory} memory */
  constructor(app, memory) {
    super(app);
    this.memory = memory;
    this.q = ''; // what is searched for; empty, the tree shows
    /** @type {{kind: 'add'} | {kind: 'rename', path: string, sel: number} | null} a name being typed */
    this.prompt = null;
    /** @type {{path: string, li: HTMLElement, kids: Node[]} | null} the row asking before its note is trashed */
    this.asking = null;
    this.keysShown = false;
    this.closed = false;
    this.tok = 0; // the render the search's lines are for
    /** @type {number | undefined} */
    this.timer = undefined;
    /** @type {Promise<void> | null} the lines on their way */
    this.pending = null;
    this.current = app.workspace.getActiveFile()?.path ?? null;
    this.tree = buildTree([], null);
    this.events = new Component();
    /** @type {HTMLInputElement} */ this.input = createEl('input');
    /** @type {HTMLElement} */ this.info = createDiv();
    this.rows = new Rows(createEl('ol'));
  }

  onOpen() {
    const page = this.modalEl;
    page.empty();
    page.removeClass('modal');
    page.addClass('mdom-notes');
    page.toggleClass('is-touch', Platform.isMobile);
    this.containerEl.addClass('mdom-notes-container');

    const head = page.createDiv('mdom-notes-head');
    this.input = head.createEl('input', {
      cls: 'mdom-notes-query',
      type: 'text',
      attr: { placeholder: SEARCH_HINT, 'aria-label': SEARCH_HINT, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go' },
    });
    head.createDiv({ cls: 'mdom-notes-title', text: 'Keys' });
    head.createEl('button', { cls: 'mdom-notes-word mdom-notes-keys-button', text: 'Keys', attr: { title: 'The keys (?)' } }).addEventListener('click', () => this.showKeys(true));
    head.createEl('button', { cls: 'mdom-notes-word mdom-notes-done', text: 'Done' }).addEventListener('click', () => (this.keysShown ? this.showKeys(false) : this.close()));
    this.info = page.createDiv('mdom-notes-info');
    const list = page.createEl('ol', { cls: 'mdom-notes-rows', attr: { role: 'listbox', 'aria-label': 'Notes', tabindex: '-1' } });
    this.rows = new Rows(list);

    this.input.addEventListener('input', () => {
      if (this.prompt) return;
      this.keep();
      this.q = this.input.value;
      this.render();
    });
    this.input.addEventListener('focus', () => this.keep());
    // A row's button never takes the focus from where it is.
    list.addEventListener('mousedown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) e.preventDefault();
    });
    list.addEventListener('click', (e) => this.click(e));
    // Escape is the Modal's (onEscapeKey); every other key comes here first.
    this.scope.register(null, null, (e) => (this.key(e) ? false : undefined));

    // The vault changed, here or elsewhere, or the note under the page did (a
    // trash went back to the one before): the rows again, unless a name or a
    // question is under way.
    const refresh = () => {
      if (!this.prompt && !this.asking && !this.keysShown) this.reload(this.rows.value?.path ?? null);
    };
    const { vault, workspace } = this.app;
    this.events.load();
    this.events.registerEvent(vault.on('create', refresh));
    this.events.registerEvent(vault.on('delete', refresh));
    this.events.registerEvent(vault.on('rename', refresh));
    this.events.registerEvent(
      workspace.on('file-open', (file) => {
        this.current = file?.path ?? null;
        refresh();
      }),
    );

    this.reload(null, null);
  }

  /** Obsidian puts the focus in the first field once the page is open (the
   * search); here it goes to the list, where every key is a row's. */
  open() {
    super.open();
    this.rows.list.focus({ preventScroll: true });
  }

  onClose() {
    this.closed = true;
    this.tok++;
    window.clearTimeout(this.timer);
    this.events.unload();
  }

  /** Escape stops a question, a name, the keys, or the search, before it
   * leaves the page. The key is the page's either way: let through, it would
   * put the focus in the note underneath.
   * @param {KeyboardEvent} [e] */
  onEscapeKey(e) {
    e?.preventDefault();
    if (this.asking) this.keep();
    else if (this.prompt) this.endPrompt();
    else if (this.keysShown) this.showKeys(false);
    else if (this.searching() || this.q) this.clearSearch();
    else this.close();
  }

  // ---- drawing --------------------------------------------------------------------

  /** The tree again (and the rows), the selection on `select` if it is there,
   * with its folders opened, else at `sel` (null: the note you are in).
   * @param {string | null} select @param {number | null} [sel] */
  reload(select, sel = this.rows.sel) {
    if (select) for (const f of foldersOf(select)) this.memory.expanded.add(f);
    this.tree = buildTree(
      this.app.vault.getMarkdownFiles().map((f) => f.path),
      this.current,
    );
    for (const p of this.memory.expanded) this.tree.expanded.add(p);
    this.memory.expanded = this.tree.expanded;
    this.render(sel);
    if (select && !this.q.trim()) this.rows.selectPath(select);
  }

  /** The tree, or the search's rows when something is searched for.
   * @param {number | null} [sel] */
  render(sel = null) {
    window.clearTimeout(this.timer);
    this.tok++;
    this.pending = null;
    if (this.q.trim()) return this.renderSearch();
    const mtimes = new Map(this.app.vault.getMarkdownFiles().map((f) => [f.path, f.stat.mtime]));
    /** @type {Row[]} */
    const rows = this.tree.visible().map((n) => {
      if (!n.dir) {
        const li = this.noteRow(n.path, mtimes.get(n.path), n.depth, (label) => {
          label.createSpan({ cls: 'mdom-notes-arrow' });
          label.appendText(bare(n.name));
        });
        return { li, value: { path: n.path, depth: n.depth } };
      }
      const open = this.tree.expanded.has(n.path);
      const li = this.rowEl('mdom-notes-folder', n.depth);
      const label = li.createSpan('mdom-notes-label');
      label.createSpan({ cls: 'mdom-notes-arrow', text: open ? '↓' : '→' });
      label.appendText(n.name);
      li.setAttribute('aria-expanded', String(open));
      return { li, value: { path: n.path, dir: true, depth: n.depth } };
    });
    // It opens on the note you are in.
    const here = rows.findIndex((r) => !r.value?.dir && r.value?.path === this.current);
    const clip = this.memory.clip;
    const idle = clip ? `${clip.cut ? 'Cut' : 'Copied'} ${bare(clip.path)} · P pastes it into the selected row’s folder` : '';
    this.show(rows, [idle || (rows.length ? '' : 'No notes in this vault')], sel ?? Math.max(0, here));
  }

  /** One search. At once, the notes the query names, the best first; then,
   * under them, what holds it inside the notes, each note once with its
   * first lines found. A name no note has can be made. */
  renderSearch() {
    const tok = this.tok;
    const q = this.q.trim();
    const files = new Map(this.app.vault.getMarkdownFiles().map((f) => [f.path, f]));
    /** @type {Row[]} */
    const named = rankNames(q, [...files.keys()]).map((m) => {
      const li = this.noteRow(m.path, files.get(m.path)?.stat.mtime, null, (label) => {
        const cut = m.path.lastIndexOf('/') + 1;
        if (cut) label.createSpan({ cls: 'mdom-notes-dir', text: m.path.slice(0, cut) });
        for (const part of nameMarks(bare(m.path.slice(cut)), m.words)) {
          if (part.on) label.createEl('mark', { text: part.text });
          else label.appendText(part.text);
        }
      });
      return { li, value: { path: m.path } };
    });
    const path = notePath(q);
    const make = path && !files.has(path) ? this.createButton(path) : null;
    const wait = q.length >= 2;
    this.show(named, [make, named.length ? '' : wait ? 'Searching…' : 'No note is named so'], 0);
    if (!wait) return;

    this.pending = new Promise((done) => {
      this.timer = window.setTimeout(async () => {
        const res = await searchNotes(
          [...files.keys()],
          (p) => {
            const f = this.app.vault.getAbstractFileByPath(p);
            return f instanceof TFile ? this.app.vault.cachedRead(f) : Promise.reject(new Error('gone'));
          },
          q,
          { cancelled: () => tok !== this.tok },
        ).catch(() => ({ hits: [], more: false })); // the names stand
        done();
        if (!res || tok !== this.tok) return;
        /** @type {Row[]} */
        const lines = [];
        for (const g of groupHits(res.hits)) {
          const more = g.hits.length > HITS_A_NOTE ? ` · ${g.hits.length}${res.more ? '+' : ''} lines, the first ${HITS_A_NOTE}` : '';
          lines.push({ li: createEl('li', { cls: 'mdom-notes-heading', text: `${bare(g.path)}${more}` }) });
          for (const h of g.hits.slice(0, HITS_A_NOTE)) {
            const cut = snippet(h.text, h.col, q.length);
            const li = this.rowEl('mdom-notes-hit', null);
            const line = li.createSpan('mdom-notes-snippet');
            line.appendText(cut.pre);
            line.createEl('mark', { text: cut.hit });
            line.appendText(cut.post);
            lines.push({ li, value: { path: h.path, goto: { line: h.line - 1, ch: h.col } } });
          }
        }
        const none = named.length || lines.length ? '' : make ? 'Nothing found: Enter creates it' : 'Nothing found';
        // The selection stays where it was moved to while the lines were read.
        this.show([...named, ...lines], [make, none], Math.max(0, this.rows.sel));
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
    li.toggleClass('is-here', path === this.current);
    li.toggleClass('is-cut', !!this.memory.clip?.cut && this.memory.clip.path === path);
    fill(li.createSpan('mdom-notes-label'));
    if (mtime) li.createSpan({ cls: 'mdom-notes-when', text: editedLabel(mtime) });
    if (Platform.isMobile) li.createEl('button', { cls: 'mdom-notes-remove', text: '×', attr: { 'aria-label': `Move ${path} to the trash` } });
    return li;
  }

  /** @param {string} path */
  createButton(path) {
    const b = createEl('button', { cls: 'mdom-notes-word mdom-notes-create', text: `Create ${bare(path)}` });
    b.addEventListener('click', () => void this.create(this.q));
    return b;
  }

  /** Rows on the page, and the line under the search.
   * @param {Row[]} rows @param {(string | HTMLElement | null)[]} info @param {number} sel */
  show(rows, info, sel) {
    this.asking = null;
    this.rows.show(rows, sel);
    this.say(...info);
  }

  /** The line under the search. @param {(string | HTMLElement | null)[]} parts */
  say(...parts) {
    this.info.empty();
    for (const p of parts) {
      if (typeof p === 'string') this.info.createSpan({ text: p });
      else if (p) this.info.appendChild(p);
    }
  }

  // ---- keys and clicks ------------------------------------------------------------

  /** Typing in the search (and not a name for a new or renamed note). */
  searching() {
    return !this.prompt && document.activeElement === this.input;
  }

  /** Every key but Escape, before Obsidian's own. True when it was the page's.
   * @param {KeyboardEvent} e */
  key(e) {
    if (e.isComposing) return false;
    const arrow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (this.keysShown) {
      if (arrow) this.rows.move(arrow);
      return !!arrow;
    }
    if (this.prompt) {
      if (e.key === 'Enter') void this.finishPrompt();
      return e.key === 'Enter';
    }
    if (this.asking) {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return false;
      // Y, D or Enter trashes it; any other key, and it stays.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && ['y', 'd', 'Delete', 'Enter'].includes(e.key)) void this.trash();
      else this.keep();
      return true;
    }
    const mod = Platform.isMacOS ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (e.key === 'Enter' && mod) {
      void this.accept(true);
      return true;
    }
    // With a modifier, a key is Obsidian's (or the search box's).
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (this.searching()) {
      const page = e.key === 'PageDown' ? this.rows.page : e.key === 'PageUp' ? -this.rows.page : 0;
      if (e.shiftKey && e.key !== 'Enter') return false;
      if (arrow || page) this.rows.move(arrow || page);
      else if (e.key === 'Enter') void this.accept(false);
      else return false;
      return true;
    }
    const k = KEYS.find((k) => k.run && k.keys.includes(e.key));
    k?.run?.(this);
    return !!k?.run;
  }

  /** A click or a tap: a row's own buttons, else the row opens.
   * @param {MouseEvent} e */
  click(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const li = /** @type {HTMLElement | null} */ (target.closest('li[role=option]'));
    if (!li) return;
    if (this.asking) {
      if (li === this.asking.li) {
        if (target.closest('.mdom-notes-yes')) void this.trash();
        else if (target.closest('.mdom-notes-no')) this.keep();
        return;
      }
      this.keep();
    }
    if (this.keysShown) return;
    this.rows.select(Number(li.dataset.i), { scroll: false });
    if (target.closest('.mdom-notes-remove')) this.askTrash();
    else this.openSelected();
  }

  // ---- the tree and the search ----------------------------------------------------

  /** Right, or L: a closed folder opens; an open one is stepped into. */
  expand() {
    const v = this.rows.value;
    if (!v?.dir) return;
    if (this.tree.expanded.has(v.path)) this.rows.move(1);
    else this.openSelected();
  }

  /** Left, or H: an open folder closes; anything else closes the folder it
   * is in, and the selection goes to that folder. */
  collapse() {
    const v = this.rows.value;
    if (!v || v.depth == null) return; // a search's row
    if (v.dir && this.tree.expanded.has(v.path)) return this.openSelected();
    const up = dirOf(v.path);
    if (!up) return;
    this.tree.expanded.delete(up);
    this.render();
    this.rows.selectPath(up);
  }

  startSearch() {
    this.keep();
    this.input.focus();
    this.input.select();
  }

  /** The search line empty and its own again, the focus back on the list. */
  resetInput() {
    this.input.value = this.q = '';
    this.input.placeholder = SEARCH_HINT;
    this.rows.list.focus({ preventScroll: true });
  }

  /** The search emptied: the tree back, the selection at `sel` (null: the
   * note you are in). @param {number | null} [sel] */
  clearSearch(sel = null) {
    this.resetInput();
    this.render(sel);
  }

  /** Enter. In the search, on a name nothing was found for, it makes the
   * note; Mod+Enter makes it whatever was found. Straight after typing, it
   * waits for what was typed. @param {boolean} create */
  async accept(create) {
    const q = this.q.trim();
    await this.pending;
    if (this.closed) return;
    if (q && (create || !this.rows.rows.some((r) => r.value)) && notePath(q)) return this.create(q);
    this.openSelected();
  }

  /** A note opens; a folder opens or closes. */
  openSelected() {
    const v = this.rows.value;
    if (!v?.path) return;
    if (!v.dir) return void this.openPath(v.path, v.goto ?? null);
    this.tree.toggle(v.path);
    this.render(this.rows.sel);
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

  // ---- names: adding and renaming -------------------------------------------------

  /** The folder a new or pasted note goes into: the selected folder, or the
   * selected note's. */
  folder() {
    const v = this.rows.value;
    return !v?.path ? '' : v.dir ? v.path : dirOf(v.path);
  }

  /** The selected note; on a folder, the line says it can't.
   * @param {string} verb */
  note(verb) {
    const v = this.rows.value;
    if (v?.path && !v.dir) return v.path;
    if (v?.dir) this.say(`Only a note can be ${verb}, not a folder`);
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
    this.say(`New note in ${folder || 'the top of the vault'}: Enter makes it, Escape stops`);
  }

  rename() {
    const path = this.note('renamed');
    if (!path) return;
    this.prompt = { kind: 'rename', path, sel: this.rows.sel };
    const name = bare(path);
    this.showPrompt(name, '');
    // The name selected, as a file manager does: typing keeps the folder.
    this.input.setSelectionRange(name.lastIndexOf('/') + 1, name.length);
    this.say(`Rename ${name}: Enter renames, Escape stops`);
  }

  endPrompt() {
    const sel = this.prompt?.kind === 'rename' ? this.prompt.sel : this.rows.sel;
    this.prompt = null;
    this.clearSearch(sel);
  }

  async finishPrompt() {
    const p = this.prompt;
    if (!p) return;
    const to = notePath(this.input.value);
    if (!to || (p.kind === 'add' && this.input.value.trim().endsWith('/'))) return this.say('That can’t be a note’s name');
    if (p.kind === 'add') return this.create(to);
    if (to === p.path) return this.endPrompt();
    try {
      await this.move(p.path, to);
    } catch (err) {
      return this.say(message(err));
    }
    this.prompt = null;
    this.resetInput();
    this.reload(to, p.sel);
  }

  // ---- the vault ------------------------------------------------------------------

  /** Makes the note a name names, its folders too, and opens it; one that is
   * there already just opens. @param {string} typed */
  async create(typed) {
    const want = notePath(typed);
    if (!want) return;
    const path = normalizePath(want);
    if (!this.app.vault.getAbstractFileByPath(path)) {
      try {
        await this.makeFolder(path);
        await this.app.vault.create(path, '');
      } catch (err) {
        return this.say(message(err));
      }
    }
    return this.openPath(path, null);
  }

  /** The folder `path` goes in, made if it is not there. @param {string} path */
  async makeFolder(path) {
    const dir = dirOf(path);
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
  }

  /** Renames or moves a note through Obsidian, so its links follow.
   * @param {string} from @param {string} to */
  async move(from, to) {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!(file instanceof TFile)) throw new Error(`${bare(from)} is gone`);
    if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`${bare(to)} is taken`);
    await this.makeFolder(to);
    await this.app.fileManager.renameFile(file, normalizePath(to));
    if (this.current === from) this.current = to;
    if (this.memory.clip?.path === from) this.memory.clip.path = to;
  }

  /** Y or X: the note waits to be pasted. @param {boolean} cut */
  clip(cut) {
    const path = this.note(cut ? 'cut' : 'copied');
    if (!path) return;
    this.memory.clip = { path, cut };
    this.render(this.rows.sel);
  }

  /** P: the note cut moves into the selected row's folder (a rename, so its
   * links follow); the note copied is made again there, under a free name. */
  async paste() {
    const clip = this.memory.clip;
    if (!clip) return this.say('Nothing copied: Y copies the selected note, X cuts it');
    const file = this.app.vault.getAbstractFileByPath(clip.path);
    if (!(file instanceof TFile)) {
      this.memory.clip = null;
      return this.say(`${bare(clip.path)} is gone`);
    }
    const folder = this.folder();
    try {
      let to;
      if (clip.cut) {
        to = movePath(clip.path, folder);
        if (to) await this.move(clip.path, to);
        this.memory.clip = null; // moved, or there already
      } else {
        to = copyPath(clip.path, folder, new Set(this.app.vault.getAllLoadedFiles().map((f) => f.path)));
        await this.app.vault.copy(file, to);
      }
      this.reload(to);
    } catch (err) {
      this.say(/taken/.test(message(err)) ? 'A note of that name is already there' : message(err));
    }
  }

  /** D: the row asks first, in place and never in a dialog. */
  askTrash() {
    this.keep();
    const path = this.note('trashed');
    if (!path) return;
    const li = this.rows.rows[this.rows.sel].li;
    this.asking = { path, li, kids: Array.from(li.childNodes) };
    li.addClass('is-asking');
    li.replaceChildren(
      createSpan({ cls: 'mdom-notes-label', text: `Trash ${bare(path.slice(path.lastIndexOf('/') + 1))}?` }),
      createEl('button', { cls: 'mdom-notes-yes', text: 'Trash', attr: { title: 'Move to the trash (Y, D or Enter)' } }),
      createEl('button', { cls: 'mdom-notes-no', text: 'Keep', attr: { title: 'Keep it (any other key)' } }),
    );
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
   * follows (file-open, in onOpen). */
  async trash() {
    const a = this.asking;
    if (!a) return;
    const file = this.app.vault.getAbstractFileByPath(a.path);
    try {
      if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    } catch (err) {
      this.keep();
      return this.say(message(err));
    }
    this.asking = null;
    if (this.memory.clip?.path === a.path) this.memory.clip = null;
    this.reload(null);
  }

  // ---- the keys -------------------------------------------------------------------

  /** ? or Keys: every key of the tree, from the table its handler uses; and
   * back to the tree. @param {boolean} on */
  showKeys(on) {
    this.keep();
    this.keysShown = on;
    this.modalEl.toggleClass('is-keys', on);
    this.rows.list.focus({ preventScroll: true });
    if (!on) return this.reload(null, null);
    const rows = KEYS.map((k) => {
      const li = this.rowEl('mdom-notes-command', null);
      li.createSpan({ cls: 'mdom-notes-label', text: k.what });
      li.createSpan({ cls: 'mdom-notes-keys', text: k.show });
      return { li, value: { path: '' } };
    });
    this.show(rows, ['In the notes. Escape goes back to them'], 0);
  }
}
