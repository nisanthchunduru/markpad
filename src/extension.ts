import * as vscode from 'vscode';
import * as path from 'node:path';
import { minimalPatch } from './diff';
import { isThemeName, type ThemeName } from './themes';

type IncomingMessage =
  | { type: 'edit'; text: string; version: number }
  | { type: 'openLink'; href: string }
  | { type: 'theme'; theme: string }
  | { type: 'ready' };

function imageUris(document: vscode.TextDocument, webview: vscode.Webview): Record<string, string> {
  const result: Record<string, string> = {};
  const roots = [vscode.Uri.joinPath(document.uri, '..'), ...(vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri)];
  const imagePattern = /!\[[^\]\n]*\]\((<?[^\s)>]+>?)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of document.getText().matchAll(imagePattern)) {
    const source = match[1].replace(/^<|>$/g, '');
    if (/^https:\/\//i.test(source)) {
      result[source] = source;
      continue;
    }
    if (/^[a-z][\w+.-]*:/i.test(source) || path.isAbsolute(source)) continue;
    let decoded: string;
    try { decoded = decodeURIComponent(source); } catch { continue; }
    const uri = vscode.Uri.joinPath(document.uri, '..', decoded);
    if (uri.scheme !== document.uri.scheme) continue;
    if (roots.some(root => root.scheme === uri.scheme && !path.relative(root.path, uri.path).startsWith('..') && !path.isAbsolute(path.relative(root.path, uri.path)))) {
      result[source] = webview.asWebviewUri(uri).toString();
    }
  }
  return result;
}

function selectedTheme(): ThemeName {
  const settings = vscode.workspace.getConfiguration('tyler');
  const saved = settings.inspect<string>('theme');
  const hasSelection = saved?.globalValue !== undefined || saved?.workspaceValue !== undefined || saved?.workspaceFolderValue !== undefined;
  const configured = hasSelection ? settings.get<string>('theme') : vscode.workspace.getConfiguration('vscode-typora').get<string>('theme');
  return isThemeName(configured) ? configured : 'github';
}

export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.CustomTextEditorProvider = {
    resolveCustomTextEditor(document, webviewPanel) {
      const webview = webviewPanel.webview;
      const roots = [context.extensionUri, vscode.Uri.joinPath(document.uri, '..'), ...(vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri)];
      webview.options = { enableScripts: true, localResourceRoots: roots };
      const nonce = Buffer.from(vscode.env.sessionId + Math.random()).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
      const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'build', 'web.js'));
      const css = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'web', 'editor.css'));
      const fontCss = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'web', 'fonts.css'));
      const themeCss = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'web', 'themes.css'));
      webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};"><link rel="stylesheet" href="${css}"><link rel="stylesheet" href="${fontCss}"><link rel="stylesheet" href="${themeCss}"><title>Markdown</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
      const sendDocument = () => webview.postMessage({ type: 'document', text: document.getText(), version: document.version, title: path.basename(document.uri.path), images: imageUris(document, webview), theme: selectedTheme() });
      const changes = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString()) void sendDocument();
      });
      const configurationChanges = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('tyler.theme') || event.affectsConfiguration('vscode-typora.theme')) void webview.postMessage({ type: 'theme', theme: selectedTheme() });
      });
      const messages = webview.onDidReceiveMessage(async (message: IncomingMessage) => {
        if (message.type === 'ready') { await sendDocument(); return; }
        if (message.type === 'theme') {
          if (!isThemeName(message.theme)) return;
          const settings = vscode.workspace.getConfiguration('tyler');
          const legacyWorkspaceTheme = vscode.workspace.getConfiguration('vscode-typora').inspect('theme')?.workspaceValue;
          const target = settings.inspect('theme')?.workspaceValue === undefined && legacyWorkspaceTheme === undefined ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
          await settings.update('theme', message.theme, target);
          return;
        }
        if (message.type === 'openLink') {
          if (/^https?:\/\//i.test(message.href) || /^mailto:/i.test(message.href)) {
            await vscode.env.openExternal(vscode.Uri.parse(message.href));
          } else if (!/^[a-z][\w+.-]*:/i.test(message.href) && !path.isAbsolute(message.href)) {
            let target: string;
            try { target = decodeURIComponent(message.href.split('#')[0]); } catch { return; }
            if (!target) return;
            const uri = vscode.Uri.joinPath(document.uri, '..', target);
            const roots = [vscode.Uri.joinPath(document.uri, '..'), ...(vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri)];
            if (uri.scheme === document.uri.scheme && roots.some(root => {
              const relative = path.relative(root.path, uri.path);
              return root.scheme === uri.scheme && !relative.startsWith('..') && !path.isAbsolute(relative);
            })) await vscode.commands.executeCommand('vscode.open', uri);
          }
          return;
        }
        if (message.type !== 'edit') return;
        if (message.version !== document.version) { await sendDocument(); return; }
        const patch = minimalPatch(document.getText(), message.text);
        if (!patch) { await sendDocument(); return; }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(patch.from), document.positionAt(patch.to)), patch.insert);
        if (!await vscode.workspace.applyEdit(edit)) await sendDocument();
      });
      webviewPanel.onDidDispose(() => { changes.dispose(); configurationChanges.dispose(); messages.dispose(); });
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('tyler.editor', provider, { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true }));
  context.subscriptions.push(vscode.commands.registerCommand('tyler.open', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, 'tyler.editor');
    else vscode.window.showInformationMessage('Open a Markdown file before using Tyler.');
  }));
}

export function deactivate(): void {}
