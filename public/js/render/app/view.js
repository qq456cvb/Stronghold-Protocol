// public/js/render/app/view.js — which field a camera shows, and the board box that follows it.

import { AREAS, areaFor } from '../board3d/layout.js';
import { normRect } from '../projection.js';
import { SEASON_THEME } from '../style.js';

const VIEW_KINDS = new Set(['prep', 'normal', 'unite', 'boss', 'bossPrep', 'pen']);

/**
 * The field a camera request actually shows — what render/projection.js presetCamera frames: 'hidden' → 'boss';
 * a 'prep' camera asked for the boss rows (Final Assault prep: rect r1 ≤ 6) → 'bossPrep'; unknown kinds → 'normal'.
 * Drives the built 3D area, the drawn 2D rows and the lit rect, so they always match the camera.
 */
export function viewKind(kind, opts) {
  let k = kind === 'hidden' ? 'boss' : kind;
  if (!VIEW_KINDS.has(k)) k = 'normal';
  if (k === 'prep' && opts && opts.rect && normRect(opts.rect).r1 <= 6) k = 'bossPrep';
  return k;
}

/**
 * 3D area built for a view kind (viewKind): the field with its separator rows 6 and 13 (the row-13 devices blow into
 * the field: act2 m01's blowers, user playtest #5 item 6; the boss field's row-6 devices are drawn with the boss field
 * only — board3d/layout.js stageDevices) and the enemy preview pen above it (rows 14–18) — as in the official prep,
 * battle and 联防 views, where the pen's front rows show at the top edge (the owner's 终极模拟 recordings of 2026-10-09:
 * the waiting enemies in prep, the empty pen floor in battle; the owner's request of 2026-10-11 reverses user playtest
 * #2 item 6, which had kept the pen for the 🔍 pen camera alone); the boss kinds build the boss field.
 */
export function boardArea(vk) {
  if (vk === 'pen' || vk === 'prep' || vk === 'normal') return AREAS.normal;
  if (vk === 'unite') return AREAS.unite;
  return areaFor(vk);
}

/** 2D rows drawn for a view kind: the field and the pen above it (rows 6–18); the boss field with the separator and the normal rows behind it as scenery. */
export function bandFor(kind) {
  if (kind === 'boss' || kind === 'hidden' || kind === 'bossPrep') return [0, 13];
  return [6, 18];
}

/**
 * Active field rows [r0, r1] of a view kind for the 2D board (render/tiles.js `setView` field: drawn rows outside it are
 * dim scenery without devices): the normal / 联防 / prep fields and the pen above them (rows 6–18 — devices stand on
 * rows ≤ 13 only, the row-6 wall's belong to the boss field — tiles.js _stageDevices); the boss field 0–6.
 */
export function fieldRows(kind) {
  return kind === 'boss' || kind === 'hidden' || kind === 'bossPrep' ? [0, 6] : [6, 18];
}

/** The views that show the pen (its floor and, in prep, its waiting enemies): every view of the normal field. */
const PEN_VIEWS = new Set(['pen', 'prep', 'normal', 'unite']);

/** Are the pen's figures shown for a view kind (a camera flight shows them when either end shows the pen)? */
export const penShown = (vk, prevVk = null) => PEN_VIEWS.has(vk) || PEN_VIEWS.has(prevVk);

/** Is the prep's leader on the boss field shown for a view kind (a flight shows it when either end is the boss-field prep)? */
export const leaderShown = (vk, prevVk = null) => vk === 'bossPrep' || prevVk === 'bossPrep';

/**
 * The board theme (render/textures.js BOARD_THEMES): `?theme=sand|default` in the page URL (dev), else the view
 * option, else the season's (render/style.js SEASON_THEME: the 盟约 season is the sand board).
 */
export function boardThemePreference(opt, season) {
  let q = null;
  try { q = new URLSearchParams(globalThis.location?.search || '').get('theme'); } catch { /* no location */ }
  const v = q || opt;
  if (v === 'sand' || v === 'default') return v;
  return (typeof season === 'string' && SEASON_THEME[season]) || 'default';
}

/** '2d' | '3d' | 'auto' board preference: `?board=` in the page URL (dev), else the view option. */
export function boardPreference(opt) {
  let q = null;
  try { q = new URLSearchParams(globalThis.location?.search || '').get('board'); } catch { /* no location */ }
  const v = q || opt;
  return v === '2d' || v === '3d' ? v : 'auto';
}

/**
 * A battle device box (render/units.js DeviceView `ctx.createBox()` contract: `{ mesh, update(cam, b), destroy() }`)
 * that follows the board layer: the 3D scene's crate mesh while `board()` returns a BoardScene, else the Pixi box of
 * the 2D board. A board switch mid-battle (lost WebGL context → 2D, or back to 3D) swaps the inner box on the next
 * update instead of leaving the crate on a dead scene. `mesh` is the Pixi mesh (null in 3D: nothing to add to Pixi).
 */
export function switchableBox({ board, pixi }) {
  let inner = null, owner;
  const drop = () => { try { inner?.destroy(); } catch { /* ignore */ } inner = null; owner = undefined; };
  return {
    get mesh() { return inner ? inner.mesh || null : null; },
    get inner() { return inner; },
    update(cam, b) {
      const scene = board() || null;
      if (!inner || owner !== scene || inner.destroyed) {
        drop();
        inner = scene ? scene.createDevice() : pixi();
        owner = scene;
      }
      inner?.update(cam, b);
    },
    destroy: drop,
  };
}
