/* Per-machine storage in the user's app data folder:
 *   macOS:   ~/Library/Application Support/SFXBrowser/
 *   Windows: %APPDATA%\SFXBrowser\
 * Never writes anywhere near the SFX library itself. */
'use strict';

window.Store = (() => {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const os = nodeRequire('os');

  const dir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'SFXBrowser')
    : path.join(os.homedir(), 'Library', 'Application Support', 'SFXBrowser');

  function file(name) { return path.join(dir, name); }

  function readJSON(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file(name), 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  // Write to a temp file then rename, so a crash never leaves a half-written file.
  async function writeJSON(name, data) {
    await fs.promises.mkdir(dir, { recursive: true });
    const target = file(name);
    const tmp = target + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 1), 'utf8');
    await fs.promises.rename(tmp, target);
  }

  return { dir, file, readJSON, writeJSON };
})();
