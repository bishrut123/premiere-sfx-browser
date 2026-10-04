/* Waveform preview pane: decodes the selected sound, draws min/max peaks per channel,
 * shows a playhead and lets you click/drag to seek. Reads files only. */
'use strict';

window.Waveform = class Waveform {
  constructor(container, { getProgress, getDuration, getCurrentTime, onSeek, isPlaying, onTogglePlay }) {
    this.el = container;
    this.getProgress = getProgress;
    this.getDuration = getDuration;
    this.getCurrentTime = getCurrentTime;
    this.onSeek = onSeek;
    this.isPlaying = isPlaying;

    this.fs = nodeRequire('fs');
    this.path = nodeRequire('path');
    this.ctx = null;                 // AudioContext, created lazily
    this.cache = new Map();          // key -> peaks (small LRU)
    this.peaks = null;               // { channels: [Float32Array(min,max pairs)], duration }
    this.key = null;
    this.token = 0;

    this.el.innerHTML =
      '<div class="wf-canvas-wrap"><canvas></canvas><div class="wf-playhead"></div>' +
      '<div class="wf-msg"></div></div>' +
      '<div class="wf-bar"><button class="wf-play icon-btn" title="Play/Pause (Space)">▶</button>' +
      '<span class="wf-time"><span class="wf-cur">0:00.00</span> / <span class="wf-dur">0:00.00</span></span></div>';
    this.wrap = this.el.querySelector('.wf-canvas-wrap');
    this.canvas = this.el.querySelector('canvas');
    this.playhead = this.el.querySelector('.wf-playhead');
    this.msg = this.el.querySelector('.wf-msg');
    this.curEl = this.el.querySelector('.wf-cur');
    this.durEl = this.el.querySelector('.wf-dur');
    this.playBtn = this.el.querySelector('.wf-play');
    this.playBtn.addEventListener('click', () => onTogglePlay());

    new ResizeObserver(() => this.draw()).observe(this.wrap);

    // Click or drag on the waveform to seek.
    const seekAt = (e) => {
      const r = this.wrap.getBoundingClientRect();
      this.onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    };
    this.wrap.addEventListener('mousedown', (e) => {
      if (!this.key) return;
      seekAt(e);
      const move = (ev) => seekAt(ev);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  static fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  clear() {
    this.token++;
    this.key = null;
    this.peaks = null;
    this.el.hidden = true;
  }

  // entry: library entry; file: absolute path
  async load(entry, file) {
    this.el.hidden = false;
    if (this.key === entry.key) return;
    const my = ++this.token;
    this.key = entry.key;
    this.peaks = this.cache.get(entry.key) || null;
    this.msg.textContent = this.peaks ? '' : 'Loading waveform…';
    this.draw();
    if (this.peaks) return;

    try {
      const stat = await this.fs.promises.stat(file);
      if (stat.size > 200 * 1024 * 1024) throw new Error('file too large for a waveform');
      let data;
      const ext = this.path.extname(file).toLowerCase();
      if (ext === '.aif' || ext === '.aiff') {
        data = await (await Aiff.toWavBlob(file)).arrayBuffer();
      } else {
        const buf = await this.fs.promises.readFile(file);
        data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
      if (my !== this.token) return;
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await this.ctx.decodeAudioData(data);
      if (my !== this.token) return;
      const peaks = Waveform.computePeaks(audio, 1200);
      this.cache.set(entry.key, peaks);
      if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value);
      this.peaks = peaks;
      this.msg.textContent = '';
    } catch (e) {
      if (my !== this.token) return;
      this.peaks = null;
      this.msg.textContent = 'Waveform unavailable';
    }
    this.draw();
  }

  // Min/max per bucket for up to 2 channels (stereo shown as two lanes, like Premiere).
  static computePeaks(audio, buckets) {
    const chCount = Math.min(2, audio.numberOfChannels);
    const channels = [];
    for (let c = 0; c < chCount; c++) {
      const d = audio.getChannelData(c);
      const out = new Float32Array(buckets * 2);
      const size = d.length / buckets;
      for (let b = 0; b < buckets; b++) {
        const start = Math.floor(b * size);
        const end = Math.max(start + 1, Math.floor((b + 1) * size));
        let min = 1, max = -1;
        for (let i = start; i < end && i < d.length; i++) {
          const v = d[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min > max) { min = 0; max = 0; }
        out[b * 2] = min;
        out[b * 2 + 1] = max;
      }
      channels.push(out);
    }
    return { channels, duration: audio.duration };
  }

  draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const g = this.canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!this.peaks) return;

    const lanes = this.peaks.channels.length;
    const laneH = h / lanes;
    g.fillStyle = '#d6d6d6';
    this.peaks.channels.forEach((p, li) => {
      const buckets = p.length / 2;
      const mid = laneH * li + laneH / 2;
      const amp = laneH / 2 - 2;
      for (let x = 0; x < w; x++) {
        // combine all buckets that fall into this pixel column
        const b0 = Math.floor(x / w * buckets);
        const b1 = Math.max(b0 + 1, Math.floor((x + 1) / w * buckets));
        let min = 1, max = -1;
        for (let b = b0; b < b1 && b < buckets; b++) {
          if (p[b * 2] < min) min = p[b * 2];
          if (p[b * 2 + 1] > max) max = p[b * 2 + 1];
        }
        if (min > max) continue;
        const y1 = mid - max * amp;
        const y2 = mid - min * amp;
        g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
      if (li > 0) { // lane divider
        g.fillStyle = '#333';
        g.fillRect(0, laneH * li, w, 1);
        g.fillStyle = '#d6d6d6';
      }
    });
    this.update();
  }

  // Called every frame: move the playhead and update the time readout.
  update() {
    if (this.el.hidden) return;
    const dur = this.getDuration() || (this.peaks ? this.peaks.duration : 0);
    const p = this.getProgress();
    this.playhead.style.left = (p * 100) + '%';
    this.curEl.textContent = Waveform.fmt(this.getCurrentTime());
    this.durEl.textContent = Waveform.fmt(dur);
    const icon = this.isPlaying() ? '❚❚' : '▶';
    if (this.playBtn.textContent !== icon) this.playBtn.textContent = icon;
  }
};
