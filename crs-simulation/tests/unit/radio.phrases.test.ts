import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameContext, RadioMessage } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { PhraseParams, RadioControl, RadioPhrases } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from '@/gameplay/radio';
import { ALL_PHRASES, paramsOf } from '@/gameplay/radio/phrase-lib';
import { DYNAMIC_PARAMS, PARAM_DEFAULTS, PARAM_SPECS } from '@/gameplay/radio/phrases/defaults';
import { placeholdersOf, spokenCallsign, spokenNumber, spokenTime, typo } from '@/gameplay/radio/text';

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
  { nombre: 0, distance: 1, duree: 1, litres: 4000, eau: 1, pct: 25, lanceur: 3, lbd: 0, heure: 17.07 },
  { nombre: -5, distance: 3.7, duree: NaN, litres: Infinity, heure: 99.5 },
  { nombre: 1, indisponibles: 1, interpelles: 1, distance: 1, duree: 1 },
  { lieu: 'rue de Rivoli', voie: 'rue de Rivoli', station: 'Concorde', type: 'feu de poubelles', objet: 'poubelles et barrières' },
  { renfort: 'ÉPERVIER 3', autre: '{autre}', issue: '', acces: null, demande: '}{', signalement: undefined, cible: '' },
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
      // préparation et prévention, liaison, signes avant-coureurs, densité, fatigue et logistique (améliorations retenues)
      'prevention_mobilier', 'prevention_controles', 'prevention_perimetre', 'liaison_ordre', 'liaison_contact',
      'liaison_accord', 'liaison_refus', 'signe_nebuleuse', 'signe_visages_couverts', 'signe_fumigenes', 'signe_bloc',
      'signe_parapluies', 'signe_depavage', 'densite_critique', 'issue_ouverte', 'bousculade', 'releve_ordonnee',
      'ravitaillement_ordonne', 'ravitaillement_effectue',
      // incidents à déléguer, secours à appeler et à protéger, feux
      'incident_automobiliste', 'incident_secours_bloques', 'incident_suspect', 'incident_feu_reprise', 'incident_accuse',
      'ordre_eteindre', 'ordre_secourir', 'ordre_proteger_secours', 'secours_itineraire_libre', 'pompiers_feu_eteint',
      'canon_ordre_extinction', 'canon_feu_eteint', 'centaure_ordre_degager', 'agent_isole',
      // circulation et métro
      'ordre_couper_circulation', 'ordre_rouvrir_circulation', 'circulation_danger', 'station_fermeture_demande',
      'station_rouverte', 'metro_flux_deplace', 'metro_departs', 'ordre_filtrer_station', 'sortie_filtree',
      // ordres de la carte tactique et moyens spéciaux
      'ordre_tenir', 'ordre_ligne', 'ordre_mouvement', 'ordre_embarquer', 'refoulement', 'encerclement_ordre',
      'interpellation_ordre', 'bravm_ordre', 'drone_ordre', 'drone_objectif', 'centaure_ordre_salve', 'canon_ordre_jet',
      'ordre_recu', 'ordre_impossible', 'ordre_objections',
      // cadre légal : réitération avant l'usage des armes, fusée rouge, fin d'emploi, comptes rendus de tir
      'sommation_reiteree', 'sommation_fusee_rouge', 'force_suspendue', 'fin_emploi_force', 'tir_lbd',
      'desencerclement_employe', 'bilan_force',
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

  it('forme « APPELÉ ICI APPELANT. corps. PARLEZ. » avec chiffres épelés, réponse « ICI APPELANT. »', async () => {
    const { phrases } = await boot();
    const t = phrases.text('prise_position', { unite: 'MISTRAL 2', lieu: 'place de la Concorde', direction: 'nord' }, 0);
    expect(t).toBe('CENTRAL ICI MISTRAL DEUX. En position, secteur place de la Concorde, face nord. PARLEZ.');
    // une réponse ne rappelle pas l'appelé (bible E.7 : « ICI CENTRAL, FORT ET CLAIR, TERMINÉ. »)
    expect(phrases.text('radio_controle_reponse', {}, 0)).toBe('ICI CENTRAL. FORT ET CLAIR. TERMINÉ.');
    expect(phrases.text('mission_apercu', { unite: 'MISTRAL 2' }, 0)).toBe('ICI MISTRAL DEUX. APERÇU. TERMINÉ.');
    expect(phrases.text('central_attendez', {}, 0)).toBe('ICI CENTRAL. ATTENDEZ.');
    // ordre du commandant : il parle sous l'indicatif de sa compagnie
    const cmd = phrases.text('ordre_tenir', { cible: 'MISTRAL 12', lieu: 'rue Royale', direction: 'sud' }, 0);
    expect(cmd).toBe('MISTRAL UN-DEUX ICI MISTRAL. Tenez le secteur rue Royale, face sud. Riposte directe seulement. PARLEZ.');
  });

  it('on ne s\'appelle jamais soi-même : ordre sans destinataire à toutes les unités, le chef rend compte à la salle', async () => {
    const { phrases } = await boot();
    expect(phrases.text('bond_offensif', { distance: 30 }, 0)).toBe('TOUTES UNITÉS ICI MISTRAL. Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ.');
    expect(phrases.text('ordre_tenir', { cible: 'MISTRAL' }, 0).startsWith('TOUTES UNITÉS ICI MISTRAL.')).toBe(true);
    // une section rend compte à son commandant ; le commandant, lui, rend compte à la salle
    expect(phrases.text('incident_traite', { unite: 'MISTRAL 2' }, 0).startsWith('MISTRAL ICI MISTRAL DEUX.')).toBe(true);
    expect(phrases.text('incident_traite', {}, 0).startsWith('CENTRAL ICI MISTRAL.')).toBe(true);
    for (const def of ALL_PHRASES) {
      for (const params of [{}, { unite: 'MISTRAL' }, { cible: 'MISTRAL' }, { unite: 'CENTRAL' }] as PhraseParams[]) {
        const text = phrases.text(def.key, params, 0);
        const m = /^(.+?) ICI (.+?)\. /.exec(text);
        if (m) expect(m[1], `${def.key} : ${text}`).not.toBe(m[2]);
      }
    }
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
    // devant « heures », le chiffre 1 s'accorde : vingt et une heures, onze heures, une heure
    expect(spokenTime(21 + 5 / 60)).toBe('DEUX-UNE heures ZÉRO-CINQ');
    expect(spokenTime(11.25)).toBe('UNE-UNE heures UN-CINQ');
    expect(spokenTime(1)).toBe('ZÉRO-UNE heures ZÉRO-ZÉRO');
    expect(spokenTime(NaN)).toBe('ZÉRO-ZÉRO heures ZÉRO-ZÉRO');
  });

  it('accorde « UN » avec le nom qui suit : singulier et genre', async () => {
    const { phrases } = await boot();
    const d = phrases.text('debarquement', { distance: 1, lieu: 'x' }, 0);
    expect(d).toContain('à UN mètre de la foule');
    expect(phrases.text('debarquement', { distance: 30, lieu: 'x' }, 0)).toContain('TROIS-ZÉRO mètres');
    expect(phrases.text('drone_batterie', { duree: 1 }, 0)).toContain('retour dans UNE minute.');
    expect(phrases.text('drone_batterie', { duree: 12 }, 0)).toContain('retour dans UN-DEUX minutes.');
    expect(phrases.text('canon_citerne_basse', { eau: 1 }, 0)).toContain('il reste UN litre.');
    expect(typo('UN personnes, UNE mètres, UN-DEUX personnes, UNE section')).toBe('UNE personne, UN mètre, UN-DEUX personnes, UNE section');
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

  it('say() : variante imposée, canal, priorité, indicatif, lieu et direction déduits de l\'unité', async () => {
    const { ctx, phrases } = await boot();
    const sq = ctx.squads.create('section', 'police', 'Section Alpha');
    const chef = ctx.people.spawn({ kind: 'crs', x: 10, z: 20, heading: Math.PI / 2, rank: 'brigadier_chef', squadId: sq.id });
    ctx.squads.setLeader(sq.id, chef.id);
    const got: RadioMessage[] = [];
    ctx.events.on('radio:message', (e) => got.push(e.msg));
    expect(phrases.say('prise_position', { direction: 'est' }, { squad: sq, variant: 1 })).toBe(true);
    const m = got[0]!;
    expect(m.from).toBe('MISTRAL 1');
    expect(m.channel).toBe('commandement'); // compte rendu à la salle
    expect(m.priority).toBe(1);
    expect(m.personId).toBe(chef.id);
    // monde neutre : le secteur n'a pas de nom, on ne dit pas « secteur inconnu »
    expect(m.text).toBe('CENTRAL ICI MISTRAL UN. Position prise, secteur actuel. Je tiens face est. PARLEZ.');
    phrases.say('agent_a_terre', {}, { squad: sq, channel: 'unite', priority: 2 });
    expect(got[1]!.channel).toBe('unite');
    expect(got[1]!.priority).toBe(2);
    // sans paramètre, la direction de face est le cap du chef (cap π/2 = est), puis celui de la formation ordonnée
    phrases.say('ligne_formee', {}, { squad: sq, variant: 2, channel: 'public' });
    expect(got[2]!.text).toContain('face est. Prêt à tenir.');
    ctx.squads.issue(sq.id, { type: 'ligne', x: 10, z: 20, heading: Math.PI });
    phrases.say('ligne_formee', {}, { squad: sq, variant: 0, channel: 'presse' });
    expect(got[3]!.text).toContain('face nord.');
  });

  it('le lieu vient du monde : position de l\'unité, ou point désigné (options.at) ; jamais pour une destination', async () => {
    const { ctx, phrases } = await boot();
    ctx.world.sectorName = (x: number): string => (x > 100 ? 'rue de Rivoli' : 'secteur Concorde');
    const sq = ctx.squads.create('section', 'police', 'S');
    const chef = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, squadId: sq.id });
    ctx.squads.setLeader(sq.id, chef.id);
    const got: RadioMessage[] = [];
    ctx.events.on('radio:message', (e) => got.push(e.msg));
    phrases.say('situation_ras', {}, { squad: sq, variant: 0 });
    expect(got[0]!.text).toBe('CENTRAL ICI MISTRAL UN. Rien à signaler, secteur Concorde. Situation calme. PARLEZ.');
    // un incident se nomme d'après l'endroit où il est, pas d'après l'unité qui en parle
    phrases.say('incident_feu', { type: 'feu de poubelles' }, { squad: sq, at: { x: 500, z: 0 }, variant: 0, channel: 'secours' });
    expect(got[1]!.text).toContain('Feu signalé, secteur rue de Rivoli. Nature : feu de poubelles.');
    // une rue coupée porte le nom de l'endroit désigné
    phrases.say('rue_fermee', {}, { squad: sq, at: { x: 500, z: 0 }, variant: 0, channel: 'presse' });
    expect(got[2]!.text).toContain('Circulation coupée : rue de Rivoli.');
    // la destination d'un mouvement n'est jamais déduite de la position de départ
    phrases.say('mouvement', {}, { squad: sq, variant: 0, channel: 'public' });
    expect(got[3]!.text).toContain('En mouvement vers le secteur désigné.');
    expect(phrases.text('mouvement', { destination: 'place Vendôme', moyen: 'en véhicule' }, 0))
      .toContain('En mouvement vers le secteur place Vendôme. Déplacement en véhicule.');
  });

  it('options.to et options.from : destinataire et émetteur imposés, quel que soit le rôle prévu', async () => {
    const { ctx, phrases } = await boot();
    const s3 = ctx.squads.create('section', 'police', 'MISTRAL 3');
    const got: RadioMessage[] = [];
    ctx.events.on('radio:message', (e) => got.push(e.msg));
    // ordre du commandant à une unité désignée par l'objet Squad
    phrases.say('charge', { distance: 40, lieu: 'rue Royale' }, { to: s3, variant: 1 });
    expect(got[0]!.from).toBe('MISTRAL');
    expect(got[0]!.channel).toBe('unite');
    expect(got[0]!.personId).toBeUndefined(); // ce n'est pas le chef de MISTRAL 3 qui parle
    expect(got[0]!.text).toBe('MISTRAL TROIS ICI MISTRAL. Charge de QUATRE-ZÉRO mètres, secteur rue Royale. Arrêt au coup de sifflet, puis repli au pas. PARLEZ.');
    // les pompiers disent une phrase écrite pour le SAMU, à l'unité qui les protège
    phrases.say('secours_attente_securisation', { lieu: 'rue Royale' }, { from: 'SAPEUR 1', squad: s3, variant: 1 });
    expect(got[1]!.from).toBe('SAPEUR 1');
    expect(got[1]!.channel).toBe('secours');
    expect(got[1]!.text.startsWith('MISTRAL TROIS ICI SAPEUR UN. En attente de sécurisation, secteur rue Royale.')).toBe(true);
    // couloir ouvert pour les pompiers plutôt que pour le SAMU
    phrases.say('secours_itineraire_libre', { acces: 'rue Saint-Florentin' }, { squad: s3, to: 'SAPEUR 1', variant: 2, channel: 'public' });
    expect(got[2]!.text).toBe('SAPEUR UN ICI MISTRAL TROIS. Accès sécurisé : rue Saint-Florentin. Avancez par le couloir, mes agents vous couvrent des deux côtés. TERMINÉ.');
  });

  it('un appel et sa réponse passent par le même canal ; la salle parle sur le canal de commandement', async () => {
    const { phrases } = await boot();
    const canal = (k: string): string => phrases.info(k)!.channel;
    for (const [appel, reponse] of [
      ['radio_controle', 'radio_controle_reponse'], ['radio_controle', 'central_recu'], ['demande_renfort', 'renfort_accorde'],
      ['demande_renfort', 'renfort_refuse'], ['secours_demande_pompiers', 'secours_en_route'], ['secours_demande_samu', 'secours_en_route'],
      ['mission_donnee', 'mission_apercu'], ['force_niveau_3', 'force_apercu'], ['incident_delegue', 'incident_accuse'],
      ['bond_offensif', 'ordre_recu'], ['charge', 'ordre_objections'], ['bravm_ordre', 'bravm_en_route'],
      ['station_fermeture_demande', 'station_fermee'], ['liaison_ordre', 'liaison_accord'],
    ] as const) {
      expect(canal(reponse), `${appel} → ${reponse}`).toBe(canal(appel));
    }
    for (const def of ALL_PHRASES) {
      if (def.from !== 'central' && def.to !== 'central') continue;
      expect(['commandement', 'secours'], def.key).toContain(def.channel);
    }
  });

  it('la documentation PHRASES.md liste toutes les clés', () => {
    const doc = readFileSync(new URL('../../src/gameplay/radio/PHRASES.md', import.meta.url), 'utf8');
    for (const def of ALL_PHRASES) expect(doc.includes('`' + def.key + '`'), def.key).toBe(true);
  });
});
