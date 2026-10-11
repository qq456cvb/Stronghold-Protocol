// The sand board of the 盟约 season (DESIGN §9, render/textures.js BOARD_THEMES): theme choice, the built area, the
// lake beside the island and the scenery spots — the pure parts (the drawers need a canvas: see the browser suites).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStage, buildWaterQuads, shoreX, islandEdge, decorSpots, planeOcclusion } from '../../public/js/render/tiles.js';
import { MATERIALS, BOARD_THEMES, boardThemeOf } from '../../public/js/render/textures.js';
import { SEASON_THEME } from '../../public/js/render/style.js';
import { boardArea, boardThemePreference, fieldRows, bandFor } from '../../public/js/render/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stagesJson = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const stages = stagesJson.stages || stagesJson;
const config = JSON.parse(readFileSync(path.join(ROOT, 'data/config.json'), 'utf8'));
const uv = Object.fromEntries(MATERIALS.map((m, i) => [m, [i, i, i + 1, i + 1]]));

describe('board theme', () => {
  test('the 盟约 season is the sand board; anything else the default one', () => {
    assert.equal(config.season, 'act2autochess');
    assert.equal(SEASON_THEME[config.season], 'sand');
    assert.equal(boardThemePreference(undefined, config.season), 'sand');
    assert.equal(boardThemePreference(undefined, 'act1autochess'), 'default');
    assert.equal(boardThemePreference(undefined, null), 'default');
  });

  test('the view option overrides the season; unknown values fall back', () => {
    assert.equal(boardThemePreference('default', config.season), 'default');
    assert.equal(boardThemePreference('sand', null), 'sand');
    assert.equal(boardThemePreference('neon', config.season), 'sand');
    assert.deepEqual([...BOARD_THEMES], ['default', 'sand']);
    assert.equal(boardThemeOf('sand'), 'sand');
    assert.equal(boardThemeOf('x'), 'default');
  });

  test('the lake has an atlas cell and the atlas still fits', () => {
    assert.ok(MATERIALS.includes('water'));
    assert.ok(MATERIALS.length <= 64);
  });
});

describe('the sand board is built only where the official client builds it', () => {
  const st = stages.act1autochess_m01;

  test('a normal view draws the own half and the pen above it, not the other player’s half', () => {
    const area = boardArea('prep');
    const g = parseStage(st, bandFor('prep'), fieldRows('prep'), area);
    for (let r = 6; r <= 12; r++) for (let c = 11; c <= 20; c++) assert.equal(g[r][c].drawn, false, `${r},${c}`);
    // the own field is drawn as before
    const full = parseStage(st, bandFor('prep'), fieldRows('prep'));
    for (let r = 6; r <= 13; r++) for (let c = 0; c <= 10; c++) assert.equal(g[r][c].drawn, full[r][c].drawn, `${r},${c}`);
    // the pen's floor (rows 14–18, cols 7–13) is drawn
    for (let r = 14; r <= 18; r++) for (let c = 7; c <= 13; c++) assert.equal(g[r][c].drawn, true, `pen ${r},${c}`);
  });

  test('without an area (the default board) the whole band is drawn as before', () => {
    const a = parseStage(st, [6, 13], [6, 13]);
    const b = parseStage(st, [6, 13], [6, 13], null);
    assert.deepEqual(a.map((row) => row.map((t) => t.drawn)), b.map((row) => row.map((t) => t.drawn)));
    assert.ok(a[9][15].drawn, 'the other half stays on the default board');
  });
});

describe('the lake beside the island', () => {
  const st = stages.act2autochess_m04;

  test('a normal view gets water east of the island, fading in over a shore that follows its outline', () => {
    const g = parseStage(st, [6, 18], [6, 18], boardArea('normal'));
    const q = buildWaterQuads(g, uv, planeOcclusion(g));
    assert.ok(q.length > 50, `${q.length} water cells`);
    const edge = islandEdge(g);
    // the field rows end at col 10 (their margin), the pen above reaches further east
    assert.equal(edge(9.5) <= 10.5, true, `field edge ${edge(9.5)}`);
    assert.ok(edge(16) > edge(9.5), `pen edge ${edge(16)} east of the field's`);
    for (const w of q) {
      assert.deepEqual(w.u, uv.water);
      assert.equal(w.va.length, 4);
      for (const a of w.va) assert.ok(a >= 0 && a <= 1);
      // nothing of it reaches over the island
      for (const [k, [x, y]] of w.pts.entries()) if (x < shoreX(edge, y)) assert.equal(w.va[k], 0);
    }
  });

  test('a full-width field (联防 / boss) has no lake on screen', () => {
    const unite = parseStage(st, [6, 13], [6, 13], boardArea('unite'));
    assert.deepEqual(buildWaterQuads(unite, uv), []);
    const boss = parseStage(st, [0, 13], [0, 6], boardArea('boss'));
    assert.deepEqual(buildWaterQuads(boss, uv), []);
  });
});

describe('scenery spots', () => {
  test('cacti and rocks stand only on blocks next to the field, never in front of it or on a device', () => {
    for (const id of ['act1autochess_m01', 'act2autochess_m01', 'act2autochess_m02', 'act2autochess_m03', 'act2autochess_m04']) {
      const st = stages[id];
      const g = parseStage(st, [6, 13], [6, 13], boardArea('normal'));
      const taken = new Set((st.devices || []).map((d) => `${d.pos[0]},${d.pos[1]}`));
      const spots = decorSpots(g, taken, 6);
      assert.deepEqual(spots, decorSpots(g, taken, 6), `${id}: deterministic`);
      for (const s of spots) {
        const t = g[s.row][s.col];
        assert.ok(t.drawn && !t.playable && t.dist === 1, `${id} ${s.row},${s.col}`);
        assert.ok(t.glyph === '#' || t.glyph === 'X');
        assert.ok(s.row > 6 && s.row < 14, `${id} ${s.row}: not in front of the bench`);
        assert.ok(!taken.has(`${s.row},${s.col}`));
        assert.ok(s.kind === 'cactus' || s.kind === 'rocks');
      }
    }
  });
});
