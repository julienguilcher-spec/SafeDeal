import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { SystemOrder } from '@/core/contracts';
import { ATLAS_COLS, ATLAS_ROWS, TILE_DOT, TILE_MIST, TILE_PUFF, buildNoiseTexture, buildSpriteAtlas, tileNoise } from '@/render/fx/atlas';
import { EV_EXPLOSION, FX_CODE, FxEventQueue } from '@/render/fx/events';
import { FX_RENDER_SERVICE, FxSystem, createSystems } from '@/render/fx/index';
import type { FxRenderApi } from '@/render/fx/index';
import { FxRandom, hash01, linB, linG, linR, srgbToLinear } from '@/render/fx/mathx';
import { projectileColor, projectileScale } from '@/render/fx/projectiles';
import { jetSpeedFor } from '@/render/fx/water';

describe('effets — système', () => {
  it('s\'exécute juste après le rendu de base et publie son service', async () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0]!.order).toBe(SystemOrder.VIEW + 5);
    expect(systems[0]!.id).toBe('render.fx');
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const api = t.ctx.require<FxRenderApi>(FX_RENDER_SERVICE);
    expect(api.stats.drawCalls).toBe(0);
    expect(api.budget.maxSprites).toBeGreaterThan(0);
    expect(api.vehicleFire).toBe(true);
  });

  it('reste inerte et ne plante pas sans vue (mode headless), même sous une pluie d\'événements', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const ctx = t.ctx;
    const ids = Object.keys(FX_CODE);
    for (let k = 0; k < 2000; k++) {
      ctx.events.emit('fx', { id: ids[k % ids.length]!, x: k, y: 1, z: -k, size: 2, color: 0xff0000, seconds: 1 });
      ctx.events.emit('explosion', { kind: 'gm2l', x: 0, y: 0, z: 0, radius: 10, sourceId: 0 });
      ctx.events.emit('projectile:impact', { id: 0, kind: 'pave', ownerId: 0, x: 0, y: 0, z: 0, hitKind: 'ground', hitId: 0 });
    }
    ctx.projectiles.spawn('grenade_lacrymo_56', 0, 0, 2, 0, 10, 5, 0);
    const prop = ctx.props.spawn('poubelle', 3, 3, 0);
    prop.burning = 1;
    t.step(1);
    const api = ctx.require<FxRenderApi>(FX_RENDER_SERVICE);
    api.emit('explosion', 0, 0, 0, { size: 2 });
    api.clear();
    expect(api.stats.sprites).toBe(0);
    // frame() appelé à la main sans vue : aucun effet, aucune exception
    const sys = t.game.systems.find((s) => s.id === 'render.fx') as FxSystem;
    expect(() => sys.frame(0.016)).not.toThrow();
    expect(() => sys.reset()).not.toThrow();
    expect(() => sys.dispose()).not.toThrow();
  });
});

describe('effets — file des événements', () => {
  it('tous les FxId du contrat ont un code distinct', () => {
    const ids = ['gaz', 'fumee', 'feu', 'etincelles', 'explosion', 'flash', 'eclats_verre', 'poussiere', 'jet_eau', 'eclaboussure',
      'traceur', 'feu_artifice', 'peinture', 'debris', 'poudre', 'sang', 'trace_brulure', 'tag', 'impact'];
    const codes = new Set<number>();
    for (const id of ids) {
      expect(FX_CODE[id], id).toBeGreaterThan(0);
      codes.add(FX_CODE[id]!);
    }
    expect(codes.size).toBe(ids.length);
    expect(Object.keys(FX_CODE).length).toBe(ids.length);
  });

  it('borne la file : une salve ne déborde pas, les abandons sont comptés', () => {
    const q = new FxEventQueue(8);
    let ok = 0;
    for (let i = 0; i < 30; i++) if (q.push(1, i, 0, 0, 1, 0, 0, 0, -1, 0, '', '')) ok++;
    expect(ok).toBe(8);
    expect(q.count).toBe(8);
    expect(q.dropped).toBe(22);
    expect(Array.from(q.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    q.clear();
    expect(q.count).toBe(0);
    expect(q.push(EV_EXPLOSION, 1, 2, 3, 10, 0, 0, 0, -1, 0, 'gm2l', '')).toBe(true);
    expect(q.kind[0]).toBe('gm2l');
    expect(q.size[0]).toBe(10);
  });

  it('ignore un événement aux coordonnées non finies', () => {
    const q = new FxEventQueue(4);
    expect(q.push(1, Number.NaN, 0, 0, 1, 0, 0, 0, -1, 0, '', '')).toBe(false);
    expect(q.count).toBe(0);
    expect(q.dropped).toBe(0);
  });
});

describe('effets — atlas procédural', () => {
  it('est déterministe, de la bonne taille, et chaque vignette s\'annule sur son bord', () => {
    const a = buildSpriteAtlas(32);
    const b = buildSpriteAtlas(32);
    expect(a.width).toBe(32 * ATLAS_COLS);
    expect(a.height).toBe(32 * ATLAS_ROWS);
    expect(a.data.length).toBe(a.width * a.height * 4);
    expect(Array.from(a.data.subarray(0, 4096))).toEqual(Array.from(b.data.subarray(0, 4096)));
    const T = a.tile;
    for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
      const ox = (tile % ATLAS_COLS) * T;
      const oy = Math.floor(tile / ATLAS_COLS) * T;
      let edge = 0;
      let center = 0;
      for (let k = 0; k < T; k++) {
        edge = Math.max(edge, a.data[(oy * a.width + ox + k) * 4 + 3]!, a.data[((oy + T - 1) * a.width + ox + k) * 4 + 3]!,
          a.data[((oy + k) * a.width + ox) * 4 + 3]!, a.data[((oy + k) * a.width + ox + T - 1) * 4 + 3]!);
      }
      for (let j = T / 4; j < (3 * T) / 4; j++) for (let i = T / 4; i < (3 * T) / 4; i++) center = Math.max(center, a.data[((oy + j) * a.width + ox + i) * 4 + 3]!);
      // bord transparent (pas de débordement d'une vignette sur l'autre), cœur visible
      expect(edge, `bord de la vignette ${tile}`).toBeLessThanOrEqual(8);
      expect(center, `cœur de la vignette ${tile}`).toBeGreaterThan(100);
    }
  });

  it('les bouffées portent une normale apparente plausible (vers la caméra au centre)', () => {
    const a = buildSpriteAtlas(64);
    const T = a.tile;
    for (const tile of [TILE_PUFF, TILE_PUFF + 3, TILE_MIST]) {
      const ox = (tile % ATLAS_COLS) * T;
      const oy = Math.floor(tile / ATLAS_COLS) * T;
      const k = ((oy + T / 2) * a.width + ox + T / 2) * 4;
      const nx = a.data[k]! / 127.5 - 1;
      const ny = a.data[k + 1]! / 127.5 - 1;
      expect(Math.hypot(nx, ny)).toBeLessThan(0.75);
    }
    // le point lumineux est blanc
    const ox = (TILE_DOT % ATLAS_COLS) * T;
    const oy = Math.floor(TILE_DOT / ATLAS_COLS) * T;
    const k = ((oy + T / 2) * a.width + ox + T / 2) * 4;
    expect(a.data[k]).toBeGreaterThan(240);
    expect(a.data[k + 3]).toBeGreaterThan(240);
  });

  it('le bruit des flammes se répète sans couture', () => {
    for (const p of [4, 8, 16]) {
      for (let k = 0; k < 20; k++) {
        const x = k * 0.37;
        expect(tileNoise(x, 0.3, p, 5)).toBeCloseTo(tileNoise(x + p, 0.3, p, 5), 10);
        expect(tileNoise(0.3, x, p, 5)).toBeCloseTo(tileNoise(0.3, x + p, p, 5), 10);
      }
    }
    const n = buildNoiseTexture(32);
    expect(n.length).toBe(32 * 32 * 4);
    let min = 255, max = 0;
    for (let i = 0; i < n.length; i += 4) { min = Math.min(min, n[i]!); max = Math.max(max, n[i]!); }
    expect(max - min).toBeGreaterThan(80);
  });
});

describe('effets — outils', () => {
  it('générateur propre aux effets : déterministe, borné, indépendant de ctx.rng', async () => {
    const a = new FxRandom(42);
    const b = new FxRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(a.int(7)).toBeLessThan(7);
    expect(hash01(12)).toBe(hash01(12));
    expect(hash01(12)).not.toBe(hash01(13));
    // le module ne consomme jamais le générateur de la simulation
    const run = async (withFx: boolean): Promise<number> => {
      const t = createTestContext({ modules: withFx ? [createSystems] : [] });
      await t.start({ seed: 9 });
      for (let k = 0; k < 50; k++) t.ctx.events.emit('fx', { id: 'explosion', x: k, y: 0, z: 0, size: 2 });
      t.step(2);
      return t.ctx.rng.next();
    };
    expect(await run(true)).toBe(await run(false));
  });

  it('couleurs : conversion sRGB → linéaire', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3);
    expect(linR(0xff8000)).toBeCloseTo(1, 6);
    expect(linG(0xff8000)).toBeCloseTo(0.2158, 3);
    expect(linB(0xff8000)).toBe(0);
  });

  it('vitesse du jet : la parabole retombe à la portée annoncée', () => {
    const g = 9.81;
    for (const [reach, pitch, drop] of [[32, 0.11, 3.7], [40, 0.2, 3.5], [15, 0.4, 3.5], [20, -0.05, 3.6], [6, 0.1, 1.1]] as const) {
      const v = jetSpeedFor(reach, pitch, drop);
      // on rejoue le vol : hauteur au bout de la portée horizontale
      const t = reach / (v * Math.cos(pitch));
      const y = drop + v * Math.sin(pitch) * t - 0.5 * g * t * t;
      expect(Math.abs(y), `portée ${reach}`).toBeLessThan(0.05);
    }
    // jet arrêté en montée par un mur proche, ou données absurdes : vitesse nominale
    expect(jetSpeedFor(2, 1.2, -8, 26)).toBe(26);
    expect(jetSpeedFor(0, 0.1, 3, 26)).toBe(26);
    expect(jetSpeedFor(500, 0.01, 0.1)).toBeLessThanOrEqual(60);
  });

  it('projectiles : grossissement avec la distance et couleur lue sans risque', () => {
    expect(projectileScale(0)).toBe(1);
    expect(projectileScale(10)).toBe(1);
    expect(projectileScale(30)).toBe(3);
    expect(projectileScale(500)).toBe(5);
    const base = { id: 1, kind: 'mortier', ownerId: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, age: 0, fuse: 1, resting: false, emitting: false, pickable: false };
    expect(projectileColor({ ...base, data: { color: 0x34c759 } }, 1)).toBe(0x34c759);
    expect(projectileColor({ ...base, data: null }, 7)).toBe(7);
    expect(projectileColor({ ...base, data: undefined }, 7)).toBe(7);
    expect(projectileColor({ ...base, data: 'x' }, 7)).toBe(7);
    expect(projectileColor({ ...base, data: { color: 'rouge' } }, 7)).toBe(7);
    expect(projectileColor({ ...base, data: { color: 0 } }, 7)).toBe(7);
    expect(projectileColor({ ...base, data: { color: 0x1ffffff } }, 7)).toBe(7);
  });
});
