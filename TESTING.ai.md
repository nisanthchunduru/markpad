# TESTING.ai.md

## Tips

### Reproduce the bug the way the writer encountered it

Use a temporary Markdown file in an isolated VS Code profile. Start with the same Markdown, theme, and cursor position, then repeat the reported clicks and keystrokes. Try the same scenario against the previous VSIX and the fix. If you couldn't reproduce the original failure, say so.

### Verify the saved Markdown, not just the screen

After an edit, verify the rendered text, formatting, and selection. Save, compare the Markdown on disk with what you expected, and reopen the file. Try undo and redo. For navigation alone, verify that the cursor moves without marking the tab as modified.

### Click the control before typing into it

For a focus bug, avoid shortcuts that bypass the gesture. For example, click the code block, click its language field, confirm the field has focus, then type with the page keyboard. Playwright’s `fill()` can focus the field even when a real click would make it disappear. Try Enter, Escape, and clicking away too.

### Measure layout changes and inspect how they look

If a control shouldn't move the next paragraph, measure the paragraph’s position before the control appears, while it’s visible, and after it disappears. Use screenshots to spot overlap or poor contrast. If a shared style changes, verify it across all seven themes.

When comparing Markpad with Typora, use the same file, theme, zoom, and a similar writing-pane width. If you only read Typora’s CSS, describe it as a stylesheet comparison, not a visual one.

### Test what happens while an edit is still in flight

For parser changes, verify that Markdown survives parsing and serialization without changing untouched text. For synchronization changes, try typing again before VS Code acknowledges the first edit, or editing the same file from another tab. Pair the focused test with the corresponding editing gesture in VS Code.

### Run the smallest test that exercises the change

After cloning Markpad, run `npm ci` from the repo root. Use `npm test` to validate TypeScript, build Markpad, and run unit tests. Before committing an editing change, run the relevant desktop scenario, for example:

```sh
npm run test:editing -- 'typing leading hashes'
```

The filter matches part of a scenario name, ignoring case. Give each scenario its own starting document and cursor position so it can run on its own. Omit the filter when the change warrants the full suite. Desktop tests need a graphical session and the `code` CLI; set `VSCODE_BIN` if yours is elsewhere.

### Test the package you intend to install

To verify an installable build, run the relevant scenario against the VSIX rather than repeating it against both the development build and the package:

```sh
npm test &&
  npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/ &&
  MARKPAD_VSIX="build/markpad-$(node -p "require('./package.json').version").vsix" npm run test:editing -- 'typing leading hashes'
```

### Report what passed and what didn't

Use the directory printed by the desktop runner (`~/tmp-workspaces/<uuid>/tmp/`) to find `results.json`, the saved Markdown, and screenshots. Before retrying a failure, inspect `failure.png` and `failure.html` to distinguish an editor bug from a test that sent the wrong keystroke or opened the wrong file. Report the version, platform, scenarios run, and whether you installed the build. If one scenario passed, report that scenario rather than a full suite pass.
