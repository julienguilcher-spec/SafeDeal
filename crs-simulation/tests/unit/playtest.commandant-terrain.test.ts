// Partie robot du commandant : la fiche promet, le terrain doit tenir la promesse. Le robot passe par le même chemin que
// « Donner l'ordre » (fiche du repère pour l'intention, ligne par défaut, unité proposée, sendCardLine), puis laisse
// tourner la partie et regarde ce que font VRAIMENT les unités : celle nommée par « Qui » bouge, à moto / en véhicules
// quand la phrase le dit, et le résultat annoncé arrive (interpellation, rue barrée…).
import { describe, expect, it } from 'vitest';

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
import { createSystems as env } from '@/env';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardEnv, SendEnv } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { sentenceOf } from '@/ui/command/preview';
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine, undoOrder } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(place: string, seed: number, x: number, z: number) {
  const t = createTestContext({ seed, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place, x, z, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard',
    extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

/** Une moto de la BRAV-M (le groupe ou ses binômes) roule-t-elle ? */
function motoRolling(ctx: Awaited<ReturnType<typeof start>>['ctx'], squadId: number): boolean {
  for (const id of [squadId, ...ctx.squads.list.filter((q) => q.parentId === squadId).map((q) => q.id)]) {
    for (const m of ctx.squads.get(id)?.members ?? []) {
      const v = ctx.vehicles.get(ctx.people.get(m)?.vehicleId ?? 0);
      if (v && v.kind === 'moto_bravm' && v.speed > 2) return true;
    }
  }
  return false;
}

describe('commandant : la fiche « Interpeller » tient sa promesse sur le terrain', () => {
  it('Concorde : Qui est le groupe BRAV-M (pas un binôme, qui refuserait sur place) et il va constater puis interpeller', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const e = cardEnvFromCore(core);
    const r = intentCandidates('interpeller', e, e.player!)[0]!;
    expect(r.kind).toBe('foule');
    // un casseur lance un projectile au cœur de la foule, sous les yeux des policiers
    const offender = ctx.people.nearest(r.x, r.z, 40, (q) => q.faction === 'protest' && q.custody === 'free' && q.vehicleId === 0)!;
    expect(offender).toBeTruthy();
    const off = ctx.law.recordOffense(offender, 'jet_projectile', offender.x, offender.z, 3);
    off.witnessed = true;
    expect(ctx.law.canArrest(offender)).toBe(true);
    const e2 = cardEnvFromCore(core);
    const card = buildCard(r, e2, 'interpeller');
    const line = card.lines[card.defaultLine]!;
    expect(line.action.kind === 'verb' && line.action.type).toBe('interpeller');
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e2, [])))!;
    const s = sentenceOf(line, who, r);
    const sq = ctx.squads.get(who.squadIds[0]!)!;
    expect(sq.kind, `${who.label} — ${s.what}`).not.toBe('binome');
    const refused: string[] = [];
    ctx.events.onAny('police:order_refused', (ev) => refused.push(JSON.stringify(ev)));
    const res = sendCardLine(sendEnv(e2), line, who, r);
    expect(res.ok, res.text).toBe(true);
    let attempted = false;
    for (let i = 0; i < 200 && !attempted; i++) {
      t.step(1);
      attempted = ctx.radio.log.some((m) => m.from === sq.name && /interpellation de l’objectif désigné/.test(m.text));
    }
    expect(refused.filter((x) => x.includes('interpeller')), refused.join('\n')).toEqual([]);
    expect(attempted, ctx.radio.log.filter((m) => m.from.startsWith('FAUCON')).map((m) => m.text).join('\n')).toBe(true);
  }, 400000);

  for (const [place, seed, px, pz] of [['Place de la Concorde', 21, -10, 15], ['Place de la Bastille', 5, 3542, 1395]] as const) {
    it(`${place} : « à pied » ou « en véhicules » dit pour la BRAV-M est ce qu’elle fait vraiment`, async () => {
      const { t, ctx, core, sendEnv } = await start(place, seed, px, pz);
      const e = cardEnvFromCore(core);
      const r = intentCandidates('interpeller', e, e.player!)[0]!;
      const card = buildCard(r, e, 'interpeller');
      const line = card.lines[card.defaultLine]!;
      const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [])))!;
      const s = sentenceOf(line, who, r);
      expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
      let rode = false;
      for (let i = 0; i < 40; i++) {
        t.step(1);
        if (motoRolling(ctx, who.squadIds[0]!)) rode = true;
      }
      expect(rode ? 'vehicules' : 'pied', s.what).toBe(who.mode);
    }, 400000);
  }

  it('Concorde : « Interpeller » à plus de 250 m, BRAV-M à pied — la fiche dit « en véhicules » et elle remonte en selle', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const e = cardEnvFromCore(core);
    const bravm = e.units.find((u) => u.symbol === 'bravm' && u.mine && ctx.squads.get(u.squadId)?.kind === 'groupe')!;
    expect(bravm.embarked).toBe(false);
    // un point sur la chaussée à ~450 m de la BRAV-M
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as never as { x: number; z: number; roadClass: string };
    let target: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !target; a++) {
      const tx = bravm.x + Math.sin(a * Math.PI / 8) * 450;
      const tz = bravm.z + Math.cos(a * Math.PI / 8) * 450;
      if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(bravm.x, bravm.z, road.x, road.z, 'vehicle', [])) target = { x: road.x, z: road.z };
    }
    expect(target).toBeTruthy();
    const r = pointRepere(target!.x, target!.z, e);
    const card = buildCard(r, e, null);
    const line = card.lines.concat(card.others).find((l) => l.action.kind === 'verb' && l.action.type === 'interpeller')!;
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [])))!;
    expect(who.squadIds).toEqual([bravm.squadId]);
    expect(who.mode).toBe('vehicules');
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    let rode = false;
    for (let i = 0; i < 90 && !rode; i++) {
      t.step(1);
      rode = motoRolling(ctx, bravm.squadId);
    }
    expect(rode, ctx.radio.log.filter((m) => m.from.startsWith('FAUCON 1')).map((m) => m.text).join('\n')).toBe(true);
  }, 400000);

});

describe('commandant : « Annuler l’ordre » (X) annule vraiment', () => {
  it('Concorde : « Y aller » à 600 m (en véhicules) annulé après 3 s — la colonne ne part pas au point', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const e = cardEnvFromCore(core);
    const sec = e.units.find((u) => u.symbol === 'section' && u.mine && u.hasVehicles)!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as never as { x: number; z: number; roadClass: string };
    let target: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !target; a++) {
      const tx = sec.x + Math.sin(a * Math.PI / 8) * 600;
      const tz = sec.z + Math.cos(a * Math.PI / 8) * 600;
      if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(sec.x, sec.z, road.x, road.z, 'vehicle', [])) target = { x: road.x, z: road.z };
    }
    const r = pointRepere(target!.x, target!.z, e);
    const card = buildCard(r, e, 'envoyer');
    const line = card.lines[card.defaultLine]!;
    expect(line.label).toBe('Y aller');
    const who = proposeWho(line, r, whoEnvFromCore(core, e, [])).find((c) => c.squadIds.length === 1 && c.squadIds[0] === sec.squadId)!;
    expect(who.mode).toBe('vehicules');
    const res = sendCardLine(sendEnv(e), line, who, r);
    expect(res.ok, res.text).toBe(true);
    t.step(3);
    expect(undoOrder(core, res.squads).ok).toBe(true);
    const lead0 = ctx.people.get(ctx.squads.get(sec.squadId)!.leaderId)!;
    const d0 = Math.hypot(lead0.x - target!.x, lead0.z - target!.z);
    let minD = d0;
    for (let i = 0; i < 120; i++) {
      t.step(1);
      const sq = ctx.squads.get(sec.squadId)!;
      for (const m of sq.members) {
        const p = ctx.people.get(m)!;
        const x = p.vehicleId ? ctx.vehicles.get(p.vehicleId)!.x : p.x;
        const z = p.vehicleId ? ctx.vehicles.get(p.vehicleId)!.z : p.z;
        minD = Math.min(minD, Math.hypot(x - target!.x, z - target!.z));
      }
    }
    const sq = ctx.squads.get(sec.squadId)!;
    expect(core.afterConvoy.has(sec.squadId)).toBe(false);
    expect(String(sq.order.type)).not.toBe('colonne');
    // personne de la section ne s'est approché du point de plus de 150 m après l'annulation
    expect(d0 - minD, `parti de ${Math.round(d0)} m, venu jusqu’à ${Math.round(minD)} m ; ordre ${sq.order.type}`).toBeLessThan(150);
  }, 400000);
});

describe('commandant : « Encercler » ne promet pas une nasse fermée qu’il ne peut pas fermer', () => {
  it('Bastille : pas assez d’unités pour toutes les rues — la phrase le dit, et la nasse n’est en effet pas déclarée', async () => {
    const { t, core, sendEnv } = await start('Place de la Bastille', 5, 3542, 1395);
    const e = cardEnvFromCore(core);
    const r = intentCandidates('encercler', e, e.player!)[0]!;
    const card = buildCard(r, e, 'encercler');
    const line = card.lines[card.defaultLine]!;
    expect(line.action.kind).toBe('nasse');
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [])))!;
    expect(who.label).toMatch(/resteront ouvertes|restera ouverte/);
    const s = sentenceOf(line, who, r).what;
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    t.step(150);
    const crowd = cardEnvFromCore(core).crowds.find((c) => c.key === r.crowdKey);
    expect(crowd?.closed ?? false).toBe(false);
    expect(s).not.toMatch(/la nasse se ferme/);
    expect(s).toMatch(/rues? rest/);
  }, 400000);
});

describe('commandant : au-delà de 250 m, « en véhicules » veut dire en véhicules', () => {
  it('Concorde : « Bond en avant jusqu’ici » à 600 m pour une section — la fiche dit « en véhicules », la section embarque', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const e0 = cardEnvFromCore(core);
    const sec = e0.units.find((u) => u.symbol === 'section' && u.mine && u.hasVehicles)!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as never as { x: number; z: number; roadClass: string };
    let target: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !target; a++) {
      const tx = sec.x + Math.sin(a * Math.PI / 8) * 600;
      const tz = sec.z + Math.cos(a * Math.PI / 8) * 600;
      if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(sec.x, sec.z, road.x, road.z, 'vehicle', [])) target = { x: road.x, z: road.z };
    }
    const e = { ...e0, selection: [sec.squadId] };
    const r = pointRepere(target!.x, target!.z, e);
    const card = buildCard(r, e, null);
    const line = card.lines.concat(card.others).find((l) => l.action.kind === 'verb' && l.action.type === 'bond_offensif')!;
    expect(line.lock).toBeNull();
    const who = proposeWho(line, r, whoEnvFromCore(core, e, [sec.squadId]))[0]!;
    expect(who.squadIds).toEqual([sec.squadId]);
    const s = sentenceOf(line, who, r).what;
    expect(who.mode, s).toBe('vehicules');
    const res = sendCardLine(sendEnv(e), line, who, r);
    expect(res.ok, res.text).toBe(true);
    let aboard = false;
    for (let i = 0; i < 60 && !aboard; i++) {
      t.step(1);
      const ids = [sec.squadId, ...ctx.squads.list.filter((q) => q.parentId === sec.squadId).map((q) => q.id)];
      aboard = ids.some((id) => (ctx.squads.get(id)?.members ?? []).some((m) => (ctx.people.get(m)?.vehicleId ?? 0) !== 0));
    }
    expect(aboard, `${s} — ordre ${ctx.squads.get(sec.squadId)!.order.type}`).toBe(true);
  }, 400000);
});
