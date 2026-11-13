# Bundled webfonts

These are unmodified, redistributable font binaries. `web/fonts.css` references only files in this directory; the extension does not copy font files or theme CSS from the installed Typora application.

| Family | Source package | License |
| --- | --- | --- |
| Open Sans | `@fontsource/open-sans@5.3.0` | `licenses/open-sans-OFL.txt` |
| Didact Gothic | `@fontsource/didact-gothic@5.3.0` | `licenses/didact-gothic-OFL.txt` |
| PT Serif | `@fontsource/pt-serif@5.3.0` | `licenses/pt-serif-OFL.txt` |
| Merriweather | `@fontsource/merriweather@5.3.0` | `licenses/merriweather-OFL.txt` |
| Lato | `@fontsource/lato@5.3.0` | `licenses/lato-OFL.txt` |
| Vollkorn | `@fontsource/vollkorn@5.3.0` | `licenses/vollkorn-OFL.txt` |
| TeX Gyre Adventor | `@docx-editor.dev/fonts@2.37.0` | `licenses/GUST-FONT-LICENSE.txt` and `licenses/LPPL-1.3c.txt` |

Fontsource families include Latin and Latin Extended WOFF2 subsets in the specified weights/styles. TeX Gyre Adventor uses the upstream OpenType binaries. Other scripts fall back to system fonts. Night's Helvetica Neue and Lucida Grande are macOS system fonts and are **not** redistributed; their CSS fallbacks apply on other platforms.
