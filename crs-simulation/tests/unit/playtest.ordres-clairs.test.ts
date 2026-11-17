// Partie jouée par un robot : « quand le commissaire ou le commandant donne un ordre, il faut que je le voie aussi quand
// je suis CRS, pour voir où on va ; et le délai avant de partir ». La carte « Ma mission » dit, à chaque moment de la
// journée de service, qui a donné l'ordre, quoi, où et à quelle distance (repère « destination »), et où en est le
// départ de la colonne : embarquement compté, « la colonne part », « en route — x km, environ y min », débarquement.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
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
import type { RadioControl } from '@/gameplay/radio';
import { createSystems as session, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { MISSION_DEST_OBJECTIVE_ID } from '@/gameplay/session/mission-api';
import { departureLine, distanceWords } from '@/gameplay/session/executant';
import { commandLine } from '@/ui/hud/mission';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const JOURNEE = { mode: 'libre' as const, place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard' as const };
type Journee = { stage: string; destination: { x: number; z: number; name: string } | null };

function rootOf(ctx: GameContext, s: Squad | undefined): Squad | undefined {
  let c = s;
  for (let g = 0; c && c.parentId !== 0 && g < 8; g++) c = ctx.squads.get(c.parentId);
  return c;
}

/** Agents valides de l'unité (sous-unités comprises) et ceux qui sont à bord, comptés par le test lui-même. */
function count(ctx: GameContext, unit: Squad): { aboard: number; total: number } {
  let aboard = 0, total = 0;
  for (const s of ctx.squads.list) {
    if (rootOf(ctx, s) !== unit) continue;
    for (const id of s.members) {
      const p = ctx.people.get(id);
      if (!p || p.custody !== 'free' || p.health <= 0 || p.posture === 'down' || p.injury === 'dead' || p.injury === 'critical' || p.injury === 'serious') continue;
      total++;
      if (p.vehicleId !== 0) aboard++;
    }
  }
  return { aboard, total };
}

/** Le joueur monte dans le fourgon de la compagnie le plus proche où il reste une place (le chauffeur est l'IA). */
function board(ctx: GameContext, me: Person): boolean {
  const van = ctx.vehicles.list.filter((v) => (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && v.seats[0] !== 0 && v.seats.some((id, i) => id === 0 && i > 0))
    .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
  if (!van) return false;
  me.x = van.x + 3; me.z = van.z;
  return ctx.vehicles.enter(me, van, 'passenger');
}

describe('« Ma mission » : l’ordre du chef et le départ de la colonne, vus par l’exécutant', () => {
  it('CRS : ordre de mouvement (qui, où, distance, repère), embarquement compté, la colonne part, en route, débarquement', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ ...JOURNEE, role: 'crs', extra: { moyens: MEANS, journee: true } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const j = ctx.service<Journee>('session.journee')!;
    const me = ctx.player.person()!;
    const company = rootOf(ctx, ctx.squads.get(me.squadId))!;
    t.step(2);
    // avant d'embarquer : l'ordre de mouvement de CENTRAL, le lieu et sa distance, le repère « destination »
    const c0 = brief.command!;
    console.log(`avant d’embarquer : ${commandLine(brief)} · ${distanceWords(c0.distance)} | ${brief.instruction.title} | ${brief.status}`);
    expect(c0.from).toBe('CENTRAL');
    expect(c0.text).toBe('Faire mouvement');
    expect(c0.place).toBe(j.destination!.name);
    expect(Math.abs(c0.distance - Math.hypot(j.destination!.x - me.x, j.destination!.z - me.z))).toBeLessThan(15);
    expect(c0.distance).toBeGreaterThan(1000);
    const dest = obj.list.find((o) => o.id === MISSION_DEST_OBJECTIVE_ID)!;
    expect(dest).toBeDefined();
    expect(Math.hypot(dest.x! - j.destination!.x, dest.z! - j.destination!.z)).toBeLessThan(3);
    expect(obj.tracked).not.toBe(MISSION_DEST_OBJECTIVE_ID); // le GPS reste sur le fourgon à rejoindre
    expect(brief.covered).toContain(MISSION_DEST_OBJECTIVE_ID); // la liste des objectifs ne le répète pas
    // embarquement compté sur la colonne du joueur, et « la colonne vous attend »
    const m = /^Embarquement : (\d+) \/ (\d+) à bord — la colonne vous attend$/.exec(brief.status);
    expect(m).not.toBeNull();
    const n0 = count(ctx, company);
    expect(Number(m![1])).toBe(n0.aboard);
    expect(Number(m![2])).toBe(n0.total);
    // il monte : la carte suit le départ jusqu'au débarquement
    t.step(18);
    expect(board(ctx, me)).toBe(true);
    const seen: string[] = [];
    let counted = false;
    for (let i = 0; i < 1100 && j.stage !== 'sur_place'; i++) {
      t.step(1);
      const st = brief.status;
      if (st !== '' && seen[seen.length - 1] !== st) seen.push(st);
      const b = /^Embarquement : (\d+) \/ (\d+) à bord/.exec(st);
      if (b && !counted) {
        const n = count(ctx, company);
        expect(Number(b[1])).toBe(n.aboard);
        expect(Number(b[2])).toBe(n.total);
        expect(st).not.toMatch(/vous attend/);
        counted = true;
      }
    }
    for (let i = 0; i < 20; i++) {
      t.step(1);
      if (brief.status !== '' && seen[seen.length - 1] !== brief.status) seen.push(brief.status);
    }
    const kinds = seen.map((s) => s.replace(/\d+ \/ \d+/, 'n / N').replace(/[\d,]+ (km|m)/, 'x $1').replace(/environ \d+ min|moins d’une minute/, 'eta'));
    console.log(`état du départ, ligne par ligne :\n  ${[...new Set(kinds)].join('\n  ')}`);
    const first = (re: RegExp): number => seen.findIndex((s) => re.test(s));
    const iBoard = first(/^Embarquement : \d+ \/ \d+ à bord — /);
    const iLeave = first(/^La colonne part$/);
    const iRoute = first(/^En route — [\d,]+ (km|m), (environ \d+ min|moins d’une minute)$/);
    const iEnd = first(/^(Arrivée : la colonne se gare|Débarquement)/);
    expect(iBoard).toBeGreaterThanOrEqual(0);
    expect(iLeave).toBeGreaterThan(iBoard);
    expect(iRoute).toBeGreaterThan(iLeave);
    expect(iEnd).toBeGreaterThan(iRoute);
    expect(j.stage).toBe('sur_place');
  }, 900000);

  it('CRS : un ordre du commandant (IA) à la compagnie, puis à la section, arrive sur la carte avec le lieu et la distance', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    t.step(10);
    const me = ctx.player.person()!;
    const group = ctx.squads.get(me.squadId)!;
    const section = ctx.squads.get(group.parentId)!;
    const company = rootOf(ctx, group)!;
    expect(ctx.people.get(company.leaderId)).toBeDefined();
    // le commandant fait mouvement avec toute la compagnie, 300 m plus loin
    const x = me.x + 300, z = me.z;
    const seq = brief.seq;
    ctx.squads.issue(company.id, { type: 'colonne', x, z, heading: 0, width: 0, issuedBy: company.leaderId });
    t.step(1);
    const c = brief.command!;
    console.log(`ordre du commandant : ${commandLine(brief)} (${c.by}) · ${distanceWords(c.distance)} | consigne : ${brief.instruction.title}`);
    expect(c.from).toBe(company.name);
    expect(c.text).toBe('Faire mouvement');
    expect(c.to).toBe(`Cie ${company.name}`);
    expect(c.place).not.toBe('');
    expect(c.distance).toBeGreaterThan(250);
    expect(c.distance).toBeLessThan(350);
    expect(brief.seq).toBeGreaterThan(seq);
    expect(brief.isOrder).toBe(true);
    expect(ctx.clock.now - brief.since).toBeLessThan(2);
    const d = obj.list.find((o) => o.id === MISSION_DEST_OBJECTIVE_ID)!;
    expect(d).toBeDefined();
    expect(Math.hypot(d.x! - x, d.z! - z)).toBeLessThan(3);
    // la distance suit le joueur
    me.x += 100;
    t.step(1);
    expect(brief.command!.distance).toBeGreaterThan(150);
    expect(brief.command!.distance).toBeLessThan(250);
    // l'ordre suivant (à la section) remplace le premier : un seul ordre affiché, le repère suit
    const x2 = me.x - 200, z2 = me.z + 50;
    ctx.squads.issue(section.id, { type: 'couper_circulation', x: x2, z: z2, heading: 0, width: 0, issuedBy: company.leaderId });
    t.step(1);
    console.log(`ordre suivant : ${commandLine(brief)} · ${distanceWords(brief.command!.distance)}`);
    expect(brief.command!.text).toBe('Barrer la rue');
    expect(brief.command!.to).toBe(`Section ${section.name}`);
    expect(obj.list.filter((o) => o.id === MISSION_DEST_OBJECTIVE_ID).length).toBe(1);
    const d2 = obj.list.find((o) => o.id === MISSION_DEST_OBJECTIVE_ID)!;
    expect(Math.hypot(d2.x! - x2, d2.z! - z2)).toBeLessThan(3);
    // le commandant donne directement un ordre au groupe du joueur : c'est aussi un ordre d'en haut
    ctx.squads.issue(group.id, { type: 'ligne', x: x2 + 20, z: z2, heading: 0, width: 0, issuedBy: company.leaderId });
    t.step(1);
    expect(brief.command!.text).toBe('Tenir la ligne');
    expect(brief.command!.from).toBe(company.name);
    // fin de l'ordre (libre) : plus d'ordre d'en haut, plus de repère
    ctx.squads.issue(group.id, { type: 'libre', issuedBy: company.leaderId });
    ctx.squads.issue(section.id, { type: 'libre', issuedBy: company.leaderId });
    ctx.squads.issue(company.id, { type: 'libre', issuedBy: company.leaderId });
    t.step(1);
    expect(brief.command).toBeNull();
    expect(obj.list.some((o) => o.id === MISSION_DEST_OBJECTIVE_ID)).toBe(false);
  }, 600000);

  it('BRAV-M : « En selle » sur la moto (pas « un véhicule de la compagnie »), puis l’état du trajet', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ ...JOURNEE, role: 'bravm', extra: { moyens: { ...MEANS, bravm: 1 }, journee: true } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const j = ctx.service<Journee>('session.journee')!;
    t.step(2);
    const me = ctx.player.person()!;
    const group = ctx.squads.get(me.squadId)!;
    const moto = ctx.vehicles.get(group.vehicleId)!;
    console.log(`à pied : ${brief.instruction.title} — ${brief.instruction.detail} | ${commandLine(brief)}`);
    expect(moto.kind).toBe('moto_bravm');
    expect(brief.instruction.title).toBe(`En selle : ${j.destination!.name}`);
    expect(brief.instruction.detail).not.toMatch(/véhicule de la compagnie/);
    expect(brief.instruction.target).toBe('vehicle');
    expect(Math.hypot(brief.instruction.x! - moto.x, brief.instruction.z! - moto.z)).toBeLessThan(1);
    expect(brief.command!.text).toBe('Faire mouvement');
    expect(brief.command!.to).toBe(group.name);
    // en selle, à l'arrêt : c'est à lui de partir (il est le chef de bord)
    me.x = moto.x + 1; me.z = moto.z;
    expect(ctx.vehicles.enter(me, moto, 0)).toBe(true);
    t.step(1);
    console.log(`en selle : ${brief.instruction.detail} | ${brief.status}`);
    expect(brief.instruction.detail).toMatch(/BRAV-M|moto/);
    expect(brief.status).toBe('Prêt au départ : démarrez, vos équipiers vous suivent');
    // il roule vers la zone : « la colonne part », puis le reste du trajet
    const dest = j.destination!;
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const dx = dest.x - moto.x, dz = dest.z - moto.z, l = Math.hypot(dx, dz);
      moto.x += (dx / l) * 8; moto.z += (dz / l) * 8; moto.speed = 8;
      me.x = moto.x; me.z = moto.z;
      t.step(0.5);
      if (seen[seen.length - 1] !== brief.status) seen.push(brief.status);
    }
    console.log(`trajet : ${seen.join(' | ')}`);
    expect(seen.some((s) => s === 'La colonne part')).toBe(true);
    expect(seen.some((s) => /^En route — [\d,]+ (km|m), (environ \d+ min|moins d’une minute)$/.test(s))).toBe(true);
  }, 600000);

  it('chef de groupe : carte réduite (ordre de mouvement, embarquement compté), toute la radio', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ ...JOURNEE, role: 'chef_groupe', extra: { moyens: MEANS, journee: true } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(3);
    const me = ctx.player.person()!;
    console.log(`chef de groupe : ${brief.heading} | ${commandLine(brief)} | ${brief.instruction.title} | ${brief.status}`);
    expect(brief.active).toBe(true);
    expect(brief.command!.from).toBe('CENTRAL');
    expect(brief.status).toMatch(/^Embarquement : \d+ \/ \d+ à bord — la colonne vous attend$/);
    expect(ctx.service<RadioControl>('radio.control')!.listen).toBeNull();
    expect(brief.radioLabel).toBe('');
    t.step(10);
    expect(board(ctx, me)).toBe(true);
    t.step(2);
    expect(brief.status).toMatch(/^Embarquement : \d+ \/ \d+ à bord — départ/);
  }, 600000);

  it('chef de groupe qui mène sa colonne (« Me suivre en colonne ») : véhicules prêts comptés', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'chef_groupe', place: 'essai', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, 'crowd.none': true } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(3);
    const me = ctx.player.person()!;
    const follow = ctx.service<{ column(id: number): boolean; inColumn(id: number): boolean }>('session.follow')!;
    expect(follow.column(me.squadId)).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      t.step(1);
      if (brief.status !== '' && seen[seen.length - 1] !== brief.status) seen.push(brief.status);
    }
    console.log(`colonne du chef : ${seen.join(' | ')}`);
    expect(follow.inColumn(me.squadId)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => /^Colonne (prête \(\d+ véhicules?\) : montez à bord, elle vous suit|: \d+ véhicules? prêts? sur \d+)$/.test(s))).toBe(true);
    expect(seen[seen.length - 1]).toMatch(/^Colonne prête/);
  }, 600000);

  it('ligne de départ (fonction pure) : chaque étape a sa phrase, les nombres sont ceux donnés', () => {
    const base = { stage: 'route', movingFor: -1, aboard: 5, total: 7, playerAfoot: false, departIn: -1, remaining: -1, speed: 5, stoppedFor: 0 };
    expect(departureLine(base)).toBe('Embarquement : 5 / 7 à bord — départ dès que tout le monde est à bord');
    expect(departureLine({ ...base, departIn: 11.2 })).toBe('Embarquement : 5 / 7 à bord — départ dans 12 s au plus tard');
    expect(departureLine({ ...base, departIn: 298, playerAfoot: true })).toBe('Embarquement : 5 / 7 à bord — la colonne vous attend');
    expect(departureLine({ ...base, aboard: 6, playerAfoot: true })).toBe('Embarquement : 6 / 7 à bord — on n’attend plus que vous');
    expect(departureLine({ ...base, aboard: 7 })).toBe('Embarquement : 7 / 7 à bord — départ au signal du chef de colonne');
    expect(departureLine({ ...base, movingFor: 3 })).toBe('La colonne part');
    expect(departureLine({ ...base, movingFor: 30, remaining: 1200, speed: 6.5 })).toBe('En route — 1,2 km, environ 3 min');
    expect(departureLine({ ...base, movingFor: 30, remaining: 1200, stoppedFor: 15 })).toBe('Colonne à l’arrêt — elle repart dès que la voie est libre');
    expect(departureLine({ ...base, stage: 'stationnement' })).toBe('Arrivée : la colonne se gare');
    expect(departureLine({ ...base, stage: 'debarquement' })).toBe('Débarquement : descendez et mettez-vous en ligne');
    expect(departureLine({ ...base, stage: 'rembarquement', aboard: 2 })).toBe('Rembarquement : 2 / 7 à bord — départ dès que tout le monde est à bord');
    expect(departureLine({ ...base, stage: 'en_place' })).toBe('');
  });
});
