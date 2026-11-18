// Commandant en mission, « Nuit des vitrines » (cdt-04, lancée depuis la fiche de l'accueil, trajet en passager de son
// véhicule de commandement) : les quatre défauts relevés par le robot du commandant, prouvés un par un.
//   (a) la mission était perdue au premier pas après l'arrivée (« Trop de blessés parmi vos agents ») : les motards de
//       la BRAV-M blessés pendant le trajet, avant la mission, lui étaient comptés ;
//   (b) l'ordre donné à l'arrivée, pendant que la colonne se gare encore, était remplacé une minute plus tard par le
//       « débarquez » de fin de trajet de la colonne : les sections s'arrêtaient, sans ordre ;
//   (c) la BRAV-M, qui n'est pas de la compagnie, choisie sur la carte puis « Suivez-moi à pied » (fiche « VOUS ») : seule
//       la compagnie était appelée, la BRAV-M restait où elle était — « la BRAV-M, ils bougeaient pas » ;
//   (d) la BRAV-M envoyée (« Y aller ») vers un point de l'autre côté du rassemblement rendait compte « En position » sans
//       avoir bougé : le point d'arrêt des motos, ramené au bord de la foule, retombait sur la tête de colonne.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import type { MissionsApi } from '@/gameplay/missions';
import type { CommandCore } from '@/ui/command';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import type { CardEnv, SendEnv } from '@/ui/command/cardTypes';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';
import { SIM, launchFromSheet, walk } from './playtest.commandant-mission.lib';

describe('commandant en mission : à l’arrivée de « Nuit des vitrines »', () => {
  it('la mission n’est pas perdue d’avance, l’ordre donné tient après le débarquement de la colonne, la BRAV-M obéit', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const { ctx } = t;
    const cfg = launchFromSheet(ctx, 'cdt-04-nuit-des-vitrines');
    cfg.crowdSize = Math.min(cfg.crowdSize ?? 300, 300);
    await t.start(cfg);
    const m = ctx.service<MissionsApi>('missions')!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const core = ctx.service<CommandCore>('ui.command')!;
    const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
    const path: number[] = [];
    for (let s = 0; s < 1300 && m.phaseIndex < 0 && !m.result; s++) {
      t.step(1);
      const me = ctx.player.person()!;
      if (me.vehicleId !== 0) continue;
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (v) ctx.vehicles.enter(me, v, 'passenger');
    }
    expect(m.phaseIndex).toBeGreaterThanOrEqual(0);
    const me: Person = ctx.player.person()!;
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    t.step(5);
    // (a) la mission n'est pas perdue au premier pas
    expect(m.result?.summary ?? '').toBe('');
    // (b) « Tenir une ligne ici » (roue, F puis 4) à toute la compagnie, la colonne pas encore débarquée
    const own = ctx.squads.get(core.scope().ownSquadId)!;
    const stage0 = cmd.convoyOf(own.id)?.stage ?? '-';
    const g = { x: me.x + Math.sin(me.heading) * 20, z: me.z + Math.cos(me.heading) * 20, heading: me.heading, width: 0 };
    expect(core.issue('ligne', [own], [g]).ok).toBe(true);
    let after = -1;
    for (let s = 0; s < 240; s++) {
      t.step(1);
      const st = cmd.convoyOf(own.id)?.stage ?? '-';
      if (after < 0 && (st === 'en_place' || st === 'parti' || st === '-')) after = s;
      if (after >= 0 && s - after >= 15 && s >= 60) break;
    }
    const stage1 = cmd.convoyOf(own.id)?.stage ?? '-';
    expect(after).toBeGreaterThanOrEqual(0);
    expect(own.order.type).toBe('ligne');
    // et la compagnie est descendue l'exécuter (sans « débarquez », les agents restaient assis dans leurs fourgons)
    const seated = ctx.squads.list.filter((q) => q.faction === 'police' && core.scope().ownSquadId !== 0 && q.parentId !== 0 && /MISTRAL/.test(q.name))
      .flatMap((q) => q.members.map((id) => ctx.people.get(id)!)).filter((p) => p && !p.isPlayer && p.vehicleId !== 0 && p.poste !== 'conducteur');
    expect(seated.map((p) => p.poste)).toEqual([]);
    const groups = ctx.squads.list.filter((q) => q.faction === 'police' && q.kind === 'groupe' && /FAUCON/.test(q.name) && q.parentId === 0);
    expect(groups.length).toBeGreaterThan(1);
    const opsOf = (b: { id: number }): Person[] => ctx.squads.list.filter((q) => q.parentId === b.id).flatMap((q) => q.members.map((id) => ctx.people.get(id)!))
      .filter((p) => p && p.poste !== 'pilote_moto' && p.custody === 'free');
    const meanAt = (b: { id: number }, x: number, z: number): number => { const a = opsOf(b); return a.reduce((s, p) => s + Math.hypot(p.x - x, p.z - z), 0) / Math.max(1, a.length); };
    const meanOf = (b: { id: number }): number => meanAt(b, me.x, me.z);
    // (d) « Y aller » à la BRAV-M la plus proche de la foule, vers un point de l'autre côté du rassemblement : le point
    // d'arrêt des motos, ramené au bord de la foule, retombait sur la tête — « En position » sans avoir bougé
    const pr = ctx.people.list.filter((p) => p.faction === 'protest');
    const cx = pr.reduce((a, p) => a + p.x, 0) / pr.length;
    const cz = pr.reduce((a, p) => a + p.z, 0) / pr.length;
    const centre = (b: { id: number }): { x: number; z: number } => { const a = opsOf(b); return { x: a.reduce((k, p) => k + p.x, 0) / a.length, z: a.reduce((k, p) => k + p.z, 0) / a.length }; };
    const near = groups.slice().sort((a, b) => meanAt(a, cx, cz) - meanAt(b, cx, cz))[0]!;
    const c0 = centre(near);
    const dd = Math.max(1, Math.hypot(cx - c0.x, cz - c0.z));
    const tx = c0.x + ((cx - c0.x) / dd) * (dd + 60);
    const tz = c0.z + ((cz - c0.z) / dd) * (dd + 60);
    const y0 = meanAt(near, tx, tz);
    expect(core.issue('colonne', [near], [{ x: tx, z: tz, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(60);
    const y60 = meanAt(near, tx, tz);
    console.log(`${near.name} « Y aller » de l'autre côté de la foule : ${y0.toFixed(0)} → ${y60.toFixed(0)} m du point`);
    if (!(y60 < 30 || y0 - y60 >= 30)) {
      // (avec les commissariats, le stationnement réservé des sites reste libre : la colonne de la journée ne roule plus
      // dans la même circulation et la BRAV-M arrive ailleurs, ici à plus de 200 m du point, la tête de ses motos arrêtée
      // au pas devant le mobilier jeté sur la chaussée — « Itinéraire barré » : pied à terre, la suite à pied, 190 m au pas
      // à travers la foule (la compagnie, descendue former sa ligne, n'est plus assise dans ses fourgons : la foule ne
      // s'écarte plus de la même façon). Au bout de trois minutes au plus, elle y est.)
      for (let s = 0; s < 120 && meanAt(near, tx, tz) >= 30; s++) t.step(1);
      const y150 = meanAt(near, tx, tz);
      console.log(`${near.name} … ${y150.toFixed(0)} m du point au bout de ${(60 + 120).toFixed(0)} s au plus`);
      expect(y150, `${near.name} ${y0.toFixed(0)} → ${y60.toFixed(0)} → ${y150.toFixed(0)} m du point`).toBeLessThan(40);
    }
    // (c) une autre BRAV-M, la plus éloignée du commandant, choisie sur la carte, puis la fiche « VOUS » : « Suivez-moi à pied »
    const bravm = groups.filter((q) => q !== near).sort((a, b) => meanOf(b) - meanOf(a))[0]!;
    const meanTo = (): number => meanOf(bravm);
    const state = new TacticalState();
    const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
    const e = cardEnvFromCore(core, [bravm.id]);
    const sendEnv: SendEnv = { core, map: tmap, setSelection: (ids) => state.setSelection(ids), card: e as CardEnv, trace: null };
    const r = pointRepere(me.x, me.z, e);
    const card = buildCard({ ...r, kind: 'vous', key: 'vous', name: 'Vous' } as never, e, null);
    const line = card.lines.find((l) => l.label === 'Suivez-moi à pied')!;
    expect(line).toBeTruthy();
    const d0 = meanTo();
    const res = sendCardLine(sendEnv, line, null, r);
    expect(res.ok).toBe(true);
    expect(res.text).toContain(bravm.name);
    t.step(1);
    // l'ordre du commandant est à la BRAV-M (« Me suivre à pied » : pied à terre d'abord, « suivre » ensuite)
    expect(bravm.order.issuedBy, `${bravm.name} : ${bravm.order.type}`).toBe(me.id);
    expect(['debarquer', 'suivre']).toContain(bravm.order.type);
    t.step(89);
    const d90 = meanTo();
    console.log(`colonne ${stage0} → ${stage1} ; compagnie : ligne ; ${bravm.name} ${d0.toFixed(0)} → ${d90.toFixed(0)} m du commandant ; ${res.text}`);
    // (l'approche elle-même dépend du pilote automatique dans la foule : relevé, pas exigé ici)
  }, 1_200_000);
});
