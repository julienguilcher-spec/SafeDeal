// « Tout le monde me suit, c'est obligatoire » : au départ d'une session (mode libre, forces déjà sur place, vraie carte
// de Paris), chaque unité que le joueur commande a l'ordre « suivre » sur lui à t = 3 s — commandant (toute la
// compagnie, BRAV-M, engins et fourgons cellulaires compris), chef de section (sa section et ses trois groupes), chef de
// groupe, chef de la BRAV-M (poste pilote : il en est le chef ; poste de chef : il commande la BRAV-M du dispositif). La
// BRAV-M est rattachée à la compagnie.
import { describe, expect, it } from 'vitest';
import type { GameContext, Squad } from '@/core/contracts';
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
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';
import { computeScope } from '@/ui/command/scope';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

interface Case { name: string; role: string; rank: string; poste: string }
const CASES: readonly Case[] = [
  { name: 'commandant', role: 'commandant', rank: 'commandant', poste: 'commandant_unite' },
  { name: 'chef de section', role: 'chef_groupe', rank: 'major', poste: 'chef_section' },
  { name: 'chef de groupe', role: 'chef_groupe', rank: 'brigadier_chef', poste: 'chef_groupe' },
  { name: 'chef de la BRAV-M (pilote, chef de son groupe)', role: 'bravm', rank: 'brigadier_chef', poste: 'pilote_moto' },
  // poste « Chef de la BRAV-M » : il commande la BRAV-M du dispositif (FAUCON 1, six binômes), en selle derrière son pilote
  { name: 'chef de la BRAV-M (poste de chef)', role: 'bravm', rank: 'brigadier_chef', poste: 'chef_groupe' },
];

/** Unités que le joueur commande : celles qu'il dirige et toutes leurs subordonnées. */
function ledTree(ctx: GameContext, playerId: number): Squad[] {
  const out: Squad[] = [];
  const add = (s: Squad): void => {
    if (out.indexOf(s) >= 0) return;
    out.push(s);
    for (const k of ctx.squads.childrenOf(s.id)) add(k);
  };
  for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === playerId) add(s);
  return out;
}

describe('au départ, tout le monde suit le joueur', () => {
  for (const c of CASES) {
    it(`${c.name} : chaque unité qu'il commande le suit à t = 3 s`, async () => {
      const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la République')!;
      const d: ScenarioDraft = {
        ...defaultDraft(), role: c.role as never, rank: c.rank as never, poste: c.poste as never, variante: '',
        place: place.name, x: place.x, z: place.z, crowdSize: 600, seed: 5,
      };
      d.mode = 'libre';
      d.options = { ...d.options, journee: false };
      const t = createTestContext({ seed: 5, strict: false, modules: SIM });
      await t.start(buildSessionConfig(d));
      const { ctx } = t;
      t.step(3);
      const me = ctx.player.person()!;
      expect(me, 'joueur incarné').toBeTruthy();
      const tree = ledTree(ctx, me.id);
      expect(tree.length, 'unités commandées').toBeGreaterThan(0);
      const wrong: string[] = [];
      for (const s of tree) {
        // (un fourgon cellulaire parti à son point de remise a un ordre de mouvement : il n'est pas « sans ordre »)
        // (le groupe à pied qui protège un blindé — Centaure, canon à eau — reste à son engin : plan « ordres directs »
        // §3.3, « not an engine foot escort » ; session/engins.ts le désigne dès les premières secondes)
        const engine = s.order.type === 'proteger' ? ctx.vehicles.get(s.order.targetId ?? 0) : undefined;
        if (engine && (engine.kind === 'centaure' || engine.kind === 'canon_eau')) continue;
        if (s.order.type !== 'suivre' || s.order.targetId !== me.id) wrong.push(`${s.name} (${s.kind}) : ${s.order.type}`);
      }
      console.log(`[${c.name}] ${tree.length} unités :`, tree.map((s) => `${s.name}=${s.order.type}`).join(', '));
      expect(wrong).toEqual([]);
      if (c.role === 'commandant') {
        // la BRAV-M est dans la compagnie, et donc dans ce qu'il commande
        const company = ctx.squads.get(me.squadId)!;
        const faucon = ctx.squads.list.filter((s) => s.name.indexOf('FAUCON') === 0);
        expect(faucon.length, 'BRAV-M engagée').toBeGreaterThan(0);
        for (const f of faucon) {
          let top: Squad | undefined = f;
          while (top && top.parentId !== 0) top = ctx.squads.get(top.parentId);
          expect(top?.id, `${f.name} rattachée à la compagnie`).toBe(company.id);
          expect(tree.indexOf(f), `${f.name} sous ses ordres`).toBeGreaterThanOrEqual(0);
        }
        expect(computeScope(ctx).squadIds.has(faucon[0]!.id)).toBe(true);
      }
      if (c.role === 'bravm' && c.poste === 'chef_groupe') {
        const faucon = tree.find((s) => s.name === 'FAUCON 1')!;
        expect(faucon, 'la BRAV-M du dispositif, sous ses ordres').toBeTruthy();
        expect(ctx.squads.childrenOf(faucon.id).length, 'ses six binômes').toBe(6);
        const sc = computeScope(ctx);
        expect(sc.label).toBe('Chef de la BRAV-M — FAUCON 1');
        expect(sc.squadIds.has(faucon.id)).toBe(true);
      }
      if (c.poste === 'chef_section') {
        const section = tree.find((s) => s.kind === 'section')!;
        expect(section, 'sa section').toBeTruthy();
        expect(ctx.squads.childrenOf(section.id).length).toBe(3);
      }
    }, 300000);
  }
});
