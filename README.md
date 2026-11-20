# mdom quiet

A quiet Obsidian, in one plugin: one page full screen, your notes on a page
of their own, and tags in colour. It takes no keys of its own: Obsidian's
(⌘O, ⌘P, ...) work as ever. Every part can be turned off in its settings
but the notes, which are only there when you open them. Works on desktop
and mobile; fits any theme, and pairs with the [mdom theme](../mdom-theme).

## One page

One page, full screen, for Obsidian. Each screen fills the window and owns
it: moving to another note swaps the whole page, never stacks a tab or a
split beside it.

- **One page.** A new tab or split replaces the note in front instead of
  opening beside it: links, the quick switcher, "Open in new tab" all land
  on the one page. Back and forward still work.
- **Sidebars start closed**, and the **tab bar** is gone.
- **The path above the note**: the vault and folders, quietly, before the
  note's name (`thinkslow / journal / Today`). Click the name to rename it, as
  ever; the path is drawn, not text, so a rename never holds it.
Every part is a toggle in the plugin's settings. Works on desktop and mobile.
It takes no keys and adds no buttons: Obsidian's own (⌘O, ⌘P, ...) work as
ever, and what they open lands on the one page.

## The notes

"Open notes" (from ⌘P, or a hotkey you give it in Settings → Hotkeys: ⌘O,
if you'd rather it than the quick switcher) opens your notes on a page of
their own: the vault as a tree, one search above it, and notes added,
renamed, moved, copied and trashed from it.

### The tree

It opens on the note you are in, its folders open and a dot on it. Nothing
is typed in the tree, so every key acts on the selected row:

| Key | Does |
|---|---|
| `↓` `↑`, `J` `K` | Move; `G` to the first row, `Shift G` to the last; `PageUp`/`PageDown` |
| `Enter` | Open the note; open or close the folder |
| `→` / `L` | Open the folder, then step into it |
| `←` / `H` | Close the folder, or the one the note is in |
| `/` | Search |
| `A` | Add a note in the selected folder (or the selected note's) |
| `R` / `F2` | Rename; a folder in the name moves it, and links follow |
| `D` / `Delete` | Trash: the row asks first, `Y`, `D` or `Enter` trashes, any other key keeps |
| `Y`, `X`, `P` | Copy, cut, paste into the selected row's folder |
| `?` | These keys (or the **Keys** button) |
| `Escape` | Back to the note |

Names are typed on the search's line, the tree staying put: Enter does it,
Escape stops. A cut note is drawn faint until it is pasted; a copied one is
made again, as "name copy" where its name is taken. Trash goes to the trash
set in Obsidian's settings; if it was the note you were in, Obsidian goes
back to the one before it. The folders you open stay open while Obsidian
runs.

On a phone each note has a ×, a finger wide, that asks the same question; a
tap opens a folder or a note, and the search takes no focus until tapped, so
no keyboard comes up by itself.

### The search

- **Names first, at once.** Every word must be in the note's name (or, after
  those, in its folders): an exact name first, then a name or a word starting
  so. Never scattered letters, unless nothing is named so and you typed one
  word of three letters or more: then the three names closest to a typo.
- **Then the lines.** Under the names, the lines inside every note that hold
  what you typed, a note at a time: notes with it in a heading first, then
  the ones with the most, the first three lines of each. A capital letter
  makes it exact.
- **Enter** opens the selected row; a line opens at its match. **Mod+Enter**,
  or Enter when nothing was found, creates a note with the name you typed,
  folders and all (or click **Create**).
- **Escape** clears the search and the tree is back.

### Leaving

Escape (or **Done**) goes back to your note exactly as it was: the note is
never closed, so its cursor, scroll and undo are all still there.

It is a page, not a box over your note: the whole window, one column, the
chosen row a flat band. Files change through Obsidian, so links follow a
rename or a move.

## Tags in colour

Each tag is a pale chip in a hue of its own, from its name alone, so
`#garden` is the same colour in every note, in the editor, in reading view
and in the properties. Case is nothing: `#Garden` and `#garden` are one tag,
one hue. Only the colours are set; the chip's shape is the theme's, light or
dark.

## Develop

```
npm install
npm run dev     # rebuild main.js on save
npm test        # node --test: the pure logic, with no Obsidian
npm run build   # type-check (JSDoc, tsc --checkJs), then bundle
```

| | |
|---|---|
| `src/main.js` | The plugin: settings, one page, the path; wires in the rest. |
| `src/lib.js` | Settings, the path, which pages to close. |
| `src/notes/page.js` | The notes page. |
| `src/notes/lib.js` | Its search, ranking, tree and paths. |
| `src/marks/tags.js` | Tags in colour: the editor, reading view, properties. |
| `src/marks/lib.js` | A tag's hue. |

The `lib.js` files import nothing from Obsidian, so Node tests them directly
(`test/`). esbuild is only a dev tool: it bundles `src/` into the one
`main.js` Obsidian loads, leaving `obsidian` and CodeMirror to Obsidian. The
plugin has no runtime dependencies. In a real Obsidian it is tested by
`../e2e` (`make e2e`).

## Release

`npm version patch` (or minor, major) bumps `package.json`, `manifest.json`
and `versions.json` and tags. `git push --follow-tags`; the workflow tests,
builds and drafts a GitHub release with `main.js`, `manifest.json` and
`styles.css`. Publish the draft. Until it is in the community list, install
it with BRAT from this repo.
