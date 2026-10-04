// ExtendScript side (runs inside Premiere Pro). Called from the panel via evalScript.
// ExtendScript is ES3: no JSON object, no let/const, no arrow functions.
// API usage follows Adobe's PProPanel sample (importFiles, createBin, overwriteClip,
// getPlayerPosition). Track creation uses the unsupported QE DOM (see addAudioTrack).

var SFX = SFX || {};

SFX.BIN_NAME = 'SFX';
SFX.MIN_DB = -50;
SFX.MAX_DB = 6; // Premiere's clip Volume maximum

// ---------- helpers

SFX.esc = function (s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
};

// Minimal JSON for flat objects (strings, numbers, booleans).
SFX.json = function (o) {
  var parts = [];
  for (var k in o) {
    if (!o.hasOwnProperty(k)) continue;
    var v = o[k];
    var s;
    if (typeof v === 'string') s = '"' + SFX.esc(v) + '"';
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else if (v === null || v === undefined) s = 'null';
    else s = '"' + SFX.esc(String(v)) + '"';
    parts.push('"' + k + '":' + s);
  }
  return '{' + parts.join(',') + '}';
};

SFX.fail = function (msg) { return SFX.json({ ok: false, msg: msg }); };

SFX.normPath = function (p) {
  p = String(p).replace(/\\/g, '/');
  if (Folder.fs === 'Windows') p = p.toLowerCase();
  return p;
};

SFX.fileName = function (p) {
  return String(p).replace(/^.*[\\\/]/, '');
};

SFX.isMediaItem = function (item) {
  return item && (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE);
};

// Walks the whole project; calls fn(item) for each clip/file item.
SFX.eachItem = function (bin, fn) {
  for (var i = 0; i < bin.children.numItems; i++) {
    var item = bin.children[i];
    if (!item) continue;
    if (item.type === ProjectItemType.BIN) SFX.eachItem(item, fn);
    else if (SFX.isMediaItem(item)) fn(item);
  }
};

// All project items whose media is the given file.
SFX.findItems = function (path) {
  var want = SFX.normPath(path);
  var found = [];
  SFX.eachItem(app.project.rootItem, function (item) {
    var mp = '';
    try { mp = item.getMediaPath(); } catch (e) { /* not file-backed */ }
    if (mp && SFX.normPath(mp) === want) found.push(item);
  });
  return found;
};

// The top-level "SFX" bin, created if needed.
SFX.getBin = function () {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var c = root.children[i];
    if (c && c.type === ProjectItemType.BIN && c.name === SFX.BIN_NAME) return c;
  }
  var bin = root.createBin(SFX.BIN_NAME);
  if (bin) return bin;
  for (var j = 0; j < root.children.numItems; j++) {
    var d = root.children[j];
    if (d && d.type === ProjectItemType.BIN && d.name === SFX.BIN_NAME) return d;
  }
  return null;
};

// nodeIds of everything inside the SFX bin (any depth).
SFX.binNodeIds = function (bin) {
  var ids = {};
  if (bin) SFX.eachItem(bin, function (item) { ids[item.nodeId] = true; });
  return ids;
};

// Reuse an item already in the project, or import into the SFX bin.
// Returns { item, imported } or { error }.
SFX.getOrImport = function (path) {
  var existing = SFX.findItems(path);
  if (existing.length) return { item: existing[0], imported: false };

  var bin = SFX.getBin();
  if (!bin) return { error: 'Could not create the “SFX” bin' };
  var ok = app.project.importFiles([path], true, bin, false);
  var items = SFX.findItems(path);
  if (!ok || !items.length) return { error: 'Premiere could not import ' + SFX.fileName(path) + ' (unsupported or damaged file?)' };
  return { item: items[0], imported: true };
};

SFX.itemDuration = function (item) {
  try {
    var d = item.getOutPoint().seconds - item.getInPoint().seconds;
    if (d > 0) return d;
  } catch (e) { /* fall through */ }
  return 0;
};

SFX.trackLocked = function (track) {
  try { return typeof track.isLocked === 'function' && track.isLocked(); } catch (e) { return false; }
};

// True if no clip on the track overlaps [start, end).
SFX.trackFree = function (track, start, end) {
  var eps = 0.0005;
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    if (c.start.seconds < end - eps && c.end.seconds > start + eps) return false;
  }
  return true;
};

// Overwrite fallback: every clip in [start, end) must come from the SFX bin, and one must sit
// at the playhead. Never touches dialogue or music.
SFX.trackOnlySfxAt = function (track, start, end, sfxIds) {
  var eps = 0.0005;
  var hitPlayhead = false;
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    if (!(c.start.seconds < end - eps && c.end.seconds > start + eps)) continue;
    var pi = c.projectItem;
    if (!pi || !sfxIds[pi.nodeId]) return false;
    if (c.start.seconds <= start + eps && c.end.seconds > start + eps) hitPlayhead = true;
  }
  return hitPlayhead;
};

// Adds one stereo audio track at the end via the unsupported QE DOM.
// Returns the new Track or null if it didn't work (e.g. a future Premiere broke it).
SFX.addAudioTrack = function (seq) {
  try {
    var before = {};
    for (var i = 0; i < seq.audioTracks.numTracks; i++) before[seq.audioTracks[i].id] = true;
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return null;
    // (videoCount, videoAfter, audioCount, audioType 1=stereo, audioAfter, submixCount, submixType)
    qeSeq.addTracks(0, 0, 1, 1, seq.audioTracks.numTracks, 0, 0);
    for (var j = 0; j < seq.audioTracks.numTracks; j++) {
      if (!before[seq.audioTracks[j].id]) return seq.audioTracks[j];
    }
  } catch (e) { /* QE unavailable */ }
  return null;
};

// The clip we just placed: on this track, starting at `start`, from this project item.
SFX.findPlaced = function (track, startSec, item) {
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    if (Math.abs(c.start.seconds - startSec) < 0.002 && c.projectItem && c.projectItem.nodeId === item.nodeId) return c;
  }
  return null;
};

SFX.trackIndex = function (seq, track) {
  for (var i = 0; i < seq.audioTracks.numTracks; i++) if (seq.audioTracks[i].id === track.id) return i;
  return -1;
};

// Clip Volume > Level. Premiere stores it as linear gain where 0 dB = 10^(-15/20) ≈ 0.1778.
SFX.setVolume = function (trackItem, db) {
  db = Number(db) || 0;
  if (db === 0) return true;
  if (db < SFX.MIN_DB) db = SFX.MIN_DB;
  if (db > SFX.MAX_DB) db = SFX.MAX_DB;
  for (var i = 0; i < trackItem.components.numItems; i++) {
    var comp = trackItem.components[i];
    // matchName is language-independent: "Internal Volume Stereo/Mono/…", not "Internal Channel Volume"
    if (comp.matchName.indexOf('Internal Volume') === 0 && comp.properties.numItems > 1) {
      comp.properties[1].setValue(Math.pow(10, (db - 15) / 20), true); // [0] Bypass, [1] Level
      return true;
    }
  }
  return false;
};

// ---------- panel entry points

// Health check: host info as JSON.
SFX.ping = function () {
  var projectName = (app.project && app.project.name) ? app.project.name : '';
  var seq = app.project ? app.project.activeSequence : null;
  return SFX.json({ ok: true, version: app.version, project: projectName, sequence: seq ? seq.name : '' });
};

// Import (or reuse) a sound and place it at the playhead on the first free audio track.
SFX.addAtPlayhead = function (path, db) {
  try {
    if (!app.project) return SFX.fail('No project open');
    var seq = app.project.activeSequence;
    if (!seq) return SFX.fail('No active sequence — open a sequence in the Timeline first');
    if (!new File(path).exists) return SFX.fail('File missing or moved: ' + SFX.fileName(path));

    var got = SFX.getOrImport(path);
    if (got.error) return SFX.fail(got.error);
    var item = got.item;

    var pos = seq.getPlayerPosition().seconds;
    var end = pos + SFX.itemDuration(item);
    var target = null;
    var mode = 'free';

    for (var t = 0; t < seq.audioTracks.numTracks; t++) {
      var tr = seq.audioTracks[t];
      if (!SFX.trackLocked(tr) && SFX.trackFree(tr, pos, end)) { target = tr; break; }
    }

    if (!target) {
      target = SFX.addAudioTrack(seq);
      if (target) mode = 'new-track';
    }

    if (!target) {
      var sfxIds = SFX.binNodeIds(SFX.getBin());
      for (var u = 0; u < seq.audioTracks.numTracks; u++) {
        var tr2 = seq.audioTracks[u];
        if (!SFX.trackLocked(tr2) && SFX.trackOnlySfxAt(tr2, pos, end, sfxIds)) { target = tr2; mode = 'overwrite'; break; }
      }
    }

    if (!target) return SFX.fail('No free audio track at the playhead — add a track and try again');

    target.overwriteClip(item, pos);
    var placed = SFX.findPlaced(target, pos, item);
    if (!placed) return SFX.fail('Premiere did not place the clip (track type mismatch?)');
    var volOk = SFX.setVolume(placed, db);

    return SFX.json({
      ok: true,
      track: 'A' + (SFX.trackIndex(seq, target) + 1),
      mode: mode,
      imported: got.imported,
      volumeSet: volOk,
      name: item.name
    });
  } catch (e) {
    return SFX.fail('Premiere error: ' + e.toString());
  }
};

// ---------- drag & drop support
// Premiere handles the drop itself (it only receives a file path). Before the drag we record
// what's already there; afterwards we find what the drop created, move new project items into
// the SFX bin and apply the dB level to new timeline clips.

SFX._drag = null;

SFX.clipKey = function (trackIdx, c) {
  return trackIdx + ':' + c.start.ticks + ':' + (c.projectItem ? c.projectItem.nodeId : '');
};

SFX.clipsWithPath = function (seq, path) {
  var want = SFX.normPath(path);
  var out = [];
  if (!seq) return out;
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var tr = seq.audioTracks[t];
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i];
      var pi = c.projectItem;
      var mp = '';
      try { mp = pi ? pi.getMediaPath() : ''; } catch (e) { /* ignore */ }
      if (mp && SFX.normPath(mp) === want) out.push({ key: SFX.clipKey(t, c), clip: c });
    }
  }
  return out;
};

SFX.dragBegin = function (path) {
  try {
    var snap = { path: path, items: {}, clips: {}, seqId: '' };
    var items = SFX.findItems(path);
    for (var i = 0; i < items.length; i++) snap.items[items[i].nodeId] = true;
    var seq = app.project.activeSequence;
    if (seq) {
      snap.seqId = seq.sequenceID;
      var clips = SFX.clipsWithPath(seq, path);
      for (var j = 0; j < clips.length; j++) snap.clips[clips[j].key] = true;
    }
    SFX._drag = snap;
    return SFX.json({ ok: true });
  } catch (e) {
    return SFX.fail(e.toString());
  }
};

// Polled by the panel after a drag. Returns counts of what it handled this time.
SFX.dragCheck = function (db) {
  try {
    var snap = SFX._drag;
    if (!snap) return SFX.json({ ok: true, items: 0, clips: 0 });
    var movedItems = 0, newClips = 0;

    var items = SFX.findItems(snap.path);
    var bin = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (snap.items[it.nodeId]) continue;
      snap.items[it.nodeId] = true;
      if (!bin) bin = SFX.getBin();
      if (bin && !SFX.binNodeIds(bin)[it.nodeId]) { try { it.moveBin(bin); } catch (e1) { /* ignore */ } }
      movedItems++;
    }

    var seq = app.project.activeSequence;
    if (seq && seq.sequenceID === snap.seqId) {
      var clips = SFX.clipsWithPath(seq, snap.path);
      for (var j = 0; j < clips.length; j++) {
        if (snap.clips[clips[j].key]) continue;
        snap.clips[clips[j].key] = true;
        SFX.setVolume(clips[j].clip, db);
        newClips++;
      }
    }
    return SFX.json({ ok: true, items: movedItems, clips: newClips });
  } catch (e) {
    return SFX.fail(e.toString());
  }
};

SFX.dragEnd = function () {
  SFX._drag = null;
  return SFX.json({ ok: true });
};
