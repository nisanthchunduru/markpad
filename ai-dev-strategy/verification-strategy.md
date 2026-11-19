# Verifying Tyler changes

Verify what a writer sees **and** what VS Code saves. A successful build, an installed extension ID, or a correct-looking screenshot alone does not establish that an edit works.

## Start with the reported interaction

Use a disposable Markdown file and an isolated desktop VS Code profile. Record the starting Markdown, theme, caret position, exact gestures, and expected result. For a bug, run the regression against the previous VSIX first, then run the same check against the fix. If the original failure cannot be reproduced, say so.

| Change | What to verify |
| --- | --- |
| Typing, navigation, or formatting | Use actual clicks and keyboard input in the Tyler webview. Assert the caret or selection, rendered blocks, exact Markdown on disk after Save, and behavior after reopening. Check undo/redo for mutations; navigation alone should not dirty the file. |
| Focus-sensitive controls | Exercise the handoff: click the code, click the language field, **verify focus**, then type with the page keyboard. Calling `fill()` directly can bypass the very click that makes a field disappear. Exercise Enter, Escape, and clicking away. |
| Layout or theme styling | Measure element bounds before, during, and after the interaction. For example, the paragraph below a fence must stay at the same document position when its language field opens. Inspect a screenshot for overlap and contrast. For shared theme changes, check all seven themes. |
| Markdown parsing or host synchronization | Add focused tests for round-tripping source, preserving untouched text, and handling delayed acknowledgements or conflicts. Verify the corresponding edit in VS Code, not just the parser output. |

For Typora comparisons, use the same document, theme, zoom, and comparable writing-pane width. Distinguish a comparison of actual app screenshots from an inference based on theme CSS.

## Run the checks

From the repository root, run `npm ci` on a fresh checkout. `npm test` type-checks, builds, and runs unit tests. `npm run test:editing` exercises the development extension in desktop VS Code; it requires a graphical session and the `code` CLI (`VSCODE_BIN` can override it).

Before handing off an installable build, test the **actual VSIX** in an isolated instance. In a POSIX shell:

```sh
npm test &&
  npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/ &&
  TYLER_VSIX="build/markpad-$(node -p "require('./package.json').version").vsix" npm run test:editing
```

## Report evidence

The desktop runner prints its artifact directory under `~/tmp-workspaces/<uuid>/tmp/`. Use `results.json`, saved Markdown, and relevant screenshots to report which scenarios passed. On failure, inspect `failure.png` and `failure.html` before retrying. Distinguish a feature failure from a fixture or harness failure; do not report a partial run as a full pass. State which version and platform were tested and whether the build was actually installed.
