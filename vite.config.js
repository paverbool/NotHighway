import fs from 'node:fs';
import { defineConfig } from 'vite';
import { SIGN_URL, CONTACT_URL, SITE_URL, UPDATED } from './site.config.js';

const manifestPath = new URL('./images.manifest.json', import.meta.url);

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function contactText(url) {
  return url
    .replace(/^(mailto|tel):/, '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/$/, '');
}

function formatDate(iso) {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return {
    iso: d.toISOString().slice(0, 10),
    text: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  };
}

// <nh-picture name="hero" alt="..." sizes="..." eager class="..."></nh-picture>
// перетворюється на <picture> з WebP, запасним JPEG, srcset, width/height і lazy loading.
function renderPicture(attrString, manifest) {
  const attrs = {};
  for (const m of attrString.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? true;

  const img = manifest[attrs.name];
  if (!img) throw new Error(`Немає зображення "${attrs.name}" у images.manifest.json. Запустіть npm run images.`);
  // alt="" дозволено явно — для декоративних кадрів.
  if (attrs.alt === undefined || attrs.alt === true) throw new Error(`Зображенню "${attrs.name}" бракує alt.`);

  const sizes = attrs.sizes || '100vw';
  const srcset = (ext) => img.widths.map((w) => `/img/${attrs.name}-${w}.${ext} ${w}w`).join(', ');
  const fallback = img.widths.find((w) => w >= 800) ?? img.widths[img.widths.length - 1];
  const loading = attrs.eager ? 'fetchpriority="high"' : 'loading="lazy"';
  const cls = attrs.class ? ` class="${esc(attrs.class)}"` : '';

  return (
    `<picture><source type="image/webp" srcset="${srcset('webp')}" sizes="${esc(sizes)}">` +
    `<img src="/img/${attrs.name}-${fallback}.jpg" srcset="${srcset('jpg')}" sizes="${esc(sizes)}" ` +
    `width="${img.width}" height="${img.height}" alt="${esc(attrs.alt)}" ${loading} decoding="async"${cls}>` +
    `</picture>`
  );
}

function sitePlugin() {
  return {
    name: 'nothighway-site',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const siteUrl = SITE_URL ? SITE_URL.replace(/\/?$/, '/') : '';
        const date = formatDate(UPDATED);
        const flags = { SIGN_URL: !!SIGN_URL, CONTACT_URL: !!CONTACT_URL, SITE_URL: !!siteUrl };

        // <!-- if:KEY --> ... <!-- endif:KEY -->  та  <!-- ifnot:KEY --> ... <!-- endif:KEY -->
        html = html.replace(
          /<!--\s*(if|ifnot):(\w+)\s*-->([\s\S]*?)<!--\s*endif:\2\s*-->/g,
          (_, kind, key, body) => ((kind === 'if') === !!flags[key] ? body : '')
        );

        const values = {
          SIGN_HREF: SIGN_URL || '#help',
          SIGN_URL,
          CONTACT_URL,
          CONTACT_TEXT: CONTACT_URL ? contactText(CONTACT_URL) : '',
          SITE_URL: siteUrl,
          UPDATED: date.text,
          UPDATED_ISO: date.iso,
        };
        html = html.replace(/%(SIGN_HREF|SIGN_URL|CONTACT_URL|CONTACT_TEXT|SITE_URL|UPDATED|UPDATED_ISO)%/g, (_, k) =>
          esc(values[k])
        );

        html = html.replace(/<nh-picture\s+([^>]*?)\s*\/?>\s*(?:<\/nh-picture>)?/g, (_, a) => renderPicture(a, manifest));

        const placeholders = Object.entries(manifest).filter(([, v]) => v.placeholder).map(([, v]) => v.source);
        if (placeholders.length) console.warn(`\n[site] На сторінці заглушки замість фото: ${placeholders.join(', ')}`);
        if (!siteUrl) console.warn('\n[site] SITE_URL порожній: картинка Open Graph не розгорнеться в месенджерах.\n');

        return html;
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sitePlugin()],
});
