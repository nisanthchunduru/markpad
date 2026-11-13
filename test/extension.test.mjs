import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function uri(filePath) { return { scheme: 'file', path: filePath }; }

test('Tyler loads bundled assets and carries over the old theme selection', async () => {
  let provider;
  let viewType;
  let receiveMessage;
  let onConfigurationChange;
  let selectedTheme;
  const posted = [];
  const settings = {
    get: () => selectedTheme ?? 'github',
    inspect: () => ({ globalValue: selectedTheme, workspaceValue: undefined }),
    update: async (_key, theme, target) => {
      assert.equal(target, 'global');
      selectedTheme = theme;
      onConfigurationChange({ affectsConfiguration: name => name === 'tyler.theme' });
    }
  };
  const legacySettings = { get: () => 'pixyll', inspect: () => ({ workspaceValue: undefined }) };
  const vscode = {
    Uri: { joinPath: (base, ...parts) => uri(path.posix.resolve(base.path, ...parts)) },
    env: { sessionId: 'test-session' },
    ConfigurationTarget: { Global: 'global', Workspace: 'workspace' },
    workspace: {
      workspaceFolders: [],
      getConfiguration: section => section === 'tyler' ? settings : legacySettings,
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidChangeConfiguration: callback => { onConfigurationChange = callback; return { dispose() {} }; }
    },
    window: {
      registerCustomEditorProvider: (type, registered) => { viewType = type; provider = registered; return { dispose() {} }; },
    },
    commands: { registerCommand: () => ({ dispose() {} }) }
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { activate } = requireExtension();
    activate({ extensionUri: uri('/extensions/tyler'), subscriptions: [] });
    assert.equal(viewType, 'tyler.editor');
    const webview = {
      cspSource: 'vscode-webview:',
      asWebviewUri: resource => ({ toString: () => `vscode-webview:${resource.path}` }),
      onDidReceiveMessage: callback => { receiveMessage = callback; return { dispose() {} }; },
      postMessage: message => { posted.push(message); return Promise.resolve(true); }
    };
    provider.resolveCustomTextEditor({ uri: uri('/notes/example.md'), getText: () => '', version: 1 }, {
      webview,
      onDidDispose: () => ({ dispose() {} })
    });
    assert.ok(webview.options.localResourceRoots.some(root => root.path === '/extensions/tyler'));
    assert.match(webview.html, /build\/web\.js/);
    assert.match(webview.html, /web\/editor\.css/);
    assert.match(webview.html, /web\/fonts\.css/);
    assert.match(webview.html, /font-src vscode-webview:/);
    assert.match(webview.html, /web\/themes\.css/);
    await receiveMessage({ type: 'ready' });
    assert.equal(posted.at(-1).theme, 'pixyll');
    await receiveMessage({ type: 'theme', theme: 'night' });
    assert.equal(selectedTheme, 'night');
    assert.deepEqual(posted.at(-1), { type: 'theme', theme: 'night' });
    await receiveMessage({ type: 'theme', theme: 'pixyll-night' });
    assert.equal(selectedTheme, 'pixyll-night');
    assert.deepEqual(posted.at(-1), { type: 'theme', theme: 'pixyll-night' });
    await receiveMessage({ type: 'theme', theme: 'unknown' });
    assert.equal(selectedTheme, 'pixyll-night');
  } finally {
    Module._load = originalLoad;
  }
});

test('all referenced fonts and redistributable licenses are included', () => {
  const fontsCss = fs.readFileSync(new URL('../web/fonts.css', import.meta.url), 'utf8');
  for (const match of fontsCss.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)) {
    assert.ok(fs.existsSync(new URL(`../web/fonts/${match[1]}`, import.meta.url)), match[1]);
  }
  assert.equal([...fontsCss.matchAll(/@font-face/g)].length, 58);
  for (const family of ['open-sans', 'didact-gothic', 'pt-serif', 'merriweather', 'lato', 'vollkorn']) {
    assert.ok(fs.existsSync(new URL(`../web/fonts/licenses/${family}-OFL.txt`, import.meta.url)));
  }
  for (const name of ['GUST-FONT-LICENSE.txt', 'LPPL-1.3c.txt']) {
    assert.ok(fs.existsSync(new URL(`../web/fonts/licenses/${name}`, import.meta.url)));
  }
});

function requireExtension() {
  return Module.createRequire(import.meta.url)('../build/extension.js');
}
