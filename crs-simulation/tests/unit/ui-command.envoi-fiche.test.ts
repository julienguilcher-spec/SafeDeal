// « Donner l'ordre » sur une ligne de fiche (sendLine.ts), dans une vraie partie à la Concorde (commandant, cortège de
// 300 personnes) avec la vraie carte tactique : la ligne 2 d'une rue barre « passants admis » (targetId −2) avec la
// section proposée ; « Y aller » à 2 km lance une colonne en véhicules ; « Encercler (nasse) » donne une rue à chaque
// unité ; la ligne 1 de la nasse passe en barrage filtrant l'issue la plus large ; « Annuler l'ordre » donne « cesser »
// aux mêmes unités ; une ligne 🔒 ne part jamais sans les étapes légales.
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
import { exitOpen } from '@/ui/maps/barrages';
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardEnv, CardLine, Repere, SendEnv } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { BARRAGE_LET_PASSERSBY } from '@/ui/command/orders';
import { previewOf, sentenceOf } from '@/ui/command/preview';
import { cardEnvFromCore, crowdRepere, mainCrowd, pointRepere } from '@/ui/command/reperes';
import { lineSends, sendCardLine, undoOrder } from '@/ui/command/sendLine';
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
  // la vraie carte tactique (ses ordres ne lisent pas le canevas)
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, state, sendEnv };
}

function lineOf(lines: readonly CardLine[], pred: (l: CardLine) => boolean): CardLine {
  const l = lines.find(pred);
  expect(l).toBeTruthy();
  return l!;
}

describe('« Donner l’ordre » sur une ligne de fiche (vraie partie, place de la Concorde)', () => {
  it('rue : « Barrer la rue, passants admis » part à la section proposée (targetId −2) ; « Annuler l’ordre » = cesser', async () => {
    const { t, ctx, core, state, sendEnv } = await concorde();
    const card = cardEnvFromCore(core);
    const street = intentCandidates('bloquer', card, card.player!)[0]!;
    const fiche = buildCard(street, card, 'bloquer');
    const line2 = fiche.lines[1]!;
    expect(line2.action).toEqual({ kind: 'verb', type: 'couper_circulation', geom: 'street', targetId: BARRAGE_LET_PASSERSBY });
    const who = defaultWho(proposeWho(line2, street, whoEnvFromCore(core, card, [])))!;
    expect(who.squadIds.length).toBeGreaterThan(0);
    // l'aperçu et la phrase disent la même chose avant l'envoi
    const pv = previewOf(line2, who, street, card);
    expect(pv.kind).toBe('street');
    expect(pv.passersby).toBe(true);
    expect(pv.arrows.length).toBe(who.squadIds.length);
    const sentence = sentenceOf(line2, who, street);
    expect(sentence.what).toMatch(/^Ce qui va se passer : La section|^Ce qui va se passer : Les sections/);
    expect(sentence.what).toContain('les manifestants ne passent pas, les passants oui');

    const issuedBefore = core.issued.length;
    const r = sendCardLine(sendEnv(card), line2, who, street);
    expect(r.ok, r.text).toBe(true);
    expect(r.text.startsWith(`${who.label} → Barrer `)).toBe(true);
    expect(r.text).toContain('passants admis');
    expect([...state.selection].sort()).toEqual(who.squadIds.slice().sort());
    expect(r.squads.slice().sort()).toEqual(who.squadIds.slice().sort());
    for (const id of who.squadIds) {
      const s = ctx.squads.get(id)!;
      // sur place : l'ordre lui-même ; loin : repris au débarquement de la colonne, avec l'option des passants
      const direct = s.order.type === 'couper_circulation' && s.order.targetId === BARRAGE_LET_PASSERSBY;
      const later = core.afterConvoy.get(id);
      expect(direct || (later !== undefined && later.type === 'couper_circulation' && later.targetId === BARRAGE_LET_PASSERSBY), `${s.name} : ${s.order.type}`).toBe(true);
    }
    expect(core.issued.length).toBeGreaterThan(issuedBefore);
    // la radio dit l'ordre (file d'attente des messages : quelques secondes)
    for (let i = 0; i < 40 && !ctx.radio.log.some((m) => /passants/i.test(m.text)); i++) t.step(1);
    expect(ctx.radio.log.some((m) => /passants/i.test(m.text)), ctx.radio.log.map((m) => m.text).join('\n')).toBe(true);

    // « Annuler l'ordre » (X, 5 s) : un ordre « cesser » aux mêmes unités
    const undo = undoOrder(core, r.squads);
    expect(undo.ok).toBe(true);
    for (const id of r.squads) expect(ctx.squads.get(id)!.order.type).toBe('cesser');
  }, 300000);

  it('point à 2 km : « Y aller » lance la colonne en véhicules (la phrase le dit)', async () => {
    const { t, ctx, core, sendEnv } = await concorde();
    const card = cardEnvFromCore(core);
    const me = card.player!;
    const far = pointRepere(me.x + 1400, me.z - 1400, card);
    const go = buildCard(far, card, 'envoyer');
    const line = go.lines[go.defaultLine]!;
    expect(line.label).toBe('Y aller');
    expect(line.action).toMatchObject({ kind: 'verb', type: 'colonne', geom: 'point' });
    const who = defaultWho(proposeWho(line, far, whoEnvFromCore(core, card, [])))!;
    expect(who.mode).toBe('vehicules');
    expect(sentenceOf(line, who, far).what).toContain('en véhicules');
    expect(previewOf(line, who, far, card).arrows.every((a) => a.vehicles)).toBe(true);
    const convoys: { squadId: number; stage: string }[] = [];
    ctx.events.onAny('command:convoy', (e) => convoys.push(e as { squadId: number; stage: string }));
    const r = sendCardLine(sendEnv(card), line, who, far);
    expect(r.ok, r.text).toBe(true);
    const unit = ctx.squads.get(who.squadIds[0]!)!;
    const said = (): boolean => ctx.radio.log.some((m) => m.text.includes(`${unit.name} ICI`) && /mouvement en véhicules/.test(m.text));
    for (let i = 0; i < 40 && !(said() && convoys.some((c) => c.squadId === unit.id)); i++) t.step(1);
    expect(said(), ctx.radio.log.map((m) => m.text).join('\n')).toBe(true);
    expect(convoys.some((c) => c.squadId === unit.id)).toBe(true);
  }, 300000);

  it('foule : « Encercler (nasse) » donne une rue à chaque unité ; la nasse ouvre ensuite sa sortie filtrée la plus large', async () => {
    const { t, ctx, core, sendEnv } = await concorde();
    let card = cardEnvFromCore(core);
    const main = mainCrowd(card)!;
    const rep = crowdRepere(main);
    const fiche = buildCard(rep, card, 'encercler');
    const nasse = fiche.lines[fiche.defaultLine]!;
    expect(nasse.action.kind).toBe('nasse');
    const who = proposeWho(nasse, rep, whoEnvFromCore(core, card, []))[0]!;
    expect(who.label).toMatch(/choisies? par le jeu/);
    const pv = previewOf(nasse, who, rep, card);
    expect(pv.kind).toBe('nasse');
    expect(pv.segments.length).toBe(who.squadIds.length);
    const open = main.exits.filter((e) => exitOpen(e));
    const r = sendCardLine(sendEnv(card), nasse, who, rep);
    expect(r.ok, r.text).toBe(true);
    expect(r.squads.slice().sort()).toEqual(who.squadIds.slice().sort());
    // chaque unité barre une rue différente, et chaque rue barrée est une issue ouverte de la foule
    const spots = new Set<string>();
    for (const id of r.squads) {
      const s = ctx.squads.get(id)!;
      const o = s.order.type === 'couper_circulation' ? s.order : core.afterConvoy.get(id)?.geom;
      expect(o, s.name).toBeTruthy();
      const e = open.find((q) => Math.hypot(q.x - o!.x, q.z - o!.z) < 0.5);
      expect(e, `${s.name} sur une issue`).toBeTruthy();
      spots.add(`${e!.x},${e!.z}`);
    }
    expect(spots.size).toBe(r.squads.length);
    expect(r.squads.length).toBe(Math.min(open.length, who.squadIds.length));

    // les barrages se mettent en place (la foule encerclée devient une nasse, sa clé et ses issues changent) : dès qu'une
    // foule a des issues tenues par mes unités, « Ouvrir une sortie filtrée » donne « filtrer » à celle qui tient la
    // plus large
    const heldBy = (c: { exits: readonly { held: boolean; squadId: number }[] }): number => c.exits.filter((e) => e.held && core.canCommand(e.squadId)).length;
    const best = () => core.maps.scene.crowdExits.slice().sort((a, b) => heldBy(b) - heldBy(a))[0];
    // (la scène de la carte ne se rafraîchit qu'à intervalles d'horloge réelle — ensureFresh — : l'essai la force à
    // chaque pas, sinon ce qu'il lit dépend de la vitesse de la machine et le résultat change d'une exécution à l'autre)
    for (let i = 0; i < 60 && !(best() && heldBy(best()!) >= 2); i++) {
      t.step(2);
      core.maps.scene.invalidate();
      core.maps.scene.ensureFresh();
    }
    expect(best() && heldBy(best()!)).toBeGreaterThanOrEqual(1);
    card = cardEnvFromCore(core);
    const sceneCrowd = best()!;
    const kettle: Repere = { ...crowdRepere(card.crowds.find((c) => c.key === sceneCrowd.key)!), kind: 'nasse' };
    const kfiche = buildCard(kettle, card, null);
    const filtered = kfiche.lines[0]!;
    expect(filtered.label).toBe('Ouvrir une sortie filtrée');
    const exits = sceneCrowd.exits.filter((e) => e.held && e.squadId > 0 && core.canCommand(e.squadId));
    const widest = exits.reduce((a, b) => (b.width > a.width ? b : a));
    const fr = sendCardLine(sendEnv(card), filtered, null, kettle);
    expect(fr.ok, fr.text).toBe(true);
    expect(fr.squads).toEqual([widest.squadId]);
    expect(ctx.squads.get(widest.squadId)!.order.type).toBe('filtrer');
    expect(fr.text).toContain('Issue filtrée ouverte');
  }, 300000);

  it('une ligne 🔒 ne part pas ici ; une ligne qui change la fiche n’envoie rien ; lecture du résultat', async () => {
    const { ctx, core, sendEnv } = await concorde();
    const card = cardEnvFromCore(core);
    const rep = crowdRepere(mainCrowd(card)!);
    const fiche = buildCard(rep, card, 'disperser');
    const gas = lineOf(fiche.lines, (l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz');
    expect(gas.lock).not.toBeNull();
    const who = defaultWho(proposeWho(gas, rep, whoEnvFromCore(core, card, [])))!;
    const before = core.issued.length;
    const r = sendCardLine(sendEnv(card), gas, who, rep);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('Il faut d’abord');
    expect(core.issued.length).toBe(before);
    for (const id of who.squadIds) expect(ctx.squads.get(id)!.order.type).not.toBe('disperser_gaz');
    // « L'envoyer ailleurs… » change la fiche : rien n'est envoyé
    const section = card.units.find((u) => u.mine && u.symbol === 'section')!;
    const unitCard = buildCard({ kind: 'unite', key: `unite:${section.key}`, x: section.x, z: section.z, squadId: section.squadId, name: section.name }, card, null);
    const elsewhere = unitCard.lines[0]!;
    expect(lineSends(elsewhere)).toBe(false);
    expect(sendCardLine(sendEnv(card), elsewhere, null, rep)).toEqual({ ok: false, text: '', squads: [] });
    // « Tenir sa position » sur la fiche de l'unité : l'ordre immédiat part à cette unité
    const hold = lineOf(unitCard.lines, (l) => l.action.kind === 'verb' && l.action.type === 'tenir');
    const h = sendCardLine(sendEnv(card), hold, { squadIds: unitCard.whoFixed!, label: 'Section ' + section.name, mode: 'pied', eta: 0, distance: 0, busy: '' }, unitCard.repere);
    expect(h.ok, h.text).toBe(true);
    expect(ctx.squads.get(section.squadId)!.order.type).toBe('tenir');
  }, 300000);
});
