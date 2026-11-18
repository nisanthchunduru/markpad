# Tyler Requirements

Requirements in [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax) format.

## Editor

### Document model

- REQ-001: Tyler shall parse a Markdown document into a sequence of typed block nodes (paragraph, heading, blockquote, bullet, ordered, task, fence, rule, table, blank, frontmatter).
- REQ-002: Tyler shall serialize block nodes and their source separators back to Markdown that, when re-parsed, produces an equivalent visible block sequence.
- REQ-005: Tyler shall store the blank-line separator between paragraphs as source metadata rather than as an additional editable block.
- REQ-003: When the user edits a block in the contenteditable surface, Tyler shall read the updated content from the DOM and update the corresponding block node's raw Markdown.
- REQ-004: When a block's raw Markdown changes to match a different block type (e.g. typing `## ` at the start of a paragraph), Tyler shall re-classify the block and re-render it as the new type.

### Rendering

- REQ-010: Tyler shall render each block node to semantic HTML inside a single contenteditable `#write` div.
- REQ-011: Tyler shall render inline Markdown (bold, italic, strikethrough, inline code, links, images) to their corresponding HTML elements (`<strong>`, `<em>`, `<del>`, `<code>`, `<a>`, `<img>`).
- REQ-012: While a heading is rendered, Tyler shall keep structural Markdown prefixes out of its editable text so moving the caret cannot edit or split a metadata span.
- REQ-013: When a heading block is not focused, Tyler shall hide the Markdown prefix and display only the rendered heading text.
- REQ-014: Tyler shall render YAML frontmatter as a two-column key-value table.
- REQ-015: Tyler shall render fenced code blocks as `<pre><code>` with a language label, supporting both top-level and indented fences.
- REQ-016: Tyler shall render Markdown tables as HTML `<table>` elements with column alignment.
- REQ-017: Tyler shall render task list items with interactive checkboxes.
- REQ-018: When the user toggles a task checkbox, Tyler shall update the block's raw Markdown (`[ ]` ↔ `[x]`) and sync the change to the host.

### Cursor and selection

- REQ-020: When the user clicks on a block, the browser's native caret shall appear at the click position within that block.
- REQ-021: Tyler shall not intercept or reposition the native caret placement.

### Block operations

- REQ-030: When the user presses Enter in a paragraph or heading, Tyler shall split at the current selection, preserve inline formatting on each side, remove selected text, and place the caret in exactly one new visible paragraph without an intervening editable separator row.
- REQ-048: When the user saves and reopens paragraphs created by Enter, Tyler shall preserve their Markdown separation without introducing extra visible separator rows.
- REQ-049: When the user presses Enter repeatedly in an empty paragraph, Tyler shall create one intentional empty paragraph per keypress and preserve those paragraphs through save, reload, undo, and redo.
- REQ-035: When the user presses Enter in a nonempty list item, Tyler shall continue its list type, increment an ordered-list number, and initialize a new task item as unchecked.
- REQ-036: When the user presses Enter in an empty list item, Tyler shall convert that item into an empty paragraph.
- REQ-037: When the user types a backtick fence opener and presses Enter, Tyler shall create an editable fenced-code block.
- REQ-038: While the caret is in a fenced-code block, when the user presses Enter, Tyler shall insert a literal newline in the code.
- REQ-039: While a frontmatter table is displayed, Tyler shall make it read-only rather than accept changes that it cannot serialize; editing its YAML shall remain available in VS Code's Text Editor.
- REQ-031: When the user presses Backspace on an empty block, Tyler shall delete the block and move the cursor to the previous block.
- REQ-032: When the user presses Shift+Enter, Tyler shall insert a line break within the current block.
- REQ-033: When the user presses Tab on a list item, Tyler shall indent the item by prepending two spaces to its raw Markdown.
- REQ-034: When the user presses Shift+Tab on a list item, Tyler shall outdent the item by removing up to two leading spaces from its raw Markdown.

## VS Code integration

### Custom editor

- REQ-040: Tyler shall register as a VS Code `CustomTextEditorProvider` for `.md`, `.markdown`, and `.mdown` files.
- REQ-041: Tyler shall keep VS Code's `TextDocument` authoritative: edits in the webview shall be sent as minimal `WorkspaceEdit` replacements to the host.
- REQ-042: When the host document content changes externally, Tyler shall reconcile the incoming text with the local draft and restore a valid selection and scroll position after rendering.
- REQ-044: When the host sends identical content, Tyler shall leave the editable DOM, selection, scroll position, and undo history unchanged.
- REQ-045: When an acknowledgement arrives after additional local typing, Tyler shall retain that typing and send it using the acknowledged document version.
- REQ-046: When the user presses Cmd/Ctrl+S in Tyler, Tyler shall wait for outstanding local edits to reach the host before requesting a document save.
- REQ-047: When an empty document is first opened, Tyler shall create an editable blank block before accepting keyboard input.
- REQ-043: If a host document change conflicts with unsaved webview edits, Tyler shall display a conflict banner with "Use latest file" and "Keep my draft" options.

### Webview

- REQ-050: Tyler shall set a Content Security Policy on the webview that restricts scripts to a nonce, allows styles and fonts from the webview's CSP source, and allows images from the CSP source, HTTPS, and data URIs.
- REQ-051: Tyler shall include the extension URI in `localResourceRoots` so bundled CSS, JS, and font files are loadable.

## Keyboard shortcuts

- REQ-060: When the user presses Cmd/Ctrl+Z, Tyler shall undo the last change.
- REQ-061: When the user presses Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y, Tyler shall redo the last undone change.
- REQ-062: When the user presses Cmd/Ctrl+B, Tyler shall wrap the selection with `**` (bold).
- REQ-063: When the user presses Cmd/Ctrl+I, Tyler shall wrap the selection with `*` (italic).
- REQ-064: When the user presses Cmd/Ctrl+`, Tyler shall wrap the selection with `` ` `` (inline code).
- REQ-065: When the user presses Cmd/Ctrl+K, Tyler shall insert a link template at the cursor.
- REQ-066: When the user presses Cmd/Ctrl+Shift+X, Tyler shall wrap the selection with `~~` (strikethrough).
- REQ-067: When the user presses Cmd/Ctrl+1 through Cmd/Ctrl+6, Tyler shall set the current block to the corresponding heading level.
- REQ-068: When the user presses Cmd/Ctrl+0, Tyler shall clear the current block's formatting and convert it to a paragraph.
- REQ-069: When the user presses Cmd/Ctrl+=, Tyler shall increase the zoom level by 10%.
- REQ-070: When the user presses Cmd/Ctrl+-, Tyler shall decrease the zoom level by 10%.
- REQ-071: When the user presses Cmd/Ctrl+\\, Tyler shall toggle the outline sidebar.
- REQ-072: When the user presses Cmd/Ctrl+Shift+D, Tyler shall duplicate the current block.
- REQ-073: When the user presses Cmd/Ctrl+Shift+K, Tyler shall delete the current block.
- REQ-074: When the user presses Alt+Shift+ArrowUp, Tyler shall move the current block up.
- REQ-075: When the user presses Alt+Shift+ArrowDown, Tyler shall move the current block down.
- REQ-076: When the user presses Cmd/Ctrl+A in the editor, Tyler shall select the entire document.
- REQ-077: When the user replaces the entire selection with text, Tyler shall discard the old document structure and allow undo to restore it.
- REQ-078: When the user pastes content, Tyler shall insert the clipboard's plain text and include the insertion in undo history.

## Undo / redo

- REQ-080: Tyler shall maintain up to 300 edit transactions, including before/after document, DOM, selection, and scroll snapshots.
- REQ-081: While the user types in the same block with less than 400ms between changes, Tyler shall group consecutive text insertions into one undo transaction.
- REQ-082: When the user performs a structural or formatting action, Tyler shall record that action as a separate undo transaction.
- REQ-083: When the user undoes or redoes an edit, Tyler shall restore its document content, selection, and scroll position.
- REQ-084: When the user edits after undoing, Tyler shall clear the redo branch.
- REQ-085: While an IME composition is active, Tyler shall defer DOM normalization until composition ends.

## Zoom

- REQ-090: Tyler shall support zoom levels from 50% to 200% in 10% increments.
- REQ-091: Tyler shall scale the `#write` element's font size proportionally to the zoom level.
- REQ-092: Tyler shall display the current zoom level and zoom in/out controls in the toolbar.

## Outline

- REQ-100: Tyler shall display an outline sidebar listing all heading blocks in document order.
- REQ-101: When the user clicks an outline item, Tyler shall scroll the corresponding heading to the top of the editor.
- REQ-102: Tyler shall indent outline items according to their heading level.
- REQ-103: The outline sidebar shall use the theme's writing font.

## Themes

- REQ-110: Tyler shall provide seven writing themes: GitHub, Gothic, Newsprint, Night, Pixyll, Pixyll Night, and Whitey.
- REQ-111: Each theme shall specify: paper color, ink color, muted color, border color, panel color, accent/link color, selection color, writing font, font size, line height, writing width, heading ink color, quote edge color, sidebar background, sidebar ink, sidebar muted, sidebar hover background, sidebar hover ink, and sidebar border.
- REQ-112: Tyler shall persist the selected theme in the `tyler.theme` VS Code setting.
- REQ-113: When the user changes the theme, Tyler shall apply the new theme to all open Tyler editor tabs.
- REQ-114: If no `tyler.theme` setting exists, Tyler shall fall back to reading `vscode-typora.theme` for backward compatibility.
- REQ-115: Tyler shall bundle redistributable webfonts (Open Sans, TeX Gyre Adventor, Didact Gothic, PT Serif, Merriweather, Lato, Vollkorn) so themes render their intended fonts without network access or system font installation.
- REQ-116: Each theme's heading font shall match the corresponding Typora theme's heading font family.
- REQ-117: Each theme shall style the outline sidebar (background, text color, hover color, border) consistently with the writing area.

## Links

- REQ-120: When the user Cmd/Ctrl+clicks a link, Tyler shall open the link in the appropriate handler: external URLs in the browser, relative Markdown paths in VS Code.
- REQ-121: Tyler shall not open links on plain clicks (without Cmd/Ctrl).

## Images

- REQ-130: Tyler shall resolve relative image paths against the document's directory.
- REQ-131: Tyler shall render resolved images as `<img>` elements with the image's alt text.
- REQ-132: Tyler shall support HTTPS image URLs without resolution.

## Editing verification

- REQ-140: When the editing regression suite runs, the test harness shall open Tyler in an isolated desktop VS Code profile and exercise mouse clicks and keyboard events.
- REQ-141: When a regression test saves a document, the test harness shall verify the Markdown on disk and the absence of a dirty tab, rather than relying only on rendered text.
- REQ-142: When a regression test fails, the test harness shall retain a screenshot, the editor DOM, and a test report in its temporary workspace.

Known coverage limits: the desktop suite currently targets macOS VS Code. IME composition, rich-text paste, nested-list semantics, complex YAML, Markdown extensions, and exhaustive cross-block selections are not fully verified. Frontmatter is read-only in Tyler; use VS Code's Text Editor to edit it.
