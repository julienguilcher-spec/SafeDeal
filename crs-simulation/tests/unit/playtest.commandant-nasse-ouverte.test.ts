// Partie robot du commandant, troisième tour : l'unité qui tient une issue d'une nasse fermée est envoyée ailleurs.
// La fiche doit le dire (Qui : « la quittera : la nasse s'ouvre »), pas un simple « la quittera », et l'ordre part.
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
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('commandant : l’unité d’une issue de nasse fermée, envoyée ailleurs', () => {
  it('Concorde : Qui dit que la nasse s’ouvre (pas seulement « la quittera »), et l’ordre part à cette unité', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard',
      extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    t.step(3);
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>('ui.command')!;
    const state = new TacticalState();
    const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
    const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
    // « Bloquer une rue » : la section proposée part barrer la première issue
    const e = cardEnvFromCore(core);
    const r = intentCandidates('bloquer', e, e.player!)[0]!;
    const card = buildCard(r, e, 'bloquer');
    const line = card.lines[card.defaultLine]!;
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, [])))!;
    expect(sendCardLine(sendEnv(e), line, who, r).ok).toBe(true);
    t.step(5);
    const holder = who.squadIds[0]!;
    // nasse fermée : toutes les issues tenues, celle-ci par le groupe de tête de la section (état posé dans la fiche)
    const e2 = cardEnvFromCore(core);
    const child = e2.units.find((u) => u.parentId === holder)!;
    const e3: CardEnv = {
      ...e2, selection: [holder],
      crowds: e2.crowds.map((c) => (c.key !== r.crowdKey ? c : {
        ...c, closed: true, exits: c.exits.map((x, i) => ({ ...x, held: true, squadId: i === 0 ? child.squadId : x.squadId })),
      })),
    };
    expect(String(e3.units.find((u) => u.squadId === holder)!.order?.type)).toBe('couper_circulation');
    const sec = e3.units.find((u) => u.squadId === holder)!;
    const go = pointRepere(sec.x + 120, sec.z + 120, e3);
    const gcard = buildCard(go, e3, 'envoyer');
    const gline = gcard.lines[gcard.defaultLine]!;
    const gwho = proposeWho(gline, go, whoEnvFromCore(core, e3, [holder]))[0]!;
    expect(gwho.squadIds).toEqual([holder]);
    expect(gwho.busy).toMatch(/la quittera\u00a0: la nasse s’ouvre/);
    // une section qui ne tient aucune issue de la nasse : simple « la quittera »
    const other = e3.units.find((u) => u.symbol === 'section' && u.squadId !== holder && u.mine && u.order)!;
    if (other) expect(proposeWho(gline, go, whoEnvFromCore(core, { ...e3, selection: [other.squadId] }, [other.squadId]))[0]!.busy).not.toMatch(/nasse/);
    expect(sendCardLine(sendEnv(e3), gline, gwho, go).ok).toBe(true);
    t.step(2);
    expect(String(ctx.squads.get(holder)!.order.type)).not.toBe('couper_circulation');
  }, 400000);
});
