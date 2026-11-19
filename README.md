# markpad

> ⚠️ Markpad is currently in active development. Expect bugs.

Typora-inspired markdown editor for VSCode

<img width="6240" height="3400" alt="image" src="https://github.com/user-attachments/assets/df440bca-3d58-465e-b25f-f984dffc6cfe" />

## Install

```
git clone https://github.com/nisanthchunduru/markpad.git
cd markpad
npm ci
npm run build
npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/
code --install-extension build/markpad-*.vsix
```
