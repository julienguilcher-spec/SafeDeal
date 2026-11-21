// Manifestations simultanées : outre la manifestation principale, deux autres manifestations DÉCLARÉES se tiennent en
// même temps ailleurs dans Paris (à plus de 1,2 km). Chacune a son parcours, ses phases (rassemblement → départ →
// cortège → dispersion), sa cause, ses organisateurs ; CENTRAL les annonce. Leurs membres sont de vrais manifestants
// pour la police et le droit (sommations, nasse). Une compagnie supplémentaire est engagée sur chacune, commandée par
// l'IA, visible sur la carte tactique. Le modèle de la page d'accueil (« Manifestations simultanées ») fait l'aller-
// retour avec la configuration de session.
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd, CROWD_CORE, CROWD_FLAG, CROWD_MANIFS, CROWD_STATE, MANIF_EVENT, readManifSpecs } from '@/sim/crowd';
import type { CrowdCoreApi, ManifEvent, ManifsApi } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { ENCIRCLE_CLOSE_ALL } from '@/sim/police/api';
import { POLICE_COMMAND_SERVICE } from '@/sim/police/command/api';
import type { CommandApi } from '@/sim/police/command/api';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { MapScene } from '@/ui/maps/scene';
import { UnitModel } from '@/ui/maps/units';
import { visibilityFor } from '@/ui/maps/visibility';
import { computeScope } from '@/ui/command/scope';
import {
  buildSessionConfig, defaultDraft, draftFromConfig, forceRatio, manifPlaces, recommendedMeans, sanitizeDraft, summarize, totalCrowd, withManifCount,
} from '@/ui/screens/scenario';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const MAIN = { x: -10, z: 15 };

describe('manifestations simultanées — scénario', () => {
  it('« Manifestations simultanées » : lieux éloignés, aller-retour de la configuration, moyens recommandés, missions exclues', () => {
    const d = sanitizeDraft({ ...defaultDraft(), place: 'Place de la Concorde', x: MAIN.x, z: MAIN.z, crowdSize: 1000, seed: 3 });
    expect(d.manifestations).toEqual([]);
    const list = withManifCount(d, 4);
    expect(list.length).toBe(3);
    const pts = [{ x: MAIN.x, z: MAIN.z }, ...list];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z)).toBeGreaterThanOrEqual(1200);
    // causes différentes de la principale, effectifs plus modestes
    for (const m of list) {
      expect(m.cause).not.toBe(d.cause);
      expect(m.crowdSize).toBeLessThan(d.crowdSize);
    }
    expect(manifPlaces({ ...d, manifestations: list }).every((p) => !list.some((m) => m.place === p.name))).toBe(true);
    const full = { ...d, manifestations: list };
    // configuration : extra.manifestations, relu à l'identique
    const cfg = buildSessionConfig(full);
    const extra = cfg.extra as Record<string, unknown>;
    expect(Array.isArray(extra['manifestations'])).toBe(true);
    expect((extra['manifestations'] as unknown[]).length).toBe(3);
    const back = draftFromConfig(cfg);
    expect(back.manifestations.map((m) => [m.place, m.x, m.z, m.crowdSize, m.cause])).toEqual(list.map((m) => [m.place, m.x, m.z, m.crowdSize, m.cause]));
    expect(buildSessionConfig(back).extra).toEqual(cfg.extra);
    // le module de foule lit la même chose
    const specs = readManifSpecs(cfg).specs;
    expect(specs.map((s) => s.place)).toEqual(list.map((m) => m.place));
    expect(readManifSpecs({ extra: { manifestations: 3 } } as unknown as SessionConfig).auto).toBe(2);
    // revenir à une seule manifestation
    expect(withManifCount(full, 1)).toEqual([]);
    // moyens : l'effectif total compte ; une compagnie par manifestation supplémentaire
    expect(totalCrowd(full)).toBe(1000 + list.reduce((a, m) => a + m.crowdSize, 0));
    const alone = recommendedMeans(d);
    const many = recommendedMeans(full);
    expect(many.sections).toBe(alone.sections);
    expect(many.bravm).toBeGreaterThanOrEqual(alone.bravm);
    expect(many.drone).toBeGreaterThan(alone.drone);
    expect(many.bravm + many.pompiers + many.samu).toBeGreaterThan(alone.bravm + alone.pompiers + alone.samu);
    expect(forceRatio(full).agents).toBeGreaterThan(forceRatio(d).agents);
    expect(summarize(full)).toMatch(/En même temps/);
    // en mission ou en patrouille libre : pas de manifestation supplémentaire
    expect((buildSessionConfig({ ...full, missionId: 'crs-01' }).extra as Record<string, unknown>)['manifestations']).toBeUndefined();
    expect((buildSessionConfig({ ...full, mode: 'monde_ouvert' }).extra as Record<string, unknown>)['manifestations']).toBeUndefined();
  });
});

describe('manifestations simultanées — simulation', () => {
  it('trois manifestations en même temps, une compagnie par manifestation, police et droit sur la deuxième', async () => {
    const t = createTestContext({ seed: 11, strict: false, modules: SIM });
    const { ctx } = t;
    const events: ManifEvent[] = [];
    ctx.events.onAny(MANIF_EVENT, (e) => events.push({ ...(e as ManifEvent) }));
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: MAIN.x, z: MAIN.z, crowdSize: 150,
      tension: 0.15, volatility: 0.2, duration: 'courte',
      extra: {
        moyens: MEANS, variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'law.delayScale': 0.25,
        manifestations: [
          { place: 'Place de la Bastille', crowdSize: 220, cause: 'climat' },
          { place: 'Place du Trocadéro', crowdSize: 160, cause: 'logement' },
        ],
      },
    } as Partial<SessionConfig>);
    const api = ctx.require<ManifsApi>(CROWD_MANIFS);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    t.step(2);
    expect(api.list.length).toBe(2);
    const [m2, m3] = [api.list[0]!, api.list[1]!];
    // des lieux distants, chacun son parcours déclaré vers une autre place
    const starts = [MAIN, { x: m2.x, z: m2.z }, { x: m3.x, z: m3.z }];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(starts[i]!.x - starts[j]!.x, starts[i]!.z - starts[j]!.z)).toBeGreaterThan(1200);
    for (const m of [m2, m3]) {
      console.log(`[manifs] ${m.label} : ${m.planned} personnes simulées (${m.declared} annoncées), parcours ${(m.route.length / 2) | 0} points, phase ${m.phase}`);
      expect(m.route.length).toBeGreaterThanOrEqual(8);
      expect(m.from).not.toBe(m.to);
      expect(m.phase).toBe('rassemblement');
      expect(m.people).toBeGreaterThan(m.planned * 0.3);
    }
    expect(m2.cause).toBe('climat');
    expect(m3.cause).toBe('logement');
    // annoncées par CENTRAL
    const central = (): string[] => ctx.radio.log.filter((m) => m.from === 'CENTRAL').map((m) => m.text);
    expect(events.filter((e) => e.state === 'annonce').length).toBe(2);

    // une compagnie par manifestation supplémentaire, près d'elle, commandée par l'IA, toutes sur la carte tactique
    const command = ctx.require<CommandApi>(POLICE_COMMAND_SERVICE);
    const companies = ctx.squads.list.filter((s) => s.kind === 'compagnie' && s.faction === 'police');
    expect(companies.length).toBe(3);
    for (const m of [m2, m3]) {
      expect(m.companyId).not.toBe(0);
      const sq = ctx.squads.get(m.companyId)!;
      const lead = ctx.people.get(sq.leaderId)!;
      console.log(`[manifs] ${sq.name} engagée sur « ${m.causeLabel} » : chef à ${Math.hypot(lead.x - m.x, lead.z - m.z).toFixed(0)} m du rassemblement`);
      expect(Math.hypot(lead.x - m.x, lead.z - m.z)).toBeLessThan(500);
      expect(command.stateOf(m.companyId)).not.toBeNull();
      expect(command.stateOf(m.companyId)!.mode).toBe('ia');
    }
    const units = new UnitModel().refresh(ctx, visibilityFor('commandant'));
    for (const c of companies) expect(units.some((u) => u.squadId === c.id), c.name).toBe(true);
    const scope = computeScope(ctx);
    for (const c of companies) expect(scope.squadIds.has(c.id)).toBe(true);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    expect(scene.manifs.length).toBe(2);
    expect(scene.manifs.every((m) => m.route.length >= 8 && m.company !== '')).toBe(true);

    // elles vivent en même temps : départ, cortège
    const seen = new Map<number, Set<string>>([[m2.id, new Set()], [m3.id, new Set()]]);
    const note = (): void => { for (const m of [m2, m3]) seen.get(m.id)!.add(m.phase); };
    let both = false;
    for (let k = 0; k < 40 && !both; k++) {
      t.step(5);
      note();
      both = m2.phase === 'cortege' && m3.phase === 'cortege';
    }
    expect(both).toBe(true);
    t.step(40);
    const h2 = m2.headS, h3 = m3.headS;
    t.step(30);
    console.log(`[manifs] têtes : ${h2.toFixed(0)} → ${m2.headS.toFixed(0)} m, ${h3.toFixed(0)} → ${m3.headS.toFixed(0)} m ; principale : ${ctx.director.phase}`);
    expect(m2.headS).toBeGreaterThan(h2 + 5);
    expect(m3.headS).toBeGreaterThan(h3 + 5);
    expect(central().some((x) => /s’élance/.test(x))).toBe(true);
    expect(central().filter((x) => /manifestation déclarée/.test(x)).length).toBe(2);

    // de vrais manifestants, pilotés par le module, rattachés à leur manifestation
    const of2 = (): Person[] => core.members.filter((p) => api.manifOf(p.id) === m2 && p.custody === 'free');
    const before = of2();
    expect(before.length).toBeGreaterThan(m2.planned * 0.8);
    for (const p of before) {
      expect(p.faction).toBe('protest');
      expect(core.brain(p)!.flags & CROWD_FLAG.UNCOUNTED).toBeTruthy();
    }
    expect(new Set(before.map((p) => p.profile)).size).toBeGreaterThan(1);

    // sommations sur la deuxième manifestation : l'autorité habilitée, au bord du cortège, à hauteur de la tête
    const near = (p: Person): boolean => Math.hypot(p.x - m2.headX, p.z - m2.headZ) < 60;
    const heard = before.filter(near);
    const chief = ctx.people.spawn({ kind: 'commissaire', faction: 'police', x: m2.headX + 6, z: m2.headZ + 6, rank: 'commissaire', poste: 'autorite_civile', look: { sash: true } });
    ctx.actions.give(chief, 'megaphone');
    for (let stage = 1; stage <= 3; stage++) {
      expect(ctx.law.sommation(chief)).toBe(stage);
      t.step(13);
    }
    const leaving = heard.filter((p) => {
      const b = core.brain(p);
      return !ctx.people.get(p.id) || !b || b.index < 0 || (b.flags & CROWD_FLAG.LEAVING) !== 0;
    });
    console.log(`[manifs] sommations : ${leaving.length}/${heard.length} des manifestants à portée s'en vont`);
    expect(heard.length).toBeGreaterThan(20);
    expect(leaving.length).toBeGreaterThan(heard.length * 0.3);
    // la troisième n'a rien entendu
    const of3 = core.members.filter((p) => api.manifOf(p.id) === m3);
    expect(of3.filter((p) => (core.brain(p)!.flags & CROWD_FLAG.LEAVING) !== 0).length).toBeLessThan(of3.length * 0.1);

    // nasse sur la troisième : une section de SA compagnie l'encercle
    const sections = ctx.squads.list.filter((s) => s.parentId === m3.companyId && s.kind === 'section');
    expect(sections.length).toBeGreaterThan(0);
    const me = ctx.player.person()!;
    const kx = m3.headX, kz = m3.headZ;
    ctx.squads.issue(sections[0]!.id, { type: 'encercler', x: kx, z: kz, width: 70, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
    t.step(8);
    const inside = core.members.filter((p) => api.manifOf(p.id) === m3 && Math.hypot(p.x - kx, p.z - kz) < 30);
    const stranded = inside.filter((p) => core.brain(p)!.state === CROWD_STATE.STRANDED);
    console.log(`[manifs] nasse : ${stranded.length}/${inside.length} se savent encerclés ; encerclée : ${m3.kettled}`);
    expect(m3.kettled).toBe(true);
    expect(stranded.length).toBeGreaterThan(inside.length * 0.4);

    // fin du déroulé : dispersion annoncée, fin de chaque manifestation
    for (let k = 0; k < 80 && !(m2.phase === 'terminee' && m3.phase === 'terminee'); k++) {
      t.step(10);
      note();
    }
    console.log('[manifs] phases vues :', [...seen.entries()].map(([id, s]) => id + ': ' + [...s].join(' → ')).join(' | '));
    console.log('[manifs] CENTRAL :', central().filter((x) => /manifestation|cortège/.test(x)).join(' | '));
    for (const s of seen.values()) for (const ph of ['depart', 'cortege']) expect(s.has(ph)).toBe(true);
    // la deuxième s'est vidée après les sommations (fin sans annonce des organisateurs) ; la troisième a suivi son horaire
    expect(m2.phase).toBe('terminee');
    expect(seen.get(m3.id)!.has('dispersion')).toBe(true);
    expect(central().some((x) => /annoncent la dispersion/.test(x))).toBe(true);
    expect(events.some((e) => e.state === 'fin')).toBe(true);
  }, 900000);
});
