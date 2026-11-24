// Grande compagnie (douze groupes) : le commandant, passager de sa colonne, arrive AVEC elle. Trois trajets de mission,
// joués comme le joueur (il monte à bord, la colonne roule, la mission commence) — sans donner d'ordre :
//   - « Le pré-cortège » (République) : la tête passait rue Commines, tenait un abribus posé le long du trottoir pour un
//     barrage, faisait demi-tour entre les façades et restait là — le commandant à bord, à 390 m de la place où sa
//     compagnie arrivait sans lui (sim/vehicles/autopilot-sense.ts, boxClear) ;
//   - « Trois ponts » (quai d'Orsay) : la mission commençait la tête à peine garée, treize véhicules sur dix-sept encore
//     sur le quai, à 240–410 m (gameplay/missions/system.ts, tailIn) ;
//   - « Minuit sur le parvis » (île de la Cité) : à 285 m du parvis, la tête, arrêtée sur le pont, repartait pour 3,8 km de
//     détour ; la file se défaisait et la mission commençait au filet des quinze minutes, la compagnie étirée sur un
//     kilomètre (sim/police/command/convoy.ts, shortPark : on débarque ensemble et on finit à pied).
// Mesure : à l'instant où la mission commence, la part des agents de la compagnie à moins de 300 m du commandant.
import { describe, expect, it } from 'vitest';

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { JOURNEE_SERVICE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import type { MissionsApi } from '@/gameplay/missions';
import { SIM, launchFromSheet, walk } from './playtest.commandant-mission.lib';

interface Arrival {
  /** Secondes de jeu jusqu'au début de la mission (−1 : jamais). */
  startAfter: number;
  /** Distance du commandant au lieu quand elle commence (m). */
  toPlace: number;
  /** Agents de sa compagnie (hors lui) à moins de 300 m de lui, et leur nombre. */
  near: number;
  total: number;
  /** Groupes dont les agents sont en moyenne à plus de 300 m de lui, sur combien. */
  farGroups: number;
  groups: number;
  /** Véhicules de la compagnie qui roulent encore à plus de 450 m de lui. */
  strays: number;
  /** Ce qu'a dit la compagnie sur le réseau de commandement. */
  said: string[];
}

async function ride(id: string): Promise<Arrival> {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = launchFromSheet(ctx, id);
  cfg.crowdSize = Math.min(cfg.crowdSize ?? 300, 300);
  await t.start(cfg);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const path: number[] = [];
  let s = 0;
  for (; s < 1000 && m.phaseIndex < 0 && !m.result; s++) {
    t.step(1);
    const me = ctx.player.person()!;
    if (me.vehicleId !== 0) continue;
    // à pied avant le départ : il rejoint le véhicule que lui désigne l'objectif et monte en passager
    const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
    if (!e) continue;
    walk(ctx, me, e.x!, e.z!, 4, path);
    const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
    if (v) ctx.vehicles.enter(me, v, 'passenger');
  }
  const me = ctx.player.person()!;
  const d = j.destination;
  let top = ctx.squads.get(me.squadId);
  for (let g = 0; top && top.parentId !== 0 && g < 8; g++) top = ctx.squads.get(top.parentId);
  const under = (sid: number): boolean => {
    for (let q = ctx.squads.get(sid), g = 0; q && g < 9; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, g++) if (top && q.id === top.id) return true;
    return false;
  };
  const posOf = (p: Person): { x: number; z: number } => {
    const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
    return v ? { x: v.x, z: v.z } : { x: p.x, z: p.z };
  };
  const out: Arrival = { startAfter: m.phaseIndex >= 0 ? s : -1, toPlace: d ? Math.hypot(me.x - d.x, me.z - d.z) : -1, near: 0, total: 0, farGroups: 0, groups: 0, strays: 0, said: [] };
  for (const q of ctx.squads.list) {
    if (q.faction !== 'police' || q.members.length === 0 || !under(q.id)) continue;
    let sum = 0, n = 0;
    for (const pid of q.members) {
      const p = ctx.people.get(pid);
      if (!p || p.isPlayer || p.posture === 'down' || p.custody !== 'free') continue;
      const ps = posOf(p);
      const far = Math.hypot(ps.x - me.x, ps.z - me.z);
      out.total++;
      if (far < 300) out.near++;
      sum += far;
      n++;
    }
    if (q.kind === 'groupe' && n > 0) {
      out.groups++;
      if (sum / n > 300) out.farGroups++;
    }
  }
  for (const v of ctx.vehicles.list) {
    if (v.faction !== 'police' || Math.abs(v.speed) < 0.5 || Math.hypot(v.x - me.x, v.z - me.z) < 450) continue;
    const drv = v.seats[0] ? ctx.people.get(v.seats[0]!) : undefined;
    if (drv && under(drv.squadId)) out.strays++;
  }
  const name = top ? top.name : '';
  for (const l of ctx.radio.log) if (l.from === name) out.said.push(l.text);
  console.log(`${id} : mission ${out.startAfter >= 0 ? `commencée après ${out.startAfter} s` : 'JAMAIS commencée'} (journée ${j.stage}), commandant à ${out.toPlace.toFixed(0)} m du lieu ; ${out.near}/${out.total} agents à moins de 300 m de lui, ${out.farGroups}/${out.groups} groupes à plus de 300 m, ${out.strays} véhicule(s) encore en route à plus de 450 m`);
  return out;
}

describe('grande compagnie : le commandant passager arrive avec sa colonne', () => {
  it('« Le pré-cortège » : la tête passe la rue Commines, toute la compagnie est sur la place avec lui', async () => {
    const a = await ride('cdt-02-le-precortege');
    expect(a.startAfter, 'la mission commence').toBeGreaterThanOrEqual(0);
    // (jeu publié : 819 s ; avant la correction : 765 s, le commandant débarqué d'office à 385 m de la place)
    expect(a.startAfter).toBeLessThanOrEqual(820);
    expect(a.toPlace, 'le commandant est sur la place').toBeLessThan(100);
    expect(a.farGroups, 'aucun groupe à plus de 300 m de lui').toBe(0);
    expect(a.near).toBeGreaterThanOrEqual(a.total * 0.9);
    expect(a.strays).toBe(0);
  }, 600_000);

  it('« Trois ponts » : la mission attend la queue de la colonne, pas plus de deux minutes', async () => {
    const a = await ride('cdt-05-trois-ponts');
    expect(a.startAfter).toBeGreaterThanOrEqual(0);
    // (jeu publié : 974 s ; avant la correction : 470 s, deux groupes sur douze à plus de 300 m et treize véhicules en route)
    expect(a.startAfter).toBeLessThanOrEqual(620);
    expect(a.toPlace).toBeLessThan(100);
    expect(a.near, 'neuf agents sur dix à moins de 300 m de lui').toBeGreaterThanOrEqual(a.total * 0.9);
    expect(a.farGroups).toBeLessThanOrEqual(1);
    expect(a.strays).toBe(0);
  }, 600_000);

  it('« Minuit sur le parvis » : rue fermée à 290 m du parvis — arrêt court, on débarque ensemble et on finit à pied', async () => {
    const a = await ride('cdt-14-minuit-sur-le-parvis');
    expect(a.startAfter).toBeGreaterThanOrEqual(0);
    // (jeu publié : 901 s, au filet, la colonne immobile ; avant la correction : 1170 s, cinq groupes sur douze à plus de 300 m)
    expect(a.startAfter).toBeLessThanOrEqual(700);
    // elle le dit, avec la distance et la raison
    expect(a.said.some((x) => /Colonne arrêtée à \d+ mètres du point : la rue est fermée, détour de [\d,]+ kilomètres\. On débarque ici et on finit à pied/.test(x)), a.said.slice(-4).join(' | ')).toBe(true);
    // à portée de marche du parvis, personne reparti pour le tour de l'île
    expect(a.toPlace).toBeLessThan(320);
    expect(a.strays, 'plus aucun véhicule de la compagnie ne roule au loin').toBe(0);
    // (la file s'est arrêtée sur 400 m de quai et de pont, et les derniers rejoignent à pied entre leurs propres fourgons :
    // relevé 59 agents sur 88 à moins de 300 m et deux groupes sur douze au-delà quand la mission commence, deux minutes
    // après l'arrêt — le jeu publié : colonne immobile, tous à bord à moins de 300 m, mission au filet des quinze minutes)
    expect(a.farGroups).toBeLessThanOrEqual(2);
    expect(a.near).toBeGreaterThanOrEqual(a.total * 0.6);
  }, 600_000);
});
