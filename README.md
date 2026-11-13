# tyler

Typora-inspired markdown editor for VSCode

## Install

```
git clone https://github.com/nisanthchunduru/tyler.git
cd tyler
npm ci
npm run build
npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/
code --install-extension build/markpad-*.vsix
```
