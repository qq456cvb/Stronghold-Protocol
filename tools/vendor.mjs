// Copies client vendor libraries from node_modules into public/vendor (run by `npm run vendor` / postinstall).
//
// three.js (the official 3D board scene, DESIGN §15) ships as two ES modules: three.module.js imports
// './three.core.js', so both are copied side by side and the renderer imports '/vendor/three.module.js' directly
// (no import map, no CDN — LAN play works offline). Optional packages that are not installed are skipped with a
// warning instead of failing the install.
// Preact's hooks build imports the bare specifier "preact"; it is rewritten to the sibling './preact.module.js' (the
// same URL the import map resolves "preact" to, so one Preact instance) — module graphs then load without import-map
// support (Safari < 16.4).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');

/** Bare specifiers inside vendored ES modules → their sibling vendored file. */
export const VENDOR_REWRITES = Object.freeze({ 'hooks.module.js': { preact: './preact.module.js' } });

/**
 * Rewrite `from"x"` / `from 'x'` / `import("x")` of the mapped bare specifiers in a vendored module source.
 * @param {string} src
 * @param {Record<string, string>} map
 */
export function rewriteBare(src, map) {
  let res = src;
  for (const [bare, rel] of Object.entries(map)) {
    const esc = bare.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    res = res.replace(new RegExp(`(\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\bimport\\s*)(["'])${esc}\\2`, 'g'), (_, pre, q) => `${pre}${q}${rel}${q}`);
  }
  return res;
}

/** [source under the repo root, file name in public/vendor, optional] */
export const VENDOR_FILES = Object.freeze([
  ['node_modules/pixi.js/dist/pixi.min.js', 'pixi.min.js'],
  ['node_modules/pixi-spine/dist/pixi-spine.js', 'pixi-spine.js'],
  ['node_modules/preact/dist/preact.module.js', 'preact.module.js'],
  ['node_modules/preact/hooks/dist/hooks.module.js', 'hooks.module.js'],
  ['node_modules/htm/dist/htm.module.js', 'htm.module.js'],
  ['node_modules/three/build/three.core.js', 'three.core.js', true],
  ['node_modules/three/build/three.module.js', 'three.module.js', true],
]);

/**
 * The CJK UI font, self-hosted (DESIGN §10): Noto Sans SC — the open-licence release (SIL OFL 1.1) of the Source Han Sans
 * design the official client's Chinese UI uses — from @fontsource/noto-sans-sc, the weights the stylesheets use. Browsers
 * fetch only the unicode-range slices of the characters on screen. Without it (Google Fonts unreachable, as from
 * mainland China) the UI fell back to the system font — Microsoft YaHei / PingFang — which reads clearly unlike the game.
 * Written to public/vendor/fonts/noto-sans-sc/: noto-sans-sc.css (the @font-face rules, woff2 only) + files/ + LICENSE.
 */
export const VENDOR_FONT = Object.freeze({
  pkg: 'node_modules/@fontsource/noto-sans-sc', dir: 'fonts/noto-sans-sc', css: 'noto-sans-sc.css', weights: Object.freeze([400, 500, 700, 900]),
});

/**
 * One weight's fontsource stylesheet reduced to woff2 sources (every browser the client supports reads woff2), and the
 * file names it references.
 * @param {string} css
 * @returns {{ css: string, files: string[] }}
 */
export function woff2Only(css) {
  const files = [];
  const out = css.replace(/src:\s*([^;]+);/g, (_, list) => {
    const m = list.match(/url\((?:\.\/)?files\/([^)]+\.woff2)\)\s*format\(['"]woff2['"]\)/);
    if (!m) return `src: ${list};`;
    files.push(m[1]);
    return `src: url(./files/${m[1]}) format('woff2');`;
  });
  return { css: out, files };
}

function vendorFont({ log, warn }) {
  const pkg = join(root, VENDOR_FONT.pkg);
  if (!existsSync(pkg)) { warn(`vendor: ${VENDOR_FONT.css} skipped (${VENDOR_FONT.pkg} not installed; the UI uses the system CJK font)`); return null; }
  const dir = join(out, VENDOR_FONT.dir);
  mkdirSync(join(dir, 'files'), { recursive: true });
  const parts = [`/* Noto Sans SC (SIL Open Font License 1.1, see LICENSE) — copied from @fontsource/noto-sans-sc by tools/vendor.mjs */`];
  let n = 0;
  for (const w of VENDOR_FONT.weights) {
    const { css, files } = woff2Only(readFileSync(join(pkg, `${w}.css`), 'utf8'));
    for (const f of files) { copyFileSync(join(pkg, 'files', f), join(dir, 'files', f)); n++; }
    parts.push(css);
  }
  writeFileSync(join(dir, VENDOR_FONT.css), parts.join('\n'));
  if (existsSync(join(pkg, 'LICENSE'))) copyFileSync(join(pkg, 'LICENSE'), join(dir, 'LICENSE'));
  log(`vendor: ${VENDOR_FONT.dir}/${VENDOR_FONT.css} (${n} woff2 slices)`);
  return `${VENDOR_FONT.dir}/${VENDOR_FONT.css}`;
}

export function vendor({ log = console.log, warn = console.warn } = {}) {
  mkdirSync(out, { recursive: true });
  const done = [];
  for (const [src, dst, optional] of VENDOR_FILES) {
    const from = join(root, src);
    if (optional && !existsSync(from)) { warn(`vendor: ${dst} skipped (${src} not installed; the 3D board falls back to 2D)`); continue; }
    if (VENDOR_REWRITES[dst]) writeFileSync(join(out, dst), rewriteBare(readFileSync(from, 'utf8'), VENDOR_REWRITES[dst]));
    else copyFileSync(from, join(out, dst));
    done.push(dst);
    log('vendor:', dst);
  }
  const font = vendorFont({ log, warn });
  if (font) done.push(font);
  return done;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) vendor();
