/* Module de rendu des véhicules branché dans le moteur réel, en mode headless : il ne doit rien casser, publier
 * son service, et ses fonctions géométriques doivent marcher sans rendu. */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/contracts';
import { getCore } from '@/core/context';
import { createTestContext } from '@/core/testing';
import { REFERENCE_DEFS, VEHICLES_RENDER_KEY, createSystems } from '@/render/vehicles/index';
import type { VehiclesRenderApi } from '@/render/vehicles/index';
import { driverPoint } from '@/render/vehicles/cockpit';
import { buildModel } from '@/render/vehicles/models/index';
import { TILE_PX, ATLAS_W, ATLAS_H, tile } from '@/render/vehicles/atlas-layout';

describe('système de rendu des véhicules (headless)', () => {
  it('se branche, publie son service et ne fait rien sans vue', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const api = t.ctx.service<VehiclesRenderApi>(VEHICLES_RENDER_KEY);
    expect(api).toBeDefined();
    expect(api!.stats.drawCalls).toBe(0);
    expect(api!.ownFire).toBe(true);
    getCore(t.ctx).stores.vehicles.registerDefs(REFERENCE_DEFS);
    const v = t.ctx.vehicles.spawn('fourgon_crs', 10, 20, 0);
    t.step(1);
    // appels sans effet en l'absence de moteur de rendu : aucune exception
    api!.setDoor(v.id, 0, true);
    api!.pulseDoor(v.id, 3);
    api!.invalidate();
    api!.ownFire = false;
    expect(api!.ownFire).toBe(false);
    expect(t.game.systems.some((s) => s.id === 'render.vehicles')).toBe(true);
  });

  it('seatEye et turretMuzzle fonctionnent sans rendu', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const api = t.ctx.require<VehiclesRenderApi>(VEHICLES_RENDER_KEY);
    getCore(t.ctx).stores.vehicles.registerDefs(REFERENCE_DEFS);
    const v = t.ctx.vehicles.spawn('centaure', 0, 0, 0);
    const eye: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
    // conducteur à gauche : au cap 0 (vers +z), la gauche est à l'est (+x)
    expect(api.seatEye(v, 0, eye)).toBe(true);
    expect(eye.x).toBeGreaterThan(0.2);
    expect(eye.y).toBeGreaterThan(2.3);
    expect(api.seatEye(v, 99, eye)).toBe(false);
    v.turretYaw[0] = Math.PI / 2;
    expect(api.turretMuzzle(v, 0, eye, dir)).toBe(true);
    expect(dir.x).toBeCloseTo(-1);      // tourelle tournée à droite : vers l'ouest quand le véhicule regarde le sud
    expect(eye.y).toBeGreaterThan(3.2);
    expect(api.turretMuzzle(v, 5, eye, dir)).toBe(false);
  });

  it('place le conducteur à gauche et sous le toit dans chaque modèle à habitacle', () => {
    for (const def of REFERENCE_DEFS) {
      const meta = buildModel(def.kind, def, true).meta;
      if (meta.cockpit === 'none' || meta.cockpit === 'bike') continue;
      const d = driverPoint(def, meta);
      expect(d.x, def.kind).toBeGreaterThan(0);                       // +x Three = gauche du véhicule
      expect(d.y + 0.72, def.kind).toBeLessThan(meta.roofY - 0.05);    // les yeux sous le pavillon
      expect(d.y + 0.72, def.kind).toBeGreaterThan(meta.beltY + 0.1);  // et au-dessus de la planche de bord
      expect(d.z, def.kind).toBeLessThan(meta.cowlZ - 0.3);            // derrière le pare-brise
    }
  });

  it('atlas : tuiles dans les limites, sans recouvrement', () => {
    const names = Object.keys(TILE_PX) as (keyof typeof TILE_PX)[];
    for (const a of names) {
      const p = TILE_PX[a];
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(ATLAS_W);
      expect(p.y + p.h).toBeLessThanOrEqual(ATLAS_H);
      for (const b of names) {
        if (a >= b) continue;
        const q = TILE_PX[b];
        const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        expect(apart, `${a} / ${b}`).toBe(true);
      }
      const uv = tile(a);
      expect(uv.u1).toBeGreaterThan(uv.u0);
      expect(uv.v1).toBeGreaterThan(uv.v0);
    }
  });
});
