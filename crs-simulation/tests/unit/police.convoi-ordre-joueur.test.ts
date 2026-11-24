// Ordres du joueur et colonnes de véhicules (plan « ordres directs », paquet P3 ; diag-arrivee R1, R2, R3, M2) :
//   - le chef de groupe à pied qui envoie son propre groupe : personne ne remonte dans les fourgons, aucune colonne ne
//     l'attend ;
//   - journée de service du commandant, passager de son véhicule : la colonne s'arrête près de la manifestation ;
//       · l'adjoint propose le dispositif dans les cinq secondes (il se taisait deux minutes) ;
//       · le joueur descend et fait barrer une rue à une section pendant que la colonne se gare : elle descend et y va
//         dans les dix secondes, et le « débarquez » de fin de trajet ne remplace jamais son ordre ;
//       · tout le monde est à pied dans les quarante secondes (on restait assis jusqu'à neuf minutes) ;
//   - colonne qui roule : un ordre pour un point proche des fourgons de l'unité la libère (ses fourgons s'arrêtent, elle
//     descend et y va) ; un ordre pour un point lointain est emporté jusqu'à l'arrêt, personne ne descend en route ;
//   - une tâche (« secourir ») donnée à une section assise dans ses fourgons : un binôme descend d'abord, puis y va (la
//     tâche ne voyait personne à pied et était refusée, ou partait avec les seuls conducteurs).
// Modules réels, carte de Paris, foule allégée.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import type { CommandCore } from '@/ui/command';
import { buildSessionConfig, defaultDraft, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { spawnProtesters } from '@/sim/police/testkit';
import { SIM, walk } from './playtest.commandant-mission.lib';

interface ConvoyLike { stage: string; awaitingPlayer?: boolean }
interface CommandLike {
  convoyOf(id: number): ConvoyLike | null;
  proposals: readonly { id: number; key: string; text: string; executable: boolean }[];
}

/** Membres (sous-unités comprises), le joueur exclu. */
function membersOf(ctx: GameContext, id: number): Person[] {
  const out: Person[] = [];
  const add = (sid: number): void => {
    const s = ctx.squads.get(sid);
    if (!s) return;
    for (const m of s.members) {
      const p = ctx.people.get(m);
      if (p && !p.isPlayer) out.push(p);
    }
    for (const k of ctx.squads.childrenOf(sid)) add(k.id);
  };
  add(id);
  return out;
}

/** Agents de l'unité qui doivent descendre (ni conducteurs, ni équipages d'engins, ni interpellés, ni blessés graves). */
function passengers(ctx: GameContext, id: number): Person[] {
  return membersOf(ctx, id).filter((p) => p.custody === 'free' && p.health > 0 && p.injury !== 'serious' && p.injury !== 'critical'
    && p.poste !== 'conducteur' && p.poste !== 'pilote_moto' && !(ctx.squads.get(p.squadId)?.kind === 'equipage'));
}

function cfgOf(patch: Partial<ScenarioDraft>): ReturnType<typeof buildSessionConfig> {
  return buildSessionConfig(sanitizeDraft({ ...defaultDraft(), mode: 'libre', ...patch }));
}

/** Premier déplacement (plus de 2 m) d'un agent de l'unité depuis l'instant de l'appel : s, −1 si aucun pendant `max` s. */
function firstMove(t: ReturnType<typeof createTestContext>, people: readonly Person[], max: number): number {
  const ctx = t.ctx;
  const p0 = new Map(people.map((p) => {
    const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
    return [p.id, { x: v ? v.x : p.x, z: v ? v.z : p.z }];
  }));
  const t0 = ctx.clock.now;
  for (let k = 0; k < max * 4; k++) {
    t.step(0.25);
    for (const p of people) {
      if (p.vehicleId !== 0) continue;
      const a = p0.get(p.id)!;
      if (Math.hypot(p.x - a.x, p.z - a.z) > 2) return ctx.clock.now - t0;
    }
  }
  return -1;
}

describe('ordres du joueur et colonnes', () => {
  it('tâche à une section assise dans ses fourgons : un binôme descend aussitôt et porte secours', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    await t.ready;
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 150, tension: 0.1,
      volatility: 0.1, duration: 'standard', extra: { moyens: { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true }, variante: 'terrain' },
    } as never);
    t.step(3);
    const ctx = t.ctx;
    const me = ctx.player.person()!;
    let company = ctx.squads.get(me.squadId)!;
    while (company.parentId !== 0) company = ctx.squads.get(company.parentId)!;
    const sec = ctx.squads.list.find((q) => q.parentId === company.id && q.kind === 'section' && passengers(ctx, q.id).length >= 8)!;
    expect(sec).toBeTruthy();
    const ppl = passengers(ctx, sec.id);
    // la section embarque dans ses fourgons
    ctx.squads.issue(sec.id, { type: 'embarquer', issuedBy: me.id, byPlayer: true });
    for (let i = 0; i < 60 && ppl.filter((p) => p.vehicleId !== 0).length < ppl.length; i++) t.step(1);
    const seated0 = ppl.filter((p) => p.vehicleId !== 0).length;
    expect(seated0).toBeGreaterThanOrEqual(ppl.length - 1);
    // un blessé grave à terre, à 25 m du premier fourgon
    const van = ctx.vehicles.get(ctx.squads.childrenOf(sec.id).find((g) => g.vehicleId !== 0)!.vehicleId)!;
    const victim = spawnProtesters(ctx, 1, van.x + Math.sin(van.heading) * 25, van.z + Math.cos(van.heading) * 25, 0, 'pacifique')[0]!;
    ctx.health.hurt(victim, { amount: 80, kind: 'impact', sourceId: 0, x: victim.x, z: victim.z, zone: 0.5 });
    t.step(0.5);
    expect(victim.posture).toBe('down');
    let ok: boolean | null = null;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { squadId: number; type: string; ok: boolean };
      if (d.type === 'secourir' && d.squadId === sec.id) ok = d.ok;
    });
    const radio0 = ctx.radio.log.length;
    ctx.squads.issue(sec.id, { type: 'secourir', targetId: victim.id, x: victim.x, z: victim.z, issuedBy: me.id, byPlayer: true });
    let pairOut = -1;
    const t0 = ctx.clock.now;
    for (let k = 0; k < 20 && pairOut < 0; k++) {
      t.step(0.25);
      if (ppl.filter((p) => p.vehicleId === 0).length >= 2) pairOut = ctx.clock.now - t0;
    }
    // le blessé est pris en charge par un agent de la section
    let heldAt = -1;
    for (let k = 0; k < 80 && heldAt < 0; k++) {
      t.step(0.25);
      if (victim.heldBy !== 0 && ppl.some((p) => p.id === victim.heldBy)) heldAt = ctx.clock.now - t0;
    }
    const said = ctx.radio.log.slice(radio0).filter((m) => m.from === sec.name).map((m) => m.text);
    console.log(`secourir à une section assise (${seated0}/${ppl.length}) : binôme à pied en ${pairOut.toFixed(2)} s ; blessé pris en charge à ${heldAt.toFixed(1)} s ; ${ok === null ? 'en cours' : ok ? 'réussi' : 'échec'} ; radio : ${said.join(' / ')}`);
    expect(pairOut, 'un binôme descend').toBeGreaterThanOrEqual(0);
    expect(pairOut).toBeLessThanOrEqual(2);
    expect(said.some((x) => /NÉGATIF/.test(x)), 'pas de refus').toBe(false);
    expect(said.some((x) => /REÇU/.test(x)), 'accusé de réception').toBe(true);
    expect(heldAt, 'le blessé est pris en charge par un agent descendu').toBeGreaterThanOrEqual(0);
    expect(heldAt).toBeLessThanOrEqual(15);
    expect(ok, 'la tâche n’a pas échoué').not.toBe(false);
  }, 600_000);

  it('chef de groupe à pied : son groupe envoyé à 400 m y va à pied, sans colonne ni attente', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.ready;
    await t.start(cfgOf({ role: 'chef_groupe', rank: 'brigadier_chef', poste: 'chef_groupe', place: 'Place de la Bastille', x: 3542, z: 1395,
      seed: 5, crowdSize: 300, depart: 'sur_place' } as Partial<ScenarioDraft>));
    t.step(3);
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>('ui.command')!;
    const cmd = ctx.service<CommandLike>('police.command')!;
    const me = ctx.player.person()!;
    const group = ctx.squads.get(me.squadId)!;
    expect(group.leaderId).toBe(me.id);
    // un point à 400 m par les rues
    const path: number[] = [];
    let target: { x: number; z: number } | null = null;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    for (let a = 0; a < 16 && !target; a++) {
      const x = me.x + Math.sin(a * Math.PI / 8) * 400, z = me.z + Math.cos(a * Math.PI / 8) * 400;
      if (ctx.world.nearestRoad(x, z, road as never, 30) && ctx.world.findPath(me.x, me.z, road.x, road.z, 'foot', path)) target = { x: road.x, z: road.z };
    }
    expect(target).toBeTruthy();
    const ppl = passengers(ctx, group.id);
    expect(core.issue('colonne', [group], [{ x: target!.x, z: target!.z, heading: 0, width: 0 }]).ok).toBe(true);
    const move = firstMove(t, ppl, 10);
    t.step(10);
    const cv = cmd.convoyOf(group.id);
    const seated = ppl.filter((p) => p.vehicleId !== 0).length;
    console.log(`chef de groupe : ${group.name} ${group.order.type} ; 1er mouvement ${move.toFixed(1)} s ; assis ${seated}/${ppl.length} ; colonne ${cv ? cv.stage : '—'}`);
    expect(group.order.type).toBe('colonne');
    expect(group.order.byPlayer).toBe(true);
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThanOrEqual(2);
    expect(seated).toBe(0);
    expect(!cv || (cv.stage !== 'route' && !cv.awaitingPlayer)).toBe(true);
  }, 600_000);

  it('chef de section : le commandant IA ne donne aucun ordre à sa section ni à ses groupes', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.ready;
    await t.start(cfgOf({ role: 'chef_groupe', rank: 'capitaine', poste: 'chef_section', place: 'Place de la Bastille', x: 3542, z: 1395,
      seed: 5, crowdSize: 300, depart: 'sur_place' } as Partial<ScenarioDraft>));
    const ctx = t.ctx;
    const me = ctx.player.person()!;
    const section = ctx.squads.list.find((q) => q.leaderId === me.id && q.kind === 'section')!;
    expect(section, 'le joueur commande une section').toBeTruthy();
    const under = (id: number): boolean => {
      for (let q = ctx.squads.get(id), g = 0; q && g < 9; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, g++) if (q.id === section.id) return true;
      return false;
    };
    const ai: string[] = [];
    let others = 0;
    ctx.events.on('order:issued', (e) => {
      if (e.order.issuedBy === me.id || e.order.byPlayer) return;
      if (under(e.squadId)) ai.push(`${ctx.squads.get(e.squadId)?.name} ${e.order.type} à t=${ctx.clock.now.toFixed(0)}`);
      else others++;
    });
    t.step(300);
    console.log(`chef de section ${section.name} : ordres de l’IA à sa section ${ai.length ? ai.join(', ') : 'aucun'} ; aux autres unités ${others}`);
    expect(others, 'le commandant IA commande bien les autres').toBeGreaterThan(0);
    expect(ai).toEqual([]);
  }, 600_000);

  it('journée de service du commandant : à l’arrêt de la colonne, adjoint, ordre exécuté et jamais remplacé, tout le monde à pied', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    await t.start(cfgOf({ role: 'commandant', rank: 'commandant', variante: 'terrain', place: 'Place de la République', x: 3123, z: -208, seed: 7, crowdSize: 300 } as Partial<ScenarioDraft>));
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>('ui.command')!;
    const cmd = ctx.service<CommandLike>('police.command')!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const me = ctx.player.person()!;
    const company = ctx.squads.get(core.scope().ownSquadId)!;
    expect(company.kind).toBe('compagnie');
    // il monte en passager du véhicule désigné et la colonne l'emmène
    const path: number[] = [];
    let stopAt = -1;
    let early = false;
    for (let s = 0; s < 1500 && stopAt < 0; s++) {
      t.step(1);
      if (cmd.convoyOf(company.id)?.stage === 'stationnement') stopAt = ctx.clock.now;
      // (pas de proposition de dispositif tant que la colonne roule)
      else if (cmd.proposals.some((p) => p.key === 'dispositif')) early = true;
      if (me.vehicleId !== 0) continue;
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (v) ctx.vehicles.enter(me, v, 'passenger');
    }
    expect(stopAt, 'la colonne s’arrête près de la manifestation').toBeGreaterThan(0);
    // l'adjoint propose le dispositif dans les cinq secondes
    let proposedAt = -1;
    for (let k = 0; k < 10 && proposedAt < 0; k++) {
      if (cmd.proposals.some((p) => p.key === 'dispositif')) proposedAt = ctx.clock.now - stopAt;
      else t.step(0.5);
    }
    // il descend et fait barrer une rue à la section la plus proche, à 40 m de ses fourgons
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    const sections = ctx.squads.list.filter((q) => q.parentId === company.id && q.kind === 'section' && passengers(ctx, q.id).length > 0);
    const centre = (q: Squad): { x: number; z: number } => {
      const a = membersOf(ctx, q.id).map((p) => (p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) ?? p : p));
      return { x: a.reduce((k, p) => k + p.x, 0) / a.length, z: a.reduce((k, p) => k + p.z, 0) / a.length };
    };
    const sec = sections.sort((a, b) => Math.hypot(centre(a).x - me.x, centre(a).z - me.z) - Math.hypot(centre(b).x - me.x, centre(b).z - me.z))[0]!;
    const c0 = centre(sec);
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    expect(ctx.world.nearestRoad(c0.x, c0.z, road as never, 60)).toBe(true);
    const gx = road.x + Math.sin(road.heading) * 40, gz = road.z + Math.cos(road.heading) * 40;
    const secPeople = passengers(ctx, sec.id);
    const seated0 = secPeople.filter((p) => p.vehicleId !== 0).length;
    const orderedAt = ctx.clock.now - stopAt;
    expect(core.issue('ligne', [sec], [{ x: gx, z: gz, heading: road.heading, width: 0 }]).ok).toBe(true);
    const move = firstMove(t, secPeople, 10);
    // tout le monde à pied, et l'ordre tient après le débarquement de la colonne
    const everyone = passengers(ctx, company.id);
    let allOut = -1;
    let overwritten = '';
    for (let k = 0; k < 240; k++) {
      t.step(0.5);
      if (sec.order.type !== 'ligne' && overwritten === '') overwritten = `${sec.order.type} à +${(ctx.clock.now - stopAt).toFixed(0)} s`;
      if (allOut < 0 && everyone.every((p) => p.vehicleId === 0)) allOut = ctx.clock.now - stopAt;
      const st = cmd.convoyOf(company.id)?.stage ?? '—';
      if (allOut >= 0 && st !== 'stationnement' && st !== 'debarquement' && ctx.clock.now - stopAt > 60) break;
    }
    const stage = cmd.convoyOf(company.id)?.stage ?? '—';
    const still = everyone.filter((p) => p.vehicleId !== 0);
    console.log(`commandant : colonne arrêtée à t=${stopAt.toFixed(0)} ; adjoint +${proposedAt.toFixed(1)} s ; ${sec.name} « ligne » donné à +${orderedAt.toFixed(1)} s (${seated0}/${secPeople.length} assis), 1er mouvement ${move.toFixed(1)} s ; `
      + `tous à pied à +${allOut.toFixed(0)} s (encore assis : ${still.length}) ; colonne ${stage} ; ordre de ${sec.name} : ${sec.order.type}${overwritten ? ' (remplacé : ' + overwritten + ')' : ''}`);
    expect(early, 'proposition faite pendant le trajet').toBe(false);
    expect(proposedAt, 'proposition de l’adjoint').toBeGreaterThanOrEqual(0);
    expect(proposedAt).toBeLessThanOrEqual(5);
    expect(move, 'premier agent de la section en mouvement').toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThanOrEqual(10);
    expect(overwritten, 'l’ordre du joueur n’est jamais remplacé').toBe('');
    expect(sec.order.byPlayer).toBe(true);
    expect(allOut, 'tout le monde à pied').toBeGreaterThanOrEqual(0);
    expect(allOut).toBeLessThanOrEqual(40);
  }, 1_200_000);

  it('colonne qui roule : ordre pour un point proche, la section descend ; pour un point lointain, emporté jusqu’à l’arrêt', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    await t.start(cfgOf({ role: 'commandant', rank: 'commandant', variante: 'terrain', place: 'Place de la République', x: 3123, z: -208, seed: 7, crowdSize: 300 } as Partial<ScenarioDraft>));
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>('ui.command')!;
    const cmd = ctx.service<CommandLike & { carrying(id: number): boolean }>('police.command')!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const me = ctx.player.person()!;
    const company = ctx.squads.get(core.scope().ownSquadId)!;
    const sections = ctx.squads.list.filter((q) => q.parentId === company.id && q.kind === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const vansOf = (q: Squad): number[] => {
      const ids: number[] = [];
      const add = (id: number): void => { const s = ctx.squads.get(id); if (!s) return; if (s.vehicleId) ids.push(s.vehicleId); for (const k of ctx.squads.childrenOf(id)) add(k.id); };
      add(q.id);
      return ids.filter((id) => ctx.vehicles.get(id)?.kind === 'fourgon_crs');
    };
    // en route, toute la colonne roule depuis vingt secondes
    const path: number[] = [];
    let rolling = -1;
    for (let s = 0; s < 1200 && (rolling < 0 || ctx.clock.now - rolling < 20); s++) {
      t.step(1);
      const st = cmd.convoyOf(company.id)?.stage;
      const all = sections.flatMap(vansOf);
      if (rolling < 0 && st === 'route' && all.length > 0 && all.every((id) => Math.abs(ctx.vehicles.get(id)!.speed) > 2)) rolling = ctx.clock.now;
      if (me.vehicleId !== 0) continue;
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (v) ctx.vehicles.enter(me, v, 'passenger');
    }
    expect(rolling, 'la colonne roule').toBeGreaterThan(0);
    const dest = ctx.service<{ destination: { x: number; z: number } | null }>('session.journee')?.destination ?? null;
    const fp = dest ?? { x: 3123, z: -208 };
    // la section de queue « tient » 40 m derrière son dernier fourgon (la colonne continue sans elle, personne ne
    // passe à travers sa ligne) ; une section de tête « barre » au point de la colonne
    const back = (q: Squad): number => Math.max(...vansOf(q).map((id) => { const v = ctx.vehicles.get(id)!; return Math.hypot(v.x - fp.x, v.z - fp.z); }));
    sections.sort((a, b) => back(b) - back(a));
    const [near, far] = sections;
    const nv = vansOf(near!).map((id) => ctx.vehicles.get(id)!);
    const fv = vansOf(far!).map((id) => ctx.vehicles.get(id)!);
    const tail = nv.slice().sort((a, b) => Math.hypot(b.x - fp.x, b.z - fp.z) - Math.hypot(a.x - fp.x, a.z - fp.z))[0]!;
    const g = { x: tail.x - Math.sin(tail.heading) * 40, z: tail.z - Math.cos(tail.heading) * 40, heading: tail.heading + Math.PI, width: 0 };
    expect(core.issue('tenir', [near!], [g]).ok).toBe(true);
    expect(core.issue('ligne', [far!], [{ x: fp.x, z: fp.z, heading: 0, width: 0 }]).ok).toBe(true);
    expect(nv.some((v) => cmd.carrying(v.id)), 'section libérée : ses fourgons ont quitté la colonne').toBe(false);
    // (point lointain, section assise : l'interface l'y envoie en véhicules — dans la colonne ou dans la sienne)
    // une troisième section reçoit, sans passer par l'interface, un ordre du joueur pour un point lointain que rien ne
    // motorise : la colonne l'emporte (règle de la simulation, police.command.takeOver)
    const third = sections[2];
    const tv = third ? vansOf(third).map((id) => ctx.vehicles.get(id)!) : [];
    if (third) {
      ctx.squads.issue(third.id, { type: 'ligne', x: fp.x, z: fp.z, heading: 0, width: 0, issuedBy: me.id, byPlayer: true });
      expect(tv.every((v) => cmd.carrying(v.id)), `${third.name} emportée par la colonne`).toBe(true);
    }
    const nearPeople = passengers(ctx, near!.id);
    const farPeople = passengers(ctx, far!.id);
    const thirdPeople = third ? passengers(ctx, third.id) : [];
    let nearOut = -1;
    let farOutEnRoute = 0;
    const t0 = ctx.clock.now;
    const away = (vs: readonly { x: number; z: number }[]): boolean => vs.some((v) => Math.hypot(v.x - fp.x, v.z - fp.z) > 250);
    for (let k = 0; k < 2400; k++) {
      t.step(0.5);
      if (nearOut < 0 && nearPeople.filter((p) => p.vehicleId === 0).length >= nearPeople.length * 0.8) nearOut = ctx.clock.now - t0;
      // personne ne descend d'un fourgon encore loin du point
      const fo = away(fv) ? farPeople.filter((p) => p.vehicleId === 0).length : 0;
      const to = away(tv) ? thirdPeople.filter((p) => p.vehicleId === 0).length : 0;
      if (Math.max(fo, to) > farOutEnRoute) {
        farOutEnRoute = Math.max(fo, to);
        console.log(`  +${(ctx.clock.now - t0).toFixed(1)} s : à pied loin du point ${far!.name} ${fo}, ${third?.name} ${to} ; fourgons à ${[...fv, ...tv].map((v) => Math.round(Math.hypot(v.x - fp.x, v.z - fp.z)) + '(' + v.speed.toFixed(1) + ')').join(' ')} m ; colonne ${cmd.convoyOf(company.id)?.stage} / ${cmd.convoyOf(far!.id)?.stage}`);
      }
      if (nearOut >= 0 && !away(fv) && !away(tv)) break;
    }
    // jusqu'à l'arrêt de la colonne et la fin du débarquement des autres (les fourgons à moins de 250 m du point, la
    // tête peut encore rouler quelques secondes vers sa place : la section emportée ne descend qu'à l'arrêt)
    for (let k = 0; k < 400 && ['route', 'stationnement', 'debarquement'].includes(cmd.convoyOf(company.id)?.stage ?? '—'); k++) t.step(0.5);
    t.step(10);
    // (l'ordre repris à l'arrivée de sa propre colonne)
    for (let k = 0; k < 240 && far!.order.type !== 'ligne'; k++) t.step(0.5);
    t.step(10);
    const farOut = farPeople.filter((p) => p.vehicleId === 0).length;
    const thirdOut = thirdPeople.filter((p) => p.vehicleId === 0).length;
    console.log(`en route : ${near!.name} « tenir » à 40 m, 80 % à pied en ${nearOut.toFixed(1)} s (fourgons ${nv.map((v) => v.speed.toFixed(1)).join('/')} m/s) ; `
      + `${far!.name} « ligne » au point : ${farOut}/${farPeople.length} à pied à l'arrivée, ordre ${far!.order.type} ; `
      + `${third ? `${third.name} emportée : ${thirdOut}/${thirdPeople.length} à pied à l'arrivée, ordre ${third.order.type} ; ` : ''}à pied loin du point : ${farOutEnRoute}`);
    expect(nearOut, 'la section libérée descend').toBeGreaterThanOrEqual(0);
    expect(nearOut).toBeLessThanOrEqual(10);
    expect(near!.order.type).toBe('tenir');
    expect(farOutEnRoute, 'personne ne descend d’un fourgon encore loin du point').toBe(0);
    expect(far!.order.type).toBe('ligne');
    expect(farOut).toBeGreaterThanOrEqual(farPeople.length * 0.8);
    if (third) {
      expect(third.order.type).toBe('ligne');
      expect(thirdOut).toBeGreaterThanOrEqual(thirdPeople.length * 0.8);
    }
  }, 1_200_000);
});
