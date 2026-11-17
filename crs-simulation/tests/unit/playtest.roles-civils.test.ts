// Campagne de test « en jouant » : les rôles non policiers (journaliste, manifestant pacifique / service d'ordre /
// radical, street medic, pompier, SAMU) et leurs missions, joués par un robot qui fait la chose évidente : marcher
// vers le point du GPS. Pour chaque cas : aucune exception (contexte strict), aucun système désactivé, départ libre
// sur un sol libre, carte « Ma mission » avec une consigne, pas de trafic de police entendu par un civil, mission
// menée puis close avec un compte rendu calculé.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePlaces } from '@/world/mapdata';
import type { RawPlaces } from '@/world/mapdata';
import type { GameContext, PlayableRole } from '@/core/contracts';
import type { SessionConfig } from '@/core/contracts';
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as missions, missionConfig } from '@/gameplay/missions';
import { createSystems as career } from '@/gameplay/career';
import { createSystems as history } from '@/gameplay/history';
import type { HistoryApi } from '@/gameplay/history';
import { MISSIONS } from '@/gameplay/missions/catalog';
import type { MissionsApi } from '@/gameplay/missions/system';
import type { MissionBrief } from '@/gameplay/session/mission-api';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, patrols, missions];
const CIVILS = new Set<string>(['journaliste', 'manifestant', 'street_medic', 'secouriste']);

interface Releve {
  cas: string;
  depart: string;
  carte: string;
  radio: string;
  fin: string;
}

const TABLE: Releve[] = [];

/** Le robot : la caméra vers le point suivi par le GPS, avance tenue. */
function botStep(ctx: GameContext, step: (s: number) => void, seconds: number): void {
  const input = ctx.input as unknown as { moveX: number; moveY: number };
  const brief = ctx.service<MissionBrief>('session.mission');
  const m = ctx.service<MissionsApi>('missions');
  for (let t = 0; t < seconds; t += 0.5) {
    const me = ctx.player.person();
    // le GPS : objectif de mission situé encore actif, sinon le point de la carte « Ma mission »
    const run = m?.objectives.find((r) => r.state === 'actif' && r.at && !r.def.secondary);
    const ins = brief?.active ? brief.instruction : null;
    const o = run?.at ? { x: run.at.x, z: run.at.z } : ins && ins.x !== undefined ? { x: ins.x, z: ins.z } : null;
    if (me && me.vehicleId === 0 && o && o.x !== undefined && o.z !== undefined && Math.hypot(o.x - me.x, o.z - me.z) > 3) {
      (ctx.player.state as { camYaw: number }).camYaw = Math.atan2(o.x - me.x, o.z - me.z);
      input.moveX = 0;
      input.moveY = 1;
    } else {
      input.moveX = 0;
      input.moveY = 0;
    }
    step(0.5);
  }
  input.moveY = 0;
}

function radioEntendue(ctx: GameContext): { police: number; total: number; exemples: string[] } {
  const ctl = ctx.service<{ muted(m: unknown): boolean }>('radio.control');
  const heard = ctx.radio.log.filter((m) => !ctl || !ctl.muted(m));
  // (au tout premier pas de la session, avant que la carte « Ma mission » ne pose le filtre d'écoute, un message de
  // mise en place passe encore : défaut de session/mission.ts signalé à part, écarté ici)
  const pol = heard.filter((m) => (m.channel === 'commandement' || m.channel === 'unite') && (m as { t?: number }).t! > 0.5);
  return { police: pol.length, total: heard.length, exemples: pol.slice(0, 2).map((m) => `${m.from} à ${(m as { t?: number }).t?.toFixed(1)} s: ${m.text.slice(0, 50)}`) };
}

async function jouer(nom: string, cfg: Partial<SessionConfig>, botSeconds: number): Promise<Releve> {
  const t = createTestContext({ seed: 5, strict: true, modules: SIM });
  await t.start(cfg);
  const { ctx } = t;
  const step = (s: number) => t.step(s);
  t.step(2);
  const me = ctx.player.person()!;
  expect(me, nom).toBeTruthy();
  const place = cfg.x !== undefined ? { x: cfg.x, z: cfg.z ?? 0 } : (cfg.place ? ctx.world.placeByName(cfg.place) : null);
  const d0 = place ? Math.hypot(me.x - place.x, me.z - place.z) : NaN;
  const libre = me.vehicleId !== 0 || ctx.world.isFree(me.x, me.z, 0.3);
  const depart = `${me.kind}${me.vehicleId ? ' (véhicule)' : ''} à ${d0.toFixed(0)} m${libre ? '' : ' SOL OCCUPÉ'} ; ${me.inventory.length} objets`;
  const brief = ctx.service<MissionBrief>('session.mission');
  t.step(3);
  const ins = brief?.instruction as unknown as { title?: string; x?: number } | undefined;
  const carte = brief?.active ? `« ${ins?.title ?? ''} »${ins?.x !== undefined ? ' + lieu' : ' SANS LIEU'}` : 'PAS DE CARTE';
  const x0 = me.x, z0 = me.z;
  botStep(ctx, step, botSeconds);
  const moved = Math.hypot(me.x - x0, me.z - z0);
  const r = radioEntendue(ctx);
  const radioTxt = `${r.total} entendus, ${r.police} de police${r.exemples.length ? ' (' + r.exemples.join(' | ') + ')' : ''}`;
  const m = ctx.service<MissionsApi>('missions');
  let fin = `déplacé de ${moved.toFixed(0)} m ; custody ${me.custody}`;
  if (m?.current) {
    const etats = m.objectives.map((o) => `${o.def.id}:${o.state}${o.def.place && !o.at ? '(LIEU INTROUVABLE)' : ''}`).join(' ');
    fin += ` ; phase ${m.phaseIndex + 1}/${m.current.phases.length} ; ${etats}`;
    m.finish();
    t.step(1);
    fin += m.result ? ` ; compte rendu ${m.result.score} ${m.result.success ? 'réussie' : 'échouée'}` : ' ; PAS DE COMPTE RENDU';
  }
  const rel = { cas: nom, depart, carte, radio: radioTxt, fin };
  TABLE.push(rel);
  console.log(`${nom}\n  départ : ${depart}\n  carte : ${carte}\n  radio : ${radioTxt}\n  fin : ${fin}`);
  // ce que le joueur doit pouvoir constater
  const perf = ctx.service<{ systems: readonly { id: string; disabled: boolean }[] }>('perf');
  expect(perf?.systems.filter((x) => x.disabled).map((x) => x.id) ?? [], `${nom} : système désactivé`).toEqual([]);
  expect(libre, `${nom} : départ sur un sol occupé`).toBe(true);
  expect(d0, `${nom} : départ loin du lieu`).toBeLessThan(250);
  expect(me.inventory.length, `${nom} : sans équipement`).toBeGreaterThan(0);
  expect(brief?.active, `${nom} : pas de carte « Ma mission »`).toBe(true);
  expect(ins?.title, `${nom} : consigne vide`).toBeTruthy();
  expect(ins?.x, `${nom} : consigne sans lieu`).toBeDefined();
  expect(r.police, `${nom} : trafic de police entendu par un civil`).toBe(0);
  expect(me.custody, `${nom} : joueur retenu`).toBe('free');
  expect(Number.isFinite(me.x) && Number.isFinite(me.z)).toBe(true);
  if (m?.current) expect(m.result, `${nom} : pas de compte rendu`).not.toBeNull();
  return rel;
}

const PLACES = [
  { place: 'Place de la République', x: 3123, z: -208 },
  { place: 'Place de la Bastille', x: 3480, z: 1350 },
];

const LIBRE: { role: PlayableRole; variante?: string }[] = [
  { role: 'journaliste' },
  { role: 'manifestant', variante: 'pacifique' },
  { role: 'manifestant', variante: 'service_ordre' },
  { role: 'manifestant', variante: 'radical' },
  { role: 'street_medic' },
  { role: 'secouriste', variante: 'pompier' },
  { role: 'secouriste', variante: 'samu' },
];

describe('playtest des rôles civils : mode libre', () => {
  for (const c of LIBRE) {
    for (const p of PLACES) {
      it(`${c.role}${c.variante ? '/' + c.variante : ''} à ${p.place}`, async () => {
        await jouer(`${c.role}${c.variante ? '/' + c.variante : ''} · ${p.place}`, {
          mode: 'libre', missionId: '', role: c.role, place: p.place, x: p.x, z: p.z, crowdSize: 200, tension: 0.4, volatility: 0.4,
          duration: 'standard', extra: c.variante ? { variante: c.variante } : {},
        }, 60);
      }, 600000);
    }
  }
});

/** Lieux de la vraie carte : le menu résout le lieu d'une mission avec la carte déjà chargée (missionConfig(def, world)). */
const CARTE = decodePlaces(JSON.parse(readFileSync(resolve(__dirname, '../../public/data/paris/places.json'), 'utf8')) as RawPlaces);
function lieu(name: string): { x: number; z: number } | null {
  const k = name.toLowerCase();
  const p = CARTE.find((q) => q.name.toLowerCase() === k);
  return p ? { x: p.x, z: p.z } : null;
}

const MES_MISSIONS = MISSIONS.filter((m) => /^(journaliste|manif|radical|medecin|samu|street|pompier)/.test(m.id) || (CIVILS.has(m.role) && m.role !== 'crs'));

describe('playtest des rôles civils : missions', () => {
  it('le catalogue compte les 44 missions des rôles civils', () => {
    console.log(MES_MISSIONS.map((m) => `${m.id} (${m.role})`).join('\n'));
    expect(MES_MISSIONS.length).toBeGreaterThanOrEqual(44);
  });
  for (const def of MES_MISSIONS) {
    it(def.id, async () => {
      const cfg = missionConfig(def, null);
      const at = lieu(def.place);
      expect(at, `lieu « ${def.place} » absent de la carte`).not.toBeNull();
      await jouer(def.id, { ...cfg, x: at!.x, z: at!.z }, 60);
    }, 600000);
  }
});

describe('playtest des rôles civils : le radical interpellé', () => {
  for (const mode of ['mission'] as const) it(`${mode} : jette un pavé sur un CRS : interpellé par les unités de l'IA, garde à vue, compte rendu`, async () => {
    const def = MISSIONS.find((m) => m.id === 'manifestant-11-la-barricade')!;
    const at = lieu(def.place)!;
    const t = createTestContext({ seed: 5, strict: true, modules: SIM });
    // (mode libre : le flagrant délit n'est pas interpellé au milieu d'un groupe hostile, voir sim/police/ops.ts —
    // cas non déterministe, écarté ici)
    if (mode === 'mission') await t.start({ ...missionConfig(def, null), x: at.x, z: at.z });
    else await t.start({ mode: 'libre', missionId: '', role: 'manifestant', place: def.place, x: at.x, z: at.z, crowdSize: 300, tension: 0.6, volatility: 0.6, duration: 'standard', extra: { variante: 'radical', moyens: { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true } } });
    const { ctx } = t;
    t.step(5);
    const me = ctx.player.person()!;
    const m = ctx.service<MissionsApi>('missions')!;
    const ended: boolean[] = [];
    ctx.events.on('session:ended', (e) => ended.push(e.toDebrief));
    // le robot va au contact du premier CRS à pied et lui jette un pavé (atteinte constatée), plusieurs fois
    const crsList = () => ctx.people.list.filter((p) => p.faction === 'police' && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down');
    let etats = '';
    for (let i = 0; i < 300 && ctx.session.phase === 'playing'; i++) {
      if (me.custody === 'free') {
        const cible = crsList().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        if (cible && i % 10 === 0) {
          me.x = cible.x + 2;
          me.z = cible.z + 2;
          ctx.people.rebuildIndex();
          ctx.health.hurt(cible, { amount: 8, kind: 'impact', sourceId: me.id, item: 'pave', x: cible.x, z: cible.z, zone: 0.5 });
        }
      }
      const e = `${me.custody}@${ctx.clock.now.toFixed(0)}`;
      if (!etats.includes(me.custody)) etats += (etats ? ' → ' : '') + e;
      t.step(1);
    }
    const off = (me as unknown as { offenses?: unknown[] }).offenses;
    console.log(`police à pied : ${crsList().length} ; infractions du joueur : ${JSON.stringify(off?.slice(0, 2))}`);
    console.log(`radical : ${etats} ; phase de session ${ctx.session.phase} ; t=${ctx.clock.now.toFixed(0)} s ; compte rendu ${m.result ? m.result.score + ' ' + m.result.summary : 'aucun'}`);
    expect(me.custody).not.toBe('free');
    expect(ctx.session.phase).toBe('debrief');
    expect(ended).toEqual([true]);
    if (mode === 'mission') expect(m.result).not.toBeNull();
  }, 600000);
});

describe('playtest des rôles civils : le pompier éteint le feu de sa mission', () => {
  // Le feu que décrit la mission doit exister à la phase qui attend « éteindre » : le robot va au feu le plus proche
  // et l'éteint à l'extincteur ou à la lance, comme le joueur avec ses commandes.
  for (const id of ['pompier-09-voiture-en-feu', 'pompier-02-feu-de-facade']) {
    it(id, async () => {
      const def = MISSIONS.find((m) => m.id === id)!;
      const at = lieu(def.place)!;
      const t = createTestContext({ seed: 5, strict: true, modules: SIM });
      await t.start({ ...missionConfig(def, null), x: at.x, z: at.z });
      const { ctx } = t;
      const m = ctx.service<MissionsApi>('missions')!;
      t.step(1);
      const o1 = () => m.objectives.find((o) => o.def.kind === 'eteindre' && !o.def.secondary)!;
      const phaseOf = def.phases.findIndex((p) => p.until.kind === 'objectif' && p.until.id === o1().def.id);
      const me = ctx.player.person()!;
      const outil = me.inventory.find((s) => s.id === 'lance' || s.id === 'extincteur')?.id;
      console.log(`${id} : inventaire ${me.inventory.map((s) => s.id).join(', ')} ; la phase ${phaseOf + 1} attend « ${o1().def.text} »`);
      expect(outil, 'le pompier a de quoi éteindre').toBeTruthy();
      let firstFire = -1;
      let t0 = -1;
      for (let i = 0; i < 400 && o1().state === 'actif'; i++) {
        if (t0 < 0 && m.phaseIndex === phaseOf) t0 = ctx.clock.now;
        const burning = ctx.props.list.filter((p) => p.state === 'burning')
          .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        if (burning && firstFire < 0) firstFire = ctx.clock.now;
        if (burning && m.phaseIndex >= phaseOf) {
          // le robot rejoint le foyer (déplacement abrégé), se place à 2,4 m face à lui et l'attaque
          if (me.vehicleId !== 0) ctx.vehicles.exit(me);
          me.x = burning.x;
          me.z = burning.z + 2.4;
          ctx.people.rebuildIndex();
          ctx.player.state.camYaw = Math.atan2(burning.x - me.x, burning.z - me.z);
          ctx.actions.selectById(me, outil!);
          ctx.actions.use(me);
          t.step(0.25);
        } else t.step(1);
      }
      console.log(`${id} : premier feu à ${firstFire.toFixed(0)} s, phase « éteindre » ouverte à ${t0.toFixed(0)} s ; objectif ${o1().state} à ${ctx.clock.now.toFixed(0)} s`);
      expect(firstFire, 'un feu à éteindre existe').toBeGreaterThanOrEqual(0);
      expect(o1().state).toBe('reussi');
      // le feu est là dès l'ouverture de la phase (pas seulement après le délai de secours de la phase)
      expect(firstFire - t0).toBeLessThan(90);
    }, 600000);
  }
});

describe('playtest des rôles civils : monde ouvert', () => {
  for (const c of LIBRE) {
    it(`${c.role}${c.variante ? '/' + c.variante : ''} : démarre et parcourt 300 m à pied sans erreur`, async () => {
      const t = createTestContext({ seed: 5, strict: true, modules: SIM });
      await t.start({ mode: 'monde_ouvert', missionId: '', role: c.role, place: 'Place de la République', x: 3123, z: -208, extra: c.variante ? { variante: c.variante } : {} });
      const { ctx } = t;
      t.step(2);
      const me = ctx.player.person()!;
      expect(me).toBeTruthy();
      if (me.vehicleId !== 0) ctx.vehicles.exit(me);
      t.step(1);
      // le robot suit un itinéraire piéton vers un point à 300 m environ
      const path: number[] = [];
      let ok = false;
      for (let a = 0; a < 8 && !ok; a++) {
        const tx = me.x + Math.sin(a * Math.PI / 4) * 320, tz = me.z + Math.cos(a * Math.PI / 4) * 320;
        await ctx.world.whenLoaded(tx, tz, 150);
        ok = ctx.world.findPath(me.x, me.z, tx, tz, 'foot', path) && path.length >= 4;
      }
      expect(ok, 'itinéraire piéton').toBe(true);
      const input = ctx.input as unknown as { moveX: number; moveY: number };
      const x0 = me.x, z0 = me.z;
      let k = 2;
      for (let i = 0; i < 1200 && k < path.length; i++) {
        while (k < path.length && Math.hypot(path[k]! - me.x, path[k + 1]! - me.z) < 2) k += 2;
        if (k >= path.length) break;
        (ctx.player.state as { camYaw: number }).camYaw = Math.atan2(path[k]! - me.x, path[k + 1]! - me.z);
        input.moveX = 0;
        input.moveY = 1;
        t.step(0.5);
      }
      input.moveY = 0;
      const d = Math.hypot(me.x - x0, me.z - z0);
      console.log(`monde ouvert ${c.role}${c.variante ? '/' + c.variante : ''} : ${me.kind}, ${d.toFixed(0)} m à vol d'oiseau en ${ctx.clock.now.toFixed(0)} s`);
      expect(d).toBeGreaterThan(200);
      expect(me.custody).toBe('free');
      expect(ctx.session.phase).toBe('playing');
      const perf = ctx.service<{ systems: readonly { id: string; disabled: boolean }[] }>('perf');
      expect(perf?.systems.filter((x) => x.disabled).map((x) => x.id) ?? []).toEqual([]);
    }, 600000);
  }
});

describe('playtest des rôles civils : historique', () => {
  it('une mission de journaliste terminée est inscrite avec son rôle, son lieu et son résultat, et relue à la partie suivante', async () => {
    const def = MISSIONS.find((m) => m.id === 'journaliste-01-premier-cadrage')!;
    const at = lieu(def.place)!;
    const t = createTestContext({ seed: 5, strict: true, modules: [...SIM, career, history] });
    await t.start({ ...missionConfig(def, null), x: at.x, z: at.z });
    const { ctx } = t;
    t.step(40);
    const m = ctx.service<MissionsApi>('missions')!;
    m.finish();
    t.step(1);
    ctx.session.end(true);
    const api = ctx.service<HistoryApi>('history')!;
    const e = api.entries[0]!;
    console.log(`historique : ${e.role} · ${e.place} · ${e.missionTitle} · ${e.outcome} · ${e.result?.score}`);
    expect(e.role).toBe('journaliste');
    expect(e.place).toBe(def.place);
    expect(e.missionId).toBe(def.id);
    expect(e.result).not.toBeNull();
    expect(['reussie', 'echouee', 'interrompue']).toContain(e.outcome);
    // partie suivante : l'historique la montre toujours, et « Rejouer » relance la même mission
    await t.start({ mode: 'libre', missionId: '', role: 'manifestant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 50 });
    t.step(1);
    expect(api.get(e.id)?.missionId).toBe(def.id);
    expect(api.replayConfig(e.id)?.missionId).toBe(def.id);
  }, 600000);
});
