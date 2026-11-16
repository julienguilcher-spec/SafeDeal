import { describe, expect, it } from 'vitest';
import type { CrowdPhase, DirectorApi, GameContext, Squad } from '@/core/contracts';
import type { RoadClosure, TrafficControlApi } from '@/core/extensions';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { RadioControl, RadioPhrases } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from '@/gameplay/radio';
import type { WorldFacts } from '@/gameplay/radio/ambient';
import {
  AMBIENT_BY_PHASE, AMBIENT_MAX, AMBIENT_MIN, CALM_MAX, ambientTopics, estimateCount, topicAllowed, windWords,
} from '@/gameplay/radio/ambient';
import { ALL_PHRASES } from '@/gameplay/radio/phrase-lib';
import { typo } from '@/gameplay/radio/text';

const PHASES: readonly CrowdPhase[] = [
  'aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion', 'apres_manif', 'terminee',
];

interface FakeDirector extends DirectorApi {
  phase: CrowdPhase;
  tension: number;
  /** Point chaud : la tension locale y vaut 1, ailleurs la tension globale. */
  hot: { x: number; z: number } | null;
}

async function boot(seed: number, phase: CrowdPhase = 'cortege', tension = 0.3): Promise<{
  ctx: GameContext; control: RadioControl; director: FakeDirector; step: (s: number) => void;
}> {
  const t = createTestContext({ seed, modules: [createSystems] });
  const director: FakeDirector = {
    phase,
    tension,
    hot: null,
    tensionAt(x: number, z: number): number {
      return this.hot && Math.hypot(x - this.hot.x, z - this.hot.z) < 50 ? 1 : this.tension;
    },
    addTension: () => {},
    stats: { total: 4000, present: 3210, dispersed: 0, radicals: 40, injured: 0, arrested: 0 },
    route: [],
    headProgress: 0,
  };
  t.ctx.director = director;
  await t.start({ seed });
  return { ctx: t.ctx, control: t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE), director, step: (s) => t.step(s) };
}

/** Section de police de `n` agents autour d'un point. */
function section(ctx: GameContext, name: string, x: number, z: number, n = 6): Squad {
  const sq = ctx.squads.create('section', 'police', name);
  for (let i = 0; i < n; i++) ctx.people.spawn({ kind: 'crs', x: x + i, z, squadId: sq.id });
  return sq;
}

/** Thème d'ambiance d'un message, retrouvé par les mots fixes de ses variantes (« ? » si aucun ne correspond). */
function themeOf(text: string): string {
  for (const def of ALL_PHRASES) {
    if (!def.key.startsWith('ambiance_')) continue;
    for (const v of def.variants) {
      const pieces = v.split(/\{[a-z_]+\}/).map((s) => typo(s).replace(/^[\s,.:;]+|[\s,.:;]+$/gu, '')).filter((s) => s.length > 6);
      if (pieces.length > 0 && pieces.every((p) => text.includes(p))) return def.key;
    }
  }
  return '?';
}

const NOTHING: WorldFacts = { squads: 0, crowd: 0, fire: null, rescue: null, press: false, closure: null };

describe('radio — ambiance', () => {
  it('tous les thèmes existent dans la bibliothèque, à faible priorité, sans réponse attendue ; aucun thème orphelin', async () => {
    const { ctx } = await boot(1);
    const phrases = ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
    const used = new Set<string>();
    for (const phase of PHASES) {
      expect(AMBIENT_BY_PHASE[phase].length).toBeGreaterThan(1);
      for (const t of AMBIENT_BY_PHASE[phase]) {
        used.add(t.key);
        expect(phrases.has(t.key), t.key).toBe(true);
        expect(phrases.info(t.key)!.priority).toBe(0);
        expect(phrases.info(t.key)!.end).toBe('termine');
        expect(phrases.info(t.key)!.variants).toBe(5);
        expect(t.weight).toBeGreaterThan(0);
      }
    }
    for (const key of phrases.keys) if (key.startsWith('ambiance_')) expect(used.has(key), `thème jamais employé : ${key}`).toBe(true);
    // en dehors de l'ambiance, aucune situation n'est en priorité 0
    for (const key of phrases.keys) if (!key.startsWith('ambiance_')) expect(phrases.info(key)!.priority, key).toBeGreaterThanOrEqual(1);
  });

  it('cohérence avec la phase : pas de combat pendant le rassemblement, pas de calme plat pendant l\'affrontement', () => {
    const interdits: Record<string, readonly string[]> = {
      rassemblement: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_dispersion', 'ambiance_cortege', 'ambiance_foyers', 'ambiance_groupes_mobiles'],
      cortege: ['ambiance_affrontement', 'ambiance_dispersion', 'ambiance_rassemblement'],
      affrontement: ['ambiance_ras', 'ambiance_rassemblement', 'ambiance_apres', 'ambiance_cortege', 'ambiance_slogans'],
      dispersion: ['ambiance_affrontement', 'ambiance_rassemblement', 'ambiance_tension', 'ambiance_cortege'],
      apres_manif: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_rassemblement', 'ambiance_cortege'],
      terminee: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_cortege', 'ambiance_rassemblement'],
    };
    for (const phase of Object.keys(interdits)) {
      for (const tension of [0.05, 0.3, 0.5, 0.9]) {
        const keys = ambientTopics(phase as CrowdPhase, tension).map((t) => t.key);
        for (const k of interdits[phase]!) expect(keys, `${phase} (${tension}) ne doit pas parler de ${k}`).not.toContain(k);
      }
    }
    // tension faible : on n'annonce pas de tension ; tension forte : ni « rien à signaler » ni ambiance bon enfant
    expect(ambientTopics('tension', 0.05).map((t) => t.key)).not.toContain('ambiance_tension');
    expect(ambientTopics('tension', 0.05).map((t) => t.key)).not.toContain('ambiance_vigilance');
    for (const phase of PHASES) {
      const chaud = ambientTopics(phase, CALM_MAX + 0.1).map((t) => t.key);
      for (const k of ['ambiance_ras', 'ambiance_slogans', 'ambiance_apres']) expect(chaud, `${phase} : ${k}`).not.toContain(k);
    }
  });

  it('après la manifestation : le temps des petits groupes mobiles, pas un retour au calme (bible F.2)', () => {
    const tendu = ambientTopics('apres_manif', 0.5);
    expect(tendu[0]!.key).toBe('ambiance_groupes_mobiles');
    expect(tendu.map((t) => t.key)).not.toContain('ambiance_apres');
    expect(tendu.map((t) => t.key)).not.toContain('ambiance_ras');
    const calme = ambientTopics('apres_manif', 0.05).map((t) => t.key);
    expect(calme).toContain('ambiance_apres');
    expect(calme).not.toContain('ambiance_groupes_mobiles');
  });

  it('un thème n\'est retenu que si le monde le confirme', () => {
    // rien dans le monde : ni feu, ni secours, ni presse, ni rue coupée, ni foule, ni unité
    for (const k of ['ambiance_foyers', 'ambiance_secours_veille', 'ambiance_presse', 'ambiance_circulation', 'ambiance_effectif',
      'ambiance_logistique', 'ambiance_cortege', 'ambiance_slogans', 'ambiance_tension', 'ambiance_affrontement', 'ambiance_dispersion',
      'ambiance_rassemblement', 'ambiance_vigilance', 'ambiance_groupes_mobiles']) {
      expect(topicAllowed(k, NOTHING), k).toBe(false);
    }
    for (const k of ['ambiance_heure', 'ambiance_meteo', 'ambiance_ras', 'ambiance_apres']) expect(topicAllowed(k, NOTHING), k).toBe(true);
    const at = { x: 1, z: 2 };
    expect(topicAllowed('ambiance_foyers', { ...NOTHING, fire: at })).toBe(true);
    expect(topicAllowed('ambiance_secours_veille', { ...NOTHING, rescue: at })).toBe(true);
    expect(topicAllowed('ambiance_presse', { ...NOTHING, press: true })).toBe(true);
    expect(topicAllowed('ambiance_circulation', { ...NOTHING, closure: at })).toBe(true);
    expect(topicAllowed('ambiance_effectif', { ...NOTHING, squads: 1 })).toBe(true);
    expect(topicAllowed('ambiance_cortege', { ...NOTHING, crowd: 300 })).toBe(true);
    // un feu ne suffit pas à parler de la presse
    expect(topicAllowed('ambiance_presse', { ...NOTHING, fire: at })).toBe(false);
  });

  it('la radio n\'est jamais muette : un message de faible priorité toutes les 20 à 40 secondes', async () => {
    const { ctx, step } = await boot(21, 'cortege', 0.3);
    const instants: number[] = [];
    ctx.events.on('radio:message', (e) => instants.push(e.t));
    step(600);
    expect(instants.length).toBeGreaterThanOrEqual(600 / (AMBIENT_MAX + 4));
    expect(instants.length).toBeLessThanOrEqual(600 / AMBIENT_MIN + 2);
    for (let i = 1; i < instants.length; i++) {
      const gap = instants[i]! - instants[i - 1]!;
      expect(gap, `écart ${i}`).toBeGreaterThanOrEqual(AMBIENT_MIN - 0.5);
      expect(gap, `écart ${i}`).toBeLessThanOrEqual(AMBIENT_MAX + 4);
    }
    for (const m of ctx.radio.log) expect(m.priority).toBe(0);
    // premier message rapidement, sans attendre un intervalle entier
    expect(instants[0]!).toBeLessThan(20);
  });

  it('même sans rien à dire du monde, il reste l\'heure et la météo', async () => {
    const { ctx, director, step } = await boot(4, 'affrontement', 0.9);
    director.stats.present = 0; // ni foule, ni unité, ni feu
    ctx.env.setWeather('pluie', true);
    ctx.env.setWind(4, 0); // le vent souffle vers l'est : il vient de l'ouest
    step(400);
    const themes = ctx.radio.log.map((m) => themeOf(m.text));
    expect(themes.length).toBeGreaterThan(8);
    for (const k of themes) expect(['ambiance_heure', 'ambiance_meteo']).toContain(k);
    expect(ctx.radio.log.some((m) => m.text.includes(typo('pluie, vent d\'ouest')))).toBe(true);
  });

  it('reflète l\'état du monde : phase, unité réelle, secteur, effectif apte', async () => {
    const { ctx, director, step } = await boot(8, 'affrontement', 0.9);
    const sq = section(ctx, 'S', 0, 0, 6);
    step(900);
    const themes = ctx.radio.log.map((m) => themeOf(m.text));
    expect(themes.length).toBeGreaterThan(20);
    expect(themes).not.toContain('?'); // chaque message est identifié à un thème
    // rien de ce que le monde ne confirme : pas de feu, pas de secours, pas de presse, pas de rue coupée
    const dits = new Set(themes);
    expect([...dits].sort()).toEqual(['ambiance_affrontement', 'ambiance_effectif', 'ambiance_heure', 'ambiance_logistique', 'ambiance_tension']);
    expect(themes.filter((k) => k === 'ambiance_affrontement').length).toBeGreaterThanOrEqual(themes.length / 3);
    // les émetteurs sont l'unité réelle (ou la salle pour l'heure) ; la section rend compte à son commandant
    const from = new Set(ctx.radio.log.map((m) => m.from));
    expect([...from].sort()).toEqual(['CENTRAL', 'MISTRAL 1']);
    for (const m of ctx.radio.log) {
      if (m.from === 'MISTRAL 1') {
        expect(m.text.startsWith('MISTRAL ICI MISTRAL UN. ')).toBe(true);
        expect(m.channel).toBe('unite');
        expect(m.text).toContain('secteur actuel'); // monde neutre : secteur sans nom
      } else {
        expect(m.text.startsWith('TOUTES UNITÉS ICI CENTRAL. ')).toBe(true);
        expect(m.channel).toBe('commandement');
      }
      expect(m.text.endsWith(' TERMINÉ.')).toBe(true);
    }
    // l'effectif annoncé est celui des agents encore aptes
    const effectif = ctx.radio.log.filter((m) => themeOf(m.text) === 'ambiance_effectif');
    expect(effectif.length).toBeGreaterThan(0);
    for (const m of effectif) expect(m.text).toContain(typo('Nombre d\'agents aptes : SIX.'));
    const blesse = ctx.people.get(sq.members[0]!)!;
    blesse.posture = 'down';
    const avantBlessure = ctx.radio.log.length;
    step(900);
    const apresBlessure = ctx.radio.log.slice(avantBlessure).filter((m) => themeOf(m.text) === 'ambiance_effectif');
    expect(apresBlessure.length).toBeGreaterThan(0);
    for (const m of apresBlessure) expect(m.text).toContain(typo('Nombre d\'agents aptes : CINQ.'));

    // la phase change : l'ambiance suit
    director.phase = 'terminee';
    director.tension = 0.05;
    const avant = ctx.radio.log.length;
    step(300);
    const apres = ctx.radio.log.slice(avant).map((m) => themeOf(m.text));
    expect(apres.length).toBeGreaterThan(5);
    const ok = new Set(AMBIENT_BY_PHASE.terminee.map((t) => t.key));
    for (const k of apres) expect(ok.has(k), k).toBe(true);
    expect(apres).not.toContain('ambiance_affrontement');
  });

  it('feu, secours, presse et rue coupée ne sont annoncés que s\'ils existent, avec le secteur du fait rapporté', async () => {
    const { ctx, director, step } = await boot(12, 'tension', 0.5);
    ctx.world.sectorName = (x: number): string => (x > 500 ? 'rue du Temple' : x < -500 ? 'boulevard Voltaire' : 'place de la République');
    section(ctx, 'S', 0, 0, 6);
    step(900);
    const avant = new Set(ctx.radio.log.map((m) => themeOf(m.text)));
    for (const k of ['ambiance_foyers', 'ambiance_secours_veille', 'ambiance_presse', 'ambiance_circulation']) expect(avant.has(k), k).toBe(false);

    // une poubelle brûle rue du Temple, des pompiers attendent boulevard Voltaire, la presse est sur la place
    const poubelle = ctx.props.spawn('poubelle', 800, 0, 0);
    poubelle.burning = 1;
    ctx.people.spawn({ kind: 'pompier', faction: 'rescue', x: -800, z: 0 });
    ctx.people.spawn({ kind: 'journaliste', faction: 'press', x: 5, z: 5 });
    const debut = ctx.radio.log.length;
    step(1800);
    const suite = ctx.radio.log.slice(debut);
    const feux = suite.filter((m) => themeOf(m.text) === 'ambiance_foyers');
    const secours = suite.filter((m) => themeOf(m.text) === 'ambiance_secours_veille');
    const presse = suite.filter((m) => themeOf(m.text) === 'ambiance_presse');
    expect(feux.length).toBeGreaterThan(0);
    expect(secours.length).toBeGreaterThan(0);
    expect(presse.length).toBeGreaterThan(0);
    for (const m of feux) expect(m.text).toContain('secteur rue du Temple');
    for (const m of secours) expect(m.text).toContain('secteur boulevard Voltaire');
    for (const m of presse) expect(m.text).toContain('secteur place de la République');

    // le feu est éteint : on n'en parle plus
    poubelle.burning = 0;
    const fin = ctx.radio.log.length;
    step(900);
    expect(ctx.radio.log.slice(fin).some((m) => themeOf(m.text) === 'ambiance_foyers')).toBe(false);

    // une rue est coupée : les déviations entrent dans l'ambiance du cortège
    director.phase = 'cortege';
    director.tension = 0.3;
    const closure: RoadClosure = { id: 1, edgeId: 7, x: 900, z: 0, heading: 0, squadId: 0, createdAt: 0 };
    const traffic: TrafficControlApi = {
      closures: [closure],
      isClosed: (edgeId) => edgeId === 7,
      closeRoad: () => null,
      closeArea: () => [],
      open: () => {},
      openAll: () => {},
      countNear: () => ({ moving: 0, stopped: 0 }),
    };
    ctx.provide(EXT.traffic, traffic);
    const coupe = ctx.radio.log.length;
    step(1800);
    const circulation = ctx.radio.log.slice(coupe).filter((m) => themeOf(m.text) === 'ambiance_circulation');
    expect(circulation.length).toBeGreaterThan(0);
    for (const m of circulation) expect(m.text).toContain('secteur rue du Temple');
  });

  it('les affrontements sont annoncés par l\'unité la plus exposée, pas par une section au repos', async () => {
    const { ctx, director, step } = await boot(5, 'affrontement', 0.8);
    section(ctx, 'A', 0, 0);
    section(ctx, 'B', 400, 0);
    section(ctx, 'C', -400, 0);
    director.hot = { x: 400, z: 0 }; // la tension locale est maximale autour de la deuxième section
    step(900);
    const heurts = ctx.radio.log.filter((m) => ['ambiance_affrontement', 'ambiance_tension'].includes(themeOf(m.text)));
    expect(heurts.length).toBeGreaterThan(8);
    for (const m of heurts) expect(m.from).toBe('MISTRAL 2');
    // les autres thèmes viennent de toutes les unités
    const autres = new Set(ctx.radio.log.filter((m) => themeOf(m.text) === 'ambiance_effectif' || themeOf(m.text) === 'ambiance_logistique').map((m) => m.from));
    expect(autres.size).toBeGreaterThanOrEqual(2);
  });

  it('dit le volume de la foule arrondi à l\'estime, pas au chiffre près', async () => {
    expect(estimateCount(7)).toBe(7);
    expect(estimateCount(43)).toBe(45);
    expect(estimateCount(437)).toBe(450);
    expect(estimateCount(3210)).toBe(3000);
    expect(estimateCount(3300)).toBe(3500);
    const { ctx, step } = await boot(3, 'cortege', 0.2);
    step(600);
    const volumes = ctx.radio.log.filter((m) => themeOf(m.text) === 'ambiance_cortege');
    expect(volumes.length).toBeGreaterThan(3);
    for (const m of volumes) expect(m.text).toContain(typo('Volume : TROIS MILLE'));
  });

  it('dit le vent d\'après la direction d\'où il vient', () => {
    expect(windWords(0, 0)).toBe('vent faible');
    expect(windWords(0.3, -0.4)).toBe('vent faible');
    expect(windWords(0, 5)).toBe('vent de nord'); // il souffle vers le sud (+z)
    expect(windWords(0, -5)).toBe('vent de sud');
    expect(windWords(5, 0)).toBe('vent d\'ouest');
    expect(windWords(-5, 0)).toBe('vent d\'est');
    expect(windWords(-4, 4)).toBe('vent de nord-est');
  });

  it('ne se répète pas : beaucoup de messages distincts sur une longue durée', async () => {
    const { ctx, step } = await boot(33, 'tension', 0.5);
    ctx.world.sectorName = (x: number): string => (x > 250 ? 'rue Royale' : x > 50 ? 'rue de Rivoli' : x < -50 ? 'quai des Tuileries' : 'place de la Concorde');
    section(ctx, 'A', 0, 0);
    section(ctx, 'B', 100, 0);
    section(ctx, 'C', 300, 0);
    section(ctx, 'D', -100, 0);
    step(1800);
    const textes = ctx.radio.log.map((m) => m.text);
    expect(textes.length).toBeGreaterThan(40);
    const distincts = new Set(textes);
    expect(distincts.size / textes.length).toBeGreaterThan(0.8);
    for (let i = 1; i < textes.length; i++) expect(textes[i]).not.toBe(textes[i - 1]);
    // et le même thème ne monopolise pas l'antenne
    const themes = textes.map(themeOf);
    let suite = 1;
    for (let i = 1; i < themes.length; i++) {
      suite = themes[i] === themes[i - 1] ? suite + 1 : 1;
      expect(suite, `thème ${themes[i]} répété`).toBeLessThanOrEqual(3);
    }
  });

  it('désactivable, puis réactivable', async () => {
    const { ctx, control, step } = await boot(2);
    control.ambient = false;
    step(300);
    expect(ctx.radio.log).toHaveLength(0);
    control.ambient = true;
    step(120);
    expect(ctx.radio.log.length).toBeGreaterThan(0);
  });

  it('la mission peut l\'interdire (extra.radioAmbiance = false)', async () => {
    const t = createTestContext({ seed: 3, modules: [createSystems] });
    await t.start({ extra: { radioAmbiance: false } });
    t.step(200);
    expect(t.ctx.radio.log).toHaveLength(0);
    expect(t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).ambient).toBe(false);
  });

  it('cède la place au trafic opérationnel : pas d\'ambiance tant que des messages attendent', async () => {
    const { ctx, step } = await boot(9, 'cortege', 0.3);
    const phrases = ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
    step(5);
    // une rafale de comptes rendus urgents occupe le canal de commandement pendant plus d'une minute
    for (let i = 0; i < 10; i++) phrases.say('agent_a_terre', { unite: `MISTRAL ${i + 1}`, lieu: `rue ${i}` }, { variant: 0 });
    step(60);
    for (const m of ctx.radio.log) expect(m.priority, m.text).toBe(2);
    step(120);
    expect(ctx.radio.log.filter((m) => m.priority === 2)).toHaveLength(10);
    expect(ctx.radio.log.some((m) => m.priority === 0)).toBe(true); // puis l'ambiance reprend
  });

  it('déterminisme : même graine, même ambiance ; autre graine, autre ambiance', async () => {
    async function run(seed: number): Promise<string[]> {
      const { ctx, step } = await boot(seed, 'cortege', 0.4);
      section(ctx, 'S', 0, 0, 4);
      step(500);
      return ctx.radio.log.map((m) => `${m.t.toFixed(3)}|${m.from}|${m.text}`);
    }
    const a = await run(77);
    const b = await run(77);
    const c = await run(78);
    expect(a.length).toBeGreaterThan(10);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
});

describe('radio — déterminisme des phrases', () => {
  it('même graine : mêmes variantes tirées, dans le même ordre', async () => {
    async function run(seed: number): Promise<string[]> {
      const t = createTestContext({ seed, modules: [createSystems] });
      await t.start({ seed });
      t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).ambient = false;
      const phrases = t.ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
      for (let i = 0; i < 20; i++) {
        phrases.say('jets_projectiles', { lieu: `rue ${i}` }, { channel: 'public' });
        phrases.say('foule_calme', { nombre: 100 * i }, { channel: 'presse' });
        t.step(30);
      }
      return t.ctx.radio.log.map((m) => m.text);
    }
    const a = await run(5);
    expect(await run(5)).toEqual(a);
    expect(await run(6)).not.toEqual(a);
  });
});
