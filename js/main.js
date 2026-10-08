/* SFX Browser panel — UI side (CEP / Chromium + Node.js). */
'use strict';

// --- Bridge to ExtendScript (jsx/host.jsx). Thin wrapper over the CEP native API,
// so we don't need to ship Adobe's CSInterface.js.
function evalHost(script) {
  return new Promise((resolve, reject) => {
    if (!window.__adobe_cep__) {
      reject(new Error('Not running inside Premiere Pro'));
      return;
    }
    window.__adobe_cep__.evalScript(script, (result) => {
      if (result === 'EvalScript error.') reject(new Error('ExtendScript error'));
      else resolve(result);
    });
  });
}

async function callHost(fn, ...args) {
  const argList = args.map((a) => JSON.stringify(a)).join(',');
  const raw = await evalHost(`SFX.${fn}(${argList})`);
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

// --- DOM
const $ = (id) => document.getElementById(id);
const appEl = $('app');
const searchEl = $('search');
const statusEl = $('status');
const emptyEl = $('empty');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

const fmt = (n) => n.toLocaleString();

// --- Views
const tree = new FolderTree($('sidebar'), {
  onSelect: (folder) => {
    if (searchEl.value) searchEl.value = '';
    appEl.classList.remove('sidebar-open');
    showList(true);
  },
  onRemoveRoot: async (rootPath) => {
    await Library.removeRoot(rootPath);
    Library.watch(onLibraryChange);
    refreshAll(true);
    setStatus('Removed from panel — your files were not touched');
  },
});

const list = new VirtualList($('list'), {
  rowHeight: 24,
  renderRow: (entry, row) => {
    row.textContent = '';
    row.classList.toggle('offline', !entry.root.online);
    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = entry.name;
    const dir = document.createElement('span');
    dir.className = 'row-dir';
    dir.textContent = entry.dir;
    row.title = Library.fullPath(entry);
    row.append(name, dir);

    const isCurrent = Player.current && Player.current.key === entry.key;
    row.classList.toggle('playing', isCurrent && Player.playing);
    row.classList.toggle('paused', isCurrent && !Player.playing);
    if (isCurrent) {
      const bar = document.createElement('div');
      bar.className = 'row-progress';
      bar.style.transform = `scaleX(${Player.progress})`;
      row.appendChild(bar);
    }
  },
  onSelect: (entry) => {                       // click or arrow keys: preview right away
    setStatus(entry.root.name + '/' + entry.rel);
    updateAddButton();
    Player.play(entry);
    waveform.load(entry, Library.fullPath(entry));
    // The waveform pane may have just appeared and shrunk the list: keep the row visible.
    requestAnimationFrame(() => list.scrollToIndex(list.selected));
  },
  onActivate: () => addSelected(),            // double-click: add at playhead
});

// --- Preview
const waveform = new Waveform($('waveform'), {
  getProgress: () => Player.progress,
  getDuration: () => Player.duration,
  getCurrentTime: () => Player.currentTime,
  isPlaying: () => Player.playing,
  onTogglePlay: () => Player.toggle(list.items[list.selected]),
  onSeek: (f) => {
    const entry = list.items[list.selected];
    if (Player.current) Player.seek(f);
    else if (entry) Player.play(entry); // stopped after an error: start again
  },
});
Player.on('change', () => list.refreshAll());
Player.on('error', (msg) => setStatus(msg, true));

// Move the progress bar of the playing row every frame.
(function tick() {
  if (Player.playing) {
    const bar = $('list').querySelector('.row.playing .row-progress');
    if (bar) bar.style.transform = `scaleX(${Player.progress})`;
  }
  waveform.update();
  requestAnimationFrame(tick);
})();

// Keyboard: ↑/↓ move through the list and auto-preview (also while typing in search);
// Space plays/pauses (except while typing in search, where it types a space).
// Premiere grabs Space and the arrow keys for its own shortcuts unless the panel asks for them.
// Key codes are native: macOS virtual key codes vs. Windows VK codes.
function registerKeys() {
  if (!window.__adobe_cep__ || !window.__adobe_cep__.registerKeyEventsInterest) return;
  const codes = process.platform === 'win32'
    ? [32, 38, 40]       // Space, Up, Down
    : [49, 126, 125];    // Space, Up, Down
  window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify(codes.map((keyCode) => ({ keyCode }))));
}
registerKeys();

document.addEventListener('keydown', (e) => {
  const inSearch = e.target === searchEl;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!list.items.length) return;
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = list.selected < 0 ? 0 : Math.min(list.items.length - 1, Math.max(0, list.selected + step));
    if (next !== list.selected) list.select(next);
  } else if (e.key === ' ' && !inSearch) {
    e.preventDefault();
    Player.toggle(list.items[list.selected]);
  }
});

// Fills the list from the search box (whole library) or the selected folder.
function showList(resetScroll) {
  const q = searchEl.value.trim();
  let items;
  if (q) {
    items = Library.search(q);
    tree.highlight(false);
  } else {
    items = Library.inFolder(tree.selectedFolder);
    tree.highlight(true);
  }
  list.setItems(items, { resetScroll });
  updateEmptyState(items.length, q);
  if (!scanning) setStatus(q ? `${fmt(items.length)} results for “${q}”` : `${fmt(items.length)} sounds`);
}

function updateEmptyState(count, q) {
  let msg = '';
  if (!Library.roots.length) msg = 'No library folders yet. Click + to add your SFX folder.';
  else if (count === 0 && q) msg = 'No sounds match your search.';
  else if (count === 0 && scanning) msg = 'Scanning…';
  else if (count === 0) msg = 'No sound files found here.';
  emptyEl.textContent = msg;
  emptyEl.hidden = !msg;
}

function refreshAll(resetScroll) {
  tree.render(Library.tree(), Library.files.length);
  showList(resetScroll);
}

// --- Scanning
let scanning = false;

let rescanAgain = false;   // a change arrived while scanning: scan once more afterwards
let lastScan = 0;

// quiet: automatic refresh (file watcher / panel focus) — no "Scanning…" messages,
// only a short note if something actually changed.
async function rescan({ quiet = false } = {}) {
  if (!Library.roots.length) return;
  if (scanning) { rescanAgain = true; return; }
  scanning = true;
  const before = Library.files.length;
  $('btn-rescan').classList.add('spinning');
  if (!quiet) setStatus('Scanning library…');
  try {
    const { changed, offline } = await Library.scanAll((n) => { if (!quiet) setStatus(`Scanning… ${fmt(n)} files`); });
    scanning = false;
    lastScan = Date.now();
    if (changed) refreshAll(false);
    else if (!quiet) { tree.render(Library.tree(), Library.files.length); showList(false); }
    if (offline.length) {
      setStatus(`Not connected: ${offline.join(', ')} — showing last scan`, true);
    } else if (quiet && changed) {
      const diff = Library.files.length - before;
      setStatus(diff > 0 ? `Library updated — ${fmt(diff)} new sound${diff === 1 ? '' : 's'}`
        : `Library updated — ${fmt(Library.files.length)} sounds`);
    }
  } catch (e) {
    scanning = false;
    setStatus('Scan failed: ' + e.message, true);
  } finally {
    $('btn-rescan').classList.remove('spinning');
    Library.watch(onLibraryChange); // (re)attach: picks up added/removed roots and reconnected drives
    if (rescanAgain) { rescanAgain = false; rescan({ quiet: true }); }
  }
}

// New/renamed/deleted sounds: wait until things settle (downloads, copying many files), then refresh.
let changeTimer = null;
function onLibraryChange() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => rescan({ quiet: true }), 1500);
}

// Fallback for drives that can't be watched: refresh when you come back to the panel.
window.addEventListener('focus', () => {
  if (Date.now() - lastScan > 30000) rescan({ quiet: true });
});

// --- dB level applied to clips as they land on the timeline (clip Volume, −50 … +6 dB)
const dbEl = $('db');
const dbValueEl = $('db-value');
function dbText(v) { return (v > 0 ? '+' : '') + v + ' dB'; }
function currentDb() { return Number(dbEl.value) || 0; }
function showDb() {
  dbValueEl.textContent = dbText(currentDb());
  try { localStorage.setItem('sfx.db', dbEl.value); } catch (_) { /* ignore */ }
}
try { const saved = localStorage.getItem('sfx.db'); if (saved !== null) dbEl.value = saved; } catch (_) { /* ignore */ }
showDb();
dbEl.addEventListener('input', showDb);
dbEl.addEventListener('dblclick', () => { dbEl.value = 0; showDb(); });
$('btn-db-reset').addEventListener('click', () => { dbEl.value = 0; showDb(); });
// Keep arrow keys on the slider for list navigation.
dbEl.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); });

// --- Add at playhead
const addBtn = $('btn-add');
let adding = false;

function selectedEntry() { return list.items[list.selected] || null; }
function updateAddButton() { addBtn.disabled = adding || !selectedEntry(); }

// Returns the file path if usable, else shows a message and returns null.
function usablePath(entry) {
  const fs = nodeRequire('fs');
  const file = Library.fullPath(entry);
  if (fs.existsSync(file)) return file;
  setStatus(fs.existsSync(entry.root.path)
    ? `File missing or moved: ${entry.name} — click ↻ to rescan`
    : `Library “${entry.root.name}” is not connected`, true);
  return null;
}

async function addSelected() {
  const entry = selectedEntry();
  if (!entry || adding) return;
  const file = usablePath(entry);
  if (!file) return;
  adding = true;
  updateAddButton();
  setStatus(`Adding ${entry.name}…`);
  try {
    const r = await callHost('addAtPlayhead', file, currentDb());
    if (!r || !r.ok) { setStatus((r && r.msg) || 'Could not add the sound', true); return; }
    let msg = `Added ${entry.name} to ${r.track}`;
    if (r.mode === 'new-track') msg += ' (new track)';
    if (r.mode === 'overwrite') msg += ' — replaced the sound effect there';
    if (currentDb() !== 0) msg += r.volumeSet ? ` at ${dbText(currentDb())}` : ' — could not set volume';
    setStatus(msg);
  } catch (e) {
    setStatus('Premiere scripting not reachable: ' + e.message, true);
  } finally {
    adding = false;
    updateAddButton();
  }
}

addBtn.addEventListener('click', addSelected);

// --- Drag & drop onto the Timeline / Project panel.
// Premiere receives only the file path and does the import itself; afterwards we poll the
// project to move the new item into the SFX bin and apply the dB level to the new clip.
let dragPoll = null;

function stopDragPoll() {
  if (!dragPoll) return;
  clearInterval(dragPoll);
  dragPoll = null;
  callHost('dragEnd').catch(() => {});
}

$('list').addEventListener('dragstart', (e) => {
  const row = e.target.closest && e.target.closest('.row');
  const entry = row && list.items[+row.dataset.index];
  if (!entry) return;
  const file = usablePath(entry);
  if (!file) { e.preventDefault(); return; }
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('com.adobe.cep.dnd.file.0', file);

  stopDragPoll();
  const db = currentDb();
  callHost('dragBegin', file).catch(() => {});
  let ticks = 0;
  let busy = false;
  dragPoll = setInterval(async () => {
    if (busy) return;
    busy = true;
    ticks++;
    try {
      const r = await callHost('dragCheck', db);
      if (r && r.ok && r.clips > 0) {
        setStatus(`Dropped ${entry.name}` + (db !== 0 ? ` at ${dbText(db)}` : ''));
        stopDragPoll();
      } else if (r && r.ok && r.items > 0) {
        setStatus(`Imported ${entry.name} into the SFX bin`);
      }
    } catch (_) { /* ignore and keep polling */ }
    busy = false;
    if (ticks >= 40) stopDragPoll(); // give up after ~20 s
  }, 500);
});

// --- Toolbar
searchEl.addEventListener('input', () => showList(true));
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { searchEl.value = ''; showList(true); }
});

$('btn-rescan').addEventListener('click', rescan);

$('btn-sidebar').addEventListener('click', () => appEl.classList.toggle('sidebar-open'));

$('btn-add-root').addEventListener('click', async () => {
  if (!window.cep || !window.cep.fs) { setStatus('Folder picker not available', true); return; }
  const res = window.cep.fs.showOpenDialog(false, true, 'Choose an SFX library folder', '');
  if (res.err || !res.data || !res.data.length) return; // cancelled
  const err = await Library.addRoot(res.data[0]);
  if (err) { setStatus(err, true); return; }
  refreshAll(false);
  rescan();
});

// --- Startup: show cached index immediately, then refresh in the background.
async function init() {
  if (!window.nodeRequire) {
    setStatus('Node.js not available — check manifest CEFCommandLine', true);
    return;
  }
  for (const id of ['search', 'btn-rescan', 'btn-add-root']) $(id).disabled = false;

  Library.load();
  refreshAll(true);

  // Reload host.jsx so updates apply by reopening the panel (no Premiere restart needed).
  const nodePath = nodeRequire('path');
  const hostFile = nodePath.join(nodePath.dirname(nodeRequire('url').fileURLToPath(location.href)), 'jsx', 'host.jsx');
  await evalHost(`$.evalFile(new File(${JSON.stringify(hostFile.replace(/\\/g, '/'))}))`).catch(() => {});
  callHost('ping').catch((e) => setStatus('Premiere scripting not reachable: ' + e.message, true));

  if (Library.roots.length) rescan();
}

init();
