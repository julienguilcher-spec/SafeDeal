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
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { sentenceOf } from '@/ui/command/preview';
import { cardEnvFromCore, crowdRepere, pointRepere, unitRepere } from '@/ui/command/reperes';
import type { CardEnv, SendEnv } from '@/ui/command/cardTypes';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

// Partie robot du commandant, troisième tour : une voiture de Police secours / BAC (trois policiers) reçoit un ordre de
// la fiche. Les lignes offertes et la phrase « Ce qui va se passer » doivent convenir à une voiture : ni « Tenir une
// ligne », ni « boucliers levés », ni charge ni gaz ; et ce que dit la phrase (elle s'y rend en voiture) arrive.
const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, patrols, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const UNFIT = /boucliers|en formation|tient une ligne|charge|gaz|encercle|tortue|barre /;

async function start() {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

function sentences(core: CommandCore, e: CardEnv, r: ReturnType<typeof pointRepere>, intent: Parameters<typeof buildCard>[2], sel: number[]) {
  const card = buildCard(r, e, intent);
  return {
    card,
    texts: card.lines.concat(card.others).map((l) => {
      const who = defaultWho(proposeWho(l, r, whoEnvFromCore(core, e, sel)));
      return `${l.label} → ${sentenceOf(l, who, r).what}`;
    }),
  };
}

describe('commandant : une voiture de patrouille reçoit un ordre de la fiche', () => {
  it('Concorde : la fiche d’un point n’offre à la voiture ni ligne ni charge, et « Y aller » l’y amène en voiture', async () => {
    const { t, ctx, core, sendEnv } = await start();
    const e0 = cardEnvFromCore(core);
    const pat = e0.units.find((u) => u.patrol && u.mine)!;
    expect(pat).toBeTruthy();
    const e = { ...e0, selection: [pat.squadId] };
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as never as { x: number; z: number; roadClass: string };
    let target: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !target; a++) {
      const tx = pat.x + Math.sin(a * Math.PI / 8) * 300, tz = pat.z + Math.cos(a * Math.PI / 8) * 300;
      if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(pat.x, pat.z, road.x, road.z, 'vehicle', [])) target = { x: road.x, z: road.z };
    }
    const r = pointRepere(target!.x, target!.z, e);
    const { card, texts } = sentences(core, e, r, 'envoyer', [pat.squadId]);
    expect(texts.filter((s) => UNFIT.test(s)), texts.join('\n')).toEqual([]);
    expect(card.lines.concat(card.others).filter((l) => UNFIT.test(l.explain)).map((l) => `${l.label} : ${l.explain}`)).toEqual([]);
    expect(card.lines.concat(card.others).map((l) => l.label)).not.toContain('Tenir une ligne ici');
    const line = card.lines[card.defaultLine]!;
    expect(line.label).toBe('Y aller');
    expect(line.explain).not.toMatch(/à pied|formation/i);
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [pat.squadId])))!;
    expect(who.squadIds).toEqual([pat.squadId]);
    const what = sentenceOf(line, who, r).what;
    expect(what).toMatch(/s’y rend en voiture/);
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    const sq = ctx.squads.get(pat.squadId)!;
    let best = Infinity;
    for (let i = 0; i < 120 && best > 25; i++) {
      t.step(1);
      const v = ctx.vehicles.get(ctx.people.get(sq.leaderId)?.vehicleId ?? 0);
      if (v) best = Math.min(best, Math.hypot(v.x - target!.x, v.z - target!.z));
    }
    expect(best, what).toBeLessThan(25);
  }, 400000);

  it('Concorde : fiche de la voiture et fiche de la foule (Disperser) avec la voiture choisie — rien qui parle de boucliers', async () => {
    const { core } = await start();
    const e0 = cardEnvFromCore(core);
    const pat = e0.units.find((u) => u.patrol && u.mine)!;
    const e = { ...e0, selection: [pat.squadId] };
    const u = sentences(core, e, unitRepere(pat), null, [pat.squadId]);
    expect(u.texts.filter((s) => UNFIT.test(s)), u.texts.join('\n')).toEqual([]);
    const fr = intentCandidates('disperser', e, e.player!)[0]!;
    expect(fr.kind).toBe('foule');
    const f = sentences(core, e, crowdRepere(e.crowds.find((c) => c.key === fr.crowdKey)!), 'disperser', [pat.squadId]);
    expect(f.texts.filter((s) => UNFIT.test(s)), f.texts.join('\n')).toEqual([]);
  }, 400000);
});
