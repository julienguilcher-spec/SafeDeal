// Carte de commandement et commissariats (vraie carte de Paris, commandant place de la Concorde) : « Rentrer au
// commissariat » au catalogue (« Fin d'action ») ; fiche d'un poste (« Envoyer … · prête », la ligne de l'unité
// choisie surlignée) ; la BRAV-M FAUCON 9 engagée et envoyée « en véhicules » part en colonne, sans l'avis « à pied » ;
// la section AQUILON 1 engagée reçoit son ordre dans le même pas (étendue du commandement recalculée), puis rentre
// sans deux-tons au centre de sa file de places ; la voiture TV 75-19 rentre « au poste » par le module des
// patrouilles ; un CRS ne peut rien engager mais C ouvre la fiche du poste en lecture ; les unités au poste ou en
// alerte ne prennent pas les chiffres des sections de la compagnie ; textes et tri de « Plus… › Commissariats ».
import { describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE } from '@/gameplay/patrols';
import type { PatrolsApi } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatView, CommissariatsApi, StockEntryView } from '@/gameplay/commissariats';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { CommandApi as PoliceCommandApi } from '@/sim/police/command/api';
import { commissariatById, fileCentre } from '@/world/commissariats';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { ORDER_GROUP_LABELS, verbOf } from '@/ui/command/orders';
import { keyboardSections, mapKey } from '@/ui/command/tacticalKeys';
import { proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import { stationWhoAt, stationWhoExt } from '@/ui/command/commissariatsLink';
import {
  buildRows, entryNumber, entryStateLabel, entryWhat, restText, stationSub,
} from '@/ui/command/commissariatsModel';
import type { Repere } from '@/ui/command/cardTypes';

const SIM = [world, roles, people, vehicles, traffic, police, law, radio, session, patrols, commissariats, command];
const MEANS = { sections: 2, fourgons: 4, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const REPUBLIQUE = { x: 3123, z: -208, heading: 0, width: 20 };

async function start(config: Partial<SessionConfig> = {}, seed = 7) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
    tension: 0.1, volatility: 0.1, duration: 'standard', ...config,
    extra: { moyens: MEANS, variante: 'salle', foyers: 0, ...(config.extra ?? {}) },
  } as Partial<SessionConfig>);
  t.step(1);
  const core = t.ctx.require<CommandCore>('ui.command');
  return { t, ctx: t.ctx, core, api: t.ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE) };
}

/** Messages radio soumis (la file de la radio peut en différer ou en écarter la diffusion). */
function spyRadio(ctx: { radio: { say: (msg: { text: string }) => void } }): string[] {
  const out: string[] = [];
  const orig = ctx.radio.say.bind(ctx.radio);
  ctx.radio.say = (msg) => {
    out.push(msg.text);
    orig(msg);
  };
  return out;
}

/** Avis affichés au joueur (ctx.ui.notify). */
function spyNotices(ctx: { ui: { notify: (text: string, ...rest: never[]) => void } }): string[] {
  const out: string[] = [];
  const orig = ctx.ui.notify.bind(ctx.ui);
  ctx.ui.notify = ((text: string, ...rest: never[]) => {
    out.push(text);
    return orig(text, ...rest);
  }) as typeof ctx.ui.notify;
  return out;
}

function stationRepere(core: CommandCore, id: string, entryId?: number): Repere {
  const env = cardEnvFromCore(core);
  const s = env.stations.find((q) => q.id === id)!;
  return { kind: 'commissariat', key: `commissariat:${id}${entryId !== undefined ? '#' + entryId : ''}`, x: s.x, z: s.z, stationId: id, entryId, name: s.name };
}

describe('carte de commandement — commissariats', () => {
  it('« Rentrer au commissariat » au catalogue ; fiche du poste : une ligne « Envoyer » par unité prête, l’unité choisie surlignée', async () => {
    const { core } = await start();
    const v = verbOf('retour_poste')!;
    expect(v).toBeDefined();
    expect(v.group).toBe('fin');
    expect(ORDER_GROUP_LABELS[v.group]).toBe('Fin d’action');
    expect(v.plain).toBe('Rentrer au commissariat');

    const env = cardEnvFromCore(core);
    expect(env.stations.map((s) => s.id).sort()).toEqual(['1er', '3e', '7e', '8e', '9e', 'celestins', 'cite']);
    const neuf = env.stations.find((s) => s.id === '9e')!;
    expect(neuf.name).toBe('Commissariat du 9e');
    expect(neuf.street).toBe('rue Chauchat');
    expect(neuf.distance).toBeGreaterThan(1000);
    expect(neuf.eta).toBeGreaterThan(60);
    const faucon = neuf.entries.find((e) => e.name === 'FAUCON 9')!;
    expect(faucon.defaultVerb).toBe('colonne');
    expect(neuf.entries.find((e) => e.name === 'TV 75-19')!.defaultVerb).toBe('avancer');

    const card = buildCard(stationRepere(core, '9e'), env, null);
    console.log(`fiche : ${card.title} | ${card.sub}\n  ${card.lines.map((l) => l.label).join('\n  ')}`);
    expect(card.title).toBe('COMMISSARIAT DU 9ᵉ — rue Chauchat');
    expect(card.sub).toMatch(/^\d+,\d km · ≈ \d+ min deux-tons · 3 prêtes$/);
    expect(card.lines.map((l) => l.label)).toEqual([
      'Envoyer FAUCON 9 — BRAV-M (policiers à moto), 6 motos · prête',
      'Envoyer TV 75-19 — Police secours, 3 gardiens · prête',
      'Envoyer BAC 75-09 — voiture banalisée, 3 policiers · prête',
      'Toutes les unités du poste…',
    ]);
    // rangée de « Plus… › Commissariats » choisie : la ligne de cette unité est surlignée
    const tv = neuf.entries.find((e) => e.name === 'TV 75-19')!;
    const picked = buildCard(stationRepere(core, '9e', tv.entryId), env, null);
    expect(picked.lines[picked.defaultLine]!.label).toBe('Envoyer TV 75-19 — Police secours, 3 gardiens · prête');
    // la Cité : le car et le PC mobile ne s'engagent pas (pas de ligne « Envoyer »)
    const cite = buildCard(stationRepere(core, 'cite'), env, null);
    expect(cite.lines.some((l) => /CAR CRS|PC MOBILE/.test(l.label))).toBe(false);
    expect(cite.lines.filter((l) => l.action.kind === 'engage').length).toBe(4);
  }, 300000);

  it('BRAV-M : « Faire mouvement » vaut « En colonne », sans l’avis « mouvement à pied »', async () => {
    const { t, ctx, core, api } = await start();
    const notices = spyNotices(ctx as never);
    const said = spyRadio(ctx as never);
    const r = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(r.ok).toBe(true);
    const bravm = ctx.squads.get(r.squadId)!;
    expect(api.entry('9e:faucon9')!.state).toBe('alerte');
    const res = core.issue('faire_mouvement', [bravm], [REPUBLIQUE]);
    expect(res.ok).toBe(true);
    expect(bravm.order.type).toBe('colonne');
    expect(Math.hypot(bravm.order.x - REPUBLIQUE.x, bravm.order.z - REPUBLIQUE.z)).toBeLessThan(1);
    expect(notices.some((n) => /à pied/.test(n))).toBe(false);
    expect(said.some((m) => /^FAUCON 9 ICI .*Mouvement à moto, en colonne/.test(m))).toBe(true);
    expect(said.some((m) => /Équipage prêt au commissariat du 9e, en attente de destination/.test(m))).toBe(true);
    t.step(2);
  }, 300000);

  it('AQUILON 1 : engagée puis ordre dans le même pas ; « Rentrer au commissariat » : au centre de sa file, sans deux-tons', async () => {
    const { t, ctx, core, api } = await start();
    const cmd = ctx.require<PoliceCommandApi>('police.command');
    const said = spyRadio(ctx as never);
    const arrivals: Record<string, unknown>[] = [];
    const arrive = cmd.arrive.bind(cmd);
    (cmd as { arrive: PoliceCommandApi['arrive'] }).arrive = (id, dest) => {
      arrivals.push({ id, ...dest });
      return arrive(id, dest);
    };
    // l'étendue du commandement est mise en cache : elle est lue juste avant l'engagement
    expect(core.scope().level).toBe('tout');
    const r = core.engageFromCommissariat(entryNumber('cite:aquilon1'));
    expect(r.ok).toBe(true);
    const section = ctx.squads.get(r.squadId)!;
    // même pas : accepté (étendue recalculée), colonne lancée, « tenir » repris au débarquement
    const res = core.issue('tenir', [section], [REPUBLIQUE]);
    expect(res.ok).toBe(true);
    expect(cmd.convoyOf(section.id)).not.toBeNull();
    expect(core.afterConvoy.get(section.id)?.type).toBe('tenir');
    const entry = api.entry('cite:aquilon1')!;
    for (let k = 0; k < 90 && entry.state !== 'engage'; k++) t.step(2);
    expect(entry.state).toBe('engage');

    const vans = ctx.vehicles.list.filter((v) => entry.vehicleIds.includes(v.id));
    expect(vans.length).toBe(3);
    arrivals.length = 0;
    const back = core.issue('retour_poste', [section], null);
    expect(back.ok).toBe(true);
    expect(entry.state).toBe('retour');
    expect(core.afterConvoy.has(section.id)).toBe(false);
    const cite = commissariatById('cite')!;
    const centre = fileCentre(cite, cite.stock.find((s) => s.id === 'cite:aquilon1')!);
    expect(arrivals.length).toBe(1);
    const dest = arrivals[0]! as { x: number; z: number; urgence: boolean; disembark: boolean; layout: string };
    expect(Math.hypot(dest.x - centre.x, dest.z - centre.z)).toBeLessThan(1);
    expect(dest.urgence).toBe(false);
    expect(dest.disembark).toBe(false);
    expect(dest.layout).toBe('file');
    expect(said.some((m) => /^AQUILON 1 ICI .*Fin de mission, rentrez à la préfecture de police, sans deux-tons\. PARLEZ\.$/.test(m))).toBe(true);
    t.step(30);
    for (const v of vans) expect(v.siren).toBe(0);
    // la fiche de l'unité dit qu'elle rentre
    const env = cardEnvFromCore(core);
    const u = env.units.find((q) => q.squadId === section.id)!;
    expect(u.order?.type).toBe('retour_poste');
    expect(u.orderPlace).toBe('à la préfecture de police');
    // une unité déjà au poste ne « rentre » pas une seconde fois
    const tv = core.engageFromCommissariat(entryNumber('9e:tv19'));
    expect(core.issue('retour_poste', [ctx.squads.get(tv.squadId)!], null).ok).toBe(true); // en alerte : alerte levée
    expect(api.entry('9e:tv19')!.state).toBe('au_poste');
    const again = core.issue('retour_poste', [ctx.squads.get(tv.squadId)!], null);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('TV 75-19 est déjà au commissariat du 9e.');
  }, 600000);

  it('TV 75-19 envoyée puis rappelée : rentre à sa place par le module des patrouilles, « Au poste » puis au repos', async () => {
    const { t, ctx, core, api } = await start();
    const pat = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    const r = core.engageFromCommissariat(entryNumber('9e:tv19'));
    expect(r.ok).toBe(true);
    const car = ctx.squads.get(r.squadId)!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    expect(ctx.world.nearestRoad(1650, -700, road, 120)).toBe(true);
    expect(core.issue('avancer', [car], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]).ok).toBe(true);
    const entry = api.entry('9e:tv19')!;
    for (let k = 0; k < 120 && entry.state !== 'engage'; k++) t.step(2);
    expect(entry.state).toBe('engage');
    expect(core.issue('retour_poste', [car], null).ok).toBe(true);
    expect(entry.state).toBe('retour');
    const view = pat.statusOf(car.id)!;
    const t0 = ctx.clock.now;
    for (let k = 0; k < 300 && entry.state === 'retour'; k++) t.step(2);
    console.log(`TV 75-19 : ${entry.state} en ${Math.round(ctx.clock.now - t0)} s (${view.state} — ${view.label})`);
    expect(entry.state).toBe('repos');
    expect(view.state).toBe('au_poste');
    expect(api.atPost(car.id)).toBe(true);
    expect(core.atPost(car.id)).toBe(true);
  }, 900000);

  it('CRS : rien à engager, mais C ouvre la fiche du poste en lecture (état de chaque unité)', async () => {
    const { core } = await start({ role: 'crs', rank: 'gardien' } as Partial<SessionConfig>);
    expect(core.scope().level).toBe('lecture');
    const r = core.engageFromCommissariat(entryNumber('9e:tv19'));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Seul le commandant engage les moyens des commissariats');
    // C est lue avant le retour anticipé de la lecture seule
    expect(mapKey('KeyC', false, { level: 'lecture', card: false })).toEqual({ kind: 'stations' });
    const env = cardEnvFromCore(core);
    expect(env.level).toBe('lecture');
    const card = buildCard(stationRepere(core, '9e'), env, null);
    expect(card.lines).toEqual([]);
    expect(card.notes[0]).toBe('Seul le commandant engage les moyens des commissariats.');
    expect(card.notes).toContain('TV 75-19 — Au poste — prête');
    expect(card.notes).toContain('FAUCON 9 — Au poste — prête');
    // personne à proposer dans la liste Qui
    expect(stationWhoExt(core).stationCandidates({ x: 0, z: 0 })).toEqual([]);
  }, 300000);

  it('renforts fixés par l’ordre d’opération : fiche sans « Envoyer », la note le dit', async () => {
    const { core } = await start({ extra: { renforts: false } } as Partial<SessionConfig>);
    const env = cardEnvFromCore(core);
    const card = buildCard(stationRepere(core, '9e'), env, null);
    expect(card.lines.map((l) => l.label)).toEqual(['Toutes les unités du poste…']);
    expect(card.notes[0]).toBe('Moyens fixés par l’ordre d’opération.');
    expect(core.engageFromCommissariat(entryNumber('9e:tv19')).ok).toBe(false);
  }, 300000);

  it('exclusions : une unité en alerte ne prend ni les chiffres des sections, ni Qui ; les renforts viennent après mes unités', async () => {
    const { core, api } = await start();
    core.maps.scene.invalidate();
    core.maps.scene.ensureFresh();
    const sectionsBefore = keyboardSections(core.maps.scene.units, (id) => core.canOrder(id)).map((u) => u.squadId);
    const r = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(r.ok).toBe(true);
    expect(api.atPost(r.squadId)).toBe(true);
    core.maps.scene.invalidate();
    core.maps.scene.ensureFresh();
    const units = core.maps.scene.units;
    expect(units.some((u) => u.squadId === r.squadId)).toBe(true);
    // rappel : sans le filtre, la BRAV-M en alerte prendrait un chiffre à côté de la compagnie
    const raw = keyboardSections(units, (id) => core.canCommand(id)).map((u) => u.squadId);
    expect(raw).toContain(r.squadId);
    const keys = keyboardSections(units, (id) => core.canOrder(id));
    expect(sectionsBefore.length).toBeGreaterThan(1);
    expect(keys.map((u) => u.squadId)).toEqual(sectionsBefore);
    expect(keys.some((u) => u.squadId === r.squadId)).toBe(false);
    // Qui : la BRAV-M en alerte n'est pas proposée d'office ; les renforts sont en fin de liste
    const env = cardEnvFromCore(core);
    const who = whoEnvFromCore(core, env, [], stationWhoExt(core));
    expect(who.canCommand(r.squadId)).toBe(false);
    const line = buildCard({ kind: 'point', key: 'point:x', x: 600, z: -300, name: 'Ici' }, env, 'envoyer').lines[0]!;
    const list = proposeWho(line, { x: 600, z: -300 }, who);
    expect(list.some((c) => c.squadIds.includes(r.squadId))).toBe(false);
    const first = list.findIndex((c) => c.fromStation !== undefined);
    expect(first).toBeGreaterThan(0);
    expect(list.slice(first).every((c) => c.fromStation !== undefined)).toBe(true);
    // « OÙ L'ENVOYER ? » : le délai depuis le poste suit le lieu visé
    const tv = list.find((c) => c.label === 'TV 75-19 (commissariat du 9e)')!;
    expect(tv).toBeDefined();
    const near = stationWhoAt(core, tv, { x: 1352, z: -800 });
    const far = stationWhoAt(core, tv, REPUBLIQUE);
    expect(far.eta).toBeGreaterThan(near.eta + 60);
    expect(far.distance).toBeGreaterThan(Math.hypot(REPUBLIQUE.x - 1352, REPUBLIQUE.z + 850));
  }, 300000);
});

describe('commissariats — textes de la carte (pur)', () => {
  const view = (id: string, x: number, entries: Partial<StockEntryView>[]): CommissariatView => ({
    id, name: `Commissariat du ${id} — rue X`, short: id, kind: 'commissariat_central', x, z: 0, returnX: x, returnZ: 0, returnHeading: 0,
    available: 0, engaged: 0, resting: 0, patrols: [],
    entries: entries.map((e, i) => ({
      id: `${id}:u${i}`, commissariatId: id, kind: 'police_secours', callsign: `TV 75-${i}`, label: '', vehicle: 'voiture_police', vehicles: 1,
      crew: 3, state: 'au_poste', squadId: 0, restUntil: 0, vehicleIds: [], engageable: true, where: '', ...e,
    })),
  });

  it('états en clair, repos, nature des unités', () => {
    const base = { engageable: true, vehicles: 1, where: '', restUntil: 0 };
    expect(entryStateLabel({ ...base, state: 'au_poste' }, 0)).toBe('Au poste — prête');
    expect(entryStateLabel({ ...base, state: 'alerte' }, 0)).toBe('En alerte (équipage à bord)');
    expect(entryStateLabel({ ...base, state: 'engage', where: 'place de la République' }, 0)).toBe('Engagée — place de la République');
    expect(entryStateLabel({ ...base, state: 'retour' }, 0)).toBe('Retour au commissariat');
    expect(entryStateLabel({ ...base, state: 'repos', restUntil: 180 }, 100)).toBe('Au repos 1:20');
    expect(entryStateLabel({ ...base, state: 'indisponible' }, 0)).toBe('Indisponible');
    expect(entryStateLabel({ ...base, state: 'au_poste', vehicles: 0 }, 0)).toBe('Indisponible');
    expect(entryStateLabel({ ...base, state: 'au_poste', engageable: false }, 0)).toBe('Garé — hors dispositif');
    expect(restText(65.2)).toBe('1:06');
    expect(restText(-3)).toBe('0:00');
    expect(entryWhat({ kind: 'bravm', crew: 12, vehicles: 6, label: '' })).toBe('BRAV-M (policiers à moto), 6 motos');
    expect(entryWhat({ kind: 'section_crs', crew: 19, vehicles: 3, label: '' })).toBe('section de CRS, 3 fourgons, 19 agents');
    expect(stationSub(2140, 250, 3)).toBe('à 2,1 km · ≈ 4 min deux-tons · 3 prêtes');
    expect(stationSub(380, 60, 1)).toBe('à 380 m · ≈ 1 min deux-tons · 1 prête');
    expect(stationSub(0, 0, 0)).toBe('aucune unité prête');
  });

  it('« Plus… › Commissariats » : du plus proche au plus loin ; envoyer, sa fiche, ou rien', () => {
    const views = [
      view('9e', 1400, [{}, { state: 'engage', squadId: 41, where: 'Opéra' }, { state: 'repos', squadId: 42, restUntil: 90 }]),
      view('1er', 800, [{ state: 'alerte', squadId: 43 }]),
      view('7e', -700, [{ engageable: false, kind: 'hors_dispositif', label: 'Car de transport CRS · hors dispositif' }]),
    ];
    (views[0]!.patrols as number[]).push(77);
    const o = {
      now: 30, ref: { x: 0, z: 0 }, travel: (id: string) => {
        const d = Math.abs(views.find((v) => v.id === id)!.x);
        return { distance: d, eta: d / 10 };
      }, streetOf: () => 'Rue Chauchat',
      canDispatch: true, commandable: (id: number) => id !== 42, patrol: (id: number) => (id === 77 ? { name: 'BAC 75-91', status: 'En patrouille' } : null),
    };
    const rows = buildRows(views, o);
    expect(rows.map((r) => r.id)).toEqual(['7e', '1er', '9e']);
    expect(rows[2]!.title).toBe('Commissariat du 9e — rue Chauchat');
    expect(rows[2]!.sub).toBe('à 1,4 km · ≈ 2 min deux-tons · 1 prête');
    expect(rows[2]!.units.map((u) => [u.stateText, u.action])).toEqual([
      ['Au poste — prête', 'envoyer'], ['Engagée — Opéra', 'fiche'], ['Au repos 1:00', 'aucune'],
    ]);
    expect(rows[1]!.units[0]!.action).toBe('envoyer');
    expect(rows[0]!.units[0]!.action).toBe('aucune');
    expect(rows[2]!.patrols).toEqual([{ squadId: 77, name: 'BAC 75-91', status: 'En patrouille' }]);
    // sans droit d'engager : la liste ne fait que renseigner (fiche des unités sous ses ordres)
    const ro = buildRows(views, { ...o, canDispatch: false, commandable: () => false });
    expect(ro.flatMap((r) => r.units.map((u) => u.action)).every((a) => a === 'aucune')).toBe(true);
  });
});
