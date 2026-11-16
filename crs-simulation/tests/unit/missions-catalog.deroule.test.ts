import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MissionDef, MissionObjective, ObjectiveKind } from '@/core/missions-schema';
import { decodePlaces } from '@/world/mapdata';
import type { RawPlaces } from '@/world/mapdata';
import { isRadioCallsign } from '@/gameplay/missions/catalog/dsl';
import { MISSIONS } from '@/gameplay/missions/catalog';

/*
 * Critères de recette du DÉROULÉ (phases, déclencheurs, messages, aléas de phase), posés à la relecture du
 * 16 novembre 2026 et devenus des tests une fois le déroulé des 129 missions réécrit. Chaque test relève
 * tous les défauts avant d'échouer : la liste attendue est vide.
 *
 * Principe d'écriture vérifié ici : les messages d'une phase sont émis à son DÉBUT. Ce sont donc des messages
 * REÇUS par le personnage (ordres, renseignements, demandes, voix de la rue) ; ils ne peuvent constater un
 * résultat que si la phase s'ouvre sur un objectif atteint (la phase précédente se termine par « objectif »).
 */

/** Texte sans espaces insécables ni apostrophes courbes, pour les contrôles. */
function brut(s: string): string {
  return s.replace(/[  ]/g, ' ').replace(/’/g, '\'');
}

/** Normalisation : minuscules, sans accents, ponctuation ramenée à des espaces. */
function norm(s: string): string {
  return brut(s).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Nombre de phrases d'un texte (une phrase compte au moins une douzaine de caractères). */
function phrases(t: string): number {
  return brut(t).split(/(?<=[.!?…»])\s+(?=[A-ZÀ-ÝŒ«])/).filter((x) => x.trim().length > 12).length;
}

const carte = decodePlaces(JSON.parse(readFileSync(resolve(__dirname, '../../public/data/paris/places.json'), 'utf8')) as RawPlaces);
/** Noms de la carte assez précis pour être reconnus dans une phrase (deux mots au moins). */
const NOMS_CARTE = [...new Set(carte.map((p) => norm(p.name)).filter((n) => n.split(' ').length >= 2 && n.length >= 8))];

/** Mots qui situent une scène quand le texte ne cite pas un nom de la carte. */
const MOT_DE_LIEU = /\b(rue|boulevard|avenue|place|pont|quai|carrefour|parvis|esplanade|jardin|cours|passage|station|métro|faubourg|berge|square|galerie|cour|gare|pelouse|trottoir|chaussée|façade|fourgon|cabine|tourelle|hall|porche|terrasse|angle|rond-point|voie|allée|toit|arcades|kiosque|fontaine|statue|colonne|obélisque|grille|vitrine|barricade|barrage|cortège|camion|engin|rédaction|commissariat|tribunal|hôpital|poste)\b/i;

/** Tournures qui constatent un résultat : interdites tant que la phase ne s'ouvre pas sur un objectif atteint. */
const RESULTATS: RegExp[] = [
  /\b(feu|feux|incendie|foyers?|flammes?|barricade|poubelles?|voiture|véhicule) (est |sont |a été |ont été )?(éteinte?s?|maîtrisée?s?|noyée?s?)\b/i,
  /\best (enfin )?(dégagée?|libérée?|évacuée?|éteinte?|levée?|rétablie?|rouverte?|sécurisée?)\b/i,
  /\bsont (enfin )?(dégagée?s|libérée?s|évacuée?s|éteinte?s|levée?s|sortis|sauvés|à l'abri)\b/i,
  /dispersion effective|chaussée libre|place nette|bouclage levé|nasse levée/i,
  /\b(UN|DEUX|TROIS|QUATRE|CINQ|SIX|SEPT|HUIT|NEUF|[Aa]ucun|un|[Dd]eux|[Tt]rois|[Qq]uatre|[Cc]inq|[Ss]ix|[Ss]ept|[Hh]uit|[Nn]euf|[Dd]ix|[Dd]ouze|[Qq]uinze|[Vv]ingt) (individus? )?interpellés?\b/,
  /aucun (blessé|mort)|pas de blessé|blessés légers seulement/i,
  /mission (accomplie|remplie|réussie|terminée)|objectif (atteint|rempli)/i,
  /bien joué|félicitations|beau travail|bon travail|bon boulot|chapeau bas/i,
  /(^|[.!?…] )Bravo\b|\bbravo\b/,
  /vous (avez|êtes) (réussi|sortis?|arrivée?s?|passée?s?|tenu|sauvé)/i,
  /(photo|image|vidéo|article|sujet) (est )?(publiée?|en ligne|parue?|diffusée?)\b/i,
  /\b(victime|blessée?|agent) (est )?(évacuée?|sauvée?|stabilisée?|extraite?|récupérée?|relevée?)\b/i,
  /\b(cible|objectif|suspect|individu) (est )?(interpellée?|menottée?|arrêtée?|maîtrisée?)\b/i,
];

/** Objectifs qui sont des garde-fous (« ne pas… », « protéger… ») : on ne les « atteint » pas, sauf s'ils portent une durée ou un compte. */
const GARDE_FOUS = new Set<ObjectiveKind>([
  'zero_bavure', 'limiter_blesses', 'limiter_degats', 'proteger_site', 'survivre', 'ne_pas_etre_interpelle', 'proteger_les_siens',
]);

/** Vrai si l'objectif peut clore une phase : principal, et doté d'un terme (lieu, compte, durée) que le cadre de mission peut constater. */
function atteignable(o: MissionObjective): boolean {
  if (o.secondary) return false;
  if (o.max !== undefined && o.count === undefined && o.seconds === undefined && o.place === undefined) return false;
  if (GARDE_FOUS.has(o.kind)) return (o.seconds ?? 0) >= 120 || (o.count ?? 0) >= 1;
  return true;
}

const ORDRE_FOULE = ['aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion'];
const DUREE_S: Record<string, number> = { courte: 600, standard: 1500, longue: 2700, temps_reel: 7200 };
const LETTRE: Record<string, string> = { temps: 'T', tension: 'X', phase_foule: 'C', objectif: 'O', fin: 'F' };

/** Indicatif du personnage incarné, quand le rôle en a un seul dans tout le catalogue. */
const INDICATIF_PROPRE: Partial<Record<MissionDef['role'], RegExp>> = {
  commandant: /^(MISTRAL|TRAMONTANE|SIROCCO|ZÉPHYR)$/, telepilote: /^ICARE$/, operateur_canon_eau: /^NEPTUNE 1$/, gendarme_centaure: /^CENTAURE 1$/,
};
const ROLES_CIVILS = new Set<MissionDef['role']>(['manifestant', 'journaliste', 'street_medic']);

/** Vrai si la phase d'indice i s'ouvre sur un objectif atteint. */
function ouverteSurObjectif(m: MissionDef, i: number): boolean {
  return i > 0 && m.phases[i - 1].until.kind === 'objectif';
}

describe('déroulé des missions : les cinq critères de recette', () => {
  it('chaque texte de phase décrit la scène en deux phrases au moins, lieu compris', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      for (const p of m.phases) {
        const t = brut(p.text);
        if (phrases(t) < 2) defauts.push(`${m.id} · ${p.id} : une seule phrase`);
        if (t.length < 120) defauts.push(`${m.id} · ${p.id} : ${t.length} caractères`);
        if (t.length > 420) defauts.push(`${m.id} · ${p.id} : ${t.length} caractères, trop long pour un bandeau`);
        const n = norm(t);
        if (!MOT_DE_LIEU.test(t) && !NOMS_CARTE.some((x) => n.includes(x))) defauts.push(`${m.id} · ${p.id} : aucun lieu`);
      }
    }
    expect(defauts).toEqual([]);
  });

  it('dans chaque mission, deux phases au moins nomment un lieu de la vraie carte', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      const n = m.phases.filter((p) => { const t = norm(p.text); return NOMS_CARTE.some((x) => t.includes(x)); }).length;
      if (n < 2) defauts.push(`${m.id} : ${n} phase(s)`);
    }
    expect(defauts).toEqual([]);
  });

  it('aucun titre de phase passe-partout : huit caractères au moins, jamais repris plus de trois fois', () => {
    const emplois = new Map<string, string[]>();
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      for (const p of m.phases) {
        const k = norm(p.title);
        emplois.set(k, [...(emplois.get(k) ?? []), m.id]);
        if (brut(p.title).length < 8) defauts.push(`${m.id} · ${p.id} : « ${p.title} »`);
      }
    }
    for (const [titre, ids] of emplois) if (ids.length > 3) defauts.push(`« ${titre} » repris ${ids.length} fois`);
    expect(defauts).toEqual([]);
    // les titres relevés à la relecture ne reviennent pas, même une fois
    for (const banal of ['fin', 'depart', 'evacuation', 'dispersion', 'repli', 'suite', 'suites', 'retour', 'arrivee']) {
      expect(emplois.has(banal), `titre « ${banal} »`).toBe(false);
    }
  });

  it('dans chaque mission, une phase au moins se termine sur un objectif atteint : principal, et que l\'on peut atteindre', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      const objectifs = new Map(m.objectives.map((o) => [o.id, o]));
      let n = 0;
      for (const p of m.phases) {
        if (p.until.kind !== 'objectif') continue;
        const o = objectifs.get(p.until.id);
        if (o === undefined) defauts.push(`${m.id} · ${p.id} : objectif inconnu « ${p.until.id} »`);
        else if (!atteignable(o)) defauts.push(`${m.id} · ${p.id} : « ${o.text} » (${o.kind}) est un garde-fou ou un objectif secondaire`);
        else n++;
      }
      if (n < 1) defauts.push(`${m.id} : aucune phase ne se termine sur un objectif`);
    }
    expect(defauts).toEqual([]);
  });

  it('aucun message écrit d\'avance n\'annonce un résultat qui dépend du joueur', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      m.phases.forEach((p, i) => {
        if (ouverteSurObjectif(m, i)) return;
        const textes = [p.text, ...p.events, ...p.radio.map((r) => r.text)].map(brut);
        for (const t of textes) {
          for (const re of RESULTATS) {
            const trouve = re.exec(t);
            if (trouve !== null) defauts.push(`${m.id} · ${p.id} : « ${trouve[0]} »`);
          }
          // le commandant fait lui-même les sommations : aucun message ne les dit faites à sa place
          if (m.role === 'commandant' && /sommations? (est |sont )?(faites?|prononcées?)/i.test(t)) defauts.push(`${m.id} · ${p.id} : sommation annoncée à la place du commandant`);
        }
      });
    }
    expect(defauts).toEqual([]);
  });

  it('chaque mission compte au moins six messages et trois aléas de phase ; aucune phase n\'est muette', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      const messages = m.phases.reduce((s, p) => s + p.radio.length, 0);
      const aleas = m.phases.reduce((s, p) => s + p.events.length, 0);
      if (messages < 6) defauts.push(`${m.id} : ${messages} message(s)`);
      if (aleas < 3) defauts.push(`${m.id} : ${aleas} aléa(s) de phase`);
      for (const p of m.phases) {
        if (p.radio.length < 1) defauts.push(`${m.id} · ${p.id} : aucun message`);
        for (const e of p.events) if (brut(e).length < 12) defauts.push(`${m.id} · ${p.id} : aléa « ${e} » trop court`);
      }
    }
    expect(defauts).toEqual([]);
  });
});

describe('déroulé des missions : déclencheurs', () => {
  it('un seuil de tension laisse une marge au départ et les seuils vont croissant ; jamais de tension sans foule', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      let dernier = m.crowd.tension;
      for (const p of m.phases) {
        if (p.until.kind !== 'tension') continue;
        if (m.crowd.size === 0) defauts.push(`${m.id} · ${p.id} : seuil de tension sans foule`);
        if (p.until.above < m.crowd.tension + 0.08 - 1e-9) defauts.push(`${m.id} · ${p.id} : seuil ${p.until.above} trop près de la tension de départ ${m.crowd.tension}`);
        if (dernier !== m.crowd.tension && p.until.above <= dernier) defauts.push(`${m.id} · ${p.id} : seuil ${p.until.above} après ${dernier}`);
        dernier = p.until.above;
      }
    }
    expect(defauts).toEqual([]);
  });

  it('les phases de foule attendues se suivent dans l\'ordre du cortège ; jamais sans foule', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      let rang = -1;
      for (const p of m.phases) {
        if (p.until.kind !== 'phase_foule') continue;
        const k = ORDRE_FOULE.indexOf(p.until.phase);
        if (m.crowd.size === 0) defauts.push(`${m.id} · ${p.id} : phase de foule sans foule`);
        if (k <= rang) defauts.push(`${m.id} · ${p.id} : « ${p.until.phase} » attendue trop tard`);
        rang = k;
      }
    }
    expect(defauts).toEqual([]);
  });

  it('les phases minutées tiennent dans la durée, échec « temps » compris', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      const minutees = m.phases.reduce((s, p) => s + (p.until.kind === 'temps' ? p.until.seconds : 0), 0);
      const limites = m.failures.filter((e) => e.kind === 'temps' && e.value !== undefined).map((e) => e.value as number);
      const borne = 0.85 * Math.min(DUREE_S[m.duration], ...limites);
      if (minutees > borne) defauts.push(`${m.id} : ${minutees} s minutées pour ${borne} s`);
    }
    expect(defauts).toEqual([]);
  });

  it('les déroulés sont variés : trois à sept phases, aucun gabarit de déclencheurs dominant', () => {
    const gabarits = new Map<string, number>();
    const longueurs = new Map<number, number>();
    for (const m of MISSIONS) {
      expect(m.phases.length, m.id).toBeGreaterThanOrEqual(3);
      expect(m.phases.length, m.id).toBeLessThanOrEqual(7);
      const g = m.phases.map((p) => LETTRE[p.until.kind]).join('');
      gabarits.set(g, (gabarits.get(g) ?? 0) + 1);
      longueurs.set(m.phases.length, (longueurs.get(m.phases.length) ?? 0) + 1);
    }
    // relevé de la première version : 100 missions sur 129 suivaient deux gabarits, 117 comptaient quatre phases
    expect(gabarits.size).toBeGreaterThanOrEqual(30);
    expect(Math.max(...gabarits.values()) / MISSIONS.length).toBeLessThanOrEqual(0.1);
    expect(longueurs.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...longueurs.values()) / MISSIONS.length).toBeLessThanOrEqual(0.6);
  });
});

describe('déroulé des missions : qui parle', () => {
  it('le personnage incarné ne parle pas dans les messages écrits d\'avance : ni « VOUS », ni son propre indicatif', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      for (const p of m.phases) {
        for (const r of p.radio) {
          if (r.from === 'VOUS' || r.from === 'JOUEUR') defauts.push(`${m.id} · ${p.id} : message sous « ${r.from} »`);
          if (INDICATIF_PROPRE[m.role]?.test(r.from) === true) defauts.push(`${m.id} · ${p.id} : message émis par ${r.from}, indicatif du personnage`);
        }
      }
    }
    expect(defauts).toEqual([]);
  });

  it('un civil n\'a pas la radio de la police : manifestant, journaliste et secouriste de rue n\'entendent que des voix', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      if (!ROLES_CIVILS.has(m.role)) continue;
      for (const p of m.phases) for (const r of p.radio) if (isRadioCallsign(r.from)) defauts.push(`${m.id} · ${p.id} : ${r.from}`);
    }
    expect(defauts).toEqual([]);
  });

  it('à la radio, les nombres se disent chiffre par chiffre : ni chiffre arabe, ni dizaine ou centaine en toutes lettres', () => {
    const defauts: string[] = [];
    for (const m of MISSIONS) {
      for (const p of m.phases) {
        for (const r of p.radio) {
          if (!isRadioCallsign(r.from)) continue;
          const t = brut(r.text);
          if (/\d/.test(t)) defauts.push(`${m.id} · ${p.id} : chiffre arabe dans « ${t} »`);
          // seule tolérance, reprise des exemples de la bible (E.6) : une distance ronde, « CENT mètres »
          if (/\b(DIX|ONZE|DOUZE|TREIZE|QUATORZE|QUINZE|SEIZE|VINGT|TRENTE|QUARANTE|CINQUANTE|SOIXANTE|QUATRE-VINGTS?|CENT)\b(?! MILLE)/.test(t.replace(/CENT mètres/g, ''))) {
            defauts.push(`${m.id} · ${p.id} : nombre non épelé dans « ${t} »`);
          }
          if (t.length > 330) defauts.push(`${m.id} · ${p.id} : message radio de ${t.length} caractères`);
        }
      }
    }
    expect(defauts).toEqual([]);
  });
});
