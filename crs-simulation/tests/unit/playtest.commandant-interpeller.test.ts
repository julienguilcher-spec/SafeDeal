// Partie robot du commandant, deuxième tour : « Interpeller » jusqu'au bout (l'auteur s'éloigne pendant l'approche ;
// aucun fait constaté). La fiche dit ce qui va se passer, le terrain et la radio doivent dire la même chose.
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
import { cardEnvFromCore } from '@/ui/command/reperes';
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

/** Fiche « Interpeller » de la première foule, sa ligne par défaut, Qui proposé et la phrase. */
function arrestCard(core: CommandCore) {
  const e = cardEnvFromCore(core);
  const r = intentCandidates('interpeller', e, e.player!)[0]!;
  const card = buildCard(r, e, 'interpeller');
  const line = card.lines[card.defaultLine]!;
  const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [])))!;
  return { e, r, line, who, what: sentenceOf(line, who, r).what };
}

describe('commandant : « Interpeller » tient sa promesse jusqu’au bout', () => {
  it('Concorde : l’auteur s’enfuit pendant l’interpellation — la fiche l’a dit, et la BRAV-M rend compte tout de suite à la radio', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const e0 = cardEnvFromCore(core);
    const r0 = intentCandidates('interpeller', e0, e0.player!)[0]!;
    const offender = ctx.people.nearest(r0.x, r0.z, 40, (q) => q.faction === 'protest' && q.custody === 'free' && q.vehicleId === 0)!;
    const off = ctx.law.recordOffense(offender, 'jet_projectile', offender.x, offender.z, 3);
    off.witnessed = true;
    const { e, r, line, who, what } = arrestCard(core);
    expect(what).toMatch(/interpelle l’auteur/);
    // la fiche ne promet pas sans réserve : l'auteur peut fuir, l'unité le dit
    expect(what).toMatch(/s’il prend la fuite, l’interpellation est abandonnée/);
    const sq = ctx.squads.get(who.squadIds[0]!)!;
    let failedAt = -1;
    ctx.events.onAny('police:order_done', (ev) => {
      const d = ev as { squadId: number; type: string; ok: boolean };
      if (d.squadId === sq.id && d.type === 'interpeller' && !d.ok && failedAt < 0) failedAt = ctx.clock.now;
    });
    const t0 = ctx.clock.now;
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    let caught = false;
    for (let i = 0; i < 260 && !caught && failedAt < 0; i++) {
      t.step(1);
      caught = ctx.people.get(offender.id)!.custody !== 'free';
    }
    if (caught) return; // interpellé : la promesse est tenue
    expect(failedAt, 'ni interpellé ni abandon en 260 s').toBeGreaterThan(0);
    t.step(15);
    // le commandant l'entend dans les secondes qui suivent (pas seulement au retour en selle, des minutes plus tard)
    const heard = ctx.radio.log.filter((m) => m.t >= failedAt - 1 && m.t <= failedAt + 15 && m.from === sq.name && /en fuite|abandonnée/.test(m.text));
    expect(heard.map((m) => m.text), ctx.radio.log.filter((m) => m.t >= t0 && m.from === sq.name).map((m) => `${Math.round(m.t - t0)} ${m.text}`).join('\n')).not.toEqual([]);
  }, 600000);

  it('Concorde : aucun fait constaté — la phrase dit que la BRAV-M va constater sans interpeller, et c’est ce qu’elle fait', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const { e, r, line, who, what } = arrestCard(core);
    expect(who.label).toMatch(/^BRAV-M/);
    expect(what, what).toMatch(/va constater .*sans fait constaté, personne n’est interpellé/);
    expect(what).not.toMatch(/interpelle l’auteur/);
    const sq = ctx.squads.get(who.squadIds[0]!)!;
    const t0 = ctx.clock.now;
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    let neg = false;
    for (let i = 0; i < 240 && !neg; i++) {
      t.step(1);
      neg = ctx.radio.log.some((m) => m.t >= t0 && m.from === sq.name && /Aucun fait constaté/.test(m.text));
    }
    expect(neg).toBe(true);
    expect(ctx.people.list.filter((p) => p.faction === 'protest' && p.custody !== 'free').length).toBe(0);
  }, 600000);

  it('Concorde, sans BRAV-M : aucun fait constaté — la phrase annonce le refus du groupe, et le groupe refuse', async () => {
    const { ctx, core, sendEnv, t } = await start('Place de la Concorde', 21, -10, 15, { ...MEANS, bravm: 0 });
    const { e, r, line, who, what } = arrestCard(core);
    expect(who.label).not.toMatch(/^BRAV-M/);
    expect(what, what).toMatch(/aucun fait constaté .*ne peut interpeller personne et refusera l’ordre/i);
    const refused: number[] = [];
    ctx.events.onAny('police:order_refused', (ev) => refused.push((ev as { squadId: number }).squadId));
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    t.step(20);
    expect(refused.some((id) => who.squadIds.includes(id) || ctx.squads.get(id)?.parentId === who.squadIds[0])).toBe(true);
  }, 600000);
});
