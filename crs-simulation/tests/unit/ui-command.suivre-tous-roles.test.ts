// « Me suivre à pied » et « Me suivre en colonne (véhicules) » pour TOUT policier : le CRS, la BRAV-M, l'équipage d'un
// engin, le télépilote n'avaient ni roue d'ordres (« Vous recevez les ordres : pas de roue d'ordres à ce poste »), ni
// bouton « Ordres » sur écran tactile, et l'ordre leur était refusé (« Lecture seule »). Ils ont maintenant la roue
// réduite aux deux ordres (F, bouton « Ordres »), les deux boutons des actions rapides, et l'ordre part à leur unité :
// en colonne, elle embarque ; à pied, elle descend et suit le joueur.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command, ordersButtonVisible } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { FOLLOW_WHEEL, WHEEL, wheelOrders } from '@/ui/command/orderWheel';
import { followButtonsShown } from '@/ui/command/quickActions';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];

async function start(role: string, poste?: string) {
  const t = createTestContext({ seed: 21, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role, rank: role === 'commandant' ? 'commandant' : undefined, place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: poste ? { poste } : {} } as never);
  t.step(3);
  return { t, ctx: t.ctx, core: t.ctx.service<CommandCore>('ui.command')!, me: t.ctx.player.person()! };
}

function crewOf(ctx: GameContext, s: Squad): Person[] {
  return s.members.map((id) => ctx.people.get(id)!).filter((p) => p && !p.isPlayer && p.custody === 'free' && p.posture !== 'down');
}

const EXECUTANTS: [string, string | undefined][] = [
  ['crs', 'bouclier'], ['crs', 'conducteur'], ['bravm', 'pilote_moto'], ['gendarme_centaure', undefined], ['operateur_canon_eau', undefined], ['telepilote', undefined],
];

describe('ordres « me suivre » : tout policier', () => {
  it('roue réduite : les deux ordres seulement, l’un à côté de l’autre, touches 1 et 2', () => {
    expect(FOLLOW_WHEEL.map((w) => w.type)).toEqual(['suivre_pied', 'avec_moi']);
    expect(wheelOrders('lecture')).toBe(FOLLOW_WHEEL);
    expect(wheelOrders('unite')).toBe(WHEEL);
    expect(wheelOrders('tout')).toBe(WHEEL);
  });

  for (const [role, poste] of EXECUTANTS) {
    it(`${role}${poste ? ' / ' + poste : ''} : roue, bouton tactile, actions rapides ; en colonne puis à pied`, async () => {
      const { t, ctx, core, me } = await start(role, poste);
      expect(core.scope().level).toBe('lecture');
      const unit = core.followUnit();
      expect(unit).toBeTruthy();
      expect(unit!.id).toBe(me.squadId);
      expect(ordersButtonVisible(core)).toBe(true);
      expect(followButtonsShown(core)).toBe(true);
      // un autre ordre reste refusé (lecture seule)
      expect(core.issue('tenir', [unit!], null).ok).toBe(false);

      // « Me suivre en colonne (véhicules) » : l'unité embarque
      const r = core.callFollow(true);
      expect(r.ok, r.reason).toBe(true);
      expect(unit!.order.type).toBe('embarquer');
      const said = ctx.radio.log.map((m) => m.text);
      expect(said.some((x) => x.indexOf(unit!.name) >= 0 && /Me suivre en colonne/.test(x) && x.indexOf(me.name.toUpperCase()) >= 0)).toBe(true);
      for (let i = 0; i < 30; i++) t.step(2);
      const aboard = crewOf(ctx, unit!).filter((p) => p.vehicleId !== 0).length;
      console.log(`${role}/${poste ?? ''} : ${unit!.name}, ${aboard}/${crewOf(ctx, unit!).length} à bord ; « ${ctx.radio.log.filter((m) => /prête à vous suivre|à pied/.test(m.text)).map((m) => m.text).pop() ?? '—'} »`);
      expect(aboard).toBeGreaterThan(0);

      // « Me suivre à pied » : l'unité descend, puis suit le joueur
      expect(core.callFollow(false).ok).toBe(true);
      for (let i = 0; i < 30 && !(unit!.order.type === 'suivre' && crewOf(ctx, unit!).every((p) => p.vehicleId === 0 || p.poste === 'conducteur' || unit!.kind === 'equipage')); i++) t.step(2);
      expect(unit!.order.type).toBe('suivre');
      expect(unit!.order.targetId).toBe(me.id);
      const still = crewOf(ctx, unit!).filter((p) => p.vehicleId !== 0 && p.poste !== 'conducteur' && unit!.kind !== 'equipage');
      expect(still.map((p) => p.poste)).toEqual([]);
    }, 300000);
  }

  for (const [role, poste] of [['chef_groupe', undefined], ['commandant', undefined], ['commissaire', undefined]] as const) {
    it(`${role} : roue complète (avec les deux ordres) et boutons « me suivre »`, async () => {
      const { core } = await start(role, poste);
      expect(core.scope().level).not.toBe('lecture');
      expect(core.followUnit()).toBeTruthy();
      expect(followButtonsShown(core)).toBe(true);
      expect(ordersButtonVisible(core)).toBe(true);
      expect(wheelOrders(core.scope().level).map((w) => w.type)).toEqual(expect.arrayContaining(['suivre_pied', 'avec_moi']));
      expect(core.callFollow(true).ok).toBe(true);
    }, 300000);
  }

  it('hors police : ni roue, ni boutons « me suivre »', async () => {
    const { core } = await start('journaliste');
    expect(core.followUnit()).toBe(null);
    expect(followButtonsShown(core)).toBe(false);
    expect(ordersButtonVisible(core)).toBe(false);
    expect(core.callFollow(true).ok).toBe(false);
  }, 300000);
});
