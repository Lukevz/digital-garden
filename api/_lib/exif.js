/**
 * Minimal JPEG EXIF reader — no dependencies.
 *
 * Only the handful of tags the photo detail panel shows are decoded (camera,
 * lens, exposure triangle, date, pixel size). EXIF lives in the APP1 segment at
 * the head of the file, so `readExif()` reads a fixed prefix rather than the
 * whole image — the legacy DSCF originals in content/photos/ are 5MB+ and the
 * grid listing asks about all of them at once.
 */
import { openSync, readSync, closeSync, statSync } from 'fs';

// APP1 is capped at 64KB by the JPEG spec, but it is not always the first
// segment (some files lead with an ICC profile or Photoshop resource block),
// so read enough to walk past a couple of those.
const HEAD_BYTES = 256 * 1024;

// TIFF tag ids we care about, per IFD.
const TAGS = {
  0x010f: 'make',
  0x0110: 'model',
  0x8769: '_exifIFD',
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x8833: 'isoSpeed',            // some bodies write ISO here instead
  0x9003: 'dateTimeOriginal',
  0x9004: 'dateTimeDigitized',
  0x0132: 'dateTime',            // IFD0 fallback
  0x920a: 'focalLength',
  0xa405: 'focalLength35mm',
  0xa434: 'lensModel',
};

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function readValue(buf, tiffStart, offset, type, count, le) {
  const size = TYPE_SIZE[type];
  if (!size) return null;
  const bytes = size * count;
  // Values over 4 bytes live elsewhere in the TIFF block and the field holds a
  // pointer to them — relative to the TIFF header, not the file.
  const at = bytes > 4
    ? tiffStart + (le ? buf.readUInt32LE(offset + 8) : buf.readUInt32BE(offset + 8))
    : offset + 8;
  if (at < 0 || at + bytes > buf.length) return null;

  if (type === 2) return buf.toString('latin1', at, at + count).replace(/\0.*$/, '').trim();

  const one = (i) => {
    const p = at + i * size;
    switch (type) {
      case 1: case 7: return buf.readUInt8(p);
      case 3: return le ? buf.readUInt16LE(p) : buf.readUInt16BE(p);
      case 4: return le ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
      case 5: {
        const n = le ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
        const d = le ? buf.readUInt32LE(p + 4) : buf.readUInt32BE(p + 4);
        return d ? n / d : null;
      }
      case 6: return buf.readInt8(p);
      case 8: return le ? buf.readInt16LE(p) : buf.readInt16BE(p);
      case 9: return le ? buf.readInt32LE(p) : buf.readInt32BE(p);
      case 10: {
        const n = le ? buf.readInt32LE(p) : buf.readInt32BE(p);
        const d = le ? buf.readInt32LE(p + 4) : buf.readInt32BE(p + 4);
        return d ? n / d : null;
      }
      default: return null;
    }
  };
  if (count === 1) return one(0);
  const out = [];
  for (let i = 0; i < count; i++) out.push(one(i));
  return out;
}

function readIFD(buf, tiffStart, ifdOffset, le, out) {
  const base = tiffStart + ifdOffset;
  if (base + 2 > buf.length) return;
  const entries = le ? buf.readUInt16LE(base) : buf.readUInt16BE(base);
  for (let i = 0; i < entries; i++) {
    const e = base + 2 + i * 12;
    if (e + 12 > buf.length) return;
    const tag = le ? buf.readUInt16LE(e) : buf.readUInt16BE(e);
    const name = TAGS[tag];
    if (!name) continue;
    const type = le ? buf.readUInt16LE(e + 2) : buf.readUInt16BE(e + 2);
    const count = le ? buf.readUInt32LE(e + 4) : buf.readUInt32BE(e + 4);
    if (count > 4096) continue;
    const value = readValue(buf, tiffStart, e, type, count, le);
    // Sub-IFD pointers are offsets from the TIFF header, like the field values.
    if (name === '_exifIFD') {
      if (typeof value === 'number') readIFD(buf, tiffStart, value, le, out);
      continue;
    }
    if (value !== null && value !== undefined && value !== '') out[name] = value;
  }
}

/** Pixel dimensions come from the SOF frame header, not EXIF — always accurate. */
function scanJpeg(buf) {
  const out = { exif: null, width: null, height: null };
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return out;
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;              // start of scan / end
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    const start = i + 4;
    if (marker === 0xe1 && buf.toString('latin1', start, start + 4) === 'Exif' && !out.exif) {
      out.exif = { tiffStart: start + 6 };
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      out.height = buf.readUInt16BE(start + 1);
      out.width = buf.readUInt16BE(start + 3);
    }
    i += 2 + len;
  }
  return out;
}

function formatShutter(sec) {
  if (!sec || sec <= 0) return null;
  if (sec >= 1) return `${Number(sec.toFixed(1))}s`;
  return `1/${Math.round(1 / sec)}s`;
}

function formatExifDate(raw) {
  // EXIF writes "YYYY:MM:DD HH:MM:SS".
  const m = String(raw).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/**
 * Read the display-ready EXIF summary for a JPEG.
 * Returns null when the file has no usable metadata at all.
 */
export function readExif(filePath) {
  let fd;
  try {
    const size = statSync(filePath).size;
    const buf = Buffer.allocUnsafe(Math.min(HEAD_BYTES, size));
    fd = openSync(filePath, 'r');
    readSync(fd, buf, 0, buf.length, 0);

    const scan = scanJpeg(buf);
    const raw = {};
    if (scan.exif) {
      const t = scan.exif.tiffStart;
      const order = buf.toString('latin1', t, t + 2);
      const le = order === 'II';
      if (le || order === 'MM') {
        const first = le ? buf.readUInt32LE(t + 4) : buf.readUInt32BE(t + 4);
        readIFD(buf, t, first, le, raw);
      }
    }
    return summarize(raw, scan);
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch (e) { /* ignore */ } }
  }
}

function summarize(raw, scan) {
  const make = typeof raw.make === 'string' ? raw.make.trim() : '';
  let model = typeof raw.model === 'string' ? raw.model.trim() : '';
  // "FUJIFILM" + "X-T30" reads better than "FUJIFILM FUJIFILM X-T30".
  const brand = make.split(/\s+/)[0] || '';
  if (brand && model.toUpperCase().startsWith(brand.toUpperCase())) model = model.slice(brand.length).trim();
  const camera = [brand, model].filter(Boolean).join(' ') || null;

  const iso = raw.iso ?? raw.isoSpeed;
  const focal = typeof raw.focalLength === 'number' ? raw.focalLength : null;
  const date = formatExifDate(raw.dateTimeOriginal || raw.dateTimeDigitized || raw.dateTime || '');

  const out = {
    camera,
    lens: typeof raw.lensModel === 'string' && raw.lensModel ? raw.lensModel : null,
    focal: focal ? `${Number(focal.toFixed(1))}mm` : null,
    focal35: typeof raw.focalLength35mm === 'number' ? `${Math.round(raw.focalLength35mm)}mm` : null,
    aperture: typeof raw.fNumber === 'number' && raw.fNumber > 0 ? `ƒ/${Number(raw.fNumber.toFixed(1))}` : null,
    shutter: formatShutter(typeof raw.exposureTime === 'number' ? raw.exposureTime : null),
    iso: typeof iso === 'number' ? `ISO ${iso}` : (Array.isArray(iso) && typeof iso[0] === 'number' ? `ISO ${iso[0]}` : null),
    date: date ? date.iso : null,
    time: date ? date.time : null,
    dimensions: scan.width && scan.height ? `${scan.width} × ${scan.height}` : null,
  };
  return Object.values(out).some(Boolean) ? out : null;
}

// Listing requests re-read the same files on every load; key the result on the
// file identity so repeated grid loads cost one stat each.
const cache = new Map();

export function readExifCached(filePath) {
  let key;
  try {
    const s = statSync(filePath);
    key = `${filePath}:${s.mtimeMs}:${s.size}`;
  } catch (e) {
    return null;
  }
  if (cache.has(key)) return cache.get(key);
  const value = readExif(filePath);
  if (cache.size > 500) cache.clear();
  cache.set(key, value);
  return value;
}
