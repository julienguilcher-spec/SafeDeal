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
import { PASSERSBY_KEY, mapKey } from '@/ui/command/tacticalKeys';
import { TacticalState } from '@/ui/command/tacticalState';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { PASSERSBY_TAG, barrageLook } from '@/ui/maps/barrages';
import type { BarrageView, BarragesApi, ExitView, KettleView } from '@/ui/maps/barrages';
import { plainOrder } from '@/gameplay/session/executant';
import { createSystems as worldQuery } from '@/world/query';
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
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';

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

  it('plus de bascule cachée : « passants admis » est une ligne explicite de la fiche d’une rue (touche B : « Bloquer une rue »)', () => {
    const st = new TacticalState();
    expect(st.passersby).toBe(false);
    // l'ancienne bascule ne peut plus changer « Barrer la rue » en « passants admis »
    expect(st.togglePassersby()).toBe(false);
    expect(st.passersby).toBe(false);
    expect(PASSERSBY_KEY).toBe('KeyB');
    expect(mapKey('KeyB', false, { level: 'tout', card: false })).toEqual({ kind: 'intent', id: 'bloquer' });
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
  it('le point désigné part avec l’option de la ligne choisie ; la radio le dit ; rien n’est retenu en cachette', async () => {
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
    // ligne 2 de la fiche d'une rue, « Barrer la rue, passants admis » : targetId −2 explicite
    expect(tmap.issuePoint(verb, -30, 0, NaN, SIM_LET)).toBe(true);
    expect(w.g.order.targetId).toBe(SIM_LET);
    expect(w.ctx.radio.log.at(-1)!.text).toContain('Laissez passer les passants, pas les manifestants ni les véhicules');
    // l'ancienne bascule (B) ne retient plus rien : l'ordre suivant sans option barre à tous ; un autre verbe n'en reçoit rien
    st.togglePassersby();
    expect(tmap.issuePoint(verb, -31, 0, NaN)).toBe(true);
    expect(w.g.order.targetId).toBe(0);
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

describe('fiche d’une rue : les deux lignes « Barrer la rue » (vraie partie, place de la Concorde)', () => {
  it('ligne 1 : personne ne passe (targetId 0) ; ligne 2 : passants admis (−2) ; chacune à la section proposée', async () => {
    const MODULES = [worldQuery, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, mapsSystems, commandSystems];
    const MEANS = { sections: 3, fourgons: 9, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.3,
      volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    t.step(3);
    const ctx = t.ctx;
    const core = ctx.service<CommandCore>(COMMAND_SERVICE)!;
    const state = new TacticalState();
    const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
    const streets = intentCandidates('bloquer', cardEnvFromCore(core), cardEnvFromCore(core).player!);
    expect(streets.length).toBeGreaterThan(1);
    for (const [i, want] of [[0, 0], [1, SIM_LET]] as const) {
      const env = cardEnvFromCore(core);
      const r = streets[i]!;
      const line = buildCard(r, env, 'bloquer').lines[i]!;
      expect(line.action).toEqual({ kind: 'verb', type: 'couper_circulation', geom: 'street', targetId: want });
      const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, env, [])))!;
      expect(who.squadIds.every((id) => env.units.find((u) => u.squadId === id)!.symbol === 'section')).toBe(true);
      const res = sendCardLine({ core, map: tmap, card: env, trace: null, setSelection: (ids) => state.setSelection(ids) }, line, who, r);
      expect(res.ok, res.text).toBe(true);
      for (const id of res.squads) {
        const s = ctx.squads.get(id)!;
        const later = core.afterConvoy.get(id);
        const got = s.order.type === 'couper_circulation' ? s.order.targetId : later?.type === 'couper_circulation' ? later.targetId : NaN;
        expect(got, `${s.name} : ${s.order.type}`).toBe(want);
      }
      core.maps.scene.invalidate();
    }
  }, 300000);
});
