// « Barrer la rue » : option « Passants : bloqués / laissés passer » sur la carte tactique — bascule (touche B, retenue
// pour les ordres suivants), ordre transmis (SquadOrder.targetId = −2, copie locale de BARRAGE_LET_PASSERSBY), phrase
// radio, étiquette « passants admis » sur la carte, légende, carte « Ma mission » de l'exécutant ; l'aide « Fermer la
// nasse » barre toujours sans passants ; l'option survit au mouvement motorisé (ordre repris au débarquement).
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, PoliceRank, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { COMMAND_SERVICE, createSystems as commandSystems } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { createSystems as mapsSystems, MAPS_SERVICE } from '@/ui/maps';
import type { MapsRuntime } from '@/ui/maps';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import {
  BARRAGE_LET_PASSERSBY as UI_LET, BARRER_HINT, barrageTargetId, barrerHint, passersbyLabel, verbHint, verbOf,
} from '@/ui/command/orders';
import { BARRAGE_LET_PASSERSBY as SIM_LET } from '@/sim/police/api';
import { orderPhrase } from '@/ui/command/phrases';
import { QUICK_VERBS, quickSub } from '@/ui/command/tacticalScreen';
import { PASSERSBY_KEY, TACTICAL_KEYS_LEGEND } from '@/ui/command/tacticalKeys';
import { TacticalState } from '@/ui/command/tacticalState';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { PASSERSBY_TAG, barrageLook } from '@/ui/maps/barrages';
import type { BarrageView, BarragesApi, ExitView, KettleView } from '@/ui/maps/barrages';
import { plainOrder } from '@/gameplay/session/executant';

describe('« Barrer la rue » : option des passants (modèle pur)', () => {
  it('constante locale identique à celle de la simulation ; libellés ; consigne', () => {
    expect(UI_LET).toBe(SIM_LET);
    expect(passersbyLabel(false)).toBe('Passants : bloqués');
    expect(passersbyLabel(true)).toBe('Passants : laissés passer');
    expect(barrerHint(false)).toBe(BARRER_HINT);
    expect(barrerHint(true)).toBe('Les manifestants ne passent pas, les passants oui');
    const v = verbOf('couper_circulation')!;
    expect(verbHint(v, false)).toBe(v.hint);
    expect(verbHint(v, true).startsWith('Les manifestants ne passent pas, les passants oui. Désignez la rue')).toBe(true);
    // les autres ordres ne sont pas concernés
    expect(verbHint(verbOf('filtrer')!, true)).toBe(verbOf('filtrer')!.hint);
  });

  it('ordre transmis : targetId −2 pour « Barrer la rue » avec passants admis, sinon inchangé', () => {
    expect(barrageTargetId('couper_circulation', true)).toBe(-2);
    expect(barrageTargetId('couper_circulation', false)).toBe(0);
    expect(barrageTargetId('avancer', true)).toBe(0);
    expect(barrageTargetId('encercler', true)).toBe(0);
    expect(barrageTargetId('interpeller', true, 42)).toBe(42);
  });

  it('bascule : défaut « bloqués », touche B dans la légende, retenue jusqu’au prochain changement', () => {
    const st = new TacticalState();
    expect(st.passersby).toBe(false);
    const rev = st.revision;
    expect(st.togglePassersby()).toBe(true);
    expect(st.passersby).toBe(true);
    expect(st.revision).toBeGreaterThan(rev);
    expect(st.togglePassersby()).toBe(false);
    expect(PASSERSBY_KEY).toBe('KeyB');
    expect(TACTICAL_KEYS_LEGEND).toContain('B = barrage : passants bloqués / admis');
  });

  it('ordre rapide : « Barrer » dit l’option retenue', () => {
    expect(QUICK_VERBS).toContain('couper_circulation');
    expect(quickSub('couper_circulation', false)).toBe('personne ne passe');
    expect(quickSub('couper_circulation', true)).toBe('passants admis');
    expect(quickSub('suivre_pied', true)).toBe('à pied');
    expect(quickSub('avancer', true)).toBeUndefined();
  });

  it('radio, carte, « Ma mission »', () => {
    const base = { type: 'couper_circulation' as const, unit: 'MISTRAL 1', from: 'MISTRAL', sector: 'rue de Rivoli', heading: 0, width: 0, distance: 30, target: '' };
    expect(orderPhrase(base)).toContain('Plus personne ne passe, dans les deux sens');
    expect(orderPhrase({ ...base, passersby: true })).toBe('MISTRAL 1 ICI MISTRAL. Barrez la rue, rue de Rivoli, d’une façade à l’autre. Laissez passer les passants, pas les manifestants ni les véhicules. PARLEZ.');
    expect(PASSERSBY_TAG).toBe('passants admis');
    expect(barrageLook({ state: 'en_place', mode: 'ferme', covered: 1, passersby: true }).tag).toBe('passants admis');
    expect(barrageLook({ state: 'incomplet', mode: 'ferme', covered: 0.6, passersby: true }).tag).toBe('incomplet 60 % · passants admis');
    expect(barrageLook({ state: 'en_place', mode: 'ferme', covered: 1 }).tag).toBe('');
    const p = plainOrder('couper_circulation', { place: 'rue de Rivoli', poste: 'bouclier', hasPost: true, passersby: true });
    expect(p.title).toBe('Barrage — rue de Rivoli : les manifestants ne passent pas, les passants oui');
    expect(p.target).toBe('post');
    // barrage atteint par « tenir » sur une rue : même carte
    expect(plainOrder('tenir', { place: 'rue de Rivoli', poste: 'bouclier', hasPost: true, passersby: true }).title)
      .toBe('Barrage — rue de Rivoli : les manifestants ne passent pas, les passants oui');
    // défaut inchangé
    expect(plainOrder('couper_circulation', { place: 'rue de Rivoli', poste: 'bouclier', hasPost: true }).title)
      .toBe('Barrage — rue de Rivoli : personne ne passe, dans les deux sens');
  });
});

// ───────────────────────────── intégration (service factice) ─────────────────────────────

function agent(ctx: GameContext, squad: Squad, x: number, z: number, rank: PoliceRank, poste: Person['poste']): Person {
  return ctx.people.spawn({ kind: 'crs', faction: 'police', x, z, rank, poste, squadId: squad.id });
}

async function world() {
  const t = createTestContext({ modules: [mapsSystems, commandSystems] });
  await t.start();
  const ctx = t.ctx;
  const company = ctx.squads.create('compagnie', 'police', 'MISTRAL');
  const commandant = agent(ctx, company, 0, -60, 'commandant', 'commandant_unite');
  const g = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA', company.id);
  agent(ctx, g, -40, 0, 'brigadier_chef', 'chef_groupe');
  for (let k = 0; k < 4; k++) agent(ctx, g, -40 + k, 1, 'gardien', 'bouclier');
  ctx.player.possess(commandant.id, 'commandant');
  const fake = { list: [] as BarrageView[], kettles: [] as KettleView[], exits: [] as ExitView[] };
  const api: BarragesApi = {
    get list() { return fake.list; },
    get kettles() { return fake.kettles; },
    exitsAround(): readonly ExitView[] { return fake.exits; },
  };
  ctx.provide('police.barrages', api);
  const core = ctx.service<CommandCore>(COMMAND_SERVICE)!;
  const maps = ctx.service<MapsRuntime>(MAPS_SERVICE)!;
  core.invalidateScope();
  return { ctx, core, maps, g, fake };
}

describe('« Barrer la rue » depuis la carte tactique', () => {
  it('le point désigné part avec l’option retenue ; la radio le dit ; l’ordre suivant la garde', async () => {
    const w = await world();
    const st = new TacticalState();
    const tmap = new TacticalMap(w.core, { handlers: null } as unknown as MapCanvas, st);
    w.maps.scene.invalidate();
    w.maps.scene.ensureFresh();
    const key = w.maps.scene.units.find((u) => u.squadId === w.g.id)!.key;
    st.setSelection([key]);
    const verb = verbOf('couper_circulation')!;
    // défaut : personne ne passe
    expect(tmap.issuePoint(verb, -30, 0, NaN)).toBe(true);
    expect(w.g.order.type).toBe('couper_circulation');
    expect(w.g.order.targetId).toBe(0);
    // B : passants laissés passer
    st.togglePassersby();
    expect(tmap.issuePoint(verb, -30, 0, NaN)).toBe(true);
    expect(w.g.order.targetId).toBe(SIM_LET);
    expect(w.ctx.radio.log.at(-1)!.text).toContain('Laissez passer les passants, pas les manifestants ni les véhicules');
    // retenue : l'ordre suivant garde l'option ; un autre verbe n'en reçoit rien
    expect(tmap.issuePoint(verb, -31, 0, NaN)).toBe(true);
    expect(w.g.order.targetId).toBe(SIM_LET);
    expect(tmap.issuePoint(verbOf('avancer')!, -35, 0, NaN)).toBe(true);
    expect(w.g.order.targetId).toBe(0);
  });

  it('la carte reprend l’option du service : étiquette « passants admis » ; un service sans l’option vaut « bloqués »', async () => {
    const w = await world();
    w.fake.list.push({ squadId: w.g.id, x: -30, z: 0, heading: 0, width: 14, covered: 1, state: 'en_place', street: 'rue Ouest', edgeId: 2, mode: 'ferme', passersby: true });
    w.fake.list.push({ squadId: 999, x: 30, z: 0, heading: 0, width: 14, covered: 1, state: 'en_place', street: 'rue Est', edgeId: 3, mode: 'ferme' });
    w.maps.scene.invalidate();
    w.maps.scene.ensureFresh();
    const [a, b] = w.maps.scene.barrages;
    expect(a!.passersby).toBe(true);
    expect(barrageLook(a!).tag).toBe('passants admis');
    expect(b!.passersby).toBe(false);
  });
});
