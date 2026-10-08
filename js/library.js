/* Library roots, scanning and the in-memory index.
 * Strictly read-only on the library: only readdir/stat are used there. */
'use strict';

window.Library = (() => {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const url = nodeRequire('url');

  const AUDIO_EXT = new Set(['.wav', '.mp3', '.aif', '.aiff', '.m4a']);
  const CACHE_VERSION = 1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  let roots = [];          // [{ path, name, online }]
  let cache = { version: CACHE_VERSION, roots: {} }; // rootPath -> { scannedAt, files: [rel] }
  let files = [];          // index entries, sorted by path
  let byName = [];         // same entries, sorted by file name (for search results)

  // ---------- persistence

  function load() {
    const settings = Store.readJSON('settings.json', {});
    roots = (settings.roots || []).map((p) => {
      p = normalizePath(p);
      return { path: p, name: baseName(p), online: true };
    });
    const c = Store.readJSON('index-cache.json', null);
    if (c && c.version === CACHE_VERSION && c.roots) cache = c;
    checkOnline();
    rebuild();
    if ((settings.roots || []).some((p, i) => roots[i] && p !== roots[i].path)) saveSettings();
  }

  function saveSettings() {
    return Store.writeJSON('settings.json', { roots: roots.map((r) => r.path) });
  }

  function saveCache() {
    return Store.writeJSON('index-cache.json', cache);
  }

  // ---------- roots

  // CEP's folder picker can return a file: URL ("file:/Volumes/SFX/My%20Sounds")
  // instead of a plain path; convert it. Also repairs entries saved that way earlier.
  function normalizePath(p) {
    const m = /^[\\/]?(file:.*)$/.exec(p);
    if (m) {
      try { p = url.fileURLToPath(m[1].replace(/^file:\/*/, 'file:///')); } catch (_) { /* keep as-is */ }
    }
    return path.resolve(p);
  }

  function baseName(p) {
    return path.basename(p.replace(/[\\/]+$/, '')) || p;
  }

  function checkOnline() {
    for (const r of roots) {
      try { r.online = fs.statSync(r.path).isDirectory(); } catch (_) { r.online = false; }
    }
  }

  function isInside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  // Returns an error message string, or null on success.
  async function addRoot(p) {
    p = normalizePath(p);
    try {
      if (!fs.statSync(p).isDirectory()) return 'Not a folder: ' + p;
    } catch (_) {
      return 'Folder not found: ' + p;
    }
    for (const r of roots) {
      if (isInside(p, r.path)) return `Already in library (inside “${r.name}”)`;
      if (isInside(r.path, p)) return `“${r.name}” is inside that folder — remove it first`;
    }
    roots.push({ path: p, name: baseName(p), online: true });
    await saveSettings();
    return null;
  }

  async function removeRoot(p) {
    roots = roots.filter((r) => r.path !== p);
    delete cache.roots[p];
    rebuild();
    await saveSettings();
    await saveCache();
  }

  // ---------- scanning

  // Walks a root and returns relative paths ('/'-separated) of audio files.
  async function scanRoot(rootPath, onProgress) {
    const out = [];
    const queue = [''];
    let active = 0;
    const CONCURRENCY = 16;

    await new Promise((resolve) => {
      const next = () => {
        if (queue.length === 0 && active === 0) { resolve(); return; }
        while (active < CONCURRENCY && queue.length) {
          const relDir = queue.shift();
          active++;
          fs.promises.readdir(path.join(rootPath, relDir), { withFileTypes: true })
            .then((entries) => {
              for (const e of entries) {
                if (e.name.startsWith('.')) continue; // hidden files, macOS "._" files
                const rel = relDir ? relDir + '/' + e.name : e.name;
                if (e.isDirectory()) queue.push(rel);
                else if (e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(rel);
              }
              if (onProgress) onProgress(out.length);
            })
            .catch(() => { /* unreadable folder: skip it */ })
            .finally(() => { active--; next(); });
        }
      };
      next();
    });

    return out;
  }

  // Rescans all online roots. Returns { changed, offline: [names], errors: [msg] }.
  async function scanAll(onProgress) {
    checkOnline();
    let changed = false;
    const offline = [];
    let total = 0;

    for (const r of roots) {
      if (!r.online) { offline.push(r.name); continue; }
      const base = total;
      const found = await scanRoot(r.path, (n) => onProgress && onProgress(base + n));
      total += found.length;
      found.sort(collator.compare);
      const old = cache.roots[r.path];
      if (!old || old.files.length !== found.length || old.files.some((f, i) => f !== found[i])) {
        changed = true;
      }
      cache.roots[r.path] = { scannedAt: Date.now(), files: found };
    }

    // Drop cache entries for roots that were removed.
    for (const p of Object.keys(cache.roots)) {
      if (!roots.some((r) => r.path === p)) { delete cache.roots[p]; changed = true; }
    }

    if (changed) rebuild();
    await saveCache();
    return { changed, offline };
  }

  // ---------- watching
  // Calls onChange (debounced by the caller) when sound files or folders change inside any root.
  // Uses the OS file-change notifications (recursive watching works on macOS and Windows).
  let watchers = [];

  function watch(onChange) {
    unwatch();
    for (const r of roots) {
      if (!r.online) continue;
      try {
        const w = fs.watch(r.path, { recursive: true }, (event, filename) => {
          if (filename) {
            const base = path.basename(String(filename));
            if (base.startsWith('.')) return;                     // hidden / macOS "._" files
            const ext = path.extname(base).toLowerCase();
            if (ext && !AUDIO_EXT.has(ext)) return;              // other files (images, partial downloads…)
          }
          onChange(r);
        });
        w.on('error', () => { try { w.close(); } catch (_) { /* ignore */ } });
        watchers.push(w);
      } catch (_) { /* drive can't be watched (e.g. some network drives): ↻ still works */ }
    }
  }

  function unwatch() {
    for (const w of watchers) { try { w.close(); } catch (_) { /* ignore */ } }
    watchers = [];
  }

  // ---------- index

  function rebuild() {
    files = [];
    roots.forEach((r, ri) => {
      const c = cache.roots[r.path];
      if (!c) return;
      for (const rel of c.files) {
        const slash = rel.lastIndexOf('/');
        const name = rel.slice(slash + 1);
        files.push({
          key: r.path + '|' + rel,
          rootIndex: ri,
          root: r,
          rel,
          dir: slash >= 0 ? rel.slice(0, slash) : '',
          name,
          lower: name.toLowerCase(),
        });
      }
    });
    byName = files.slice().sort((a, b) => collator.compare(a.name, b.name));
  }

  function fullPath(entry) {
    return path.join(entry.root.path, ...entry.rel.split('/'));
  }

  // Entries in a folder (including subfolders). folder = { rootIndex, dir } or null for all.
  function inFolder(folder) {
    if (!folder) return files;
    const prefix = folder.dir ? folder.dir + '/' : '';
    return files.filter((f) => f.rootIndex === folder.rootIndex &&
      (prefix === '' || f.dir === folder.dir || f.dir.startsWith(prefix)));
  }

  // Name search across the whole library; every space-separated term must match.
  function search(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return byName;
    return byName.filter((f) => terms.every((t) => f.lower.includes(t)));
  }

  // Folder tree per root: { name, dir, count, children: Map }
  function tree() {
    return roots.map((r, ri) => {
      const top = { name: r.name, dir: '', rootIndex: ri, root: r, count: 0, children: new Map() };
      for (const f of files) {
        if (f.rootIndex !== ri) continue;
        top.count++;
        if (!f.dir) continue;
        let node = top;
        let acc = '';
        for (const part of f.dir.split('/')) {
          acc = acc ? acc + '/' + part : part;
          let child = node.children.get(part);
          if (!child) {
            child = { name: part, dir: acc, rootIndex: ri, root: r, count: 0, children: new Map() };
            node.children.set(part, child);
          }
          child.count++;
          node = child;
        }
      }
      return top;
    });
  }

  return {
    load, addRoot, removeRoot, scanAll, watch, fullPath, inFolder, search, tree, collator,
    get roots() { return roots; },
    get files() { return files; },
    get hasCache() { return Object.keys(cache.roots).length > 0; },
  };
})();
