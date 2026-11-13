# Tyler

Tyler is a Typora-inspired, distraction-free Markdown editor inside VS Code. It is an independent implementation: it does not include Typora's application code or assets. Included third-party webfonts carry their own licenses under `web/fonts/licenses/`.

## Try it

```sh
npm ci
npm test
```

Open this folder in VS Code and press **F5** to launch an Extension Development Host. Open a `.md` file: Tyler is offered as the default Markdown editor. To switch back, use **Reopen Editor With… → Text Editor**. For an already-open Markdown file, run **Markdown: Open in Tyler** from the Command Palette.

## Features

- Single-pane live Markdown: headings, emphasis, links, code, quotes, lists, task checkboxes, rules, tables, and local/HTTPS images; markup reappears on the active line. Click a task checkbox to toggle its source text.
- Source-mode toggle, outline navigation, word count, focus mode, typewriter scrolling, formatting actions, and familiar Bold/Italic shortcuts. Ctrl/Cmd-click links to open them.
- VS Code's Markdown `TextDocument` stays authoritative. Edits use minimal `WorkspaceEdit` replacements, so save, auto-save, file watching, dirty state, and undo/redo remain VS Code features. Non-overlapping edits from another view are rebased; overlapping edits pause with a choice between the latest file and the local draft.
- Seven Typora-inspired writing themes: **GitHub, Gothic, Newsprint, Night, Pixyll, Pixyll Night, Whitey**. Pixyll Night adapts the separately installed `pixyll-night.css` theme, not a Typora bundled default. Use the theme selector in the editor header; selection persists in `tyler.theme` and updates all open editor tabs. Tyler also reads a previously saved `vscode-typora.theme` choice until a new selection is saved. The editor bundles locally served, redistributable webfonts for Open Sans, TeX Gyre Adventor, Didact Gothic, PT Serif, Merriweather, Lato and Vollkorn; see `web/fonts/README.md` for provenance and licenses. No network access or system font installation is required for these Latin/Latin Extended families.
- Light and dark palettes (Night and Pixyll Night are always dark), CSP-restricted webview, and workspace-local image URLs.

## Differences from Typora

This is a source-preserving live-preview editor, **not** Typora's full rich-text engine. The themes adapt Typora's visual styles to CodeMirror rather than copying Typora's CSS; font versions/metrics may differ from Typora's own assets. Night still uses macOS system fonts when available, with cross-platform fallbacks. Complex Markdown (especially nested lists, tables, math, diagrams, embedded HTML, and fenced-code highlighting) remains editable as Markdown rather than fully rendered. Markdown paste is plain text, not Typora's smart rich-text paste. VS Code supplies tabs, file browser, and save behavior. No Typora license or installation is needed.

## Architecture

Tyler uses a custom contenteditable engine modeled on Typora's approach — no CodeMirror. The document is a list of typed block nodes (`heading`, `paragraph`, `blockquote`, `bullet`, `ordered`, `task`, `fence`, `table`, `rule`). Each block renders to semantic HTML in a `contenteditable` div. Inline Markdown (bold, italic, code, links, images, strikethrough) is rendered to native HTML elements. Editing uses the browser's native caret, selection, and input handling. Changes are read back from the DOM per-block and serialized to Markdown for VS Code's `TextDocument`.

## Build

`npm run build` produces `dist/extension.js` (extension host, 9KB) and `dist/web.js` (webview, 26KB). `npm test` type-checks, builds, and runs tests. Package with `npx @vscode/vsce package` if desired.
