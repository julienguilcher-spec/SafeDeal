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
import { createSystems as rescueSim } from '@/sim/roles/rescue';
import { createSystems as command, ordersButtonVisible } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { FOLLOW_WHEEL, WHEEL, wheelOrders } from '@/ui/command/orderWheel';
import type { WheelSector } from '@/ui/command/orderWheel';
import { followButtonsShown, requestRescueAtPlayer } from '@/ui/command/quickActions';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore, collectReperes } from '@/ui/command/reperes';
import { sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];

/** Ce que fait la touche n (« F puis n ») dans la roue de ce niveau de commandement ; '' si rien. */
function sectorOf(level: string, n: number): string {
  const w: WheelSector | undefined = wheelOrders(level).find((s) => s.key === n);
  return w ? w.type : '';
}

async function start(role: string, poste?: string, modules = SIM) {
  const t = createTestContext({ seed: 21, strict: false, modules });
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
  it('roue réduite : « Suivez-moi » à pied, en véhicules, et « Secours ici », avec les numéros de la roue complète (1, 2, 7)', () => {
    expect(FOLLOW_WHEEL.map((w) => w.type)).toEqual(['suivre_pied', 'avec_moi', 'secours']);
    expect(FOLLOW_WHEEL.map((w) => w.key)).toEqual([1, 2, 7]);
    expect(wheelOrders('lecture')).toBe(FOLLOW_WHEEL);
    expect(wheelOrders('unite')).toBe(WHEEL);
    expect(wheelOrders('tout')).toBe(WHEEL);
    // F puis 1 / F puis 2 / F puis 7 : le même ordre pour tout le monde
    for (const level of ['lecture', 'unite', 'section', 'tout']) {
      expect([sectorOf(level, 1), sectorOf(level, 2), sectorOf(level, 7)], level).toEqual(['suivre_pied', 'avec_moi', 'secours']);
    }
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
      expect([sectorOf(core.scope().level, 1), sectorOf(core.scope().level, 2)]).toEqual(['suivre_pied', 'avec_moi']);
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
    it(`${role} : roue complète (F puis 1 / F puis 2 comme le CRS), boutons « Suivez-moi », fiche « VOUS » de la carte`, async () => {
      // avec le service des secours (pompiers, SAMU) du jeu : « Secours ici » y aboutit
      const { t, ctx, core, me } = await start(role, poste, [...SIM.slice(0, -2), rescueSim, ...SIM.slice(-2)]);
      expect(core.scope().level).not.toBe('lecture');
      const unit = core.followUnit();
      expect(unit).toBeTruthy();
      expect(followButtonsShown(core)).toBe(true);
      expect(ordersButtonVisible(core)).toBe(true);
      expect(wheelOrders(core.scope().level)).toBe(WHEEL);
      expect([sectorOf(core.scope().level, 1), sectorOf(core.scope().level, 2), sectorOf(core.scope().level, 7)]).toEqual(['suivre_pied', 'avec_moi', 'secours']);
      // la fiche « VOUS » de la carte de commandement : les deux mêmes ordres, en lignes 1 et 2
      const env = cardEnvFromCore(core);
      const vous = collectReperes(env).find((r) => r.kind === 'vous');
      expect(vous).toBeTruthy();
      const card = buildCard(vous!, env, null);
      expect(card.lines.slice(0, 2).map((l) => l.label)).toEqual(['Suivez-moi à pied', 'Suivez-moi en véhicules']);
      // F puis 2 : l'unité qu'il commande embarque pour le suivre en véhicules
      const heard = ctx.radio.log.length;
      const r = core.callFollow(true);
      expect(r.ok, r.reason).toBe(true);
      t.step(1);
      const types = [unit!.order.type, ...ctx.squads.childrenOf(unit!.id).map((s) => s.order.type)];
      console.log(`${role} : ${unit!.name} (${unit!.kind}) → ${types.join(', ')} ; fiche « ${card.title} » ; radio « ${ctx.radio.log.slice(-1)[0]?.text ?? ''} »`);
      expect(types.some((x) => x === 'embarquer' || x === 'avec_moi' || x === 'suivre')).toBe(true);
      // l'ordre est dit à la radio par le joueur
      expect(ctx.radio.log.slice(heard).some((m) => m.personId === me.id)).toBe(true);
      // F puis 7 puis 1 : les pompiers au point où se trouve le joueur, une seule fois même si on insiste
      const before = ctx.radio.log.length;
      expect(requestRescueAtPlayer(core, 'pompiers')).toBe(true);
      expect(requestRescueAtPlayer(core, 'pompiers')).toBe(false);
      const said = ctx.radio.log.slice(before).filter((m) => m.channel === 'secours');
      expect(said.length).toBe(1);
      const rescue = core.rescue;
      expect(rescue, 'service des secours').toBeTruthy();
      const call = rescue!.calls[rescue!.calls.length - 1];
      expect(call, 'demande enregistrée par le service des secours').toBeTruthy();
      expect(call!.kind).toBe('pompiers');
      expect(Math.hypot(call!.x - me.x, call!.z - me.z)).toBeLessThan(5);
    }, 300000);
  }

  it('équipage de patrouille à bord : « en colonne » le laisse à bord sans ordre radio ; « à pied », le joueur descendu, il suit', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    await t.start(vacationSessionConfig(sanitizePatrolSetup({ seed: 21, crew: 'bac', seat: 'conducteur' })));
    t.step(3);
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    expect(me.vehicleId).not.toBe(0);
    const unit = core.followUnit()!;
    expect(unit).toBeTruthy();
    expect(followButtonsShown(core)).toBe(true);
    const before = ctx.radio.log.length;
    expect(core.callFollow(true).ok).toBe(true);
    for (let i = 0; i < 10; i++) t.step(1);
    // ni « Me suivre en colonne » dans l'habitacle, ni « Pas de véhicule disponible, je vous suis à pied »
    const said = ctx.radio.log.slice(before).map((m) => m.text);
    expect(said.filter((x) => /Me suivre en colonne|Pas de véhicule disponible/.test(x))).toEqual([]);
    expect(crewOf(ctx, unit).every((p) => p.vehicleId === me.vehicleId)).toBe(true);
    // le joueur descend, puis « Me suivre à pied » : ses deux collègues descendent et le suivent
    ctx.vehicles.exit(me);
    t.step(1);
    expect(core.callFollow(false).ok).toBe(true);
    for (let i = 0; i < 30 && crewOf(ctx, unit).some((p) => p.vehicleId !== 0); i++) t.step(2);
    expect(unit.order.type).toBe('suivre');
    expect(crewOf(ctx, unit).filter((p) => p.vehicleId !== 0).length).toBe(0);
    // retour à la voiture : le joueur remonte, « en colonne » fait remonter l'équipage avec lui
    const car = ctx.vehicles.get(unit.vehicleId)!;
    expect(car).toBeTruthy();
    expect(ctx.vehicles.enter(me, car, 0)).toBe(true);
    const mark = ctx.radio.log.length;
    expect(core.callFollow(true).ok).toBe(true);
    for (let i = 0; i < 40 && crewOf(ctx, unit).some((p) => p.vehicleId !== car.id); i++) t.step(1);
    console.log('remontée :', crewOf(ctx, unit).map((p) => p.vehicleId === car.id), ctx.radio.log.slice(mark).map((m) => m.text).join(' | '));
    expect(crewOf(ctx, unit).every((p) => p.vehicleId === car.id)).toBe(true);
  }, 300000);

  it('hors police : ni roue, ni boutons « me suivre »', async () => {
    const { core } = await start('journaliste');
    expect(core.followUnit()).toBe(null);
    expect(followButtonsShown(core)).toBe(false);
    expect(ordersButtonVisible(core)).toBe(false);
    expect(core.callFollow(true).ok).toBe(false);
  }, 300000);
});
