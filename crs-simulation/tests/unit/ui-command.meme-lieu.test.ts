// Un ordre, un nom de lieu (F2 de la passe de lisibilité) : place de la Concorde, commandant. La fiche « Bloquer une
// rue » nomme une rue (« Voie Georges-Pompidou ») ; l'ordre dit à la radio, l'accusé de réception de l'unité et la ligne
// de suivi (« barre la voie Georges-Pompidou ») disent ce nom-là — pas la place voisine (« Place de la Concorde »)
// trouvée en cherchant la voie la plus proche du point, ni le secteur. En colonne (rue lointaine), l'ordre « Embarquez
// … sur <rue> » et l'ordre repris au débarquement gardent le même nom.
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
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import { busyText, defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardEnv, Repere, SendEnv } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { withArticle } from '@/ui/command/orders';
import { readTracks } from '@/ui/command/panelFollow';
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function concorde() {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

/** Nom de la rue tel que la fiche l'écrit. */
const cardName = (r: Repere): string => r.name.split(' — ')[0]!.trim();

describe('un ordre, un nom de lieu : fiche, radio, accusé de réception, suivi', () => {
  it('« Barrer la rue » : la radio et le suivi disent la rue de la fiche, pas la place voisine', async () => {
    const { t, ctx, core, sendEnv } = await concorde();
    const card = cardEnvFromCore(core);
    const streets = intentCandidates('bloquer', card, card.player!);
    // une rue dont le nom diffère du secteur et de la voie la plus proche du point (cas de la capture S1)
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    const street = streets.find((s) => {
      const n = cardName(s).toLocaleLowerCase('fr-FR');
      const near = ctx.world.nearestRoad(s.x, s.z, road, 40) ? road.name.toLocaleLowerCase('fr-FR') : '';
      return n !== ctx.world.sectorName(s.x, s.z).toLocaleLowerCase('fr-FR') && n !== near;
    }) ?? streets[0]!;
    const name = cardName(street);
    const fiche = buildCard(street, card, 'bloquer');
    const line = fiche.lines[fiche.defaultLine]!;
    expect(line.action).toMatchObject({ kind: 'verb', type: 'couper_circulation' });
    const who = defaultWho(proposeWho(line, street, whoEnvFromCore(core, card, [])))!;
    const logBefore = ctx.radio.log.length;
    const r = sendCardLine(sendEnv(card), line, who, street);
    expect(r.ok, r.text).toBe(true);

    // l'ordre dit à la radio par le commandant (écrit tout de suite au journal : RadioMessage.silent)
    const isOrder = (s: string): boolean => / ICI /.test(s) && (/Barrez la rue/.test(s) || /Embarquez/.test(s));
    for (let i = 0; i < 40 && !ctx.radio.log.slice(logBefore).some((m) => isOrder(m.text)); i++) t.step(0.5);
    // (la carte relit les unités au plus toutes les demi-secondes de temps réel : on la force à les relire, la phrase
    // d'ordre n'attendant plus la file de la radio)
    core.maps.scene.invalidate();
    const said = ctx.radio.log.slice(logBefore).map((m) => m.text);
    const order = said.find(isOrder);
    expect(order, said.join('\n')).toBeTruthy();
    expect(order!, `la radio doit dire « ${name} »`).toContain(name);

    for (const id of who.squadIds) {
      const s = ctx.squads.get(id)!;
      const later = core.afterConvoy.get(id);
      if (later) {
        // en colonne : l'ordre repris au débarquement et la ligne de suivi gardent le nom
        expect(later.geom.place).toBe(name);
        const tracks = readTracks(core, card, new Map());
        const tr = tracks.get(id);
        if (tr && tr.intended) expect(tr.intended.place).toBe(name);
        core.onConvoyStage(id, 'en_place');
      }
      expect(s.order.type).toBe('couper_circulation');
      expect(s.order.place).toBe(name);
      // ligne « ce que fait l'unité » (Qui, Mes unités) : « barre la voie … »
      const u = cardEnvFromCore(core).units.find((q) => q.squadId === id)!;
      expect(u.orderPlace).toBe(name);
      expect(busyText(u, card, true).toLocaleLowerCase('fr-FR')).toContain(withArticle(name).toLocaleLowerCase('fr-FR'));
    }
    // l'accusé de réception des unités envoyées (« ICI MISTRAL UN. REÇU, je barre la rue, <rue>. TERMINÉ. »)
    const names = new Set(who.squadIds.map((id) => ctx.squads.get(id)!.name));
    const acks = (): string[] => ctx.radio.log.slice(logBefore).filter((m) => names.has(m.from) && /REÇU, je barre la rue/.test(m.text)).map((m) => m.text);
    for (let i = 0; i < 80 && acks().length === 0; i++) t.step(0.5);
    expect(acks().length, ctx.radio.log.slice(logBefore).map((m) => `${m.from} : ${m.text}`).join('\n')).toBeGreaterThan(0);
    for (const a of acks()) expect(a).toContain(name);
  }, 300000);

  it('point quelconque « Ici : près de <rue> » : l’ordre garde cette rue, pas le secteur', async () => {
    const { t, ctx, core, sendEnv } = await concorde();
    const card = cardEnvFromCore(core);
    // un point hors chaussée, près d'une rue nommée (fiche « Ici : près de … »), dont le secteur porte un autre nom
    let where: Repere | null = null;
    const nearOf = (p: Repere): string => /près de (.+)$/u.exec(p.name.replace(/ /g, ' '))?.[1]?.trim() ?? '';
    for (let r = 60; r < 400 && !where; r += 20) {
      for (let a = 0; a < 16 && !where; a++) {
        const x = card.player!.x + Math.sin(a * 0.39) * r, z = card.player!.z + Math.cos(a * 0.39) * r;
        if (card.roadAt(x, z, 8)) continue;
        const p = pointRepere(x, z, card);
        const n = nearOf(p);
        if (n !== '' && n.toLocaleLowerCase('fr-FR') !== ctx.world.sectorName(x, z).toLocaleLowerCase('fr-FR')) where = p;
      }
    }
    expect(where, 'aucun point « près de » trouvé').toBeTruthy();
    const name = nearOf(where!);
    const fiche = buildCard(where!, card, 'envoyer');
    const line = fiche.lines.find((l) => l.action.kind === 'verb' && l.action.type === 'tenir') ?? fiche.lines[fiche.defaultLine]!;
    expect(line.action.kind).toBe('verb');
    const who = defaultWho(proposeWho(line, where!, whoEnvFromCore(core, card, [])))!;
    const r = sendCardLine(sendEnv(card), line, who, where!);
    expect(r.ok, r.text).toBe(true);
    t.step(1);
    for (const id of who.squadIds) {
      const later = core.afterConvoy.get(id);
      expect(later ? later.geom.place : ctx.squads.get(id)!.order.place).toBe(name);
    }
  }, 300000);
});
