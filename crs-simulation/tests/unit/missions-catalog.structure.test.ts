import { describe, expect, it } from 'vitest';
import type { PlayableRole } from '@/core/contracts';
import type { MissionDef, MissionType, ObjectiveKind } from '@/core/missions-schema';
import { CAREER_CHAPTERS, CAMPAIGN_SEMAINE } from '@/gameplay/missions/catalog/career';
import { CAUSES, FAMILIES, SOMMATIONS, isRadioCallsign, spokenCallsign } from '@/gameplay/missions/catalog/dsl';
import { MISSIONS, mirrorsOf, missionById, missionsFor } from '@/gameplay/missions/catalog';

const ROLES_JOUABLES: PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'street_medic', 'secouriste', 'journaliste', 'manifestant',
];

const TYPES: MissionType[] = [
  'manifestation_declaree', 'manifestation_interdite', 'emeute_nocturne', 'soir_de_match', 'securisation', 'escorte',
  'evacuation', 'pillage', 'protection_secours', 'barrage', 'interpellation_ciblee', 'evenement_festif',
  'visite_officielle', 'catastrophe', 'patrouille', 'formation',
];

const KINDS: ObjectiveKind[] = [
  'tenir_position', 'proteger_site', 'disperser', 'interpeller', 'zero_bavure', 'sommations_regulieres',
  'limiter_blesses', 'limiter_degats', 'couper_circulation', 'degager_barricade', 'escorter', 'evacuer',
  'reperer_signaux', 'guider_unite', 'traiter_incidents', 'releve', 'prevention', 'eteindre', 'secourir', 'soigner',
  'photographier', 'filmer', 'publier', 'rester_dans_cortege', 'atteindre', 'ne_pas_etre_interpelle',
  'proteger_les_siens', 'survivre', 'duree', 'personnalise',
];

const PHASES_FOULE = ['aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion'];

/** Durée de jeu de chaque préréglage, en secondes (BRIEF : 10 / 25 / 45 min / temps réel). */
const DUREE_S: Record<string, number> = { courte: 600, standard: 1500, longue: 2700, temps_reel: 7200 };

/** Champs chiffrés ou localisés qu'un objectif doit porter pour être mesurable par le cadre de mission. */
const CHAMPS_REQUIS: Partial<Record<ObjectiveKind, Array<Array<'place' | 'target' | 'count' | 'seconds' | 'max'>>>> = {
  tenir_position: [['seconds']], proteger_site: [['place', 'target']], disperser: [['place', 'target']], interpeller: [['count']],
  limiter_blesses: [['max']], limiter_degats: [['max']], couper_circulation: [['place', 'count']],
  degager_barricade: [['count', 'place']], escorter: [['place', 'target']], evacuer: [['count', 'place']],
  reperer_signaux: [['count']], guider_unite: [['target', 'place', 'count']], traiter_incidents: [['count']], releve: [['count']],
  prevention: [['target', 'count']], eteindre: [['count']], secourir: [['count']], soigner: [['count']],
  photographier: [['count']], filmer: [['count']], publier: [['count']], rester_dans_cortege: [['seconds', 'max']],
  atteindre: [['place']], duree: [['seconds']], personnalise: [['target']],
};

/** Texte sans espaces insécables ni apostrophes courbes, pour les contrôles. */
function brut(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, ' ').replace(/’/g, '\'');
}

function textes(m: MissionDef): string[] {
  return [
    m.title, m.pitch, m.briefing, m.unique, m.intel.expected, m.intel.radicals, ...m.intel.advice, ...m.randomEvents,
    ...m.phases.flatMap((p) => [p.title, p.text, ...p.events, ...p.radio.map((r) => r.text)]),
    ...m.objectives.map((o) => o.text), ...m.failures.map((f) => f.text),
  ];
}

describe('catalogue de missions : volumétrie et identifiants', () => {
  it('compte au moins 110 missions', () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(110);
  });

  it('identifiants uniques, en minuscules, sans espace', () => {
    const vus = new Set<string>();
    for (const m of MISSIONS) {
      expect(m.id, m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(m.id).toBe(m.id.toLowerCase());
      expect(vus.has(m.id), `doublon ${m.id}`).toBe(false);
      vus.add(m.id);
    }
    expect(vus.size).toBe(MISSIONS.length);
  });

  it('au moins 8 missions par rôle jouable ; aucun rôle « commissaire »', () => {
    for (const r of ROLES_JOUABLES) {
      expect(missionsFor(r).length, r).toBeGreaterThanOrEqual(8);
    }
    expect(MISSIONS.filter((m) => (m.role as string) === 'commissaire')).toHaveLength(0);
    expect(MISSIONS.filter((m) => m.altRoles.includes('commissaire'))).toHaveLength(0);
    expect(MISSIONS.filter((m) => m.rank === 'commissaire')).toHaveLength(0);
    expect(missionsFor('commissaire').map((m) => m.id)).toEqual(missionsFor('commandant').map((m) => m.id));
  });

  it('le manifestant couvre le profil pacifique ET radical', () => {
    const profils = new Set(missionsFor('manifestant').map((m) => m.profile));
    expect(profils.has('radical')).toBe(true);
    expect([...profils].some((p) => p === 'pacifique' || p === 'famille' || p === 'militant' || p === 'service_ordre')).toBe(true);
    expect(missionsFor('manifestant').filter((m) => m.profile === 'radical').length).toBeGreaterThanOrEqual(4);
    expect(missionsFor('manifestant').filter((m) => m.profile === 'pacifique' || m.profile === 'famille' || m.profile === 'militant').length).toBeGreaterThanOrEqual(4);
  });

  it('tous les types de mission sont représentés', () => {
    const vus = new Set(MISSIONS.map((m) => m.type));
    for (const t of TYPES) expect(vus.has(t), t).toBe(true);
  });

  it('les lieux de départ sont variés', () => {
    const lieux = new Set(MISSIONS.map((m) => m.place));
    expect(lieux.size).toBeGreaterThanOrEqual(40);
  });

  it('le profil de manifestant n\'est renseigné que pour ce rôle ; le grade et le poste que pour la police', () => {
    for (const m of MISSIONS) {
      if (m.role === 'manifestant') expect(m.profile, m.id).not.toBeNull();
      else expect(m.profile, m.id).toBeNull();
      if (['journaliste', 'manifestant', 'street_medic', 'secouriste'].includes(m.role)) {
        expect(m.rank, m.id).toBeNull();
        expect(m.poste, m.id).toBeNull();
      }
    }
  });
});

describe('catalogue de missions : champs remplis et dans leurs bornes', () => {
  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s', (_id, m) => {
    // textes
    expect(m.title.trim().length).toBeGreaterThanOrEqual(3);
    expect(m.title.length).toBeLessThanOrEqual(80);
    expect(m.pitch.length).toBeGreaterThanOrEqual(50);
    expect(m.pitch.length).toBeLessThanOrEqual(400);
    expect(m.unique.length).toBeGreaterThanOrEqual(25);
    // briefing : quatre paragraphes dans l'ordre situation, mission, exécution, consignes
    const paragraphes = m.briefing.split('\n\n');
    expect(paragraphes).toHaveLength(4);
    expect(paragraphes[0].startsWith('Situation.')).toBe(true);
    expect(paragraphes[1].startsWith('Mission.')).toBe(true);
    expect(paragraphes[2].startsWith('Exécution.')).toBe(true);
    expect(paragraphes[3].startsWith('Consignes particulières.')).toBe(true);
    for (const p of paragraphes) expect(p.length, 'paragraphe trop court').toBeGreaterThanOrEqual(150);
    // scène
    expect(m.place.trim().length).toBeGreaterThan(2);
    expect(m.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(m.timeOfDay).toBeLessThan(24);
    expect(['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage']).toContain(m.weather);
    expect(m.windFrom).toBeGreaterThanOrEqual(0);
    expect(m.windFrom).toBeLessThanOrEqual(360);
    expect(m.windSpeed).toBeGreaterThanOrEqual(0);
    expect(m.windSpeed).toBeLessThanOrEqual(25);
    expect(['courte', 'standard', 'longue', 'temps_reel']).toContain(m.duration);
    expect([1, 2, 3, 4, 5]).toContain(m.difficulty);
    expect(TYPES).toContain(m.type);
    expect(m.tags.length).toBeGreaterThanOrEqual(1);
    for (const t of m.tags) expect(t).toMatch(/^[a-z0-9-]+$/);
    // foule
    const c = m.crowd;
    expect(Number.isInteger(c.size)).toBe(true);
    expect(c.size).toBeGreaterThanOrEqual(0);
    expect(c.size).toBeLessThanOrEqual(5000);
    expect(CAUSES as readonly string[]).toContain(c.cause);
    for (const v of [c.tension, c.volatility, c.radicalShare, c.metroShare]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    let somme = 0;
    for (const [k, v] of Object.entries(c.families)) {
      expect(FAMILIES as readonly string[], `famille ${k}`).toContain(k);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
      somme += v;
    }
    if (c.size > 0) {
      expect(Object.keys(c.families).length).toBeGreaterThanOrEqual(1);
      expect(somme).toBeGreaterThan(0.95);
      expect(somme).toBeLessThanOrEqual(1.0001);
    }
    // moyens
    const f = m.forces;
    for (const k of ['sections', 'fourgons', 'pelotons', 'centaure', 'canonEau', 'bravm', 'pompiers', 'samu'] as const) {
      expect(Number.isInteger(f[k]), k).toBe(true);
      expect(f[k], k).toBeGreaterThanOrEqual(0);
    }
    expect(typeof f.drone).toBe('boolean');
    if (m.role === 'bravm') expect(f.bravm).toBeGreaterThanOrEqual(1);
    if (m.role === 'gendarme_centaure') expect(f.centaure).toBeGreaterThanOrEqual(1);
    if (m.role === 'operateur_canon_eau') expect(f.canonEau).toBeGreaterThanOrEqual(1);
    if (m.role === 'telepilote') expect(f.drone).toBe(true);
    // renseignement
    expect(m.intel.expected.length).toBeGreaterThan(15);
    expect(m.intel.radicals.length).toBeGreaterThan(10);
    expect(m.intel.hotspots.length).toBeGreaterThanOrEqual(1);
    expect(m.intel.advice.length).toBeGreaterThanOrEqual(2);
    // aléas
    expect(m.randomEvents.length).toBeGreaterThanOrEqual(2);
    for (const e of m.randomEvents) expect(e.length).toBeGreaterThan(8);
    // phases
    expect(m.phases.length).toBeGreaterThanOrEqual(3);
    const idsPhases = new Set<string>();
    const idsObj = new Set(m.objectives.map((o) => o.id));
    m.phases.forEach((p, i) => {
      expect(idsPhases.has(p.id), `phase en double ${p.id}`).toBe(false);
      idsPhases.add(p.id);
      expect(p.title.length).toBeGreaterThan(2);
      expect(p.text.length).toBeGreaterThan(14);
      expect(p.id, `identifiant de phase ${p.id}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.radio.length, `radio de ${p.id}`).toBeGreaterThanOrEqual(1);
      for (const r of p.radio) {
        expect(r.from.length).toBeGreaterThan(1);
        expect(r.from, 'émetteur en capitales').toBe(r.from.toUpperCase());
        expect(r.from, 'le personnage incarné parle sous « VOUS », jamais sous « JOUEUR »').not.toBe('JOUEUR');
        const t = brut(r.text);
        if (isRadioCallsign(r.from)) {
          // message radio : « APPELÉ ICI APPELANT. Corps. PARLEZ. », et l'appelant est bien l'émetteur déclaré
          const ici = /^(.+?) ICI ([^.,]+)[.,] /.exec(t);
          expect(ici, `radio « ${t} »`).not.toBeNull();
          expect(ici?.[2], `émetteur de « ${t} »`).toBe(spokenCallsign(r.from));
          expect(ici?.[1], `l'appelé ne peut pas être l'appelant : « ${t} »`).not.toBe(ici?.[2]);
          expect(t, `radio « ${t} »`).toMatch(/(PARLEZ|TERMINÉ|APERÇU|COLLATIONNEZ)\.$/);
          // chiffres dits un par un (bible E.6) : pas de dizaine en toutes lettres capitales
          expect(t, `nombre à épeler chiffre par chiffre : « ${t} »`).not.toMatch(/\b(DIX|ONZE|DOUZE|TREIZE|QUATORZE|QUINZE|SEIZE|VINGT|TRENTE|QUARANTE|CINQUANTE|SOIXANTE|QUATRE-VINGTS?)\b(?! MILLE)/);
        } else {
          // voix (ami, rédaction, haut-parleur, moniteur…) : français courant, sans procédure radio
          expect(t, `voix « ${t} »`).not.toMatch(/\bICI\b|\bPARLEZ\b|\bTERMINÉ\b|\bCOLLATIONNEZ\b/);
          expect(t.length).toBeGreaterThan(5);
        }
      }
      if (i < m.phases.length - 1) {
        expect(p.until.kind).not.toBe('fin');
        if (p.until.kind === 'temps') expect(p.until.seconds).toBeGreaterThan(0);
        if (p.until.kind === 'tension') {
          expect(p.until.above).toBeGreaterThan(0);
          expect(p.until.above).toBeLessThanOrEqual(1);
        }
        if (p.until.kind === 'phase_foule') expect(PHASES_FOULE).toContain(p.until.phase);
        if (p.until.kind === 'objectif') expect(idsObj.has(p.until.id)).toBe(true);
      } else {
        expect(p.until.kind).toBe('fin');
      }
    });
    // déroulé : les phases minutées tiennent dans la durée, un seuil de tension n'est pas déjà franchi au départ
    const minutees = m.phases.reduce((s, p) => s + (p.until.kind === 'temps' ? p.until.seconds : 0), 0);
    expect(minutees, 'somme des phases minutées').toBeLessThanOrEqual(0.85 * DUREE_S[m.duration]);
    for (const p of m.phases) {
      if (p.until.kind === 'tension') expect(p.until.above, `seuil de tension de ${p.id}`).toBeGreaterThan(m.crowd.tension);
    }
    // moyens : un fourgon par groupe, donc trois par section (bible C et E.1)
    if (f.sections > 0) expect(f.fourgons, 'fourgons = 3 × sections').toBe(3 * f.sections);
    // objectifs
    const principaux = m.objectives.filter((o) => !o.secondary);
    const secondaires = m.objectives.filter((o) => o.secondary);
    expect(principaux.length).toBeGreaterThanOrEqual(2);
    expect(secondaires.length).toBeGreaterThanOrEqual(1);
    expect(idsObj.size).toBe(m.objectives.length);
    for (const o of m.objectives) {
      expect(KINDS).toContain(o.kind);
      expect(o.text.length).toBeGreaterThan(10);
      expect(o.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (o.count !== undefined) expect(o.count).toBeGreaterThan(0);
      if (o.seconds !== undefined) expect(o.seconds).toBeGreaterThan(0);
      if (o.max !== undefined) expect(o.max).toBeGreaterThanOrEqual(0);
      if (o.target !== undefined) expect(o.target, `cible de ${o.id}`).toMatch(/^[a-z0-9_]+$/);
      // mesurabilité : chaque type d'objectif porte le champ qui permet de le vérifier
      for (const auChoix of CHAMPS_REQUIS[o.kind] ?? []) {
        expect(auChoix.some((k) => o[k] !== undefined), `${o.id} (${o.kind}) : il manque ${auChoix.join(' ou ')}`).toBe(true);
      }
    }
    // échecs
    expect(m.failures.length).toBeGreaterThanOrEqual(1);
    const civil = ['journaliste', 'manifestant', 'street_medic'].includes(m.role);
    for (const e of m.failures) {
      expect(e.text.length).toBeGreaterThan(10);
      if (e.value !== undefined) expect(e.value).toBeGreaterThan(0);
      if (e.kind === 'trop_de_blesses' || e.kind === 'temps') expect(e.value, `seuil de l'échec ${e.kind}`).toBeDefined();
      // « interpellé » est l'échec de celui qui peut l'être : jamais d'un policier, d'un gendarme ou d'un pompier
      if (e.kind === 'interpelle') expect(civil, 'échec « interpelle » réservé aux rôles civils').toBe(true);
    }
    // cohérence des familles de rôle
    if (m.type === 'formation') expect(m.crowd.tension).toBeLessThan(0.5);
  });
});

describe('catalogue de missions : typographie française', () => {
  it('espaces insécables avant ; : ! ? et dans les guillemets, apostrophes courbes', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m)) {
        expect(t, `${m.id} : espace ordinaire avant ponctuation haute`).not.toMatch(/[^ ] [;:!?»]/);
        expect(t, `${m.id} : guillemet ouvrant sans espace insécable`).not.toMatch(/« [^ ]|«[^ ]/);
        expect(t, `${m.id} : apostrophe droite`).not.toMatch(/'/);
        expect(t, `${m.id} : guillemets anglais`).not.toMatch(/["“”]/);
      }
    }
  });
});

describe('catalogue de missions : réalisme, cadre légal et vocabulaire', () => {
  it('les sommations citées sont le texte réglementaire, mot pour mot (R. 211-11, version de 2021)', () => {
    const exact = { annonce: brut(SOMMATIONS.annonce), premiere: brut(SOMMATIONS.premiere), derniere: brut(SOMMATIONS.derniere) };
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) {
        if (t.includes('Vous participez à un attroupement')) expect(t, m.id).toContain(exact.annonce);
        if (t.includes('Première sommation :')) expect(t, m.id).toContain(exact.premiere);
        if (t.includes('Dernière sommation :')) expect(t, m.id).toContain(exact.derniere);
        // formules d'avant le 5 mai 2021 : à ne jamais employer
        expect(t, `${m.id} : formule périmée`).not.toMatch(/Obéissance à la loi\. Dispersez-vous|on va faire usage de la force/);
      }
    }
  });

  it('le commandant est le chef unique : ni commissaire, ni autorité civile, ni autorisation à demander', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) {
        expect(t, m.id).not.toMatch(/commissaire|autorité civile|AUTORITÉ (UN|DEUX|TROIS)\b/i);
        expect(t, m.id).not.toMatch(/demande[rz]? l'autorisation|attend(re|ez) l'autorisation|autorisation de la salle/i);
      }
      for (const p of m.phases) for (const r of p.radio) expect(r.from, m.id).not.toMatch(/^AUTORITÉ/);
      // la salle renseigne et fixe la mission ; elle n'autorise pas la force à la place du commandant
      for (const p of m.phases) {
        for (const r of p.radio) {
          if (r.from === 'CENTRAL') expect(brut(r.text), `${m.id} : la force est autorisée par le commandant`).not.toMatch(/force autorisé|armes autorisé/);
        }
      }
    }
  });

  it('une manifestation est déclarée, jamais « autorisée »', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) {
        expect(t, m.id).not.toMatch(/(manifestation|cortège|rassemblement|marche) autorisée?\b/i);
      }
    }
  });

  it('effectifs de la bible : groupe de 6, section de 16, demi-compagnie de 32, compagnie de 70', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) {
        expect(t, m.id).not.toMatch(/section de dix-huit|dix-huit agents|groupe de sept|sept agents|trente-six agents|soixante-dix-huit/i);
      }
    }
  });

  it('jamais moins de deux sections face à une foule en maintien de l\'ordre', () => {
    for (const m of MISSIONS) {
      const f = m.forces;
      const c = m.crowd;
      if (f.sections === 0 || ['formation', 'securisation', 'catastrophe'].includes(m.type)) continue;
      if ((c.size >= 200 && c.tension >= 0.3) || c.size >= 600) expect(f.sections, m.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('aucun mot d\'atelier dans les textes affichés (ni « joueur », ni « fictif », ni « simulé », ni réglage chiffré)', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) {
        expect(t, `${m.id} : « ${t.slice(0, 80)} »`).not.toMatch(/\bjoueurs?\b|\bfictifs?\b|\bfictives?\b|\bsimulée?s?\b|\bPNJ\b|heures de jeu|\(tension|\(foule|gameplay/i);
      }
    }
  });

  it('aucun nom de modèle commercial pour le matériel', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m).map(brut)) expect(t, m.id).not.toMatch(/\bcougar\b|\bflash-?ball\b|\btaser\b|\btonfa\b/i);
    }
  });

  it('titres, accroches et phrases « unique » ne sont jamais répétés d\'une mission à l\'autre', () => {
    for (const champ of ['title', 'pitch', 'unique'] as const) {
      const vus = new Map<string, string>();
      for (const m of MISSIONS) {
        const cle = brut(m[champ]).toLowerCase();
        expect(vus.get(cle), `${champ} identique : ${m.id}`).toBeUndefined();
        vus.set(cle, m.id);
      }
    }
  });

  it('une mission miroir ne recopie ni le briefing ni les objectifs de sa base', () => {
    for (const m of MISSIONS.filter((x) => x.mirrorOf !== '')) {
      const base = missionById(m.mirrorOf);
      if (!base) continue;
      expect(m.briefing, m.id).not.toBe(base.briefing);
      expect(m.pitch, m.id).not.toBe(base.pitch);
      const communs = m.objectives.filter((o) => base.objectives.some((b) => b.text === o.text));
      expect(communs.length, `${m.id} : objectifs recopiés`).toBeLessThanOrEqual(1);
    }
  });
});

/*
 * Critères du DÉROULÉ (phases, déclencheurs, messages) que le catalogue ne remplit pas encore : relevés à la relecture
 * du 16 novembre 2026. À transformer en tests réels quand le déroulé des 129 missions aura été réécrit.
 */
describe('catalogue de missions : déroulé à réécrire (critères de recette)', () => {
  it.todo('chaque texte de phase décrit la scène en deux phrases au moins, lieu compris (relevé : 479 phases sur 504 en une seule phrase, médiane de 39 caractères)');
  it.todo('aucun titre de phase passe-partout n\'est repris plus de trois fois (relevé : « Fin » 14 fois, « Départ » 11, « Évacuation » 11, « Dispersion » 10)');
  it.todo('dans chaque mission, une phase au moins se termine sur un objectif atteint (relevé : aucun déclencheur « objectif » ; 100 missions sur 129 suivent deux gabarits temps / tension / foule)');
  it.todo('aucun message écrit d\'avance n\'annonce un résultat qui dépend du joueur (« feu éteint », « place dégagée », nombre d\'interpellés…)');
  it.todo('chaque mission compte au moins six messages et trois aléas de phase (relevé : un message par phase dans 492 phases sur 504, aucun aléa dans 336)');
});

describe('catalogue de missions : missions miroirs', () => {
  const miroirs = MISSIONS.filter((m) => m.mirrorOf !== '');

  it('mirrorOf désigne une mission existante, d\'un autre rôle, sur le même lieu', () => {
    for (const m of miroirs) {
      const base = missionById(m.mirrorOf);
      expect(base, `${m.id} → ${m.mirrorOf}`).toBeDefined();
      if (!base) continue;
      expect(base.role, m.id).not.toBe(m.role);
      expect(base.place, m.id).toBe(m.place);
      expect(base.mirrorOf, 'la base d\'un miroir n\'est pas elle-même un miroir').toBe('');
      expect(base.altRoles, `${base.id} doit lister ${m.role}`).toContain(m.role);
      expect(m.altRoles, `${m.id} doit lister ${base.role}`).toContain(base.role);
    }
  });

  it('au moins dix situations jouables sous plusieurs rôles', () => {
    const bases = new Set(miroirs.map((m) => m.mirrorOf));
    expect(bases.size).toBeGreaterThanOrEqual(10);
  });

  it('toute mission qui annonce des rôles alternatifs a un miroir pour chacun', () => {
    for (const m of MISSIONS.filter((x) => x.mirrorOf === '' && x.altRoles.length > 0)) {
      const roles = mirrorsOf(m.id).map((x) => x.role);
      for (const r of m.altRoles) expect(roles, `${m.id} : miroir ${r}`).toContain(r);
    }
  });

  it('au moins une scène commandant / journaliste / manifestant', () => {
    const trio = miroirs.filter((m) => m.role === 'journaliste').map((m) => m.mirrorOf).filter((id) => {
      const roles = mirrorsOf(id).map((x) => x.role);
      return roles.includes('manifestant') && missionById(id)?.role === 'commandant';
    });
    expect(trio.length).toBeGreaterThanOrEqual(2);
  });
});

describe('carrière et campagne', () => {
  it('chapitres contigus de 0 à 13, avec le chapitre 0 « L\'école » de quatre ateliers de formation', () => {
    expect(CAREER_CHAPTERS.map((c) => c.index)).toEqual(CAREER_CHAPTERS.map((_, i) => i));
    expect(CAREER_CHAPTERS.length).toBeGreaterThanOrEqual(9);
    const ecole = CAREER_CHAPTERS[0];
    expect(ecole.title.replace(/’/g, '\'')).toContain('école');
    expect(ecole.missions).toHaveLength(4);
    for (const id of ecole.missions) {
      const m = missionById(id);
      expect(m?.type).toBe('formation');
      expect(m?.chapter).toBe(0);
    }
    const sujets = ecole.missions.map((id) => missionById(id)?.title ?? '').join(' ').toLowerCase();
    for (const mot of ['ligne', 'bouclier', 'sommations', 'secours']) expect(sujets).toContain(mot);
  });

  it('chaque chapitre référence des missions existantes, et réciproquement', () => {
    const vues = new Map<string, number>();
    for (const c of CAREER_CHAPTERS) {
      expect(c.missions.length).toBeGreaterThanOrEqual(1);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.description.length).toBeGreaterThan(40);
      expect(c.requirement.length).toBeGreaterThan(10);
      expect(c.requiredMissions).toBeGreaterThanOrEqual(1);
      expect(c.requiredMissions).toBeLessThanOrEqual(c.missions.length);
      expect(c.requiredAverage).toBeGreaterThanOrEqual(0);
      expect(c.requiredAverage).toBeLessThanOrEqual(4);
      expect(c.unlocks.length).toBeGreaterThanOrEqual(1);
      for (const id of c.missions) {
        const m = missionById(id);
        expect(m, `chapitre ${c.index} : ${id}`).toBeDefined();
        expect(m?.chapter, id).toBe(c.index);
        expect(vues.has(id), `${id} dans deux chapitres`).toBe(false);
        vues.set(id, c.index);
      }
    }
    for (const m of MISSIONS) {
      if (m.chapter >= 0) expect(vues.get(m.id), `${m.id} absente des chapitres`).toBe(m.chapter);
      else expect(vues.has(m.id)).toBe(false);
    }
  });

  it('les textes de la carrière et de la campagne suivent la même typographie que les missions', () => {
    const textesCarriere = [
      ...CAREER_CHAPTERS.flatMap((c) => [c.title, c.description, c.requirement, ...c.unlocks]),
      CAMPAIGN_SEMAINE.title, CAMPAIGN_SEMAINE.description,
    ];
    for (const t of textesCarriere) {
      expect(t, 'espace ordinaire avant ponctuation haute').not.toMatch(/\S\u0020[;:!?»]/);
      expect(t, 'guillemet ouvrant sans espace insécable').not.toMatch(/«[^\u00a0]/);
      expect(t, 'apostrophe droite').not.toMatch(/'/);
    }
  });

  it('les déblocages de grade suivent la hiérarchie : on obtient à la fin d\'un chapitre le grade du suivant', () => {
    const libelles: Record<string, string> = {
      gardien: 'gardien de la paix', brigadier_chef: 'brigadier-chef', major: 'major', capitaine: 'capitaine', commandant: 'commandant',
    };
    for (let i = 1; i < 6; i++) {
      const suivant = CAREER_CHAPTERS[i + 1].rank;
      if (suivant === CAREER_CHAPTERS[i].rank) continue;
      expect(CAREER_CHAPTERS[i].unlocks.join(' | '), `chapitre ${i}`).toContain(`Grade de ${libelles[suivant]}`);
    }
    // l'école mène au chapitre 1 sans changer de grade ; aucun texte ne parle plus de groupe de sept
    for (const c of CAREER_CHAPTERS) expect(brut(c.title + ' ' + c.description)).not.toMatch(/sept\b|dix-huit|commissaire/i);
  });

  it('la montée en grade va du gardien stagiaire au commandant', () => {
    const grades = CAREER_CHAPTERS.slice(0, 9).map((c) => c.rank);
    expect(grades[0]).toBe('gardien_stagiaire');
    expect(grades).toContain('brigadier_chef');
    expect(grades).toContain('major');
    expect(grades).toContain('capitaine');
    expect(grades[grades.length - 1]).toBe('commandant');
    expect(CAREER_CHAPTERS.some((c) => (c.rank as string) === 'commissaire')).toBe(false);
  });

  it('la campagne « semaine de mobilisation » compte 5 à 7 missions du commandant qui s\'aggravent', () => {
    const actes = MISSIONS.filter((m) => m.tags.includes('semaine'));
    expect(actes.length).toBeGreaterThanOrEqual(5);
    expect(actes.length).toBeLessThanOrEqual(7);
    expect(CAMPAIGN_SEMAINE.acts).toHaveLength(actes.length);
    let tensionPrecedente = -1;
    let taillePrecedente = 0;
    CAMPAIGN_SEMAINE.acts.forEach((a, i) => {
      const m = missionById(a.missionId);
      expect(m, a.missionId).toBeDefined();
      if (!m) return;
      expect(m.role).toBe('commandant');
      expect(m.tags).toContain('semaine');
      expect(m.tags).toContain(`acte-${i + 1}`);
      expect(m.chapter).toBe(8);
      expect(m.crowd.tension).toBeGreaterThanOrEqual(tensionPrecedente);
      tensionPrecedente = m.crowd.tension;
      if (i < 5) {
        expect(m.crowd.size).toBeGreaterThanOrEqual(taillePrecedente);
        taillePrecedente = m.crowd.size;
      }
      expect(a.carryOver.length).toBeGreaterThanOrEqual(1);
    });
    const premier = missionById(CAMPAIGN_SEMAINE.acts[0].missionId);
    const dernier = missionById(CAMPAIGN_SEMAINE.acts[CAMPAIGN_SEMAINE.acts.length - 1].missionId);
    expect((dernier?.crowd.tension ?? 0) - (premier?.crowd.tension ?? 1)).toBeGreaterThanOrEqual(0.4);
    expect(CAREER_CHAPTERS[8].missions).toEqual(CAMPAIGN_SEMAINE.acts.map((a) => a.missionId));
  });
});
