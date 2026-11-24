// Partie robot du commandant, deuxième tour : « Toute la compagnie » (T). La fiche dit qui part, comment et quand ; la
// colonne de la compagnie, dont le commandant fait partie, doit faire ce que dit la phrase.
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
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(place: string, seed: number, x: number, z: number, means: Record<string, unknown> = MEANS) {
  const t = createTestContext({ seed, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place, x, z, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard',
    extra: { moyens: means, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

import { fixedCandidate } from '@/ui/command/tacticalState';
import { wholeCandidate } from '@/ui/command/bestUnit';

describe('commandant : « Toute la compagnie » (T) fait ce que dit la fiche', () => {
  it('Concorde : T + « Y aller » à 600 m, commandant à pied — la phrase dit que la colonne l’attend, et elle l’attend', async () => {
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
    const r = pointRepere(target!.x, target!.z, e0);
    const card = buildCard(r, e0, 'envoyer');
    const line = card.lines[card.defaultLine]!;
    const we = whoEnvFromCore(core, e0, []);
    expect(we.whole?.label).toBe('Toute la compagnie');
    // les deux chemins de T (fiche ouverte : fixedCandidate ; liste Qui : wholeCandidate) disent la même chose
    const who = fixedCandidate(e0, we.whole!.squadIds, r, we.whole!.label);
    const who2 = wholeCandidate(r, we)!;
    expect(e0.player!.inVehicle).toBe(false);
    const what = sentenceOf(line, who, r).what;
    expect(who.mode, what).toBe('vehicules');
    expect(what).toMatch(/La colonne vous attend pour partir/);
    expect(sentenceOf(line, who2, r).what).toMatch(/La colonne vous attend pour partir/);
    expect(sendCardLine(sendEnv(e0), line, who, r).ok).toBe(true);
    t.step(60);
    const cv = ctx.service<{ convoyOf(id: number): { awaitingPlayer?: boolean } | null }>('police.command')!.convoyOf(who.squadIds[0]!);
    // sur le terrain : la colonne est embarquée et attend bien le commandant
    expect(cv?.awaitingPlayer).toBe(true);
    // une section seule (le commandant n'en fait pas partie) ne l'attend pas, et la phrase ne le dit pas
    const one = fixedCandidate(e0, [sec.squadId], r);
    expect(sentenceOf(line, one, r).what).not.toMatch(/vous attend/);
  }, 600000);
});
