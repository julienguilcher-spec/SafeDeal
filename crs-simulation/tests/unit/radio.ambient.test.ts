import { describe, expect, it } from 'vitest';
import type { CrowdPhase, DirectorApi, GameContext } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { RadioControl, RadioPhrases } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from '@/gameplay/radio';
import { AMBIENT_BY_PHASE, AMBIENT_MAX, AMBIENT_MIN, ambientTopics, estimateCount } from '@/gameplay/radio/ambient';

const PHASES: readonly CrowdPhase[] = [
  'aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion', 'apres_manif', 'terminee',
];

interface FakeDirector extends DirectorApi {
  phase: CrowdPhase;
  tension: number;
}

async function boot(seed: number, phase: CrowdPhase = 'cortege', tension = 0.3): Promise<{
  ctx: GameContext; control: RadioControl; director: FakeDirector; step: (s: number) => void;
}> {
  const t = createTestContext({ seed, modules: [createSystems] });
  const director: FakeDirector = {
    phase,
    tension,
    tensionAt: () => tension,
    addTension: () => {},
    stats: { total: 4000, present: 3210, dispersed: 0, radicals: 40, injured: 0, arrested: 0 },
    route: [],
    headProgress: 0,
  };
  t.ctx.director = director;
  await t.start({ seed });
  return { ctx: t.ctx, control: t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE), director, step: (s) => t.step(s) };
}

function ambientKeyOf(ctx: GameContext, phrases: RadioPhrases): string[] {
  // retrouve la situation d'après le texte : chaque variante est unique à sa clé
  const out: string[] = [];
  for (const m of ctx.radio.log) {
    const key = phrases.keys.find((k) => phrases.variants(k, {}).length > 0 && k.startsWith('ambiance_')
      && matches(ctx, phrases, k, m.text));
    out.push(key ?? '?');
  }
  return out;
}

function matches(_ctx: GameContext, phrases: RadioPhrases, key: string, text: string): boolean {
  const gabarits = phrases.variants(key, { lieu: '@', nombre: '#', unite: '§', heure: '%', meteo: '&' });
  // on compare les mots fixes de la variante (les valeurs variables sont remplacées par des marqueurs)
  return gabarits.some((g) => {
    const morceaux = g.split(/[@#§%&]/).map((s) => s.replace(/^ICI/, '')).filter((s) => s.trim().length > 8);
    return morceaux.length > 0 && morceaux.every((m) => text.includes(m.trim()));
  });
}

describe('radio — ambiance', () => {
  it('tous les thèmes de toutes les phases existent dans la bibliothèque, à faible priorité', async () => {
    const { ctx } = await boot(1);
    const phrases = ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
    for (const phase of PHASES) {
      expect(AMBIENT_BY_PHASE[phase].length).toBeGreaterThan(1);
      for (const t of AMBIENT_BY_PHASE[phase]) {
        expect(phrases.has(t.key), t.key).toBe(true);
        expect(phrases.info(t.key)!.priority).toBe(0);
        expect(t.weight).toBeGreaterThan(0);
      }
    }
  });

  it('cohérence avec la phase : pas de combat pendant le rassemblement, pas de calme plat pendant l\'affrontement', () => {
    const interdits: Record<string, readonly string[]> = {
      rassemblement: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_dispersion', 'ambiance_cortege'],
      cortege: ['ambiance_affrontement', 'ambiance_dispersion', 'ambiance_rassemblement'],
      affrontement: ['ambiance_ras', 'ambiance_rassemblement', 'ambiance_apres', 'ambiance_cortege'],
      dispersion: ['ambiance_affrontement', 'ambiance_rassemblement', 'ambiance_tension', 'ambiance_cortege'],
      apres_manif: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_rassemblement', 'ambiance_cortege'],
      terminee: ['ambiance_affrontement', 'ambiance_tension', 'ambiance_cortege', 'ambiance_rassemblement'],
    };
    for (const phase of Object.keys(interdits)) {
      const keys = ambientTopics(phase as CrowdPhase, 0.5).map((t) => t.key);
      for (const k of interdits[phase]!) expect(keys, `${phase} ne doit pas parler de ${k}`).not.toContain(k);
    }
    // tension faible : on n'annonce pas de tension ; tension forte : pas de « rien à signaler »
    expect(ambientTopics('tension', 0.05).map((t) => t.key)).not.toContain('ambiance_tension');
    expect(ambientTopics('tension', 0.05).map((t) => t.key)).not.toContain('ambiance_vigilance');
    expect(ambientTopics('apres_manif', 0.9).map((t) => t.key)).not.toContain('ambiance_ras');
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

  it('reflète l\'état du monde : phase, nombre de manifestants, secteur et effectif de l\'unité, heure', async () => {
    const { ctx, director, step } = await boot(8, 'affrontement', 0.9);
    const sq = ctx.squads.create('section', 'police', 'S');
    for (let i = 0; i < 6; i++) ctx.people.spawn({ kind: 'crs', x: 5 * i, z: 0, squadId: sq.id });
    step(400);
    const phrases = ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
    const keys = ambientKeyOf(ctx, phrases);
    expect(keys.length).toBeGreaterThan(8);
    const autorises = new Set(AMBIENT_BY_PHASE.affrontement.map((t) => t.key));
    for (const k of keys) expect(autorises.has(k), k).toBe(true);
    expect(keys.filter((k) => k === 'ambiance_affrontement').length).toBeGreaterThanOrEqual(2);
    expect(keys).not.toContain('?'); // chaque message est identifié à un thème de la phase
    // les émetteurs sont l'unité réelle (ou la salle pour l'heure)
    const from = new Set(ctx.radio.log.map((m) => m.from));
    for (const f of from) expect(['MISTRAL 1', 'CENTRAL']).toContain(f);
    expect(from.has('MISTRAL 1')).toBe(true);
    // le secteur vient du monde, l'effectif de l'unité
    expect(ctx.radio.log.some((m) => /secteur inconnu/.test(m.text))).toBe(true);
    expect(ctx.radio.log.some((m) => m.text.includes('SIX'))).toBe(true);

    // la phase change : l'ambiance suit
    director.phase = 'apres_manif';
    director.tension = 0.1;
    const avant = ctx.radio.log.length;
    step(300);
    const apres = ctx.radio.log.slice(avant);
    expect(apres.length).toBeGreaterThan(5);
    const kApres = ambientKeyOf({ ...ctx, radio: { ...ctx.radio, log: apres } } as unknown as GameContext, phrases);
    const ok = new Set(AMBIENT_BY_PHASE.apres_manif.map((t) => t.key));
    for (const k of kApres) expect(ok.has(k), k).toBe(true);
  });

  it('dit le volume de la foule arrondi à l\'estime, pas au chiffre près', () => {
    expect(estimateCount(7)).toBe(7);
    expect(estimateCount(43)).toBe(45);
    expect(estimateCount(437)).toBe(450);
    expect(estimateCount(3210)).toBe(3000);
    expect(estimateCount(3300)).toBe(3500);
  });

  it('ne se répète pas : beaucoup de messages distincts sur une longue durée', async () => {
    const { ctx, step } = await boot(33, 'tension', 0.5);
    step(1800);
    const textes = ctx.radio.log.map((m) => m.text);
    expect(textes.length).toBeGreaterThan(40);
    const distincts = new Set(textes);
    expect(distincts.size / textes.length).toBeGreaterThan(0.55);
    for (let i = 1; i < textes.length; i++) expect(textes[i]).not.toBe(textes[i - 1]);
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

  it('déterminisme : même graine, même ambiance ; autre graine, autre ambiance', async () => {
    async function run(seed: number): Promise<string[]> {
      const { ctx, step } = await boot(seed, 'cortege', 0.4);
      const sq = ctx.squads.create('section', 'police', 'S');
      for (let i = 0; i < 4; i++) ctx.people.spawn({ kind: 'crs', x: i, z: 0, squadId: sq.id });
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
