import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameContext, RadioMessage } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { PhraseParams, RadioControl, RadioPhrases } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from '@/gameplay/radio';
import { ALL_PHRASES, paramsOf } from '@/gameplay/radio/phrase-lib';
import { PARAM_DEFAULTS, DYNAMIC_PARAMS } from '@/gameplay/radio/phrases/defaults';
import { spokenCallsign, spokenNumber, spokenTime, typo } from '@/gameplay/radio/text';

async function boot(seed = 3): Promise<{ ctx: GameContext; phrases: RadioPhrases; step: (s: number) => void }> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start({ seed });
  t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).ambient = false;
  return { ctx: t.ctx, phrases: t.ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE), step: (s) => t.step(s) };
}

/** Ensembles de paramètres hostiles : absents, vides, nombres, textes à accolades, valeurs étranges. */
const HOSTILE: readonly PhraseParams[] = [
  {},
  { unite: undefined, lieu: null, nombre: undefined },
  { unite: '', lieu: '', nombre: '', heure: '' },
  { unite: 'MISTRAL 2', cible: 'MISTRAL 3 BRAVO', lieu: 'place de la Concorde', nombre: 12, direction: 'est' },
  { lieu: '{lieu}', nombre: '{nombre}', unite: '{unite}', heure: '{heure}', voie: '{', station: '}' },
  { nombre: 0, distance: 1, duree: 1, litres: 4000, pct: 25, reste: 3, heure: 17.07 },
  { nombre: -5, distance: 3.7, duree: NaN, litres: Infinity, heure: 99.5 },
  { nombre: 1, indisponibles: 1, interpelles: 1, distance: 1, duree: 1 },
  { lieu: 'rue de Rivoli', voie: 'rue de Rivoli', station: 'Concorde', type: 'feu de poubelles', objet: 'poubelles et barrières' },
  { inconnu: 'valeur', autre: 5 },
];

describe('radio — bibliothèque de phrases', () => {
  it('contient au moins 90 situations, chacune avec 3 à 5 variantes distinctes', () => {
    expect(ALL_PHRASES.length).toBeGreaterThanOrEqual(90);
    const seen = new Set<string>();
    for (const def of ALL_PHRASES) {
      expect(seen.has(def.key), `clé en double : ${def.key}`).toBe(false);
      seen.add(def.key);
      expect(def.variants.length, def.key).toBeGreaterThanOrEqual(3);
      expect(def.variants.length, def.key).toBeLessThanOrEqual(5);
      expect(new Set(def.variants).size, `variantes en double : ${def.key}`).toBe(def.variants.length);
    }
  });

  it('couvre toutes les situations demandées par le brief', () => {
    const attendu = [
      'prise_position', 'mouvement', 'foule_calme', 'signe_changement_tenue', 'jets_projectiles', 'agent_blesse',
      'agent_a_terre', 'demande_renfort', 'munitions_basses', 'releve_demande', 'releve_effectuee', 'sommation_annonce',
      'sommation_premiere', 'sommation_derniere', 'sommations_effectuees', 'force_niveau_0', 'force_niveau_1',
      'force_niveau_2', 'force_niveau_3', 'force_niveau_4', 'force_niveau_5', 'gaz_main', 'gaz_lanceur', 'bond_offensif',
      'charge', 'repli', 'encerclement_en_place', 'interpellation_en_cours', 'interpellation_effectuee',
      'remise_interpelle', 'incident_feu', 'incident_blesse', 'incident_pillage', 'incident_barricade', 'incident_delegue',
      'incident_traite', 'secours_demande_pompiers', 'secours_demande_samu', 'secours_en_route',
      'secours_attente_securisation', 'secours_sur_place', 'rue_fermee', 'rue_rouverte', 'station_fermee', 'metro_arrivee',
      'drone_observation', 'canon_batterie', 'centaure_position', 'centaure_salve', 'barricade_degagee',
      'dispersion_en_cours', 'fin_mission', 'retour_base',
    ];
    const keys = new Set(ALL_PHRASES.map((d) => d.key));
    for (const k of attendu) expect(keys.has(k), k).toBe(true);
  });

  it('tout paramètre employé a une valeur par défaut (ou est calculé par le moteur)', () => {
    for (const def of ALL_PHRASES) {
      for (const p of paramsOf(def)) {
        expect(PARAM_DEFAULTS[p] !== undefined || DYNAMIC_PARAMS.has(p), `${def.key} : {${p}}`).toBe(true);
      }
    }
  });

  it('toutes les clés, toutes les variantes : aucun texte ne garde d\'accolade, quels que soient les paramètres', async () => {
    const { phrases } = await boot();
    expect(phrases.keys.length).toBe(ALL_PHRASES.length);
    for (const key of phrases.keys) {
      for (const params of HOSTILE) {
        const texts = phrases.variants(key, params);
        expect(texts.length, key).toBe(phrases.info(key)!.variants);
        for (const t of texts) {
          expect(t, `${key} ${JSON.stringify(params)}`).not.toMatch(/[{}]/);
          expect(t.length, key).toBeGreaterThan(12);
          expect(t, key).not.toMatch(/undefined|null|NaN|Infinity/);
          expect(t, key).not.toMatch(/ {2}/);
        }
      }
    }
  });

  it('say() accepte aussi toutes les clés sans erreur ni accolade dans le journal', async () => {
    const { ctx, phrases, step } = await boot();
    for (const key of phrases.keys) {
      for (let i = 0; i < 2; i++) phrases.say(key, HOSTILE[i === 0 ? 4 : 0]!, { channel: 'public' });
      step(40);
    }
    expect(ctx.radio.log.length).toBeGreaterThan(90);
    for (const m of ctx.radio.log) expect(m.text).not.toMatch(/[{}]/);
  });

  it('une clé inconnue est refusée proprement', async () => {
    const { phrases, ctx } = await boot();
    expect(phrases.has('nexiste_pas')).toBe(false);
    expect(phrases.say('nexiste_pas')).toBe(false);
    expect(phrases.text('nexiste_pas')).toBe('');
    expect(phrases.variants('nexiste_pas')).toEqual([]);
    expect(phrases.info('nexiste_pas')).toBeUndefined();
    expect(ctx.radio.log).toHaveLength(0);
  });

  it('forme « APPELÉ ICI APPELANT. corps. PARLEZ. » avec chiffres épelés', async () => {
    const { phrases } = await boot();
    const t = phrases.text('prise_position', { unite: 'MISTRAL 2', lieu: 'place de la Concorde', direction: 'nord' }, 0);
    expect(t).toBe('CENTRAL ICI MISTRAL DEUX. En position, secteur place de la Concorde, face nord. PARLEZ.');
    const a = phrases.text('radio_controle_reponse', { cible: 'MISTRAL 2' }, 0);
    expect(a).toBe('MISTRAL ICI CENTRAL. Fort et clair. TERMINÉ.'); // destinataire par défaut : la compagnie
    const cmd = phrases.text('ordre_tenir', { cible: 'MISTRAL 12', lieu: 'rue Royale', direction: 'sud' }, 0);
    expect(cmd.startsWith('MISTRAL UN-DEUX ICI MISTRAL ZÉRO.')).toBe(true);
  });

  it('les nombres sont dits un par un, les milliers en toutes lettres', () => {
    expect(spokenNumber(45)).toBe('QUATRE-CINQ');
    expect(spokenNumber(5000)).toBe('CINQ MILLE');
    expect(spokenNumber(1000)).toBe('MILLE');
    expect(spokenNumber(100)).toBe('CENT');
    expect(spokenNumber(0)).toBe('ZÉRO');
    expect(spokenNumber(200)).toBe('DEUX-ZÉRO-ZÉRO');
    expect(spokenNumber(NaN)).toBe('ZÉRO');
    expect(spokenCallsign('Mistral 12 bravo')).toBe('MISTRAL UN-DEUX BRAVO');
    expect(spokenTime(17.07)).toBe('UNE-SEPT heures ZÉRO-QUATRE');
    expect(spokenTime(8.5)).toBe('ZÉRO-HUIT heures TROIS-ZÉRO');
    expect(spokenTime(21 + 5 / 60)).toBe('DEUX-UN heures ZÉRO-CINQ');
  });

  it('accorde « UN » avec le nom au singulier', async () => {
    const { phrases } = await boot();
    const t = phrases.text('prise_position', {}, 0);
    expect(t).toContain('PARLEZ');
    const d = phrases.text('debarquement', { distance: 1, lieu: 'x' }, 0);
    expect(d).toContain('à UN mètre de la foule');
    expect(phrases.text('debarquement', { distance: 30, lieu: 'x' }, 0)).toContain('TROIS-ZÉRO mètres');
  });

  it('typographie française : espace insécable avant ; : ! ? et dans les guillemets', () => {
    const NB = ' ';
    expect(typo('Attention ! Réponse : oui ; non ?')).toBe(`Attention${NB}! Réponse${NB}: oui${NB}; non${NB}?`);
    expect(typo('Il dit « bonjour » à tous')).toBe(`Il dit «${NB}bonjour${NB}» à tous`);
    expect(typo("l'unité")).toBe('l’unité');
    for (const def of ALL_PHRASES) {
      for (const v of def.variants) {
        const t = typo(v);
        expect(t, def.key).not.toMatch(/ [;:!?»]/);
        expect(t, def.key).not.toMatch(/«(?! )/);
      }
    }
  });

  it('chaque variante est une phrase soignée : capitale initiale, ponctuation finale, pas de double espace', () => {
    for (const def of ALL_PHRASES) {
      for (const v of def.variants) {
        expect(v, def.key).toMatch(/^[A-ZÉÈÀÇ{]/);
        expect(v, def.key).toMatch(/[.!?]$/);
        expect(v, def.key).not.toMatch(/ {2}|\s[,.]/);
      }
    }
  });

  it('neutralité : aucun nom propre réel (parti, syndicat, marque, personne) dans la bibliothèque', () => {
    const tout = ALL_PHRASES.flatMap((d) => d.variants).join(' ').toLowerCase();
    for (const mot of ['cgt', 'cfdt', 'macron', 'lfi', 'rassemblement national', 'renault', 'peugeot', 'citroën', 'bmw', 'mercedes']) {
      expect(tout.includes(mot), mot).toBe(false);
    }
  });

  it('varie les variantes sans jamais répéter deux fois de suite la même', async () => {
    const { phrases, ctx, step } = await boot(11);
    const seen = new Set<string>();
    let previous = '';
    for (let i = 0; i < 12; i++) {
      phrases.say('foule_calme', { lieu: 'place de la République', nombre: 3000 }, { channel: 'public', priority: 0 });
      step(95); // au-delà de la fenêtre anti-répétition de l'ambiance
      const last = ctx.radio.log[ctx.radio.log.length - 1]!.text;
      expect(last).not.toBe(previous);
      previous = last;
      seen.add(last);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('say() : variante imposée, canal, priorité, indicatif et lieu déduits de l\'unité', async () => {
    const { ctx, phrases } = await boot();
    const sq = ctx.squads.create('section', 'police', 'Section Alpha');
    const chef = ctx.people.spawn({ kind: 'crs', x: 10, z: 20, rank: 'brigadier_chef', squadId: sq.id });
    ctx.squads.setLeader(sq.id, chef.id);
    const got: RadioMessage[] = [];
    ctx.events.on('radio:message', (e) => got.push(e.msg));
    expect(phrases.say('prise_position', { direction: 'est' }, { squad: sq, variant: 1 })).toBe(true);
    const m = got[0]!;
    expect(m.from).toBe('MISTRAL 1');
    expect(m.channel).toBe('unite');
    expect(m.priority).toBe(1);
    expect(m.personId).toBe(chef.id);
    expect(m.text).toContain('MISTRAL UN');
    expect(m.text).toContain('Position prise, secteur inconnu'); // monde neutre : « secteur inconnu »
    expect(m.text).toContain('face est');
    phrases.say('agent_a_terre', {}, { squad: sq, channel: 'commandement', priority: 2 });
    expect(got[1]!.channel).toBe('commandement');
    expect(got[1]!.priority).toBe(2);
  });

  it('la documentation PHRASES.md liste toutes les clés', () => {
    const doc = readFileSync(new URL('../../src/gameplay/radio/PHRASES.md', import.meta.url), 'utf8');
    for (const def of ALL_PHRASES) expect(doc.includes('`' + def.key + '`'), def.key).toBe(true);
  });
});
