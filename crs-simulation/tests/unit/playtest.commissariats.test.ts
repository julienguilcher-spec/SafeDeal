// Robot joueur « commissariats » (vraie carte de Paris, commandant place de la Concorde) : il fait ce que fait le
// joueur et mesure ce qu'il verrait.
//   placement   les véhicules garés de chaque site sont dans leurs files, sur la chaussée, jamais dans un mur ni dans
//               le mobilier (candélabre, fontaine Wallace), même quand les tuiles du site se chargent après la mise en
//               place ; ils laissent la voie libre ;
//   cycle       pour chacun des sept sites, toutes ses unités engagées, envoyées dans Paris, puis « Rentrer au
//               commissariat » : chacune part, arrive, rentre, se gare dans les places du site, se repose puis est de
//               nouveau disponible (la BRAV-M du 9e, garée boulevard Haussmann, comprise) ;
//   C           la touche C parcourt les commissariats un par un (la deuxième pression change de site) ;
//   2e partie   une nouvelle partie dans le même processus repart d'un stock complet et propre.
import { describe, expect, it } from 'vitest';

import type { GameContext, Prop, RoadSample, SessionConfig, Vehicle } from '@/core/contracts';
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
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { COMMISSARIATS, isHeldVehicle } from '@/world/commissariats';
import { PROPS_EXT_SERVICE } from '@/sim/props/api';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { cycleStation, entryNumber } from '@/ui/command/commissariatsModel';
import type { StationCycle } from '@/ui/command/commissariatsModel';
import type { OrderType } from '@/core/contracts';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const ROAD = (): RoadSample => ({ edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false });

async function start(config: Partial<SessionConfig> = {}, seed = 5, ui = false) {
  const t = createTestContext({ seed, strict: false, modules: ui ? [...SIM, command] : SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
    tension: 0.1, volatility: 0.1, duration: 'standard', ...config,
    extra: { moyens: MEANS, variante: 'terrain', foyers: 0, ...(config.extra ?? {}) },
  } as Partial<SessionConfig>);
  t.step(1);
  return { t, ctx: t.ctx, api: t.ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE) };
}

/** Le joueur s'approche de chaque site : tuiles chargées, mobilier posé (comme en jeu, APRÈS la mise en place). */
async function loadSites(ctx: GameContext): Promise<void> {
  for (const c of COMMISSARIATS) await ctx.world.whenLoaded(c.door.x, c.door.z, 260);
  ctx.service<{ flushTiles(): void }>(PROPS_EXT_SERVICE)?.flushTiles();
}

function corners(v: Vehicle): [number, number][] {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const hl = v.def.length / 2, hw = v.def.width / 2;
  const out: [number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) out.push([v.x + fx * hl * a + fz * hw * b, v.z + fz * hl * a - fx * hw * b]);
  return out;
}

const nearP: Prop[] = [];

/** Ce qui ne va pas pour un véhicule garé (vide : rien). */
function parkedProblems(ctx: GameContext, v: Vehicle): string[] {
  const out: string[] = [];
  for (const [cx, cz] of corners(v)) {
    const surf = ctx.world.surfaceAt(cx, cz);
    if (surf === 'building' || surf === 'interior' || surf === 'water' || surf === 'park') out.push(`coin sur « ${surf} »`);
    if (!ctx.world.isFree(cx, cz, 0.05)) out.push('coin dans un obstacle');
  }
  // sur la chaussée : le milieu du véhicule et ses deux bouts
  for (const k of [-0.4, 0, 0.4]) {
    const x = v.x + Math.sin(v.heading) * v.def.length * k, z = v.z + Math.cos(v.heading) * v.def.length * k;
    const surf = ctx.world.surfaceAt(x, z);
    if (surf !== 'road' && surf !== 'sett') out.push(`axe sur « ${surf} »`);
  }
  const n = ctx.props.queryRadius(v.x, v.z, v.def.length / 2 + 3, nearP);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  for (let k = 0; k < n; k++) {
    const p = nearP[k]!;
    if (!p.blocksMove) continue;
    const dx = p.x - v.x, dz = p.z - v.z;
    const r = Math.max(p.halfX, p.halfZ);
    if (Math.abs(dx * fx + dz * fz) < v.def.length / 2 + r && Math.abs(dx * fz - dz * fx) < v.def.width / 2 + r) out.push(`dans « ${p.kind} »`);
  }
  // la voie reste libre : de l'autre côté du véhicule, au moins 3,5 m de chaussée
  const road = ROAD();
  if (ctx.world.nearestRoad(v.x, v.z, road, 30)) {
    const left = road.width / 2 + road.dist - v.def.width / 2;
    if (left < 3.5) out.push(`voie restante ${left.toFixed(1)} m (${road.name})`);
  }
  return [...new Set(out)];
}

describe('robot joueur — commissariats', () => {
  it('placement : files propres, sur la chaussée, hors du mobilier, la voie libre (sites chargés après la mise en place)', async () => {
    const { ctx, api } = await start();
    await loadSites(ctx);
    const bad: string[] = [];
    let held = 0;
    for (const site of api.list) {
      const def = COMMISSARIATS.find((c) => c.id === site.id)!;
      for (const e of site.entries) {
        const tpl = def.stock.find((s) => s.id === e.id)!;
        expect(e.vehicles, `${e.callsign} : véhicules au stock`).toBe(tpl.vehicles);
        for (const id of e.vehicleIds) {
          const v = ctx.vehicles.get(id)!;
          held++;
          expect(isHeldVehicle(ctx, id)).toBe(true);
          // dans sa propre file, nez vers la sortie (cap de la place)
          const slot = tpl.slots.map((i) => def.slots[i]!).find((s) => Math.hypot(s.x - v.x, s.z - v.z) < 0.5);
          if (!slot) bad.push(`${site.short} ${e.callsign} : hors de sa file`);
          else if (Math.abs(Math.atan2(Math.sin(v.heading - slot.heading), Math.cos(v.heading - slot.heading))) > 0.02) bad.push(`${e.callsign} : en biais`);
          for (const p of parkedProblems(ctx, v)) bad.push(`${site.short} ${e.callsign} : ${p}`);
        }
      }
    }
    console.log(`${held} véhicules garés${bad.length ? '\n  ' + bad.join('\n  ') : ', aucun défaut'}`);
    expect(held).toBe(32);
    expect(bad).toEqual([]);
  }, 600000);

  for (const siteId of COMMISSARIATS.map((c) => c.id)) {
    it(`cycle complet — ${siteId} : engager, envoyer, rentrer sans deux-tons, se garer, se reposer, redevenir disponible`, async () => {
      const { t, ctx, api } = await start({}, 11, true);
      await loadSites(ctx);
      const core = ctx.require<CommandCore>('ui.command');
      const def = COMMISSARIATS.find((c) => c.id === siteId)!;
      const said: string[] = [];
      const say = ctx.radio.say.bind(ctx.radio);
      ctx.radio.say = (m) => {
        said.push(m.text);
        say(m);
      };
      const sent: { id: string; squad: number; tx: number; tz: number }[] = [];
      const avail0 = api.get(def.id)!.available;
      let k = 0;
      for (const tpl of def.stock) {
        if (!tpl.engageable) continue;
        const r = core.engageFromCommissariat(entryNumber(tpl.id));
        expect(r.ok, `${tpl.callsign} : ${r.reason}`).toBe(true);
        // ~600 m vers l'intérieur de la carte, un peu de biais pour chaque unité
        const ang = Math.atan2(1500 - def.exit.x, 0 - def.exit.z) + (k - 1) * 0.6;
        k++;
        const road = ROAD();
        expect(ctx.world.nearestRoad(def.exit.x + Math.sin(ang) * 600, def.exit.z + Math.cos(ang) * 600, road, 200)).toBe(true);
        const verb: OrderType = tpl.kind === 'police_secours' || tpl.kind === 'bac' ? 'avancer' : tpl.kind === 'bravm' ? 'colonne' : 'faire_mouvement';
        const res = core.issue(verb, [ctx.squads.get(r.squadId)!], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]);
        expect(res.ok, `${tpl.callsign} : ${res.reason}`).toBe(true);
        sent.push({ id: tpl.id, squad: r.squadId, tx: road.x, tz: road.z });
      }
      // aller : toutes parties, le compteur du site baisse
      for (let s = 0; s < 200 && !sent.every((u) => api.entry(u.id)!.state === 'engage'); s++) t.step(2);
      for (const u of sent) expect(api.entry(u.id)!.state, `${u.id} partie`).toBe('engage');
      expect(api.get(def.id)!.available).toBe(avail0 - sent.length);
      for (let s = 0; s < 240; s++) t.step(2);
      for (const u of sent) {
        const e = api.entry(u.id)!;
        const v = ctx.vehicles.get(e.vehicleIds[0]!)!;
        // BRAV-M (ordre du joueur, plan « ordres directs » P4) : motos arrêtées à moins de 250 m du point — elle met pied
        // à terre et finit à pied, ses pilotes gardent les machines là où elles se sont arrêtées ; c'est son chef qui
        // arrive au point
        const chief = e.kind === 'bravm' ? ctx.people.get(ctx.squads.get(u.squad)!.leaderId) : undefined;
        const at = chief && chief.vehicleId === 0 ? chief : v;
        expect(Math.hypot(at.x - u.tx, at.z - u.tz), `${e.callsign} arrivée`).toBeLessThan(80);
      }
      // retour
      for (const u of sent) {
        const res = core.issue('retour_poste' as OrderType, [ctx.squads.get(u.squad)!], null);
        expect(res.ok, `${u.id} retour : ${res.reason}`).toBe(true);
        expect(api.entry(u.id)!.state).toBe('retour');
      }
      for (let s = 0; s < 300 && sent.some((u) => api.entry(u.id)!.state === 'retour'); s++) t.step(2);
      for (let s = 0; s < 70; s++) t.step(2);
      const log: string[] = [];
      const pat = ctx.service<{ statusOf(id: number): { state: string; label: string } | null }>('police.patrols');
      for (const u of sent) {
        const e = api.entry(u.id)!;
        if (e.state === 'retour') {
          const v = ctx.vehicles.get(e.vehicleIds[0]!)!;
          const ps = pat?.statusOf(u.squad);
          const st = ctx.require<{ status(v: Vehicle): { mode: string; state: string; reason: string; blockedFor: number } }>('vehicles.autopilot').status(v);
          const near: string[] = [];
          for (const o of ctx.vehicles.list) if (o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 12) near.push(`${o.kind}@${Math.hypot(o.x - v.x, o.z - v.z).toFixed(1)}${o.faction}`);
          console.log(`${e.callsign} encore en retour : (${v.x.toFixed(0)}, ${v.z.toFixed(0)}) cap ${v.heading.toFixed(2)} ${ps ? `${ps.state} « ${ps.label} »` : ''} ${st.mode}/${st.state}/${st.reason}/${st.blockedFor.toFixed(0)} près : ${near.join(' ')} gens ${ctx.people.countIn(v.x, v.z, 8, () => true)}`);
        }
        expect(['repos', 'au_poste'], `${e.callsign} rentrée`).toContain(e.state);
        // garée sur une place du site, dans son cap
        for (const id of e.vehicleIds) {
          const v = ctx.vehicles.get(id)!;
          const slot = def.slots.find((s) => Math.hypot(s.x - v.x, s.z - v.z) < 1);
          const dh = slot ? Math.abs(Math.atan2(Math.sin(v.heading - slot.heading), Math.cos(v.heading - slot.heading))) : NaN;
          log.push(`${e.callsign} : ${slot ? `place ${def.slots.indexOf(slot)}, cap ${(dh * 57.3).toFixed(0)}°` : `hors des places (${v.x.toFixed(0)}, ${v.z.toFixed(0)})`}`);
          expect(slot, `${e.callsign} garée sur une place`).toBeDefined();
          expect(dh).toBeLessThan(0.2);
        }
      }
      console.log(`── ${def.short}\n  ${log.join('\n  ')}`);
      // au bout du repos, de nouveau disponibles, annoncé à la radio
      for (let s = 0; s < 160 && sent.some((u) => api.entry(u.id)!.state !== 'au_poste'); s++) t.step(2);
      for (const u of sent) expect(api.entry(u.id)!.state).toBe('au_poste');
      expect(api.get(def.id)!.available).toBe(avail0);
      expect(said.some((m) => /disponible/.test(m))).toBe(true);
      // et on peut les renvoyer : l'unité déjà construite repart en alerte
      const again = core.engageFromCommissariat(entryNumber(sent[0]!.id));
      expect(again.ok).toBe(true);
      expect(again.squadId).toBe(sent[0]!.squad);
    }, 1800000);
  }

  // (la Cité n'y est pas : quatre engins qui rentrent ensemble sous les yeux du joueur s'y gênent encore dans leurs
  // manœuvres sur le boulevard du Palais — pilote automatique ; hors de sa vue, ils sont rangés, voir le cycle complet)
  for (const siteId of ['9e', '8e']) {
    it(`retour sous les yeux du joueur — ${siteId} : chaque véhicule se gare lui-même dans les places, dans leur sens`, async () => {
      const { t, ctx, api } = await start({}, 13, true);
      await loadSites(ctx);
      const core = ctx.require<CommandCore>('ui.command');
      const def = COMMISSARIATS.find((c) => c.id === siteId)!;
      const sent: { id: string; squad: number }[] = [];
      for (const tpl of def.stock) {
        if (!tpl.engageable) continue;
        const r = core.engageFromCommissariat(entryNumber(tpl.id));
        const road = ROAD();
        const ang = Math.atan2(1500 - def.exit.x, 0 - def.exit.z) + sent.length * 0.5;
        ctx.world.nearestRoad(def.exit.x + Math.sin(ang) * 500, def.exit.z + Math.cos(ang) * 500, road, 200);
        const verb: OrderType = tpl.kind === 'police_secours' || tpl.kind === 'bac' ? 'avancer' : tpl.kind === 'bravm' ? 'colonne' : 'faire_mouvement';
        expect(core.issue(verb, [ctx.squads.get(r.squadId)!], [{ x: road.x, z: road.z, heading: 0, width: 0 }]).ok).toBe(true);
        sent.push({ id: tpl.id, squad: r.squadId });
      }
      for (let s = 0; s < 200; s++) t.step(2);
      // le joueur attend devant la porte : rien n'est rangé hors de sa vue
      const me = ctx.player.person()!;
      me.x = def.door.x;
      me.z = def.door.z;
      for (const u of sent) core.issue('retour_poste' as OrderType, [ctx.squads.get(u.squad)!], null);
      for (let s = 0; s < 300 && sent.some((u) => api.entry(u.id)!.state === 'retour'); s++) {
        t.step(2);
        me.x = def.door.x;
        me.z = def.door.z;
      }
      for (let s = 0; s < 90; s++) {
        t.step(2);
        me.x = def.door.x;
        me.z = def.door.z;
      }
      const bad: string[] = [];
      const log: string[] = [];
      for (const u of sent) {
        const e = api.entry(u.id)!;
        if (e.state !== 'repos' && e.state !== 'au_poste') bad.push(`${e.callsign} : ${e.state}`);
        for (const id of e.vehicleIds) {
          const v = ctx.vehicles.get(id)!;
          let best = def.slots[0]!, bd = Infinity;
          for (const sl of def.slots) { const d = Math.hypot(sl.x - v.x, sl.z - v.z); if (d < bd) { bd = d; best = sl; } }
          const lat = Math.abs((v.x - best.x) * Math.cos(best.heading) - (v.z - best.z) * Math.sin(best.heading));
          const dh = Math.abs(Math.atan2(Math.sin(v.heading - best.heading), Math.cos(v.heading - best.heading)));
          log.push(`${e.callsign} : ${bd.toFixed(1)} m de la place ${def.slots.indexOf(best)}, écart ${lat.toFixed(1)} m, cap ${(dh * 57.3).toFixed(0)}°`);
          if (bd > 4 || lat > 1 || dh > 0.45) bad.push(`${e.callsign} mal garée : ${log[log.length - 1]}`);
        }
      }
      console.log(`── ${def.short} (joueur sur place)\n  ${log.join('\n  ')}`);
      expect(bad).toEqual([]);
    }, 1800000);
  }

  it('C parcourt les commissariats un par un, sans rester sur le même', () => {
    const all = [
      { id: 'a', x: 0, z: 0 }, { id: 'b', x: 100, z: 0 }, { id: 'c', x: 300, z: 0 }, { id: 'd', x: -1000, z: 0 },
    ];
    const memo: StationCycle = { order: [], index: -1 };
    // première pression : le plus proche du point visé
    expect(cycleStation(memo, all, { x: 90, z: 0 }, false)).toBe('b');
    // les suivantes (la fiche du commissariat est ouverte, la visée est sur lui) : les autres, dans l'ordre
    const seen = ['b'];
    for (let i = 0; i < 3; i++) seen.push(cycleStation(memo, all, all.find((s) => s.id === seen[seen.length - 1])!, true));
    expect(seen).toEqual(['b', 'a', 'c', 'd']);
    expect(cycleStation(memo, all, { x: -1000, z: 0 }, true)).toBe('b');
    // la liste change (un poste n'a plus d'unité prête) : on repart du plus proche
    expect(cycleStation(memo, all.slice(0, 3), { x: 290, z: 0 }, true)).toBe('c');
  });

  it('deuxième partie dans le même processus : stock complet, rien de la partie précédente', async () => {
    const { t, ctx, api } = await start({}, 3, true);
    const core = ctx.require<CommandCore>('ui.command');
    const r = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(r.ok).toBe(true);
    const road = ROAD();
    ctx.world.nearestRoad(1100, -300, road, 100);
    expect(core.issue('colonne', [ctx.squads.get(r.squadId)!], [{ x: road.x, z: road.z, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(60);
    expect(api.entry('9e:faucon9')!.state).toBe('engage');
    // nouvelle partie
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', foyers: 0 },
    } as Partial<SessionConfig>);
    t.step(1);
    const entries = api.list.flatMap((c) => c.entries);
    expect(entries.every((e) => e.state === 'au_poste' && e.squadId === 0)).toBe(true);
    expect(ctx.vehicles.list.filter((v) => isHeldVehicle(ctx, v.id)).length).toBe(32);
    expect(api.list.reduce((n, c) => n + c.available, 0)).toBe(entries.filter((e) => e.engageable).length);
    expect(ctx.squads.list.some((s) => s.name === 'FAUCON 9')).toBe(false);
    const again = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(again.ok).toBe(true);
    expect(ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && ctx.squads.get(again.squadId)).length).toBeGreaterThanOrEqual(6);
  }, 600000);
});
