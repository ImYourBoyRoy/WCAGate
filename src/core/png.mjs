// ./src/core/png.mjs
/**
 * Minimal dependency-free PNG decoder for browser screenshots.
 *
 * Purpose: the contrast resolver samples rendered pixels behind text. Chromium, Firefox, and WebKit
 * emit non-interlaced 8-bit PNGs (grayscale, RGB, palette, or RGBA), which is all this supports.
 * Anything else throws so the caller can leave the finding unresolved instead of guessing.
 */

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const MAX_PIXELS = 64_000_000;

/**
 * @param {Buffer | Uint8Array} input
 * @returns {{ width: number, height: number, rgba: Uint8Array }} Row-major RGBA, alpha 255 when absent.
 */
export function decodePng(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG image');

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const data = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new Error('Truncated PNG chunk');
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12]
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (!header) throw new Error('PNG is missing IHDR');
  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${header.colorType}`);
  if (header.bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error('Interlaced PNG is not supported');
  if (!header.width || !header.height || header.width * header.height > MAX_PIXELS) {
    throw new Error('PNG dimensions are empty or too large to sample');
  }
  if (header.colorType === 3 && !palette) throw new Error('Palette PNG is missing PLTE');

  const { width, height } = header;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(data));
  if (raw.length < (stride + 1) * height) throw new Error('PNG pixel data is truncated');

  const pixels = new Uint8Array(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? pixels[target + index - channels] : 0;
      const up = row > 0 ? pixels[target - stride + index] : 0;
      const upLeft = row > 0 && index >= channels ? pixels[target - stride + index - channels] : 0;
      pixels[target + index] = (raw[source + index] + predictor(filter, left, up, upLeft)) & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const from = pixel * channels;
    const to = pixel * 4;
    switch (header.colorType) {
      case 0:
        rgba[to] = rgba[to + 1] = rgba[to + 2] = pixels[from];
        rgba[to + 3] = 255;
        break;
      case 2:
        rgba[to] = pixels[from];
        rgba[to + 1] = pixels[from + 1];
        rgba[to + 2] = pixels[from + 2];
        rgba[to + 3] = 255;
        break;
      case 3: {
        const entry = pixels[from] * 3;
        rgba[to] = palette[entry] ?? 0;
        rgba[to + 1] = palette[entry + 1] ?? 0;
        rgba[to + 2] = palette[entry + 2] ?? 0;
        rgba[to + 3] = transparency?.[pixels[from]] ?? 255;
        break;
      }
      case 4:
        rgba[to] = rgba[to + 1] = rgba[to + 2] = pixels[from];
        rgba[to + 3] = pixels[from + 1];
        break;
      default:
        rgba[to] = pixels[from];
        rgba[to + 1] = pixels[from + 1];
        rgba[to + 2] = pixels[from + 2];
        rgba[to + 3] = pixels[from + 3];
    }
  }
  return { width, height, rgba };
}

function predictor(filter, left, up, upLeft) {
  switch (filter) {
    case 0: return 0;
    case 1: return left;
    case 2: return up;
    case 3: return (left + up) >> 1;
    case 4: {
      const estimate = left + up - upLeft;
      const pa = Math.abs(estimate - left);
      const pb = Math.abs(estimate - up);
      const pc = Math.abs(estimate - upLeft);
      if (pa <= pb && pa <= pc) return left;
      return pb <= pc ? up : upLeft;
    }
    default: throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

/** Encodes RGBA for tests and fixtures (filter 0, no interlace). */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + row * stride, stride).copy(raw, row * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}
