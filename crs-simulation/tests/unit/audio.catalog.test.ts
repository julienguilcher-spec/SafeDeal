import { describe, expect, it } from 'vitest';
// texte source du contrat (import « brut » de Vite) : la liste des SoundId y est lue telle quelle
import contractSource from '@/core/contracts.ts?raw';
import { ALL_SOUND_IDS, CONTRACT_SOUND_IDS, EXTRA_SOUND_IDS, allSoundDefs, soundDef } from '@/audio/catalog';
import { FakeAudioContext } from '@/audio/dev/fakeWebAudio';
import { instantiate } from '@/audio/instantiate';
import { SIREN_SPECS } from '@/audio/recipes/vehicles';
import { GENERIC_SLOGANS } from '@/audio/recipes/crowd';

/** Extrait du contrat la liste des SoundId nommés (union littérale de `export type SoundId = Open<…>`). */
function contractSoundIds(): string[] {
  const m = /export type SoundId = Open<([\s\S]*?)>;/.exec(contractSource);
  if (!m) throw new Error('type SoundId introuvable dans contracts.ts');
  return [...m[1]!.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]!);
}

describe('catalogue des sons', () => {
  it('chaque SoundId du contrat a une recette', () => {
    const ids = contractSoundIds();
    expect(ids.length).toBeGreaterThanOrEqual(48);
    for (const id of ids) expect(soundDef(id), `recette manquante : ${id}`).toBeDefined();
  });

  it('la liste CONTRACT_SOUND_IDS est exactement celle du contrat', () => {
    expect([...CONTRACT_SOUND_IDS].sort()).toEqual(contractSoundIds().sort());
  });

  it('les sons supplémentaires ne recouvrent pas ceux du contrat', () => {
    for (const id of EXTRA_SOUND_IDS) expect(CONTRACT_SOUND_IDS as readonly string[]).not.toContain(id);
    expect(ALL_SOUND_IDS.length).toBe(CONTRACT_SOUND_IDS.length + EXTRA_SOUND_IDS.length);
    expect(new Set(ALL_SOUND_IDS).size).toBe(ALL_SOUND_IDS.length);
  });

  it('profils de diffusion cohérents', () => {
    for (const d of allSoundDefs()) {
      expect(d.level, d.id).toBeGreaterThan(0);
      expect(d.level, d.id).toBeLessThanOrEqual(1);
      expect(d.refDistance, d.id).toBeGreaterThan(0);
      expect(d.maxDistance, d.id).toBeGreaterThan(d.refDistance);
      expect(d.priority, d.id).toBeGreaterThanOrEqual(0);
      expect(d.priority, d.id).toBeLessThanOrEqual(3);
      expect(d.maxInstances, d.id).toBeGreaterThanOrEqual(1);
      expect(d.label.length, d.id).toBeGreaterThan(2);
    }
  });

  it('les détonations portent plus loin que les sons du quotidien', () => {
    expect(soundDef('detonation')!.maxDistance).toBeGreaterThan(soundDef('sirene_police')!.maxDistance);
    expect(soundDef('sirene_police')!.maxDistance).toBeGreaterThan(soundDef('pas')!.maxDistance * 5);
    expect(soundDef('detonation')!.delayed).toBe(true);
    expect(soundDef('pas')!.delayed).toBe(false);
  });

  it('boucles entretenues attendues', () => {
    for (const id of ['feu', 'canon_eau', 'sirene_police', 'sirene_pompiers', 'sirene_samu', 'moteur', 'drone', 'pluie', 'vent', 'ville', 'foule_calme', 'foule_huees', 'foule_panique', 'gaz_sifflement', 'spray', 'extincteur', 'klaxon']) {
      expect(soundDef(id)!.sustained, id).toBe(true);
    }
    for (const id of ['detonation', 'verre_brise', 'pas', 'ui_clic', 'tir_arme']) expect(soundDef(id)!.sustained, id).toBe(false);
  });
});

describe('sirènes deux-tons françaises', () => {
  it('note grave commune à 435 Hz, note aiguë propre à chaque service', () => {
    expect(SIREN_SPECS.sirene_police).toMatchObject({ low: 435, high: 580 });
    expect(SIREN_SPECS.sirene_pompiers).toMatchObject({ low: 435, high: 488 });
    expect(SIREN_SPECS.sirene_samu).toMatchObject({ low: 435, high: 651 });
    expect(SIREN_SPECS.sirene_gendarmerie).toMatchObject({ low: 435, high: 732 });
  });

  it('cadences réglementaires : 50 à 60 cycles/min, 25 à 30 pour les pompiers', () => {
    for (const id of ['sirene_police', 'sirene_samu', 'sirene_gendarmerie'] as const) {
      expect(SIREN_SPECS[id].cyclesPerMinute).toBeGreaterThanOrEqual(50);
      expect(SIREN_SPECS[id].cyclesPerMinute).toBeLessThanOrEqual(60);
    }
    expect(SIREN_SPECS.sirene_pompiers.cyclesPerMinute).toBeGreaterThanOrEqual(25);
    expect(SIREN_SPECS.sirene_pompiers.cyclesPerMinute).toBeLessThanOrEqual(30);
  });

  it('les trois services se distinguent à l’oreille (notes aiguës écartées d’au moins un ton)', () => {
    const highs = [SIREN_SPECS.sirene_police.high, SIREN_SPECS.sirene_pompiers.high, SIREN_SPECS.sirene_samu.high].sort((a, b) => a - b);
    for (let i = 1; i < highs.length; i++) expect(highs[i]! / highs[i - 1]!).toBeGreaterThan(1.1);
  });
});

describe('recettes : construction sur un contexte quelconque', () => {
  // Le faux contexte valide chaque appel WebAudio (valeurs finies, instants ≥ 0, rampes exponentielles > 0…).
  for (const d of allSoundDefs()) {
    it(`« ${d.id} » se construit sans erreur, en lecture ponctuelle${d.sustained ? ' et en boucle' : ''}`, () => {
      for (const seed of [1, 99, 123456]) {
        const fake = new FakeAudioContext();
        const ac = fake.asContext();
        const inst = instantiate(ac, d, ac.destination, 0.01, { seed, pitch: 1, loop: false, text: '' });
        expect(Number.isFinite(inst.duration), 'durée finie').toBe(true);
        expect(inst.duration).toBeGreaterThan(0.03);
        expect(inst.duration).toBeLessThan(10);
        expect(inst.period).toBeGreaterThan(0);
        expect(inst.period).toBeLessThanOrEqual(inst.duration);
        expect(fake.started, 'au moins une source').toBeGreaterThan(0);
        // toute source démarrée est programmée pour s'arrêter : rien ne tourne à vide après la fin
        for (const s of fake.sources) {
          expect(s.started).toBe(true);
          expect(s.stopAt, 'arrêt programmé').toBeLessThanOrEqual(0.01 + inst.duration + 0.06);
        }
        // budget : une voix reste un graphe modeste
        expect(fake.nodes, 'nombre de nœuds').toBeLessThan(400);
      }
      if (d.sustained) {
        const fake = new FakeAudioContext();
        const ac = fake.asContext();
        const inst = instantiate(ac, d, ac.destination, 0.01, { seed: 5, pitch: 1, loop: true, text: '' });
        expect(inst.duration).toBe(Infinity);
        expect(fake.sources.some((s) => s.stopAt === Infinity), 'source entretenue').toBe(true);
        inst.kit.stopAll(3);
        for (const s of fake.sources) expect(s.stopAt).toBeLessThanOrEqual(3);
      }
    });
  }

  it('la hauteur demandée et l’effet Doppler passent par le désaccord des oscillateurs', () => {
    const fake = new FakeAudioContext();
    const ac = fake.asContext();
    const inst = instantiate(ac, soundDef('sirene_police')!, ac.destination, 0, { seed: 1, pitch: 2, loop: true, text: '' });
    expect(inst.kit.baseDetune).toBeCloseTo(1200, 6);
    expect(inst.kit.detunes.length).toBeGreaterThan(0);
    inst.kit.setDoppler(Math.pow(2, 1 / 12), 0.5);
    for (const p of inst.kit.detunes) expect(p.value).toBeCloseTo(1300, 6);
  });

  it('les slogans suivent le texte : plus de syllabes, phrase plus longue', () => {
    const run = (text: string): number => {
      const fake = new FakeAudioContext();
      const ac = fake.asContext();
      return instantiate(ac, soundDef('foule_slogans')!, ac.destination, 0, { seed: 3, pitch: 1, loop: false, text }).period;
    };
    // même graine → même tempo ; la période est un nombre entier de phrases
    const short = run('Non ! Non !');
    const long = run('On est là, on est là, même si vous ne voulez pas, nous on est là !');
    expect(long).toBeGreaterThan(short);
    expect(GENERIC_SLOGANS.length).toBeGreaterThan(4);
  });

  it('la voix de mégaphone dure le temps de dire le texte', () => {
    const run = (text: string): number => {
      const fake = new FakeAudioContext();
      const ac = fake.asContext();
      return instantiate(ac, soundDef('megaphone')!, ac.destination, 0, { seed: 3, pitch: 1, loop: false, text }).duration;
    };
    expect(run('Dispersez-vous.')).toBeLessThan(run('Obéissance à la loi. Vous participez à un attroupement. Dispersez-vous.'));
  });
});
