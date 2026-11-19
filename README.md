# markpad

Typora-inspired markdown editor for VSCode

<img width="3680" height="2244" alt="image" src="https://github.com/user-attachments/assets/4f9c26be-ca3d-474e-af8d-34ef020e2545" />

## Install

```
git clone https://github.com/nisanthchunduru/markpad.git
cd markpad
npm ci
npm run build
npx @vscode/vsce package --no-dependencies --allow-missing-repository -o build/
code --install-extension build/markpad-*.vsix
```
