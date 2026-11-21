// Recette jouée des missions de police (CRS, chef de groupe, commandant, école, semaine de mobilisation) : chaque mission
// est lancée comme dans le jeu (vrais modules, son rôle, son lieu, son heure, sa foule) et un robot la joue de la façon
// évidente (aller au point de l'objectif en cours, suivre son chef, donner les ordres, prononcer les sommations).
// On relève, mission par mission : exception, système désactivé, joueur absent ou enfermé, objectif en cours sans
// point valable, aléas et messages non joués, fin de mission, compte rendu et carrière.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import type { MissionDef } from '@/core/missions-schema';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
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
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { createSystems as career, CAREER_SERVICE } from '@/gameplay/career';
import type { CareerApi } from '@/gameplay/career';
import { MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { COMMANDANT, CHEF_GROUPE, CRS, ECOLE } from '@/gameplay/missions/catalog';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, career, objectives];

const MINE: readonly MissionDef[] = [...ECOLE, ...CRS, ...CHEF_GROUPE, ...COMMANDANT];
/**
 * Par défaut, un échantillon (une mission par famille, dont celles qui ont révélé un défaut) pour garder la suite
 * rapide ; PLAYTEST_ALL=1 joue les 49 missions, PLAYTEST_ONLY=id1,id2 celles demandées, PLAYTEST_SECONDS la durée.
 */
const SAMPLE = ['ecole-03-ecouter-les-sommations', 'ecole-04-premiers-secours', 'crs-02-pluie-de-paves', 'cg-01-six-dont-moi', 'cdt-11-l-echarpe', 'semaine-02-la-colere-monte'];
const ONLY = process.env.PLAYTEST_ONLY ? process.env.PLAYTEST_ONLY.split(',') : process.env.PLAYTEST_ALL ? null : SAMPLE;
const SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 150);

const BAD_TEXT = /undefined|NaN|\{|\}|\bnull\b|\[object/;

interface Row { id: string; state: string; notes: string[] }

/** Avance le joueur à pied de `dist` mètres vers (x, z) le long d'un itinéraire piéton ; false si aucun chemin. */
function walk(ctx: GameContext, me: Person, x: number, z: number, dist: number, path: number[]): boolean {
  if (me.vehicleId !== 0) return true;
  if (Math.hypot(x - me.x, z - me.z) < 2) return true;
  path.length = 0;
  if (!ctx.world.findPath(me.x, me.z, x, z, 'foot', path) || path.length < 4) return false;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - me.x, dz = path[i + 1]! - me.z;
    const l = Math.hypot(dx, dz);
    if (l <= left) { me.x = path[i]!; me.z = path[i + 1]!; left -= l; }
    else { me.x += (dx / l) * left; me.z += (dz / l) * left; left = 0; }
  }
  return true;
}

async function play(def: MissionDef, seconds: number): Promise<Row> {
  const row: Row = { id: def.id, state: '?', notes: [] };
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = missionConfig(def, ctx.world) as SessionConfig;
  cfg.mode = 'carriere';
  await t.start(cfg);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
  const path: number[] = [];
  let banners = 0;
  const radio0 = ctx.radio.log.length;
  let lastPhase = -1;
  let stuck = '';
  let sommations = 0;
  if (process.env.PLAYTEST_DEBUG) ctx.events.on('person:hurt', (e) => { if (e.id === ctx.player.state.personId) console.log(`t=${ctx.clock.now.toFixed(1)} blessé ${e.info.kind} ${e.info.amount?.toFixed?.(1)} src=${e.info.sourceId} → ${e.healthAfter.toFixed(2)} ; consigne « ${brief.instruction.title} » ${brief.instruction.source}`); });
  const allTexts: string[] = [];
  for (let s = 0; s < seconds; s += 1) {
    t.step(1);
    const me = ctx.player.person();
    if (!me) { row.notes.push(`t=${s} : pas de joueur`); break; }
    if (m.result) break;
    if (m.phaseIndex !== lastPhase) { lastPhase = m.phaseIndex; banners++; }
    // objectif suivi : point valable et atteignable
    const active = obj.list.filter((o) => o.state === 'actif');
    if (active.length === 0) stuck = `t=${s} : aucun objectif en cours`;
    if (process.env.PLAYTEST_DEBUG && s % 60 === 59) console.log(`t=${s} suivi=${obj.tracked} actifs : ${active.map((o) => `${o.id}${o.secondary ? '(s)' : ''} « ${o.text} »`).join(' | ')}`);
    for (const o of active) {
      allTexts.push(o.text);
      if (o.x !== undefined && o.z !== undefined && (!Number.isFinite(o.x) || !Number.isFinite(o.z))) row.notes.push(`objectif ${o.id} : point non fini`);
    }
    // robot : la consigne de la carte (exécutant) ou le premier objectif principal avec un point
    let tx: number | undefined, tz: number | undefined;
    if (brief.active && brief.instruction.x !== undefined) { tx = brief.instruction.x; tz = brief.instruction.z; }
    else {
      const run = m.objectives.find((r) => r.state === 'actif' && !r.def.secondary && r.at);
      if (run && run.at) { tx = run.at.x; tz = run.at.z; }
    }
    // soins : la victime suivante de l'objectif en cours (atelier « Premiers secours »), trousse en main
    const care = m.objectives.find((r) => r.state === 'actif' && r.victims && r.victims.length > 0);
    const patient = care ? care.victims!.map((id) => ctx.people.get(id)).find((v) => v && v.health < 100) : undefined;
    if (patient) {
      tx = patient.x + 0.8;
      tz = patient.z;
      if (Math.hypot(patient.x - me.x, patient.z - me.z) < 1.5 && !ctx.interactions.current(me)) ctx.interactions.startVerb(me, 'soigner', patient.id);
    }
    if (tx !== undefined && tz !== undefined) {
      if (!walk(ctx, me, tx, tz, 4, path) && s % 30 === 0) row.notes.push(`t=${s} : pas d'itinéraire piéton vers (${tx.toFixed(0)}, ${tz.toFixed(0)})`);
    }
    // sommations : le chef qui en a la charge les prononce une à une
    if (def.objectives.some((o) => o.kind === 'sommations_regulieres' && !o.secondary) && s > 30 && s % 25 === 0 && sommations < 3) {
      ctx.law.sommation(me);
      sommations++;
    }
  }
  if (!m.result) {
    const act = m.objectives.filter((r) => r.state === 'actif' && !r.def.secondary && !['zero_bavure', 'limiter_blesses', 'limiter_degats', 'proteger_site', 'survivre', 'sommations_regulieres', 'personnalise', 'prevention'].includes(r.def.kind));
    const me = ctx.player.person();
    const dist = (r: typeof act[number]): string => (r.at && me ? ` à ${Math.round(Math.hypot(r.at.x - me.x, r.at.z - me.z))} m` : '');
    row.state = `en cours phase ${m.phaseIndex + 1}/${def.phases.length} ; ${act.map((r) => `${r.def.id}:${r.def.kind} ${Math.round(r.progress * 100)}%${dist(r)}`).join(', ')}`;
    m.finish();
  }
  const r = m.result;
  if (r) {
    if (row.state === '?') row.state = (r.success ? 'réussie' : 'terminée (non réussie)') + ` à ${Math.round(ctx.clock.now)} s, ${r.grade} : ${r.summary}`;
    if (!r.success) for (const o of m.objectives) if (!o.def.secondary && o.state !== 'reussi') row.notes.push(`manqué ${o.def.id}:${o.def.kind} — ${o.note}`);
    if (!Number.isFinite(r.score)) row.notes.push('score NaN');
    for (const l of r.lines) if (BAD_TEXT.test(`${l.label} ${l.value} ${l.note ?? ''}`)) row.notes.push(`ligne : ${l.label} ${l.value} ${l.note}`);
    if (BAD_TEXT.test(r.summary)) row.notes.push(`résumé : ${r.summary}`);
  } else row.notes.push('aucun compte rendu');
  if (banners === 0) row.notes.push('aucune phase ouverte');
  if (ctx.radio.log.length === radio0) row.notes.push('aucun message radio');
  if (stuck) row.notes.push(stuck);
  for (const x of new Set(allTexts)) if (BAD_TEXT.test(x)) row.notes.push(`texte : ${x}`);
  const car = ctx.service<CareerApi>(CAREER_SERVICE);
  if (car && !car.progress.results[def.id]) row.notes.push('carrière : rien enregistré');
  return row;
}

describe('recette jouée des missions de police', () => {
  it('chaque mission se joue jusqu’au bout sans blocage', async () => {
    const rows: Row[] = [];
    for (const def of MINE) {
      if (ONLY && !ONLY.includes(def.id)) continue;
      const t0 = Date.now();
      let row: Row;
      try { row = await play(def, SECONDS); } catch (e) { row = { id: def.id, state: 'ERREUR', notes: [String((e as Error).stack ?? e).slice(0, 400)] }; }
      console.log(`${row.id} → ${row.state} (${((Date.now() - t0) / 1000).toFixed(0)} s)${row.notes.length ? '\n    ' + row.notes.join('\n    ') : ''}`);
      rows.push(row);
    }
    expect(rows.length).toBeGreaterThan(0);
    // ni exception, ni joueur perdu, ni texte cassé, ni compte rendu manquant ou faux, ni carrière oubliée
    const defects = rows.flatMap((r) => (r.state === 'ERREUR' ? [`${r.id} : ${r.notes[0]}`] : r.notes
      .filter((n) => /pas de joueur|point non fini|score NaN|^ligne|^résumé|aucun compte rendu|aucune phase|^texte|carrière/.test(n))
      .map((n) => `${r.id} : ${n}`)));
    expect(defects).toEqual([]);
  }, 3_600_000);
});
