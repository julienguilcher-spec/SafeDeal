import { describe, expect, it } from 'vitest';
import type { GameContext, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import type { OverlayOptions } from '@/ui/maps/overlay';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { MapTransform } from '@/ui/maps/transform';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState, readOnlyBanner, readOnlyFrame, tacticalFrame } from '@/ui/command/tacticalState';

/**
 * Carte tactique d'un équipier (CRS porte-bouclier, place de la République) : à l'ouverture, la vue cadrait le
 * rectangle de TOUTES les unités visibles — patrouilles et foyers dans tout Paris — puis plafonnait l'échelle à
 * 2,2 m/px autour du MILIEU de ce rectangle (vers le Palais-Royal) : le joueur n'était pas sur la carte
 * (tests/e2e/out/verif-roles-interface-tel-crs-bouclier-tactique.png).
 */
function view(): MapTransform {
  const v = new MapTransform();
  v.setSize(844 - 190, 390 - 46);
  return v;
}

describe('carte tactique — cadrage à l’ouverture', () => {
  it('unités éparpillées dans Paris : le joueur reste sur la carte', () => {
    const v = view();
    const player = { x: 1500, z: -600 };
    // patrouilles aux quatre coins de Paris, le joueur avec son groupe à l'est
    tacticalFrame(v, -3200, -2100, 2600, 1900, player, 0.55, 2.2);
    expect(v.mpp).toBeCloseTo(2.2, 5);
    const b = v.visibleBounds({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    expect(player.x).toBeGreaterThan(b.minX);
    expect(player.x).toBeLessThan(b.maxX);
    expect(player.z).toBeGreaterThan(b.minZ);
    expect(player.z).toBeLessThan(b.maxZ);
  });

  it('unités groupées : cadrage sur leur rectangle, échelle bornée', () => {
    const v = view();
    tacticalFrame(v, 100, 100, 300, 200, { x: 120, z: 110 }, 0.55, 2.2);
    expect(v.cx).toBeCloseTo(200, 5);
    expect(v.cz).toBeCloseTo(150, 5);
    expect(v.mpp).toBeGreaterThanOrEqual(0.55);
    expect(v.mpp).toBeLessThanOrEqual(2.2);
  });
});

describe('carte de l’exécutant (lecture seule) : cadrée sur lui et sa destination', () => {
  it('cadrage pur : le joueur et la destination à 235 m sont dans la vue, avec une marge ; sans destination, centrée sur lui', () => {
    const v = view();
    const me = { x: 100, z: 50 };
    const dest = { x: 300, z: -73 };
    readOnlyFrame(v, me, dest);
    const b = v.visibleBounds({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    for (const p of [me, dest]) {
      expect(p.x).toBeGreaterThan(b.minX + 10);
      expect(p.x).toBeLessThan(b.maxX - 10);
      expect(p.z).toBeGreaterThan(b.minZ + 10);
      expect(p.z).toBeLessThan(b.maxZ - 10);
    }
    const w = view();
    readOnlyFrame(w, me, null);
    expect(w.cx).toBeCloseTo(me.x, 5);
    expect(w.cz).toBeCloseTo(me.z, 5);
  });

  it('vraie partie (CRS, Concorde) : son groupe mis en avant, les autres estompés, la destination « ICI » ; le bandeau dit l’ordre', async () => {
    const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
    const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.3,
      volatility: 0.3, duration: 'standard', extra: { moyens: MEANS },
    } as never);
    const ctx: GameContext = t.ctx;
    t.step(10);
    const core = ctx.service<CommandCore>('ui.command')!;
    expect(core.scope().level).toBe('lecture');
    const me = ctx.player.person()!;
    let company: Squad | undefined = ctx.squads.get(me.squadId);
    for (let g = 0; company && company.parentId !== 0 && g < 8; g++) company = ctx.squads.get(company.parentId);
    // le chef de la compagnie (IA) ordonne une ligne 230 m plus loin
    ctx.squads.issue(company!.id, { type: 'ligne', x: me.x + 230, z: me.z, heading: 0, width: 0, issuedBy: company!.leaderId });
    t.step(1);
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    expect(brief.command).not.toBeNull();
    // la carte de l'exécutant (TacticalMap, avant chaque dessin)
    const overlay = {} as OverlayOptions;
    const map = { handlers: null, overlay, invalidate(): void {} } as unknown as MapCanvas;
    const tmap = new TacticalMap(core, map, new TacticalState());
    (tmap as unknown as { beforeDraw(): void }).beforeDraw();
    expect(overlay.readOnly).toBe(true);
    const own = core.scope().ownSquadId;
    expect(overlay.executant).toBeTruthy();
    expect(overlay.executant!.squadId).toBe(own);
    const dest = overlay.executant!.dest!;
    expect(Math.hypot(dest.x - brief.command!.x, dest.z - brief.command!.z)).toBeLessThan(1);
    expect(overlay.emphasis && overlay.emphasis.has(own)).toBe(true);
    expect(overlay.emphasisAlpha).toBe(0.5);
    // bandeau « ORDRE DU … » : l'ordre et le lieu, jamais un type brut
    const banner = readOnlyBanner(brief, ctx.clock.now, false, '↗');
    expect(banner.line1).toMatch(/^ORDRE D/);
    expect(banner.line1).toContain(brief.command!.text);
    expect(banner.line1 + banner.line2).not.toMatch(/[a-z]_[a-z]/);
    // le cadrage d'ouverture contient le joueur et sa destination
    const v = new MapTransform();
    v.setSize(1280, 800 - 44 - 60);
    readOnlyFrame(v, me, dest);
    const b = v.visibleBounds({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    for (const p of [me, dest]) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.maxX);
      expect(p.z).toBeGreaterThan(b.minZ);
      expect(p.z).toBeLessThan(b.maxZ);
    }
  }, 300000);
});
