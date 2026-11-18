# Tyler

Tyler is a Typora-inspired, distraction-free Markdown editor inside VS Code. It is an independent implementation: it does not include Typora's application code or assets. Included third-party webfonts carry their own licenses under `web/fonts/licenses/`.

## Try it

```sh
npm ci
npm test
```

Open this folder in VS Code and press **F5** to launch an Extension Development Host. Open a `.md` file: Tyler is offered as the default Markdown editor. To switch back, use **Reopen Editor With… → Text Editor**. For an already-open Markdown file, run **Markdown: Open in Tyler** from the Command Palette.

## Features

- Single-pane Markdown: headings, emphasis, links, code, quotes, lists, task checkboxes, rules, tables, and local/HTTPS images. Structural prefixes are excluded from editable headings. Typed inline markup renders when the block is re-rendered, such as after Enter.
- Outline navigation, zoom, formatting actions, and Bold/Italic shortcuts. Ctrl/Cmd-click links to open them. Source editing uses VS Code's Text Editor; there is no source toggle or word count in Tyler.
- VS Code's Markdown `TextDocument` stays authoritative. Edits use minimal `WorkspaceEdit` replacements, so save, auto-save, file watching, dirty state, and undo/redo remain VS Code features. Non-overlapping edits from another view are rebased; overlapping edits pause with a choice between the latest file and the local draft.
- Seven Typora-inspired writing themes: **GitHub, Gothic, Newsprint, Night, Pixyll, Pixyll Night, Whitey**. Pixyll Night adapts the separately installed `pixyll-night.css` theme, not a Typora bundled default. Use the theme selector in the editor header; selection persists in `tyler.theme` and updates all open editor tabs. Tyler also reads a previously saved `vscode-typora.theme` choice until a new selection is saved. The editor bundles locally served, redistributable webfonts for Open Sans, TeX Gyre Adventor, Didact Gothic, PT Serif, Merriweather, Lato and Vollkorn; see `web/fonts/README.md` for provenance and licenses. No network access or system font installation is required for these Latin/Latin Extended families.
- Light and dark palettes (Night and Pixyll Night are always dark), CSP-restricted webview, and workspace-local image URLs.

## Differences from Typora

This is a source-preserving live-preview editor, **not** Typora's full rich-text engine. The themes adapt Typora's visual styles to Tyler's contenteditable surface rather than copying Typora's CSS; font versions/metrics may differ from Typora's own assets. Night still uses macOS system fonts when available, with cross-platform fallbacks. Complex Markdown (especially nested lists, tables, math, diagrams, embedded HTML, and fenced-code highlighting) remains editable as Markdown rather than fully rendered. Markdown paste is plain text, not Typora's smart rich-text paste. VS Code supplies tabs, file browser, and save behavior. No Typora license or installation is needed.

## Architecture

Tyler uses a custom contenteditable engine modeled on Typora's approach — no CodeMirror. The document is a list of typed block nodes (`heading`, `paragraph`, `blockquote`, `bullet`, `ordered`, `task`, `fence`, `table`, `rule`). Each block renders to semantic HTML in a `contenteditable` div. Inline Markdown (bold, italic, code, links, images, strikethrough) is rendered to native HTML elements. Editing uses the browser's native caret, selection, and input handling. Changes are read back from the DOM per-block and serialized to Markdown for VS Code's `TextDocument`. Paragraph-separating blank lines are stored as source metadata, not extra editable rows: one Enter creates one visible paragraph, while repeated Enter can create intentional empty paragraphs.

## Build

`npm run build` produces `build/extension.js` and `build/web.js`. `npm test` type-checks, builds, and runs unit tests. Package with `npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/`.

## Editing regressions

`npm run test:editing` opens an isolated desktop VS Code instance using the `code` CLI (override with `VSCODE_BIN`). It exercises the actual Tyler webview using Playwright mouse/keyboard input, checks saved Markdown, and retains screenshots and results under a UUID directory in `~/tmp-workspaces/`. It needs a graphical session and is currently verified on macOS. It briefly uses the clipboard; on macOS the previous plain-text clipboard contents are restored. It does not use your usual VS Code profile or project files.

The suite covers new-file typing, Enter, saving/caret stability, rapid typing, undo/redo, formatted splits, block switching, lists, indentation, code fences, line breaks, tasks, document replacement, toolbar formatting, Backspace joins, clipboard operations, table cells, and zoom. This is not a guarantee of complete Markdown/editor compatibility. Complex YAML/frontmatter is displayed read-only: edit it in VS Code's Text Editor. Nested-list semantics, IME, rich-text paste, math/diagrams, and exhaustive selection combinations need more testing.
