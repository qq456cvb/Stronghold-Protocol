// The sand board of the 盟约 season (DESIGN §9, render/textures.js BOARD_THEMES): theme choice, the built area, the
// lake beside the island and the scenery spots — the pure parts (the drawers need a canvas: see the browser suites).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStage, buildWaterQuads, shoreX, islandEdge, decorSpots, planeOcclusion, interiorPits, interiorRuns, fenceRimQuads, FENCE_RIM } from '../../public/js/render/tiles.js';
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
  test('cacti, rocks and picket fences stand only on blocks next to the field, never in front of it or on a device', () => {
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
        assert.ok(s.kind === 'cactus' || s.kind === 'rocks' || s.kind === 'picket', s.kind);
        if (s.kind === 'picket') assert.equal(t.glyph, 'X', 'picket fences stand on the separator walls only');
      }
    }
  });
});

describe('forbidden runs inside the field sink to pits', () => {
  test('act1 m01: the row-9 run between the lanes is a pit, the field\'s edge blocks stay blocks', () => {
    const g = parseStage(stages.act1autochess_m01, [6, 18], [6, 18], boardArea('normal'));
    const pits = interiorPits(g).map((t) => `${t.r},${t.c}`).sort();
    assert.deepEqual(pits, ['9,5', '9,6', '9,7']);
  });

  test('act2 m01: single blocks between lanes are pits; the block between the two halves (col 10) and the one against the wall are not', () => {
    const g = parseStage(stages.act2autochess_m01, [6, 18], [6, 18], boardArea('normal'));
    const pits = new Set(interiorPits(g).map((t) => `${t.r},${t.c}`));
    for (const k of ['10,6', '11,6', '10,8', '11,8', '9,6']) assert.ok(pits.has(k), k);
    // 12,8 lies against the separator wall: raised, as act1 m04's row-12 run in the recording
    for (const k of ['10,10', '11,10', '9,1', '10,2', '12,8']) assert.ok(!pits.has(k), k);
  });

  test('act1 m04 (the P1 recording): the row-9 run is a pit; the row-12 run between the crates, against the separator wall, stays raised', () => {
    const g = parseStage(stages.act1autochess_m04, [6, 18], [6, 18], boardArea('normal'));
    const field = (t) => t.r >= 9 && t.r <= 12 && t.c <= 10;
    assert.deepEqual(interiorPits(g).filter(field).map((t) => `${t.r},${t.c}`).sort(), ['9,5', '9,6', '9,7']);
    const walls = interiorRuns(g).filter((run) => run.wall && run.tiles.every(field));
    assert.deepEqual(walls.map((run) => run.tiles.map((t) => `${t.r},${t.c}`)), [['12,5', '12,6', '12,7']]);
    // the recorded crates stand either side of that run (the official level's tokenInsts)
    const crates = stages.act1autochess_m04.devices.filter((d) => d.role === 'crate' && d.pos[0] === 12 && d.pos[1] <= 10).map((d) => d.pos.join(','));
    assert.deepEqual(crates.sort(), ['12,3', '12,4', '12,8']);
  });

  test('act2 m04 has none (no forbidden tile inside its field)', () => {
    const g = parseStage(stages.act2autochess_m04, [6, 18], [6, 18], boardArea('normal'));
    assert.deepEqual(interiorPits(g).filter((t) => t.r >= 9 && t.r <= 12), []);
  });
});

describe('活性源石 on the sand board', () => {
  test('its own drawer (a red shard on pale sand, as recorded on act1 m04), both variants; the default board keeps the crust', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/render/textures.js'), 'utf8');
    const sand = src.slice(src.indexOf('const SAND_DRAW = {'));
    assert.match(sand, /infection\(ctx, x, y, s, r\) \{ sandOriginium\(ctx, x, y, s, r, false\); \}/);
    assert.match(sand, /infection2\(ctx, x, y, s, r\) \{ sandOriginium\(ctx, x, y, s, r, true\); \}/);
    assert.match(src, /infection\(ctx, x, y, s, r\) \{ floorBase\(ctx, x, y, s, r\); originiumOverlay\(ctx, x, y, s, false\); \}/);
  });
});

describe('raised wooden fence frames', () => {
  test('four low bars round every drawn fence tile, sorted with its row, inside the tile', () => {
    const g = parseStage(stages.act2autochess_m04, [6, 18], [6, 18], boardArea('normal'));
    const fences = g.flat().filter((t) => t.drawn && t.glyph === 'b');
    const q = fenceRimQuads([], uv, g);
    assert.equal(q.length, fences.length * 4 * 4, '4 bars × (top + S/E/W) per fence tile');
    for (const quad of q) {
      assert.equal(quad.kind, 'block');
      const t = g[quad.row][quad.col];
      assert.equal(t.glyph, 'b');
      for (const [x, y, z] of quad.pts) {
        assert.ok(x >= quad.col - 0.5 - 1e-9 && x <= quad.col + 0.5 + 1e-9 && y >= quad.row - 0.5 - 1e-9 && y <= quad.row + 0.5 + 1e-9);
        assert.ok(z >= -1e-9 && z <= FENCE_RIM.h + 1e-9);
      }
    }
  });
});

describe('the sand board\'s relief', () => {
  test('taller smooth blocks, the rubble row and pits unchanged, a sunken deep-water channel', async () => {
    const { installFakePixi } = await import('./fakepixi.js');
    const fake = installFakePixi();
    try {
      const P = globalThis.PIXI;
      P.BLEND_MODES = { ADD: 1, NORMAL: 0 };
      const { TileField, SAND_DEPTH } = await import('../../public/js/render/tiles.js');
      const layers = { ground: new P.Container(), overlay: new P.Container(), props: new P.Container(), anim: new P.Container() };
      for (const l of Object.values(layers)) l.addChild = function (...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return kids[0]; };
      const f = new TileField(layers);
      f.setExternal(true);
      f.setTheme('sand');
      f.setView(bandFor('normal'), null, fieldRows('normal'), boardArea('normal'));
      f.setStage(stages.act2autochess_m04);
      assert.equal(f.heightAt(10, 6), SAND_DEPTH.channel, 'deep water (10,6) sunk');
      assert.equal(f.heightAt(10, 1), SAND_DEPTH.block, 'an edge block (10,1) raised');
      assert.ok(f.heightAt(8, 2) < SAND_DEPTH.block && f.heightAt(8, 2) > 0, 'the rubble beside the item slots keeps its lower height');
      f.setTheme('default');
      assert.equal(f.heightAt(10, 6), 0, 'the default board: the channel at ground level');
      f.destroy();
    } finally {
      fake.restore();
    }
  });
});
