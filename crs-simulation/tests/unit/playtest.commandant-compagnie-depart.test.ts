// Partie robot du commandant : « Toute la compagnie » (T) en véhicules, commandant à pied, « Y aller » à 600 m, sur la
// place de la Concorde (piétonne, loin de toute voie carrossable : la file rangée par lineUp le long du tronçon droit
// vers la voie Georges-Pompidou mettait sa tête, le canon à eau, nez au mur de quai — colonne figée derrière elle, plus
// de cinq minutes à 563 m du point). Garantie : une fois l'attente du commandant écoulée, CHAQUE véhicule de la
// compagnie qui a un conducteur part dans un délai borné, et arrive.
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
import { whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardEnv, SendEnv } from '@/ui/command/cardTypes';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState, fixedCandidate } from '@/ui/command/tacticalState';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

const CASES: [string, number, number, number, Record<string, unknown>][] = [
  ['Place de la Concorde', 21, -10, 15, {}],
  ['Place de la Concorde', 7, -10, 15, {}],
];

describe('commandant : « Toute la compagnie » en véhicules — tout le monde part et arrive', () => {
  for (const [place, seed, x, z, extra] of CASES) {
    it(`${place}, graine ${seed}${extra.journee ? ' (journée de service)' : ''}`, async () => {
      const t = createTestContext({ seed, strict: false, modules: MODULES });
      await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place, x, z, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', ...extra } } as never);
      t.step(3);
      const ctx = t.ctx;
      const core = ctx.service<CommandCore>('ui.command')!;
      const state = new TacticalState();
      const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
      const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
      const e0 = cardEnvFromCore(core);
      const sec = e0.units.find((u) => u.symbol === 'section' && u.mine && u.hasVehicles)!;
      const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as never as { x: number; z: number; roadClass: string };
      let target: { x: number; z: number } | null = null;
      for (let a = 0; a < 16 && !target; a++) {
        const tx = sec.x + Math.sin(a * Math.PI / 8) * 600;
        const tz = sec.z + Math.cos(a * Math.PI / 8) * 600;
        if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(sec.x, sec.z, road.x, road.z, 'vehicle', [])) target = { x: road.x, z: road.z };
      }
      expect(target).toBeTruthy();
      const r = pointRepere(target!.x, target!.z, e0);
      const card = buildCard(r, e0, 'envoyer');
      const line = card.lines[card.defaultLine]!;
      const we = whoEnvFromCore(core, e0, []);
      const who = fixedCandidate(e0, we.whole!.squadIds, r, we.whole!.label);
      expect(who.mode).toBe('vehicules');
      expect(sendCardLine(sendEnv(e0), line, who, r).ok).toBe(true);
      t.step(2);
      const pc = ctx.service<{ convoyOf(id: number): { stage: string; awaitingPlayer?: boolean } | null }>('police.command')!;
      const ap = ctx.service<{ status(v: unknown): { mode: string; state: string; reason: string } }>('vehicles.autopilot')!;
      // véhicules de la compagnie qui partiront (un conducteur ; ni motos ni drone)
      const ids = new Set<number>();
      for (const sid of who.squadIds) {
        const stack = [sid];
        while (stack.length) {
          const id = stack.pop()!;
          const s = ctx.squads.get(id);
          if (!s) continue;
          if (s.vehicleId) ids.add(s.vehicleId);
          for (const q of ctx.squads.list) if (q.parentId === id) stack.push(q.id);
        }
      }
      // attente du commandant (à pied, la colonne l'attend) : elle se termine au plus tard en cinq minutes
      let waited = 0;
      while (pc.convoyOf(who.squadIds[0]!)?.awaitingPlayer && waited < 320) { t.step(5); waited += 5; }
      t.step(5);
      const vs = [...ids].map((id) => ctx.vehicles.get(id)!).filter((v) => v && v.seats[0] !== 0 && v.kind !== 'moto_bravm' && !v.def.flying);
      const start = new Map(vs.map((v) => [v.id, { x: v.x, z: v.z }]));
      const left = new Map<number, number>();
      const T = 900;
      for (let s = 0; s < T; s += 5) {
        t.step(5);
        for (const v of vs) if (!left.has(v.id) && Math.hypot(v.x - start.get(v.id)!.x, v.z - start.get(v.id)!.z) > 30) left.set(v.id, s);
      }
      const desc = (v: { id: number; kind: string; x: number; z: number }) => { const st = ap.status(v); const sq = ctx.squads.list.find((q) => q.vehicleId === v.id); return `${sq?.name}/${sq?.order.type} ${v.kind}#${v.id} (${v.x.toFixed(0)}, ${v.z.toFixed(0)}) ${st.mode}/${st.state}/${st.reason} à ${Math.hypot(v.x - target!.x, v.z - target!.z).toFixed(0)} m`; };
      const stayed = vs.filter((v) => !left.has(v.id) || left.get(v.id)! > 240);
      expect(stayed.map(desc), 'partis trop tard ou jamais').toEqual([]);
      const far = vs.filter((v) => Math.hypot(v.x - target!.x, v.z - target!.z) > 220);
      expect(far.map(desc), `colonne ${pc.convoyOf(who.squadIds[0]!)?.stage} : pas arrivés`).toEqual([]);
    }, 1200000);
  }
});
