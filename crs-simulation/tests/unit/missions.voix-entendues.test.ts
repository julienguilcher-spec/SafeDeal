// Voix et messages des phases d'une mission, ENTENDUS par le joueur (sous-titre) à travers son filtre d'écoute :
//  - le policier exécutant (crs-02, gardien stagiaire) entendait au journal la voix « CHEF DE GROUPE » de sa propre
//    mission, mais son filtre d'écoute la classait « trafic d'une autre unité » et la masquait (pas de sous-titre) ;
//  - le pompier (secouriste) n'entendait ni « CENTRAL » qui l'appelle (SAPEUR UN ICI CENTRAL, envoyé sur le réseau de
//    commandement de la police), ni son chef d'agrès à côté de lui (canal public, hors de son réseau).
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
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
import { createObjectives } from '@/ui/core/objectives';
import { ExecutantRadioFilter, listenForRole } from '@/gameplay/radio/relevance';
import type { RadioScope } from '@/gameplay/radio/relevance';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, objectives];

async function heard(id: string, seconds: number) {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const def = missionById(id)!;
  await t.start(missionConfig(def, t.ctx.world) as SessionConfig);
  const { ctx } = t;
  const subs: string[] = [];
  const real = ctx.ui.subtitle.bind(ctx.ui);
  ctx.ui.subtitle = (from: string, text: string, d?: number) => { subs.push(from); real(from, text, d); };
  // la mission commence à l'arrivée (journée de service) : on attend la première phase, puis `seconds`
  for (let i = 0; i < 900 && !ctx.radio.log.some((m) => m.from === def.phases[0]!.radio[0]!.from); i++) t.step(1);
  t.step(seconds);
  return { def, ctx, subs };
}

describe('voix des phases entendues par le joueur', () => {
  it('filtre de l\'exécutant : une voix entendue sur place (canal public, sans personne attachée) passe, une seule fois', () => {
    const f = new ExecutantRadioFilter();
    const scope: RadioScope = { group: 'Mistral 1 Alfa', section: 'Mistral 1', company: 'Mistral', people: new Set(), self: 5 };
    const msg = { channel: 'public' as const, from: 'CHEF DE GROUPE', text: 'Serrez la ligne, boucliers au contact !', priority: 1 as const };
    expect(f.accept(msg, scope, 10)).toBe(true);
    expect(f.accept(msg, scope, 12)).toBe(false);
    // le trafic de commandement d'une autre unité reste masqué
    expect(f.accept({ channel: 'commandement', from: 'TRAMONTANE 2', text: 'TRAMONTANE ICI TRAMONTANE DEUX. En place. PARLEZ.', priority: 1 }, scope, 20)).toBe(false);
  });

  it('écoute du secouriste : son chef d\'agrès sur place et les appels qui lui sont adressés passent, pas le trafic de police', () => {
    const f = new ExecutantRadioFilter();
    const l = listenForRole('secouriste')!;
    expect(f.acceptChannel({ channel: 'public', from: 'CHEF D’AGRÈS', text: 'Casque, visière, veste fermée.', priority: 1 }, l, 5, 1)).toBe(true);
    expect(f.acceptChannel({ channel: 'secours', from: 'CENTRAL', text: 'SAPEUR UN ICI CENTRAL. Victime inconsciente avenue de l’Opéra. PARLEZ.', priority: 1 }, l, 5, 2)).toBe(true);
    expect(f.acceptChannel({ channel: 'commandement', from: 'MISTRAL 1', text: 'MISTRAL ICI MISTRAL UN. En place. PARLEZ.', priority: 1 }, l, 5, 3)).toBe(false);
    expect(f.acceptChannel({ channel: 'secours', from: 'MISTRAL 1', text: 'CENTRAL ICI MISTRAL UN. Demande pompiers rue de Rivoli. PARLEZ.', priority: 1 }, l, 5, 4)).toBe(false);
  });

  it('crs-02 (gardien stagiaire) : la voix « CHEF DE GROUPE » de sa mission est sous-titrée', async () => {
    const { def, ctx, subs } = await heard('crs-02-pluie-de-paves', 20);
    const chef = def.phases[0]!.radio.find((l) => l.from === 'CHEF DE GROUPE');
    expect(chef, 'voix du chef au catalogue').toBeTruthy();
    expect(ctx.radio.log.some((m) => m.from === 'CHEF DE GROUPE')).toBe(true);
    expect(subs).toContain('CHEF DE GROUPE');
  }, 300000);

  it('pompier-01 : l\'appel de CENTRAL à SAPEUR 1 et la voix du chef d\'agrès sont entendus', async () => {
    const { def, subs } = await heard('pompier-01-sous-protection', 20);
    for (const l of def.phases[0]!.radio) expect(subs, l.from).toContain(l.from);
  }, 300000);
});
