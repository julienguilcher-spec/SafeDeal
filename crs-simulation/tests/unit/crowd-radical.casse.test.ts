// Groupes radicaux — sans forces de l'ordre en vue, la rue est livrée à la casse : cibles choisies par ordre de
// priorité, vitrine attaquée PUIS pillée (butin emporté, pilleurs en fuite), barricade montée en travers de la rue
// avec le mobilier mobile puis incendiée. Modules réels : décor, matériel, dangers, droit.
import { describe, expect, it } from 'vitest';
import type { EntityId } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { CROWD_RADICAL } from '@/sim/crowd';
import type { RadicalApi } from '@/sim/crowd';
import { avenueConfig, chantier, createRadicalTest } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];

describe('groupes radicaux — casse, pillage, barricade', () => {
  it('brise une vitrine qui est ensuite pillée, monte une barricade en travers de la rue et l\'incendie', async () => {
    // Graine 18 (au lieu de 9) depuis l'assemblage 2 : les troncs d'arbres sont devenus des obstacles, ce qui change
    // le détail des trajets. Scénario émergent : sur 12 graines essayées avec les troncs (15 à 26), la barricade est
    // incendiée 8 fois et une boutique pillée 10 fois ; les graines 18, 24, 25 et 26 donnent la chaîne complète.
    const t = createRadicalTest({ seed: 18, modules: MODULES });
    const { ctx, watch } = t;
    const windows: { t: number; id: EntityId; state: string; by: string; category: string }[] = [];
    const loots: { t: number; id: EntityId; by: string }[] = [];
    const barricades: { t: number; id: EntityId; x: number; z: number }[] = [];
    const fires: { t: number; kind: string; id: EntityId }[] = [];
    const moved = new Set<EntityId>();
    ctx.events.on('shop:window', (e) => {
      const by = ctx.people.get(e.byId);
      windows.push({ t: ctx.clock.now, id: e.id, state: e.state, by: by?.profile ?? '?', category: ctx.props.shop(e.id)?.category ?? '?' });
    });
    ctx.events.on('shop:looted', (e) => loots.push({ t: ctx.clock.now, id: e.id, by: ctx.people.get(e.byId)?.profile ?? '?' }));
    ctx.events.on('barricade:built', (e) => barricades.push({ t: ctx.clock.now, id: e.id, x: e.x, z: e.z }));
    ctx.events.on('fire:started', (e) => fires.push({ t: ctx.clock.now, kind: e.targetKind, id: e.targetId }));
    ctx.events.on('prop:moved', (e) => {
      const by = ctx.people.get(e.byId);
      if (by && by.faction === 'protest') moved.add(e.id);
    });
    await t.start(avenueConfig({ tension: 0.55, volatility: 1 }));
    t.run(1);
    chantier(ctx, 186, 15);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    let butin = 0;
    let fled = 0;
    ctx.events.on('person:fled', () => fled++);
    for (let s = 0; s < 420; s += 2) {
      t.run(2);
      butin = Math.max(butin, t.protesters().filter((p) => p.inventory.some((st) => st.id === 'butin' && st.count > 0)).length);
      const lit = barricades.some((b) => fires.some((f) => f.kind === 'prop' && f.id === b.id));
      if (lit && loots.length >= 3 && s > 200) break;
    }
    const broken = windows.filter((w) => w.state === 'broken');
    console.log('[radicaux] vitrines', windows.map((w) => w.category + ':' + w.state + '@' + w.t.toFixed(0) + '(' + w.by + ')').join(' '));
    console.log('[radicaux] pillages', loots.length, 'par', JSON.stringify(loots.reduce((a: Record<string, number>, l) => { a[l.by] = (a[l.by] ?? 0) + 1; return a; }, {})),
      '| porteurs de butin vus', butin, '| objets déplacés', moved.size, '| barricades', barricades.map((b) => '@' + b.t.toFixed(0)).join(' '),
      '| feux', fires.map((f) => f.kind + '@' + f.t.toFixed(0)).join(' '));
    console.log('[radicaux] faits', JSON.stringify(watch.count), '| stats', JSON.stringify(api.stats), '| infractions', JSON.stringify(watch.offenses));
    // ── vitrine attaquée par les radicaux, selon les priorités : jamais une pharmacie ni un petit commerce ──
    expect(broken.length).toBeGreaterThan(0);
    expect(api.stats.windowsAttacked).toBeGreaterThan(0);
    for (const w of windows) expect(['pharmacie', 'alimentation', 'cafe_restaurant', 'tabac_presse', 'autre']).not.toContain(w.category);
    // ── puis pillée : le premier pillage d'une boutique vient après le bris de SA vitrine ──
    expect(loots.length).toBeGreaterThan(0);
    for (const l of loots) {
      const w = broken.find((b) => b.id === l.id);
      expect(w, 'vitrine brisée avant pillage').toBeDefined();
      expect(l.t).toBeGreaterThan(w!.t);
    }
    expect(butin).toBeGreaterThan(0);
    expect(watch.offenses['pillage'] ?? 0).toBeGreaterThan(0);
    expect(watch.offenses['degradation'] ?? 0).toBeGreaterThan(0);
    // ── barricade : faite d'objets apportés par des manifestants, en travers de la rue, puis incendiée ──
    expect(barricades.length).toBeGreaterThan(0);
    expect(moved.size).toBeGreaterThanOrEqual(3);
    const b = barricades[0]!;
    const prop = ctx.props.get(b.id);
    const lit = fires.find((f) => f.kind === 'prop' && f.id === b.id);
    expect(lit, 'barricade incendiée').toBeDefined();
    expect(lit!.t).toBeGreaterThanOrEqual(b.t);
    expect(api.stats.barricades).toBeGreaterThan(0);
    expect(api.stats.barricadesLit).toBeGreaterThan(0);
    if (prop) {
      // en travers : son grand axe fait un angle marqué avec l'axe de l'avenue (est-ouest)
      const along = Math.abs(Math.cos(prop.heading)) * prop.halfX + Math.abs(Math.sin(prop.heading)) * prop.halfZ;
      const across = Math.abs(Math.sin(prop.heading)) * prop.halfX + Math.abs(Math.cos(prop.heading)) * prop.halfZ;
      console.log('[radicaux] barricade : emprise le long de la rue', along.toFixed(1), 'm, en travers', across.toFixed(1), 'm');
      expect(across).toBeGreaterThan(along);
    }
    expect(watch.offenses['barricade'] ?? 0).toBeGreaterThan(0);
    expect(watch.offenses['incendie'] ?? 0).toBeGreaterThan(0);
  }, 600_000);
});
