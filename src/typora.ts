import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

export type TyporaLauncher = (file: string) => Promise<void>;
const run = promisify(execFile);

export async function findTypora(): Promise<TyporaLauncher | undefined> {
  if (process.platform === 'darwin') {
    const query = 'ObjC.import("AppKit"); const url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("abnerworks.Typora"); url.isNil() ? "" : ObjC.unwrap(url.path)';
    const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', query], { timeout: 5000 }).catch(() => undefined);
    const application = result?.stdout.trim();
    if (application) return async file => { await run('/usr/bin/open', ['-a', application, file]); };
    return undefined;
  }

  const windows = process.platform === 'win32';
  const candidates = (process.env.PATH ?? '').split(path.delimiter).filter(dir => path.isAbsolute(dir))
    .map(dir => path.join(dir, windows ? 'Typora.exe' : 'typora'));
  if (windows) {
    for (const dir of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
      if (dir) candidates.unshift(path.join(dir, 'Typora', 'Typora.exe'));
    }
  }
  for (const executable of candidates) {
    try {
      await access(executable, constants.X_OK);
      if (!(await stat(executable)).isFile()) continue;
    } catch { continue; }
    return file => new Promise((resolve, reject) => {
      const child = spawn(executable, [file], { detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
  return undefined;
}
