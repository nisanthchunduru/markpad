# Markpad Requirements

Requirements in [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax) format.

## Editor

### Document model

- REQ-001: Markpad shall parse a Markdown document into a sequence of typed block nodes (paragraph, heading, blockquote, bullet, ordered, task, fence, rule, table, blank, frontmatter).
- REQ-002: Markpad shall serialize block nodes and their source separators back to Markdown that, when re-parsed, produces an equivalent visible block sequence.
- REQ-005: Markpad shall store the blank-line separator between paragraphs as source metadata rather than as an additional editable block.
- REQ-006: When adjacent paragraphs are rendered, Markpad shall add a positive visual margin smaller than one body-text line height, without inserting an editable separator row or changing the saved Markdown.
- REQ-007: While a theme is active, Markpad shall give headings more visual space above than below and more space above than the gap between ordinary paragraphs.
- REQ-008: Markpad shall apply heading margins without stacking them with obsolete vertical padding from the earlier line-based layout.
- REQ-003: When the user edits a block in the contenteditable surface, Markpad shall read the updated content from the DOM and update the corresponding block node's raw Markdown.
- REQ-004: When a block's raw Markdown changes to match a different block type (e.g. typing `## ` at the start of a paragraph), Markpad shall re-classify the block and re-render it as the new type.

### Rendering

- REQ-010: Markpad shall render each block node to semantic HTML inside a single contenteditable `#write` div.
- REQ-011: Markpad shall render inline Markdown (bold, italic, strikethrough, inline code, links, images) to their corresponding HTML elements (`<strong>`, `<em>`, `<del>`, `<code>`, `<a>`, `<img>`).
- REQ-012: While a heading is rendered, Markpad shall keep structural Markdown prefixes out of its editable text so moving the caret cannot edit or split a metadata span.
- REQ-013: When a heading block is not focused, Markpad shall hide the Markdown prefix and display only the rendered heading text.
- REQ-014: Markpad shall render YAML frontmatter as a two-column key-value table.
- REQ-009: When Markpad renders consecutive fenced code blocks, the active theme shall separate them visually using its Typora-inspired vertical margins without inserting editable rows or changing the Markdown.
- REQ-015: Markpad shall render fenced code blocks as `<pre><code>` with a language label, supporting both top-level and indented fences.
- REQ-150: When a fenced code block declares a supported language or alias, Markpad shall syntax-highlight its literal code locally, including after edits. Unlabeled, unknown-language and oversized blocks shall remain readable as plain code.
- REQ-154: While a fence’s language input has focus, when the user presses Cmd/Ctrl+A, Markpad shall select the entire input value without changing the document selection or committing the language.
- REQ-153: When a pointer click transfers focus from fence code to its language input, Markpad shall keep the input visible and focused for typing without requiring a second click.
- REQ-152: While the caret is inside a fence or its language input has focus, Markpad shall display that fence’s inline language input below the right edge of the code panel, outside its horizontal scroll area, without shifting subsequent blocks when it appears or disappears.
- REQ-151: When the user edits a fence’s inline language input, Markpad shall accept a language identifier in a plain text field without a dropdown, or an empty value to remove the language. Enter or leaving the field shall apply a valid value, and Escape shall discard the draft. Applying a change shall update the opening fence without changing its code, support undo/redo and persist on save; canceling shall not edit the document.
- REQ-016: Markpad shall render Markdown tables as HTML `<table>` elements with column alignment.
- REQ-017: Markpad shall render task list items with interactive checkboxes.
- REQ-018: When the user toggles a task checkbox, Markpad shall update the block's raw Markdown (`[ ]` ↔ `[x]`) and sync the change to the host.

### Cursor and selection

- REQ-020: When the user clicks on a block, the browser's native caret shall appear at the click position within that block.
- REQ-021: Markpad shall not intercept or reposition the native caret placement.
- REQ-022: When the user moves the caret or changes the selection without editing, Markpad shall leave the Markdown and the document’s modified state unchanged.

### Block operations

- REQ-030: When the user presses Enter in a paragraph or heading, Markpad shall split at the current selection, preserve inline formatting on each side, remove selected text, and place the caret in exactly one new visible paragraph without an intervening editable separator row.
- REQ-048: When the user saves and reopens paragraphs created by Enter, Markpad shall preserve their Markdown separation without introducing extra visible separator rows.
- REQ-049: When the user presses Enter repeatedly in an empty paragraph, Markpad shall create one intentional empty paragraph per keypress and preserve those paragraphs through save, reload, undo, and redo.
- REQ-035: When the user presses Enter in a nonempty list item, Markpad shall continue its list type, increment an ordered-list number, and initialize a new task item as unchecked.
- REQ-036: When the user presses Enter in an empty list item, Markpad shall convert that item into an empty paragraph.
- REQ-037: When the user types a backtick fence opener and presses Enter, Markpad shall create an editable fenced-code block.
- REQ-038: While the caret is in a fenced-code block, when the user presses Enter, Markpad shall insert a literal newline in the code.
- REQ-079: While the caret is on the last line of a fenced-code block (including an empty block), when the user presses unmodified Down Arrow without a selection, Markpad shall move the caret to the start of the following paragraph, creating an undoable paragraph if needed. Earlier lines and modified arrows retain their normal navigation and selection behavior.
- REQ-039: While a frontmatter table is displayed, Markpad shall make it read-only rather than accept changes that it cannot serialize; editing its YAML shall remain available in VS Code's Text Editor.
- REQ-156: When the user types a space immediately after one to six leading hash characters in an existing heading, Markpad shall set its level to the hash count, consume the typed prefix, preserve inline formatting, and keep the caret at the beginning of the title. Hashes elsewhere and runs longer than six shall remain literal.
- REQ-155: When the user presses unmodified Backspace with a collapsed caret at the start of an H1–H6 heading, Markpad shall convert it to a separate ordinary paragraph, preserving inline formatting and the caret at its start in one undoable edit. Backspace elsewhere shall retain its normal behavior.
- REQ-031: When the user presses Backspace on an empty block, Markpad shall delete the block and move the cursor to the previous block.
- REQ-157: While the caret is in a list item, when the user presses Shift+Enter, Markpad shall start a new line within that item. Two consecutive Shift+Enter presses shall start a new paragraph within the same item, including after saving and reopening the file.
- REQ-032: When the user presses Shift+Enter, Markpad shall insert a line break within the current block.
- REQ-033: When the user presses Tab on a list item, Markpad shall indent the item by prepending two spaces to its raw Markdown.
- REQ-034: When the user presses Shift+Tab on a list item, Markpad shall outdent the item by removing up to two leading spaces from its raw Markdown.

## VS Code integration

### Custom editor

- REQ-040: Markpad shall register as a VS Code `CustomTextEditorProvider` for `.md`, `.markdown`, and `.mdown` files.
- REQ-041: Markpad shall keep VS Code's `TextDocument` authoritative: edits in the webview shall be sent as minimal `WorkspaceEdit` replacements to the host.
- REQ-042: When the host document content changes externally, Markpad shall reconcile the incoming text with the local draft and restore a valid selection and scroll position after rendering.
- REQ-044: When the host sends identical content, Markpad shall leave the editable DOM, selection, scroll position, and undo history unchanged.
- REQ-045: When an acknowledgement arrives after additional local typing, Markpad shall retain that typing and send it using the acknowledged document version.
- REQ-054: When the user saves an edited document, Markpad shall preserve the Markdown outside the edited region.
- REQ-046: When the user presses Cmd/Ctrl+S in Markpad, Markpad shall wait for outstanding local edits to reach the host before requesting a document save.
- REQ-047: When an empty document is first opened, Markpad shall create an editable blank block before accepting keyboard input.
- REQ-043: If a host document change conflicts with unsaved webview edits, Markpad shall display a conflict banner with "Use latest file" and "Keep my draft" options.

- REQ-052: While editing a local file with Typora detected, Markpad shall show an “Open in Typora” button immediately after the Outline toggle with a vertical divider between them; otherwise both the button and divider shall be hidden.
- REQ-053: When the user selects “Open in Typora”, Markpad shall synchronize pending edits and save the document before launching Typora with the current file path.

### Webview

- REQ-050: Markpad shall set a Content Security Policy on the webview that restricts scripts to a nonce, allows styles and fonts from the webview's CSP source, and allows images from the CSP source, HTTPS, and data URIs.
- REQ-051: Markpad shall include the extension URI in `localResourceRoots` so bundled CSS, JS, and font files are loadable.

## Keyboard shortcuts

- REQ-060: When the user presses Cmd/Ctrl+Z, Markpad shall undo the last change.
- REQ-061: When the user presses Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y, Markpad shall redo the last undone change.
- REQ-062: When the user presses Cmd/Ctrl+B, Markpad shall wrap the selection with `**` (bold).
- REQ-063: When the user presses Cmd/Ctrl+I, Markpad shall wrap the selection with `*` (italic).
- REQ-064: When the user presses Cmd/Ctrl+`, Markpad shall wrap the selection with `` ` `` (inline code).
- REQ-065: When the user presses Cmd/Ctrl+K, Markpad shall insert a link template at the cursor.
- REQ-066: When the user presses Cmd/Ctrl+Shift+X, Markpad shall wrap the selection with `~~` (strikethrough).
- REQ-067: When the user presses Cmd/Ctrl+1 through Cmd/Ctrl+6, Markpad shall set the current block to the corresponding heading level.
- REQ-068: When the user presses Cmd/Ctrl+0, Markpad shall clear the current block's formatting and convert it to a paragraph.
- REQ-069: When the user presses Cmd/Ctrl+=, Markpad shall increase the zoom level by 10%.
- REQ-070: When the user presses Cmd/Ctrl+-, Markpad shall decrease the zoom level by 10%.
- REQ-071: When the user presses Cmd/Ctrl+\\, Markpad shall toggle the outline sidebar.
- REQ-072: When the user presses Cmd/Ctrl+Shift+D, Markpad shall duplicate the current block.
- REQ-073: When the user presses Cmd/Ctrl+Shift+K, Markpad shall delete the current block.
- REQ-074: When the user presses Alt+Shift+ArrowUp, Markpad shall move the current block up.
- REQ-075: When the user presses Alt+Shift+ArrowDown, Markpad shall move the current block down.
- REQ-076: When the user presses Cmd/Ctrl+A in the editor, Markpad shall select the entire document.
- REQ-077: When the user replaces the entire selection with text, Markpad shall discard the old document structure and allow undo to restore it.
- REQ-078: When the user pastes content, Markpad shall insert the clipboard's plain text and include the insertion in undo history.

## Undo / redo

- REQ-080: Markpad shall maintain up to 300 edit transactions, including before/after document, DOM, selection, and scroll snapshots.
- REQ-081: While the user types in the same block with less than 400ms between changes, Markpad shall group consecutive text insertions into one undo transaction.
- REQ-082: When the user performs a structural or formatting action, Markpad shall record that action as a separate undo transaction.
- REQ-083: When the user undoes or redoes an edit, Markpad shall restore its document content, selection, and scroll position.
- REQ-084: When the user edits after undoing, Markpad shall clear the redo branch.
- REQ-085: While an IME composition is active, Markpad shall defer DOM normalization until composition ends.

## Zoom

- REQ-090: Markpad shall support zoom levels from 50% to 200% in 10% increments.
- REQ-091: Markpad shall scale the `#write` element's font size proportionally to the zoom level.
- REQ-092: Markpad shall display the current zoom level and zoom in/out controls in the toolbar.

## Outline

- REQ-100: Markpad shall display an outline sidebar listing all heading blocks in document order.
- REQ-101: When the user clicks an outline item, Markpad shall scroll the corresponding heading to the top of the editor.
- REQ-102: Markpad shall indent outline items according to their heading level.
- REQ-103: The outline sidebar shall use the theme's writing font.

## Themes

- REQ-110: Markpad shall provide seven writing themes: GitHub, Gothic, Newsprint, Night, Pixyll, Pixyll Night, and Whitey.
- REQ-111: Each theme shall specify: paper color, ink color, muted color, border color, panel color, accent/link color, selection color, writing font, font size, line height, writing width, heading ink color, quote edge color, sidebar background, sidebar ink, sidebar muted, sidebar hover background, sidebar hover ink, and sidebar border.
- REQ-112: Markpad shall persist the selected theme in the `markpad.theme` VS Code setting.
- REQ-113: When the user changes the theme, Markpad shall apply the new theme to all open Markpad editor tabs.
- REQ-114: If no `markpad.theme` setting exists, Markpad shall fall back to `tyler.theme`, then `vscode-typora.theme`, for backward compatibility.
- REQ-115: Markpad shall bundle redistributable webfonts (Open Sans, TeX Gyre Adventor, Didact Gothic, PT Serif, Merriweather, Lato, Vollkorn) so themes render their intended fonts without network access or system font installation.
- REQ-116: Each theme's heading font shall match the corresponding Typora theme's heading font family.
- REQ-117: Each theme shall style the outline sidebar (background, text color, hover color, border) consistently with the writing area.

## Links

- REQ-120: When the user Cmd/Ctrl+clicks a link, Markpad shall open the link in the appropriate handler: external URLs in the browser, relative Markdown paths in VS Code.
- REQ-121: Markpad shall not open links on plain clicks (without Cmd/Ctrl).

## Images

- REQ-130: Markpad shall resolve relative image paths against the document's directory.
- REQ-131: Markpad shall render resolved images as `<img>` elements with the image's alt text.
- REQ-132: Markpad shall support HTTPS image URLs without resolution.
