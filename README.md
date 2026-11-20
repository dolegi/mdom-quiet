# mdom quiet

One page, full screen, for Obsidian. From the mdom notes app, whose rule is
that each screen fills the window and owns it: moving to another note swaps
the whole page, never stacks a tab or a split beside it.

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

Pairs with the [mdom theme](../mdom-theme), but fits any theme.

## Develop

```
npm install
npm run dev     # rebuild main.js on save
npm test        # node --test: the pure logic in src/lib.js
npm run build   # type-check (JSDoc, tsc --checkJs), then bundle
```

`src/lib.js` is pure logic with no Obsidian imports, tested directly by
Node; `src/main.js` wires it into Obsidian. esbuild is only a dev tool: it
bundles `src/` into the one `main.js` Obsidian loads, leaving `obsidian` and
CodeMirror to Obsidian. The plugin has no runtime dependencies.

## Release

`npm version patch` (or minor, major) bumps `package.json`, `manifest.json`
and `versions.json` and tags. `git push --follow-tags`; the workflow tests,
builds and drafts a GitHub release with `main.js`, `manifest.json` and
`styles.css`. Publish the draft. Until it is in the community list, install
it with BRAT from this repo.
