/* =====================================================================================
 * Droit — appréciation de CHAQUE emploi de la force (LawApi.reportForce).
 *
 * Ordre d'examen (le premier manquement retenu fait le verdict) :
 *   1. moyens interdits par nature : véhicule contre des personnes, arme de service hors légitime
 *      défense ;
 *   2. cible illégitime : journaliste identifiable, secouriste, observateur, passant, enfant, tant
 *      qu'ils ne commettent pas eux-mêmes de violences ;
 *   3. état de la personne visée : entravée, à terre, déjà maîtrisée, mains en l'air ou assise, en
 *      fuite → disproportionné ;
 *   4. règles propres à chaque arme : LBD (objectif individualisé, auteur de violences à l'instant,
 *      jamais en dispersion, 10 à 50 m, tête interdite), grenade de désencerclement (unité prise à
 *      partie seulement), lanceur (tir tendu interdit), grenades en milieu clos ;
 *   5. cadre juridique : riposte directe (violences contre les forces, art. L. 211-9 al. 6), défense
 *      de soi ou d'autrui, ou sommations (annonce + deux sommations + délai ; réitération pour les
 *      lanceurs et les grenades assourdissantes) → sinon « sans sommation » ;
 *   6. proportionnalité : menace que présente la personne, zone où ne se trouvent que des tiers,
 *      foule encerclée sans issue, force poursuivie après la dispersion ;
 *   7. ordre de la hiérarchie → sinon « non autorisé ».
 *
 * Matrice de référence : docs/research/00-bible-realisme.md A.4 (annexe VIII de l'instruction du
 * 2 août 2017). Chaque acte est inscrit au journal avec la mention filmé ou non ; le verdict peut
 * être révisé quand l'impact est connu (tête atteinte, tir tendu constaté).
 * ===================================================================================== */

import type { DamageInfo, EntityId, ForceMeans, ForceVerdict, ForceVerdictKind, Person } from '@/core/contracts';
import { FORCE_LEVEL_OF } from '@/core/contracts';
import { CAMERA_THIRD_PARTY } from './api';
import type { ForceRecord, LegalFrame } from './api';
import { FORCE_LOG_MAX, FORCE_LOG_TRIM, HURT_LINK_WINDOW, INDIVIDUAL_MEANS, MERGE_WINDOW } from './config';
import type { Kernel } from './kernel';
import { PROTECTED_LABELS } from './perception';
import type { ProtectedKind } from './perception';
import { LEVEL_NAMES, MEANS_OF, MEANS_SHORT, STAGE_NAMES, secondsText } from './texts';
import { rankLevel } from '@/core/stores';

/** Verdict rendu quand l'auteur n'appartient pas aux forces de l'ordre (non inscrit au journal). */
const CIVIL_VERDICT: ForceVerdict = Object.freeze({
  kind: 'interdit' as const,
  reason: "Violences commises par une personne étrangère aux forces de l'ordre : ce n'est pas un emploi de la force publique mais une infraction, inscrite à son encontre.",
  severity: 0,
});

const PROTECTED_WHY: Readonly<Record<ProtectedKind, string>> = {
  '': '',
  collegue: '',
  enfant: "L'emploi de la force contre un enfant est une faute lourde, quelles que soient les circonstances.",
  journaliste: 'Les journalistes circulent librement dans le dispositif et peuvent rester pendant la dispersion : toute force ou entrave à leur encontre est une faute lourde (schéma national du maintien de l\'ordre).',
  secouriste: 'Les secouristes portent assistance aux blessés des deux camps : ils ne sont jamais une cible.',
  observateur: "Les observateurs indépendants peuvent rester sur place tant qu'ils ne se confondent pas avec les participants.",
  passant: 'Cette personne est étrangère à la manifestation.',
};

/** Nombre de lignes du journal relues, au plus, pour reconnaître un geste déjà déclaré. */
const MERGE_SCAN = 256;
/** Durée de validité du constat d'un tir tendu (s). */
const FLAT_SHOT_MEMORY = 1.5;
/** Rayon autour du point d'impact d'un véhicule où l'on cherche une personne heurtée (m). */
const VEHICLE_HIT_RADIUS = 2.2;
/** Distance et effectif qui caractérisent la prise à partie d'un agent par un groupe. */
const PRESSED_RADIUS = 12;
const PRESSED_COUNT = 4;
const PRESSED_ATTACK_RADIUS = 40;
const CAPTAIN = rankLevel('capitaine');

function round(d: number): number {
  return Math.round(d);
}

/** « aucune personne », « 1 personne », « 3 personnes ». */
function people(n: number): string {
  return n === 0 ? 'aucune personne' : n === 1 ? '1 personne' : n + ' personnes';
}

export class ForceJudge {
  // résultat de l'examen en cours
  private kind: ForceVerdictKind = 'licite';
  private reason = '';
  private severity = 0;
  private frame: LegalFrame = 'aucun';
  private distance = 0;

  /** Agent → instant de son dernier tir tendu constaté au lanceur. */
  private readonly flat = new Map<EntityId, number>();
  private readonly dry: ForceVerdict = { kind: 'licite', reason: '', severity: 0 };
  private excludeA: EntityId = 0;
  private excludeVehicle: EntityId = 0;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.flat.clear();
  }

  private readonly hitCandidate = (p: Person): boolean =>
    p.faction !== 'police' && p.id !== this.excludeA && (p.vehicleId === 0 || p.vehicleId !== this.excludeVehicle);

  private set(kind: ForceVerdictKind, frame: LegalFrame, severity: number, reason: string): void {
    this.kind = kind;
    this.frame = frame;
    this.severity = severity;
    this.reason = reason;
  }

  // ───────────────────────────── déclaration ─────────────────────────────

  /** Déclare un emploi de la force : évalue, inscrit au journal, émet law:force. */
  report(by: Person, means: ForceMeans, target: Person | null, x: number, z: number, auto = false): ForceVerdict {
    const k = this.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    if (FORCE_LEVEL_OF[means] === undefined) means = 'contact';
    if (target === by) target = null;

    if (by.faction !== 'police') {
      // un manifestant qui frappe ne « fait pas usage de la force » : il commet une infraction
      if (means !== 'presence') k.offenses.record(by, target && target.faction === 'police' ? 'violence_agent' : 'violence', by.x, by.z);
      return CIVIL_VERDICT;
    }

    // même geste déjà déclaré (jet continu, double signalement) : même verdict, pas de nouvelle ligne
    const log = k.records.forces;
    const targetId = target ? target.id : 0;
    const window = MERGE_WINDOW[means];
    const floor = log.length > MERGE_SCAN ? log.length - MERGE_SCAN : 0;
    for (let i = log.length - 1; i >= floor; i--) {
      const r = log[i]!;
      if (now - r.t > window) break;
      if (r.byId !== by.id || r.means !== means || r.targetId !== targetId) continue;
      if (targetId !== 0) return r.verdict;
      const dx = r.x - x;
      const dz = r.z - z;
      if (dx * dx + dz * dz <= 9) return r.verdict;
    }

    this.evaluate(by, means, target, x, z, now);

    const cameras = means === 'presence' ? 0 : k.eyes.cameras(target ? target.x : x, target ? target.z : z, by.id, by);
    const verdict: ForceVerdict = { kind: this.kind, reason: this.reason, severity: this.severity };
    const record: ForceRecord = {
      t: now, byId: by.id, means, targetId, x, z, verdict,
      filmed: (cameras & CAMERA_THIRD_PARTY) !== 0,
      frame: this.frame, distance: this.distance, targetName: target ? target.name : '', cameras,
      lawfulForce: k.roe.lawfulForce, authorizedForce: k.roe.authorizedForce, sommation: k.roe.sommation,
      amended: false, auto,
    };
    if (log.length >= FORCE_LOG_MAX) log.splice(0, FORCE_LOG_TRIM);
    log.push(record);
    ctx.events.emit('law:force', { report: record });
    this.consequences(record, by, target);
    return verdict;
  }

  /**
   * Verdict qu'obtiendrait cet emploi de la force, sans rien inscrire ni émettre (aide à la décision
   * des IA et de l'interface). L'objet retourné est réutilisé d'un appel à l'autre.
   */
  assess(by: Person, means: ForceMeans, target: Person | null, x: number, z: number): ForceVerdict {
    if (by.faction !== 'police') return CIVIL_VERDICT;
    if (FORCE_LEVEL_OF[means] === undefined) means = 'contact';
    this.evaluate(by, means, target === by ? null : target, x, z, this.k.ctx.clock.now);
    const v = this.dry;
    v.kind = this.kind;
    v.reason = this.reason;
    v.severity = this.severity;
    return v;
  }

  /** Suites d'un verdict : message au joueur, plainte probable, tension, dossier d'interpellation. */
  private consequences(record: ForceRecord, by: Person, target: Person | null): void {
    const k = this.k;
    const v = record.verdict;
    if (target) k.custody.noteForce(target.id, record);
    if (v.kind === 'licite') {
      if (record.means === 'arme_feu') k.notify(by, "Tir de l'arme de service : une enquête est systématiquement ouverte.", 'warn', 8);
      return;
    }
    k.notify(by, 'Faute — ' + v.reason, 'alert', 9);
    if (target && target.faction !== 'police') {
      k.records.addComplaint(
        record.t, 'force', target, by.id,
        'emploi ' + MEANS_OF[record.means] + ' jugé ' + (v.kind === 'cible_illegitime' ? 'illégitime' : v.kind === 'interdit' ? 'interdit'
          : v.kind === 'disproportionne' ? 'disproportionné' : v.kind === 'sans_sommation' ? 'irrégulier (sans sommation)' : 'irrégulier (sans ordre)'),
        v.severity, record.filmed,
      );
    }
    // un emploi irrégulier de la force, surtout filmé, échauffe la foule
    k.ctx.director.addTension(0.006 * v.severity * (record.filmed ? 1.5 : 1), record.x, record.z, 'Emploi irrégulier de la force (' + MEANS_SHORT[record.means] + ')');
  }

  // ───────────────────────────── examen ─────────────────────────────

  private evaluate(by: Person, means: ForceMeans, target: Person | null, x: number, z: number, now: number): void {
    const k = this.k;
    const ctx = k.ctx;
    const cfg = k.cfg;
    const eyes = k.eyes;
    const som = k.sommations;
    const roe = k.roe;
    const level = FORCE_LEVEL_OF[means];
    const tx = target ? target.x : x;
    const tz = target ? target.z : z;
    const dist = Math.sqrt((tx - by.x) * (tx - by.x) + (tz - by.z) * (tz - by.z));
    this.distance = dist;
    const of = MEANS_OF[means];

    if (means === 'presence') {
      this.set('licite', 'contact', 0, 'Présence dissuasive : aucun acte de contrainte.');
      return;
    }

    // ── véhicule : jamais contre des personnes ──
    if (means === 'vehicule') {
      let victim: Person | null = target && target.faction !== 'police' ? target : null;
      if (!victim) {
        this.excludeA = by.id;
        this.excludeVehicle = by.vehicleId;
        victim = ctx.people.nearest(x, z, VEHICLE_HIT_RADIUS, this.hitCandidate);
      }
      if (victim) {
        this.set('interdit', 'aucun', 5, 'Véhicule employé contre des personnes (' + victim.name + ") : un véhicule n'est jamais un moyen de contrainte ni de dispersion. Seul le dégagement d'un obstacle, vérifié sans personne, est permis. Faute lourde.");
      } else {
        this.set('licite', 'contact', 0, "Véhicule employé pour dégager un obstacle, personne à proximité : licite.");
      }
      return;
    }

    // ── qui est visé ? ──
    let threat = 0;
    let recent = false;
    let threatLabel = '';
    let prot: ProtectedKind = '';
    if (target) {
      threat = eyes.threat(target, now);
      recent = eyes.threatRecent;
      threatLabel = eyes.threatLabel;
      prot = eyes.protectedKind(target);
    }
    const name = target ? target.name : '';
    const violentNow = recent && threat >= 3;
    const riposte = k.attack.near(by.x, by.z, cfg.riposteRadius) && k.attack.near(tx, tz, cfg.riposteRadius + 15);

    if (target && prot !== '' && !violentNow) {
      if (prot === 'collegue') {
        if (means === 'contact') {
          this.set('licite', 'contact', 0, "Geste d'assistance à un collègue : ce n'est pas un emploi de la force.");
        } else {
          this.set('cible_illegitime', 'aucun', level >= 4 ? 5 : 3, 'Emploi ' + of + ' contre un collègue (' + name + ') : rien ne le justifie.');
        }
        return;
      }
      // l'interpellation d'un auteur d'infraction reste possible quelle que soit sa qualité ;
      // après les sommations, le refoulement s'applique aussi aux passants restés sur place
      const arrestable = means === 'contact' && k.offenses.canArrest(target);
      const pushedBack = means === 'contact' && prot === 'passant' && roe.sommation === 3 && now >= som.forceFrom && som.inZone(tx, tz);
      if (!arrestable && !pushedBack) {
        const sev = prot === 'enfant' ? (level >= 2 ? 5 : 4) : level >= 4 ? 5 : level >= 2 ? 4 : 3;
        this.set('cible_illegitime', 'aucun', sev, 'Emploi ' + of + ' contre ' + PROTECTED_LABELS[prot] + ' (' + name + ') qui ne commettait aucune violence. ' + PROTECTED_WHY[prot]);
        return;
      }
    }

    const bound = target !== null && (target.custody === 'cuffed' || target.custody === 'escorted' || target.custody === 'in_vehicle' || target.custody === 'handed_over');
    const down = target !== null && (target.posture === 'down' || target.posture === 'prone' || ctx.health.isIncapacitated(target));

    // ── arme de service : légitime défense seulement ──
    if (means === 'arme_feu') {
      const lethal = target !== null && !bound && !down && eyes.lethal(target, now);
      if (lethal) {
        this.set('licite', 'legitime_defense', 0, "Usage de l'arme de service en légitime défense : " + name + ', ' + threatLabel + ", portait une atteinte grave et actuelle à la vie ou à l'intégrité physique (art. L. 435-1 du code de la sécurité intérieure). Une enquête est systématiquement ouverte après un tir.");
      } else {
        this.set('interdit', 'aucun', 5, "Usage de l'arme de service hors légitime défense : " + (target ? name + ' (' + threatLabel + ') ne portait aucune atteinte' : 'personne ne portait atteinte de façon') + " grave et actuelle à la vie. L'arme à feu n'est jamais un moyen de maintien de l'ordre : absolue nécessité et stricte proportionnalité (art. L. 435-1 du code de la sécurité intérieure).");
      }
      return;
    }

    // ── état de la personne visée ──
    if (target && level >= 2 && INDIVIDUAL_MEANS[means]) {
      if (bound) {
        this.set('disproportionne', 'aucun', 5, 'Emploi ' + of + ' contre ' + name + ', déjà entravé : toute personne appréhendée est placée sous la protection des policiers et préservée de toute violence (art. R. 434-17 du code de la sécurité intérieure). Faute lourde.');
        return;
      }
      if (down) {
        this.set('disproportionne', 'aucun', means === 'gazeuse' ? 4 : 5, 'Emploi ' + of + ' contre ' + name + ", à terre et hors d'état de nuire : la force cesse dès que la personne ne présente plus de danger. Faute lourde.");
        return;
      }
      if (target.custody === 'held') {
        this.set('disproportionne', 'aucun', 4, 'Emploi ' + of + ' contre ' + name + ', déjà maîtrisé par un agent : la force strictement nécessaire à la maîtrise ne va pas au-delà.');
        return;
      }
      if (target.upper === 'hands_up' || target.posture === 'kneel' || target.posture === 'sit') {
        this.set('disproportionne', 'aucun', 4, 'Emploi ' + of + ' contre ' + name + ', ' + (target.upper === 'hands_up' ? "qui avait les mains en l'air" : 'qui était au sol, immobile') + ', sans geste hostile : seule une interpellation sans violence était proportionnée.');
        return;
      }
      if (eyes.fleeing(by, target)) {
        this.set('disproportionne', 'aucun', means === 'lbd' ? 4 : 3, 'Emploi ' + of + ' contre ' + name + ', qui prenait la fuite et ne présentait plus de menace : la force ne sert pas à punir. Il restait possible de l\'interpeller.');
        return;
      }
    }

    // ── lanceur de balles de défense ──
    if (means === 'lbd') {
      if (!target) {
        this.set('interdit', 'aucun', 4, "Tir de LBD sans objectif individualisé : le lanceur de balles de défense ne se tire jamais « dans la foule ». Le tireur vise une personne précise, auteur de violences.");
        return;
      }
      if (dist < cfg.lbdMinRange && !eyes.lethal(target, now)) {
        this.set('interdit', 'aucun', 4, 'Tir de LBD à ' + round(dist) + ' m : en deçà de ' + round(cfg.lbdMinRange) + " m, le risque de lésion grave interdit le tir, sauf péril imminent pour la vie.");
        return;
      }
      if (!violentNow) {
        if (!riposte) {
          this.set('interdit', 'aucun', threat === 0 ? 5 : 4, 'Tir de LBD sur ' + name + ' (' + threatLabel + ") alors qu'aucune violence n'était exercée contre les forces : le LBD n'est jamais un moyen de dispersion, même après les sommations. Il ne répond qu'à des violences (riposte directe ou légitime défense).");
        } else {
          this.set('disproportionne', 'aucun', 4, 'Tir de LBD sur ' + name + ' (' + threatLabel + ") : des violences visaient bien les forces, mais cette personne n'en était pas l'auteur à l'instant. Le tir ne peut viser que l'auteur de violences qui viennent d'être constatées.");
        }
        return;
      }
      if (dist > cfg.lbdMaxRange) {
        this.set('disproportionne', 'aucun', 2, 'Tir de LBD à ' + round(dist) + ' m, au-delà de la portée utile de ' + round(cfg.lbdMaxRange) + ' m : précision insuffisante, risque pour les tiers.');
        return;
      }
      this.set('licite', riposte ? 'riposte' : 'legitime_defense', 0, 'Tir de LBD à ' + round(dist) + ' m sur ' + name + ', ' + threatLabel + " : riposte individualisée à des violences, sans sommation requise (art. L. 211-9 al. 6 et D. 211-19 du code de la sécurité intérieure). Torse ou membres seulement ; rendre compte et faire vérifier l'état de la personne.");
      return;
    }

    // ── grenade de désencerclement ──
    if (means === 'desencerclement') {
      if (ctx.world.surfaceAt(x, z) === 'interior') {
        this.set('interdit', 'aucun', 4, "Grenade de désencerclement lancée en milieu clos : emploi proscrit.");
        return;
      }
      const around = eyes.hostilesNear(by.x, by.z, PRESSED_RADIUS);
      const attacked = k.attack.near(by.x, by.z, PRESSED_ATTACK_RADIUS);
      if (around < PRESSED_COUNT || !attacked) {
        this.set('interdit', 'aucun', 4, "Grenade de désencerclement lancée hors situation d'encerclement ou de prise à partie (" + (around < PRESSED_COUNT ? people(around) + ' à moins de ' + PRESSED_RADIUS + ' m' : "aucune violence contre l'unité") + ") : elle est réservée à l'unité encerclée ou prise à partie par un groupe violent, jamais à la dispersion.");
        return;
      }
      this.set('licite', 'riposte', 0, 'Grenade de désencerclement : unité prise à partie par un groupe violent (' + around + ' personnes à moins de ' + PRESSED_RADIUS + ' m). Emploi conforme, lancer au ras du sol ; rendre compte.');
      return;
    }

    // ── contact : niveau minimal de la gradation ──
    if (means === 'contact') {
      if (target && k.offenses.canArrest(target)) {
        this.set('licite', 'contact', 0, 'Contact physique pour interpeller ' + name + ' en flagrant délit : force strictement nécessaire à la maîtrise.');
      } else {
        this.set('licite', 'contact', 0, 'Contact physique au niveau minimal de la gradation (saisie, maîtrise, poussée au bouclier) : licite tant qu\'il reste nécessaire.');
      }
      return;
    }

    // ── bâton, aérosol, grenades, engin lanceur d'eau ──
    const launcher = means === 'gm2l' || (means === 'lacrymo' && eyes.usesLauncher(by));
    if (launcher && this.flatShot(by.id, now)) {
      this.set('interdit', 'aucun', 4, 'Tir tendu au lanceur de grenades : strictement interdit. Seul le tir courbe est permis, pour que personne ne soit directement atteint.');
      return;
    }
    if ((means === 'lacrymo' || means === 'gm2l') && ctx.world.surfaceAt(x, z) === 'interior') {
      this.set('interdit', 'aucun', 3, 'Emploi ' + of + ' dans un local clos : proscrit, le gaz ne peut pas se dissiper et personne ne peut fuir.');
      return;
    }

    let frame: LegalFrame;
    if (riposte) {
      frame = 'riposte';
    } else if (violentNow && INDIVIDUAL_MEANS[means]) {
      frame = 'legitime_defense';
    } else {
      const stage = roe.sommation;
      if (stage < 3) {
        const done = stage === 0 ? "qu'aucune annonce ni sommation n'a été prononcée" : stage === 1 ? "que seule l'annonce a été faite" : 'que seule la première sommation a été faite';
        this.set('sans_sommation', 'aucun', level >= 4 ? 5 : level === 3 ? 4 : 3, 'Emploi ' + of + ' alors ' + done + " et qu'aucune violence n'était exercée contre les forces : un attroupement ne se dissipe par la force qu'après l'annonce et deux sommations de l'autorité habilitée (art. L. 211-9 du code de la sécurité intérieure).");
        return;
      }
      if (now < som.forceFrom) {
        this.set('sans_sommation', 'aucun', level >= 3 ? 3 : 2, 'Emploi ' + of + ' ' + secondsText(now - roe.sommationAt) + ' seulement après la ' + STAGE_NAMES[3] + ' : la foule doit avoir le temps et la possibilité matérielle de se disperser (encore ' + secondsText(som.forceFrom - now) + ').');
        return;
      }
      if (!som.inZone(x, z)) {
        this.set('sans_sommation', 'aucun', 3, 'Emploi ' + of + ' à plus de ' + round(cfg.sequenceRadius) + " m du lieu des sommations : elles ne valent que pour le compartiment de terrain où elles ont été faites, et sont à refaire ici.");
        return;
      }
      if (launcher) {
        if (!som.reiterated) {
          this.set('sans_sommation', 'aucun', 3, 'Emploi ' + of + (means === 'lacrymo' ? ' au lanceur' : '') + " sans réitération de la dernière sommation : l'usage des armes (lanceurs, grenades assourdissantes) exige qu'elle soit répétée (art. R. 211-11). Après deux sommations, seules les grenades lancées à la main sont permises.");
          return;
        }
        if (now < som.armsFrom) {
          this.set('sans_sommation', 'aucun', 2, 'Emploi ' + of + ' trop tôt après la réitération de la dernière sommation (encore ' + secondsText(som.armsFrom - now) + ').');
          return;
        }
        frame = 'armes';
      } else {
        frame = 'sommations';
      }
    }

    // zone visée : y a-t-il autre chose que des tiers ?
    if (!INDIVIDUAL_MEANS[means]) {
      eyes.areaCensus(x, z, cfg.areaRadius);
      if (eyes.areaParticipants === 0 && eyes.areaProtected > 0) {
        this.set('cible_illegitime', 'aucun', 4, 'Emploi ' + of + ' sur une zone où ne se trouvaient que des tiers (' + people(eyes.areaProtected) + (eyes.areaProtected > 1 ? ' étrangères' : ' étrangère') + " à l'attroupement : passants, secouristes ou journalistes).");
        return;
      }
    }

    // proportionnalité : le bâton répond à une résistance active, pas à une présence
    if (means === 'baton' && target && threat < 2) {
      this.set('disproportionne', 'aucun', 3, 'Coup de bâton sur ' + name + ' (' + threatLabel + ") : le bâton ne répond qu'à une résistance active ou à des violences. Contre une personne non menaçante, seuls le refoulement et l'interpellation sont proportionnés.");
      return;
    }

    // une foule sans issue ne peut pas se disperser : la force n'a alors aucun objet
    if ((frame === 'sommations' || frame === 'armes') && som.enclosed && !violentNow) {
      this.set('disproportionne', 'aucun', 3, 'Emploi ' + of + " pour disperser une foule encerclée, sans issue libre : elle n'a pas la possibilité matérielle de partir. Une issue contrôlée doit être ouverte avant tout emploi de la force.");
      return;
    }

    // la force prend fin quand le trouble a cessé
    if ((frame === 'sommations' || frame === 'armes') && som.pursued(now) && !violentNow) {
      this.set('disproportionne', 'aucun', 3, 'Emploi ' + of + " alors que l'attroupement était dispersé depuis " + secondsText(now - som.dispersedSince) + " : l'emploi de la force doit prendre fin dès que le trouble a cessé (art. R. 211-13 du code de la sécurité intérieure).");
      return;
    }

    // ordre de la hiérarchie
    if (frame !== 'legitime_defense' && !this.commands(by)) {
      const auth = som.authorizedFor(by, frame === 'riposte');
      if (level > auth) {
        this.set('non_autorise', frame, level >= 4 ? 3 : 2, 'Emploi ' + of + " sans ordre : la hiérarchie n'a autorisé que le niveau " + auth + ' (' + LEVEL_NAMES[auth] + '), ce moyen relève du niveau ' + level + ". Le cadre légal était réuni, mais l'initiative n'appartient pas à l'agent.");
        return;
      }
    }

    if (frame === 'riposte') {
      this.set('licite', frame, 0, 'Emploi ' + of + " en riposte à des violences exercées à l'instant contre les forces : emploi direct de la force, sans sommation (art. L. 211-9 al. 6 du code de la sécurité intérieure). Riposte proportionnée.");
    } else if (frame === 'legitime_defense') {
      this.set('licite', frame, 0, 'Emploi ' + of + ' contre ' + name + ', ' + threatLabel + ' : défense immédiate et proportionnée de soi ou d\'autrui.');
    } else if (frame === 'armes') {
      this.set('licite', frame, 0, 'Emploi ' + of + " après réitération de la dernière sommation, sur ordre : usage des armes régulier (art. R. 211-11 et D. 211-17 du code de la sécurité intérieure).");
    } else {
      this.set('licite', frame, 0, 'Emploi ' + of + " après l'annonce et les deux sommations, délai respecté : emploi de la force régulier.");
    }
  }

  /** L'agent décide lui-même des moyens : le commandant, autorité habilitée (docs/BRIEF.md §1, « un seul chef »). */
  private commands(by: Person): boolean {
    return by.kind === 'commissaire' || by.poste === 'autorite_civile' || by.poste === 'commandant_unite' || rankLevel(by.rank) >= CAPTAIN;
  }

  // ───────────────────────────── révisions après coup ─────────────────────────────

  private flatShot(byId: EntityId, now: number): boolean {
    const t = this.flat.get(byId);
    return t !== undefined && now - t <= FLAT_SHOT_MEMORY;
  }

  /** Dernière déclaration de cet agent avec ce moyen, dans la fenêtre donnée ; `targetId` 0 = n'importe quelle cible. */
  private recent(byId: EntityId, means: ForceMeans, targetId: EntityId, window: number): ForceRecord | null {
    const log = this.k.records.forces;
    const now = this.k.ctx.clock.now;
    for (let i = log.length - 1; i >= 0; i--) {
      const r = log[i]!;
      if (now - r.t > window) break;
      if (r.byId !== byId || r.means !== means) continue;
      if (targetId === 0 || r.targetId === targetId || r.targetId === 0) return r;
    }
    return null;
  }

  private amend(record: ForceRecord, by: Person, target: Person | null, kind: ForceVerdictKind, severity: number, reason: string): void {
    const prev = record.verdict;
    record.verdict = {
      kind,
      severity: severity > prev.severity ? severity : prev.severity,
      reason: prev.kind === 'licite' ? reason : reason + ' ' + prev.reason,
    };
    record.amended = true;
    record.frame = 'aucun';
    if (target && record.targetId === 0) {
      record.targetId = target.id;
      record.targetName = target.name;
    }
    this.k.ctx.events.emitAny('law:force_amended', { report: record });
    this.consequences(record, by, target);
  }

  /** Un tir tendu au lanceur de grenades vient d'être constaté (vitesse initiale du projectile). */
  noteFlatShot(by: Person, means: ForceMeans): void {
    const k = this.k;
    this.flat.set(by.id, k.ctx.clock.now);
    const rec = this.recent(by.id, means, 0, FLAT_SHOT_MEMORY) ?? (means === 'gm2l' ? null : this.recent(by.id, 'gm2l', 0, FLAT_SHOT_MEMORY));
    if (rec && !(rec.amended && rec.verdict.kind === 'interdit')) {
      this.amend(rec, by, null, 'interdit', 4, 'Tir tendu au lanceur de grenades : strictement interdit. Seul le tir courbe est permis, pour que personne ne soit directement atteint.');
    }
  }

  /** L'impact d'un tir ou d'un coup est connu : au-dessus des épaules, le verdict est révisé. */
  noteImpactZone(by: Person, means: ForceMeans, victim: Person, zone: number): void {
    if (!(zone >= this.k.cfg.headZone) || (means !== 'lbd' && means !== 'baton')) return;
    let rec = this.recent(by.id, means, victim.id, HURT_LINK_WINDOW[means]);
    if (!rec) {
      this.report(by, means, victim, victim.x, victim.z, true);
      rec = this.recent(by.id, means, victim.id, HURT_LINK_WINDOW[means]);
      if (!rec) return;
    }
    if (rec.amended && rec.verdict.kind === 'interdit') return;
    if (means === 'lbd') {
      this.amend(rec, by, victim, 'interdit', 5, 'Le tir de LBD a atteint ' + victim.name + " à la tête : « la tête n'est pas visée », le tireur vise le torse ou les membres (instruction du 2 août 2017). Faute lourde, enquête systématique.");
    } else {
      this.amend(rec, by, victim, 'interdit', 4, 'Coup de bâton porté à la tête de ' + victim.name + ' : les frappes ne visent que les membres et le tronc. Faute lourde.');
    }
  }

  /**
   * Un agent a blessé quelqu'un (événement person:hurt). Rattache la blessure à la déclaration
   * correspondante — ou la crée pour les moyens dirigés contre une personne, afin qu'aucun emploi
   * de la force n'échappe à l'examen — puis relève l'impact à la tête et la blessure d'un tiers.
   */
  onHurt(by: Person, means: ForceMeans, victim: Person, info: DamageInfo, healthAfter: number): void {
    const k = this.k;
    const now = k.ctx.clock.now;
    const window = HURT_LINK_WINDOW[means];
    let rec: ForceRecord | null = null;
    if (window > 0) {
      rec = this.recent(by.id, means, victim.id, window);
      if (!rec) {
        this.report(by, means, victim, victim.x, victim.z, true);
        rec = this.recent(by.id, means, victim.id, window);
      }
    }
    if (info.zone !== undefined) this.noteImpactZone(by, means, victim, info.zone);

    // blessure sérieuse d'une personne qui ne commettait pas de violences : plainte probable
    if (victim.faction !== 'police' && healthAfter <= 50 && info.amount > 0) {
      const threat = k.eyes.threat(victim, now);
      if (!(k.eyes.threatRecent && threat >= 3)) {
        const filmed = rec ? rec.filmed : (k.eyes.cameras(victim.x, victim.z, by.id, null) & CAMERA_THIRD_PARTY) !== 0;
        k.records.addComplaint(now, 'blessure', victim, by.id, 'blessure ' + (healthAfter <= 25 ? 'grave' : 'sérieuse') + ' causée par ' + MEANS_SHORT[means], healthAfter <= 25 ? 4 : 3, filmed);
      }
    }
  }
}
