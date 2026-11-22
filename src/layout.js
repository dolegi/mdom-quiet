// One page, full screen: one note fills the window; opening another replaces
// it rather than stacking a tab or split beside it. The sidebars start shut,
// the tab bar goes, and the note's path sits quietly above it.

import { MarkdownView } from 'obsidian';

/** @typedef {import('obsidian').WorkspaceLeaf} WorkspaceLeaf */
/** @typedef {import('./settings.js').Settings} Settings */

/** The layout, as `settings()` says. Gives back what applies a change of
 * the settings.
 * @param {import('obsidian').Plugin} plugin @param {() => Settings} settings */
export function layout(plugin, settings) {
  const { workspace, vault } = plugin.app;
  let closing = false;

  /** One page: when a tab or split has been opened beside the note, close
   * every other, keeping the one in front (or, with the focus in a sidebar,
   * the last opened). Closing them changes the layout again, so this does
   * nothing while it is closing. */
  const onePage = () => {
    if (!settings().onePage || closing) return;
    /** @type {WorkspaceLeaf[]} */
    const leaves = [];
    workspace.iterateRootLeaves((leaf) => {
      leaves.push(leaf);
    });
    if (leaves.length < 2) return;
    const front = workspace.getMostRecentLeaf();
    const keep = front && leaves.includes(front) ? front : leaves[leaves.length - 1];
    closing = true;
    try {
      for (const leaf of leaves) if (leaf !== keep) leaf.detach();
    } finally {
      closing = false;
    }
  };

  /** The vault and folders before each note's name, "vault / a / b / ": an
   * attribute styles.css draws, so a rename of the title never holds them. */
  const labelTitles = () => {
    workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const title = leaf.view.containerEl.querySelector('.inline-title');
      const file = leaf.view.file;
      if (!title) return;
      if (settings().pathTitle && file) {
        const folders = file.path.split('/').slice(0, -1).filter(Boolean);
        title.setAttribute('data-mdom-path', [vault.getName(), ...folders].map((p) => `${p} / `).join(''));
      } else title.removeAttribute('data-mdom-path');
    });
  };

  const apply = () => {
    document.body.toggleClass('mdom-quiet-tabs', settings().hideTabs);
    document.body.toggleClass('mdom-quiet-path', settings().pathTitle);
    labelTitles();
    onePage();
  };

  workspace.onLayoutReady(() => {
    if (settings().closeSidebars) {
      workspace.leftSplit.collapse();
      workspace.rightSplit.collapse();
    }
    apply();
    plugin.registerEvent(workspace.on('layout-change', () => {
      onePage();
      labelTitles();
    }));
    plugin.registerEvent(workspace.on('file-open', labelTitles));
    plugin.registerEvent(vault.on('rename', labelTitles));
  });
  plugin.register(() => {
    document.body.removeClass('mdom-quiet-tabs', 'mdom-quiet-path');
    document.querySelectorAll('.inline-title[data-mdom-path]').forEach((el) => el.removeAttribute('data-mdom-path'));
  });
  return apply;
}
