// Стискає фото з ./photos у public/img: WebP + запасний JPEG у кількох ширинах.
// Оригінали не змінюються. Метадані (EXIF, зокрема GPS) у копії не потрапляють.
// Якщо оригіналу немає, створюється сіра заглушка з правильними пропорціями.
// Запуск: npm run images

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(root, 'photos');
const OUT_DIR = path.join(root, 'public', 'img');
const MANIFEST = path.join(root, 'images.manifest.json');

// name — латинська назва копії; widths — ширини для srcset;
// fallback — розмір заглушки, якщо оригіналу немає.
const IMAGES = [
  { src: 'PXL_20261114_120512638.jpg', name: 'hero', widths: [640, 960, 1280, 1920], fallback: [4032, 2268] },
  { src: 'PXL_20261114_121238975.jpg', name: 'now', widths: [480, 800, 1200, 1600], fallback: [4032, 2268] },
  { src: 'Теракотові_подушки_перед_переходом.png', alt: 'Теракотові подушки перед переходом.png', name: 'proposal', widths: [480, 800, 1200, 1600], fallback: [1672, 941] },
  { src: 'PXL_20261114_121408029.jpg', name: 'crossing-1', widths: [480, 800, 1200, 1600], fallback: [4032, 2268] },
  { src: 'PXL_20261114_121554741.jpg', name: 'crossing-2', widths: [480, 800, 1200, 1600], fallback: [4032, 2268] },
  { src: 'PXL_20260323_123023168.jpg', name: 'signs-portrait', widths: [400, 640, 900, 1200], fallback: [2268, 4032] },
  { src: 'PXL_20260322_110540738.jpg', name: 'signs-street', widths: [480, 800, 1200, 1600], fallback: [4032, 2268] },
  { src: 'PXL_20261114_120726176.jpg', name: 'curb-1', widths: [400, 640, 900, 1200], fallback: [2268, 4032] },
  { src: 'PXL_20261114_120730461.jpg', name: 'curb-2', widths: [400, 640, 900, 1200], fallback: [2268, 4032] },
  { src: 'PXL_20261114_121234036.jpg', name: 'curb-3', widths: [480, 800, 1200, 1600], fallback: [4032, 2268] },
  { src: 'night.jpg', name: 'night', widths: [480, 800, 1200, 1600], fallback: [1920, 1080] },
];

// Вотермарк «Харків для Людей» (лого v3_4_1 у колі, 1024 px) з брендбука.
const WATERMARK = path.join(root, 'brand', 'watermark.png');

// Картинка для Open Graph / Twitter Card.
const OG = { from: 'hero', name: 'og', width: 1200, height: 630 };

const WEBP = { quality: 72, effort: 5 };
const JPEG = { quality: 76, mozjpeg: true, progressive: true };

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function findSource(img) {
  for (const candidate of [img.src, img.alt].filter(Boolean)) {
    const p = path.join(SRC_DIR, candidate);
    if (await exists(p)) return p;
  }
  return null;
}

function placeholderSvg(w, h, label) {
  const fs1 = Math.round(w / 28);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#cfc8bf"/>
  <rect x="${w * 0.02}" y="${h * 0.02}" width="${w * 0.96}" height="${h * 0.96}" fill="none" stroke="#9c948a" stroke-width="${Math.max(2, w / 400)}" stroke-dasharray="${w / 60} ${w / 90}"/>
  <text x="50%" y="47%" text-anchor="middle" font-family="sans-serif" font-size="${fs1}" fill="#4a4540">Заглушка: немає фото</text>
  <text x="50%" y="${47 + 9}%" text-anchor="middle" font-family="monospace" font-size="${Math.round(fs1 * 0.8)}" fill="#4a4540">${label}</text>
</svg>`);
}

async function loadBase(img) {
  const file = await findSource(img);
  if (file) {
    // rotate() без аргументів враховує EXIF-орієнтацію телефона.
    const buf = await sharp(file).rotate().toBuffer();
    return { buf, placeholder: false };
  }
  const [w, h] = img.fallback;
  const buf = await sharp(placeholderSvg(w, h, `photos/${img.src}`)).png().toBuffer();
  return { buf, placeholder: true };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const f of await fs.readdir(OUT_DIR)) {
    if (/\.(webp|jpe?g)$/.test(f)) await fs.unlink(path.join(OUT_DIR, f));
  }

  const manifest = {};
  const missing = [];
  let totalBytes = 0;

  for (const img of IMAGES) {
    const { buf, placeholder } = await loadBase(img);
    const meta = await sharp(buf).metadata();
    if (placeholder) missing.push(img.src);

    // Не збільшуємо фото: ширини, більші за оригінал, відкидаємо.
    let widths = img.widths.filter((w) => w <= meta.width);
    if (widths.length === 0) widths = [meta.width];
    if (placeholder) widths = [widths[0], widths[widths.length - 1]].filter((w, i, a) => a.indexOf(w) === i);

    for (const w of widths) {
      const pipeline = sharp(buf).resize({ width: w, withoutEnlargement: true });
      const webp = await pipeline.clone().webp(WEBP).toFile(path.join(OUT_DIR, `${img.name}-${w}.webp`));
      const jpg = await pipeline.clone().flatten({ background: '#ffffff' }).jpeg(JPEG).toFile(path.join(OUT_DIR, `${img.name}-${w}.jpg`));
      totalBytes += webp.size + jpg.size;
    }

    const largest = widths[widths.length - 1];
    manifest[img.name] = {
      source: img.src,
      placeholder,
      widths,
      width: largest,
      height: Math.round((meta.height / meta.width) * largest),
    };
    console.log(`${placeholder ? '⚠ заглушка' : '✓'} ${img.name.padEnd(15)} ← ${img.src}  [${widths.join(', ')}]`);

    if (img.name === OG.from) {
      // Вотермарк за брендбуком: лого в колі, 15% короткої сторони, 2,5% від країв, непрозорість 0.85.
      const wmSize = Math.round(Math.min(OG.width, OG.height) * 0.15);
      const margin = Math.round(Math.min(OG.width, OG.height) * 0.025);
      const composites = [];
      if (await exists(WATERMARK)) {
        const wm = await sharp(WATERMARK)
          .resize(wmSize, wmSize)
          .ensureAlpha()
          .linear([1, 1, 1, 0.85], [0, 0, 0, 0])
          .png()
          .toBuffer();
        composites.push({ input: wm, left: OG.width - wmSize - margin, top: OG.height - wmSize - margin });
      } else {
        console.warn(`⚠ Немає ${path.relative(root, WATERMARK)}: og.jpg без вотермарку`);
      }
      const ogBase = await sharp(buf)
        .resize({ width: OG.width, height: OG.height, fit: 'cover', position: 'centre' })
        .toBuffer();
      await sharp(ogBase)
        .composite(composites)
        .jpeg({ ...JPEG, quality: 80 })
        .toFile(path.join(OUT_DIR, `${OG.name}.jpg`));
      manifest[OG.name] = { source: img.src, placeholder, widths: [OG.width], width: OG.width, height: OG.height };
    }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nУсього ${(totalBytes / 1024 / 1024).toFixed(1)} МБ у public/img, маніфест: images.manifest.json`);
  if (missing.length) {
    console.log(`\nНе знайдено в ./photos (поставлено заглушки):\n  - ${missing.join('\n  - ')}\nДодайте файли й запустіть npm run images ще раз.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
