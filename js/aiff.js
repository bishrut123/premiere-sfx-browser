/* AIFF -> WAV conversion in memory, for preview only (the panel's Chromium can't play AIFF).
 * Reads the file; never writes anything. Handles uncompressed PCM AIFF and the
 * common AIFC variants (NONE, sowt, fl32). */
'use strict';

window.Aiff = (() => {
  const fs = nodeRequire('fs');

  // 80-bit IEEE 754 extended -> number (AIFF stores the sample rate this way).
  function readExtended(buf, o) {
    const exp = ((buf[o] & 0x7f) << 8 | buf[o + 1]) - 16383;
    const hi = buf.readUInt32BE(o + 2);
    const lo = buf.readUInt32BE(o + 6);
    const sign = buf[o] & 0x80 ? -1 : 1;
    return sign * (hi * Math.pow(2, exp - 31) + lo * Math.pow(2, exp - 63));
  }

  // Returns a Blob (audio/wav). Throws Error with a short message if unsupported.
  async function toWavBlob(filePath) {
    const buf = await fs.promises.readFile(filePath);
    if (buf.toString('ascii', 0, 4) !== 'FORM') throw new Error('not an AIFF file');
    const form = buf.toString('ascii', 8, 12);
    if (form !== 'AIFF' && form !== 'AIFC') throw new Error('not an AIFF file');

    let channels, frames, bits, rate, comp = 'NONE', data = null;
    let o = 12;
    while (o + 8 <= buf.length) {
      const id = buf.toString('ascii', o, o + 4);
      const size = buf.readUInt32BE(o + 4);
      const body = o + 8;
      if (id === 'COMM') {
        channels = buf.readInt16BE(body);
        frames = buf.readUInt32BE(body + 2);
        bits = buf.readInt16BE(body + 6);
        rate = readExtended(buf, body + 8);
        if (form === 'AIFC') comp = buf.toString('ascii', body + 18, body + 22);
      } else if (id === 'SSND') {
        const offset = buf.readUInt32BE(body);
        data = buf.subarray(body + 8 + offset, body + size);
      }
      o = body + size + (size & 1); // chunks are padded to even length
    }
    if (!channels || !data) throw new Error('damaged AIFF file');

    const bytes = Math.ceil(bits / 8);
    const isFloat = comp === 'fl32' || comp === 'FL32';
    const littleEndian = comp === 'sowt';
    if (!(comp === 'NONE' || littleEndian || isFloat)) throw new Error(`AIFF compression “${comp}” not supported`);

    const len = Math.min(data.length, frames * channels * bytes);
    const pcm = Buffer.alloc(len);
    if (bytes === 1) {
      for (let i = 0; i < len; i++) pcm[i] = (data[i] + 128) & 0xff; // signed -> unsigned
    } else if (littleEndian) {
      data.copy(pcm, 0, 0, len);
    } else {
      for (let i = 0; i + bytes <= len; i += bytes) {
        for (let b = 0; b < bytes; b++) pcm[i + b] = data[i + bytes - 1 - b]; // byte swap
      }
    }

    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + len, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(isFloat ? 3 : 1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(Math.round(rate), 24);
    header.writeUInt32LE(Math.round(rate) * channels * bytes, 28);
    header.writeUInt16LE(channels * bytes, 32);
    header.writeUInt16LE(bytes * 8, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(len, 40);

    return new Blob([header, pcm], { type: 'audio/wav' });
  }

  return { toWavBlob };
})();
