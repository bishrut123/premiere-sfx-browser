/* One shared audio element for previews: starting a sound stops the previous one. */
'use strict';

window.Player = (() => {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const url = nodeRequire('url');

  const audio = new Audio();
  audio.preload = 'auto';
  let current = null;   // entry being previewed
  let blobUrl = null;   // for AIFF previews converted in memory
  let token = 0;        // guards against a slow AIFF load finishing after a newer click
  const listeners = { change: [], error: [] };

  const emit = (type, ...args) => listeners[type].forEach((fn) => fn(...args));
  const on = (type, fn) => listeners[type].push(fn);

  function releaseBlob() {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  }

  async function play(entry) {
    const my = ++token;
    audio.pause();
    current = entry;
    emit('change');

    const file = Library.fullPath(entry);
    if (!fs.existsSync(file)) {
      const offline = !entry.root.online || !fs.existsSync(entry.root.path);
      stopQuiet();
      emit('error', offline
        ? `Library “${entry.root.name}” is not connected`
        : `File missing or moved: ${entry.name} — click ↻ to rescan`);
      return;
    }

    try {
      let src;
      const ext = path.extname(file).toLowerCase();
      if (ext === '.aif' || ext === '.aiff') {
        const blob = await Aiff.toWavBlob(file);
        if (my !== token) return;
        releaseBlob();
        src = blobUrl = URL.createObjectURL(blob);
      } else {
        releaseBlob();
        src = url.pathToFileURL(file).href;
      }
      audio.src = src;
      audio.currentTime = 0;
      await audio.play();
    } catch (e) {
      if (my !== token || e.name === 'AbortError') return; // superseded by a newer click
      stopQuiet();
      emit('error', `Can't preview ${entry.name}: ${e.message || 'unsupported format'}`);
    }
  }

  // Space: pause/resume the current sound, or start the given entry if it isn't current.
  function toggle(entry) {
    if (!current || (entry && entry.key !== current.key)) {
      if (entry) play(entry);
      return;
    }
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  // Jump to a position (0–1) in the current sound and keep/start playing from there.
  function seek(fraction) {
    if (!current || !audio.duration) return;
    audio.currentTime = fraction * audio.duration;
    if (audio.paused) audio.play().catch(() => {});
  }

  function stopQuiet() {
    token++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    releaseBlob();
    current = null;
    emit('change');
  }

  audio.addEventListener('play', () => emit('change'));
  audio.addEventListener('pause', () => emit('change'));
  audio.addEventListener('ended', () => emit('change'));
  audio.addEventListener('error', () => {
    if (!current || !audio.getAttribute('src')) return;
    const name = current.name;
    stopQuiet();
    emit('error', `Can't preview ${name}: format not supported`);
  });

  return {
    play, toggle, seek, stop: stopQuiet, on,
    get current() { return current; },
    get playing() { return !!current && !audio.paused; },
    get progress() { return current && audio.duration ? audio.currentTime / audio.duration : 0; },
    get duration() { return current && audio.duration ? audio.duration : 0; },
    get currentTime() { return current ? audio.currentTime : 0; },
  };
})();
