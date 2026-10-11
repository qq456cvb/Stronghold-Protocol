// The self-hosted CJK UI font (tools/vendor.mjs VENDOR_FONT, DESIGN §10): Noto Sans SC from @fontsource, woff2 only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_FONT, woff2Only } from '../tools/vendor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('self-hosted Noto Sans SC', () => {
  test('a fontsource rule keeps its woff2 source only and names the file', () => {
    const css = `/* x */\n@font-face {\n  font-family: 'Noto Sans SC';\n  font-weight: 700;\n  src: url(./files/noto-sans-sc-4-700-normal.woff2) format('woff2'), url(./files/noto-sans-sc-4-700-normal.woff) format('woff');\n  unicode-range: U+4e00-4e10;\n}\n`;
    const out = woff2Only(css);
    assert.deepEqual(out.files, ['noto-sans-sc-4-700-normal.woff2']);
    assert.match(out.css, /src: url\(\.\/files\/noto-sans-sc-4-700-normal\.woff2\) format\('woff2'\);/);
    assert.doesNotMatch(out.css, /\.woff\)/);
    assert.match(out.css, /unicode-range: U\+4e00-4e10;/);
  });

  test('the weights the stylesheets use, a production dependency, the page links it', () => {
    assert.deepEqual([...VENDOR_FONT.weights], [400, 500, 700, 900]);
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies['@fontsource/noto-sans-sc'], 'installed with the production dependencies (the release bundle runs npm ci)');
    const html = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    assert.ok(html.includes(`/vendor/${VENDOR_FONT.dir}/${VENDOR_FONT.css}`));
    assert.doesNotMatch(html, /family=Noto\+Sans\+SC/, 'not from Google Fonts any more');
  });

  test('every installed weight stylesheet reduces to existing woff2 files', { skip: !existsSync(path.join(ROOT, VENDOR_FONT.pkg)) && 'package not installed' }, () => {
    for (const w of VENDOR_FONT.weights) {
      const { files } = woff2Only(readFileSync(path.join(ROOT, VENDOR_FONT.pkg, `${w}.css`), 'utf8'));
      assert.ok(files.length > 50, `${w}: ${files.length} slices`);
      for (const f of files) assert.ok(existsSync(path.join(ROOT, VENDOR_FONT.pkg, 'files', f)), f);
    }
  });
});
