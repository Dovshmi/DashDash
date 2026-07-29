import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const outputDir = new URL('../public/icons/', import.meta.url);
const sizes = [
  ['icon-32.png', 32, 1],
  ['icon-64.png', 64, 1],
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-192-maskable.png', 192, 0.78],
  ['icon-512-maskable.png', 512, 0.78],
];

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function capsuleDistance(x, y, centerX, scale) {
  const directionX = -0.36;
  const directionY = 0.93;
  const relativeX = x - centerX;
  const relativeY = y;
  const along = relativeX * directionX + relativeY * directionY;
  const across = relativeX * -directionY + relativeY * directionX;
  const halfLength = 0.58 * scale;
  const radius = 0.135 * scale;
  const segmentDistance = Math.max(Math.abs(along) - halfLength, 0);
  return Math.hypot(segmentDistance, across) - radius;
}

function renderIcon(size, symbolScale) {
  const pixels = Buffer.alloc(size * size * 4);
  const edge = 2.2 / size;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = ((px + 0.5) / size) * 2 - 1;
      const y = ((py + 0.5) / size) * 2 - 1;
      const radial = Math.max(0, 1 - Math.hypot(x, y) / 1.45);
      const vignette = smoothstep(1.35, 0.2, Math.hypot(x, y));

      let red = 55 + radial * 23 + vignette * 8;
      let green = 56 + radial * 24 + vignette * 8;
      let blue = 60 + radial * 27 + vignette * 10;

      const distances = [
        capsuleDistance(x, y, -0.245 * symbolScale, symbolScale),
        capsuleDistance(x, y, 0.245 * symbolScale, symbolScale),
      ];
      const distance = Math.min(...distances);
      const glow = Math.exp(-Math.pow(Math.max(distance, 0) / (0.19 * symbolScale), 2));
      red += glow * 16;
      green += glow * 90;
      blue += glow * 175;

      const coverage = 1 - smoothstep(-edge, edge, distance);
      if (coverage > 0) {
        const vertical = clamp((y + 0.72 * symbolScale) / (1.44 * symbolScale), 0, 1);
        const fillRed = mix(48, 34, vertical);
        const fillGreen = mix(190, 63, vertical);
        const fillBlue = mix(255, 239, vertical);
        red = mix(red, fillRed, coverage);
        green = mix(green, fillGreen, coverage);
        blue = mix(blue, fillBlue, coverage);

        const outline = 1 - smoothstep(-edge * 2.6, -edge * 0.2, distance);
        red = mix(red, 28, outline * 0.2);
        green = mix(green, 93, outline * 0.2);
        blue = mix(blue, 219, outline * 0.2);
      }

      const index = (py * size + px) * 4;
      pixels[index] = Math.round(clamp(red));
      pixels[index + 1] = Math.round(clamp(green));
      pixels[index + 2] = Math.round(clamp(blue));
      pixels[index + 3] = 255;
    }
  }

  return encodePng(size, size, pixels);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    pixels.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outputDir, { recursive: true });
await Promise.all(
  sizes.map(async ([fileName, size, symbolScale]) => {
    await writeFile(new URL(fileName, outputDir), renderIcon(size, symbolScale));
  }),
);

console.log(`Generated ${sizes.length} DashDash app icons.`);
