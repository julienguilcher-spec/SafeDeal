/* =====================================================================================
 * Droit — sommations, séquence de dispersion et niveau de force autorisé.
 *
 * Machine à états (docs/research/01-doctrine-cadre-legal.md §1.8, bible A.2) :
 *   cortège ──annonce──► 1 ──première sommation──► 2 ──dernière sommation──► 3 (force après délai)
 *                                                    3 ──réitération──► 3 « réitérée » (armes après délai)
 *   dispersion effective pendant cfg.sequenceEndDelay ──► retour à 0 (fin d'emploi de la force).
 *
 * Règles appliquées :
 *   - seule l'autorité habilitée peut sommer, insigne tricolore porté (look.sash, ou
 *     look.extras.brassard_tricolore). Décision du commanditaire (docs/BRIEF.md §1, « un seul chef ») :
 *     le commandant d'unité EST l'autorité habilitée — postes 'commandant_unite' et 'autorite_civile',
 *     type 'commissaire', ou tout membre des forces à qui l'écharpe a été confiée. Un gardien ou un
 *     chef de groupe sans écharpe ne peut pas sommer ;
 *   - délais minimaux entre deux étapes (cfg.delay*) ; refus motivé sinon ;
 *   - mégaphone, sonorisation d'un véhicule de police ou, à défaut, voix nue (portée 15 m, procédure
 *     fragile) ; une fusée rouge de la dotation double la sommation quand la foule est hors de portée ;
 *   - une série de sommations vaut pour un compartiment de terrain (cfg.sequenceRadius) ;
 *   - les participants qui ont entendu la dernière sommation et restent sur place après le délai
 *     commettent 'attroupement_apres_sommations', sauf si la foule est encerclée sans issue
 *     (attroupement.ts) ;
 *   - la dernière sommation vaut décision d'emploi de la force (niveau 3) et sa réitération ordre
 *     d'usage des armes (niveau 4), sauf consigne contraire donnée ensuite par authorize().
 * ===================================================================================== */

import type { EntityId, ForceLevel, Person, SommationStage } from '@/core/contracts';
import { rankLevel } from '@/core/stores';
import type { SommationMeans } from './api';
import { LEVEL_ARMS, LEVEL_CONTACT, LEVEL_FORCE, LEVEL_RIPOSTE_AUTO, TROUBLE_COUNT } from './config';
import type { Kernel } from './kernel';
import { LEVEL_NAMES, STAGE_NAMES, hourText, secondsText, sommationText } from './texts';

/** Distance à un véhicule de police sonorisé pour se servir de son haut-parleur (m). */
const SPEAKER_REACH = 6;
/** Grades de commandement à partir desquels un ordre d'autorisation est recevable. */
const COMMAND_RANK = rankLevel('brigadier_chef');

export class Sommations {
  /** La dernière sommation a été réitérée (préalable à l'usage des armes). */
  reiterated = false;
  /** Centre du compartiment de terrain et rayon d'audition de la dernière sommation. */
  zoneX = 0;
  zoneZ = 0;
  heardRadius = 0;
  /** Instants à partir desquels la force, puis les armes, sont licites (Infinity tant que non acquis). */
  forceFrom = Infinity;
  armsFrom = Infinity;
  /** Niveau de force ordonné par la hiérarchie (explicite ou déduit des sommations). */
  ordered: ForceLevel = LEVEL_CONTACT;
  orderedBy: EntityId = 0;
  /** Participants présents dans le compartiment : dernier comptage, maximum observé. */
  present = 0;
  peak = 0;
  /** Instant où la dispersion est devenue effective (−1 si la foule est encore là). */
  dispersedSince = -1;
  /** Autorité qui a prononcé la dernière sommation. */
  authorityId: EntityId = 0;
  /** Code du dernier motif rendu par refusal() : 'non_habilite' | 'indisponible' | 'insigne' | 'delai' | ''. */
  refusalCode = '';

  private justified = true;
  private nextCountAt = 0;

  constructor(private readonly k: Kernel) {}

  /** La foule sommée n'a aucune issue libre : elle ne peut matériellement pas se disperser. */
  get enclosed(): boolean {
    return this.k.attroupement.enclosed;
  }

  reset(): void {
    const roe = this.k.roe;
    roe.dispersionOrdered = false;
    roe.sommation = 0;
    roe.sommationAt = 0;
    this.reiterated = false;
    this.zoneX = 0;
    this.zoneZ = 0;
    this.heardRadius = 0;
    this.forceFrom = Infinity;
    this.armsFrom = Infinity;
    this.ordered = LEVEL_CONTACT;
    this.orderedBy = 0;
    this.present = 0;
    this.peak = 0;
    this.dispersedSince = -1;
    this.authorityId = 0;
    this.justified = true;
    this.nextCountAt = 0;
    this.k.attroupement.reset();
    this.refreshRoe();
  }

  // ───────────────────────────── habilitation ─────────────────────────────

  /**
   * Autorité habilitée à décider de l'emploi de la force : le commandant unique du BRIEF (poste
   * 'commandant_unite'), le commissaire ou l'autorité civile, et tout membre des forces de l'ordre à
   * qui l'insigne tricolore a été confié. Le port effectif de l'insigne est vérifié à part.
   */
  isAuthority(p: Person): boolean {
    if (p.faction !== 'police') return false;
    return p.kind === 'commissaire' || p.poste === 'autorite_civile' || p.poste === 'commandant_unite' || this.wearsInsignia(p);
  }

  /** L'insigne tricolore (écharpe ou brassard) est-il porté ? */
  wearsInsignia(p: Person): boolean {
    if (p.look.sash) return true;
    const extras = p.look.extras;
    return extras !== undefined && (extras['brassard_tricolore'] ?? 0) > 0;
  }

  /** La personne peut-elle fixer le niveau de force autorisé (commandant, autorité habilitée ou gradé qui commande) ? */
  canCommand(p: Person): boolean {
    if (p.faction !== 'police') return false;
    if (this.isAuthority(p)) return true;
    const poste = p.poste;
    if (poste === 'commandant_unite' || poste === 'chef_section' || poste === 'chef_groupe') return true;
    return rankLevel(p.rank) >= COMMAND_RANK;
  }

  /** L'autorité a-t-elle quitté le compartiment de terrain de la série en cours ? */
  private movedAway(by: Person): boolean {
    const dx = by.x - this.zoneX;
    const dz = by.z - this.zoneZ;
    const r = this.k.cfg.sequenceRadius;
    return dx * dx + dz * dz > r * r;
  }

  /** Temps restant avant que l'étape suivante (ou la réitération) soit possible (s, 0 si elle l'est). */
  waitNext(): number {
    const k = this.k;
    const roe = k.roe;
    const cfg = k.cfg;
    const stage = roe.sommation;
    if (stage === 0) return 0;
    const delay = stage === 1 ? cfg.delayAnnonce : stage === 2 ? cfg.delaySommation : this.reiterated ? cfg.delayArmes : cfg.delayForce;
    const wait = delay - (k.ctx.clock.now - roe.sommationAt);
    return wait > 1e-6 ? wait : 0;
  }

  /**
   * Motif pour lequel `by` ne peut pas prononcer maintenant l'étape suivante ('' s'il le peut).
   * Sans effet de bord ; `refusalCode` reçoit le code du motif.
   */
  refusal(by: Person): string {
    const k = this.k;
    const roe = k.roe;
    this.refusalCode = '';
    if (!this.isAuthority(by)) {
      this.refusalCode = 'non_habilite';
      return by.faction === 'police'
        ? "Seul le commandant, autorité habilitée à décider de l'emploi de la force et porteur de l'écharpe tricolore, peut prononcer les sommations."
        : "Les sommations ne peuvent être prononcées que par l'autorité habilitée à décider de l'emploi de la force, porteuse de l'écharpe tricolore.";
    }
    if (k.ctx.health.isIncapacitated(by) || by.custody !== 'free') {
      this.refusalCode = 'indisponible';
      return "L'autorité habilitée n'est pas en état de procéder aux sommations.";
    }
    if (!this.wearsInsignia(by)) {
      this.refusalCode = 'insigne';
      return "Insigne non porté : ceignez l'écharpe ou le brassard tricolore avant de sommer (art. R. 211-12 du code de la sécurité intérieure). Sans insigne, les sommations sont nulles.";
    }
    // délais minimaux (sans objet si la série doit reprendre ailleurs depuis l'annonce)
    const stage = roe.sommation;
    if (stage > 0 && !this.movedAway(by)) {
      const wait = this.waitNext();
      if (wait > 0) {
        this.refusalCode = 'delai';
        return stage === 3
          ? 'Délai insuffisant : la dernière sommation ne peut être réitérée que dans ' + secondsText(wait) + '.'
          : 'Délai insuffisant : la foule doit avoir le temps de se disperser. La ' + STAGE_NAMES[stage + 1] + ' sera possible dans ' + secondsText(wait) + '.';
      }
    }
    return '';
  }

  // ───────────────────────────── sommation ─────────────────────────────

  /** Sommation suivante prononcée par `by`. Retourne l'étape atteinte (inchangée en cas de refus). */
  pronounce(by: Person): SommationStage {
    const k = this.k;
    const ctx = k.ctx;
    const cfg = k.cfg;
    const roe = k.roe;
    const now = ctx.clock.now;

    // 1 à 3. habilitation, insigne, délais minimaux
    const reason = this.refusal(by);
    if (reason !== '') {
      k.records.lastRefusal = reason;
      ctx.events.emitAny('law:sommation_refused', { byId: by.id, code: this.refusalCode, reason });
      k.notify(by, reason, 'warn', 6);
      return roe.sommation;
    }
    // nouveau compartiment de terrain : la série est à reprendre depuis l'annonce
    if (roe.sommation > 0 && this.movedAway(by)) {
      this.endSequence('deplacement');
      k.notify(by, 'Nouveau compartiment de terrain : la série de sommations reprend depuis l\'annonce.', 'info', 5);
    }
    const stage = roe.sommation;
    const reiteration = stage === 3;
    const next = (reiteration ? 3 : stage + 1) as SommationStage;

    // 4. moyen de diffusion et couverture de la foule
    let means: SommationMeans = 'voix';
    let heard = cfg.voiceRange;
    if (ctx.actions.has(by, 'megaphone') > 0) {
      means = 'megaphone';
      heard = cfg.megaphoneRange;
    }
    if (this.nearSpeakerVehicle(by)) {
      means = 'vehicule';
      heard = cfg.vehicleSpeakerRange;
    }
    const crowd = k.eyes.participantsIn(by.x, by.z, cfg.sequenceRadius);
    let inRange = heard >= cfg.sequenceRadius ? crowd : k.eyes.participantsIn(by.x, by.z, heard);
    let flare = false;
    if ((means === 'voix' || (crowd > 0 && inRange < crowd * 0.5)) && ctx.actions.has(by, 'fusee_sommation') > 0) {
      // fusée rouge : remplace ou complète la sommation quand le haut-parleur est inopérant (art. R. 211-11)
      ctx.actions.remove(by, 'fusee_sommation', 1);
      flare = true;
      if (cfg.flareRange > heard) heard = cfg.flareRange;
      inRange = heard >= cfg.sequenceRadius ? crowd : k.eyes.participantsIn(by.x, by.z, heard);
    }
    const coverage = crowd > 0 ? inRange / crowd : 1;
    let note = '';
    if (means === 'voix' && !flare) {
      note = 'prononcée à la voix nue, sans haut-parleur ni fusée rouge : inaudible au-delà de ' + Math.round(cfg.voiceRange) + ' m, procédure fragile';
    } else if (coverage < 0.5 && !flare) {
      note = 'moins de la moitié de la foule à portée intelligible, sans fusée rouge';
    }

    // 5. y a-t-il un attroupement à dissiper ? (qualifier ainsi un cortège calme est une faute)
    if (next === 1) {
      this.justified = this.troubleAt(by.x, by.z);
      if (!this.justified) {
        k.notify(by, "Aucun trouble caractérisé : qualifier d'attroupement un cortège calme est une faute qui sera relevée.", 'warn', 6);
      }
    }

    // 6. application
    roe.sommation = next;
    roe.sommationAt = now;
    roe.dispersionOrdered = true;
    this.zoneX = by.x;
    this.zoneZ = by.z;
    this.heardRadius = heard;
    this.authorityId = by.id;
    if (next === 1) {
      this.peak = crowd;
      this.present = crowd;
      this.dispersedSince = -1;
      this.nextCountAt = now + 1;
      k.attroupement.clear();
    } else if (crowd > this.peak) {
      this.peak = crowd;
    }
    if (next === 3) {
      if (!reiteration) {
        this.reiterated = false;
        this.forceFrom = now + cfg.delayForce;
        this.armsFrom = Infinity;
        k.attroupement.clear();
      } else if (!this.reiterated) {
        this.reiterated = true;
        this.armsFrom = now + cfg.delayArmes;
      }
      // eux seuls pourront ensuite « rester sciemment »
      k.attroupement.collect(by.x, by.z, heard);
    }

    const sector = ctx.world.sectorName(by.x, by.z);
    k.records.sommations.push({
      t: now, stage: next, reiteration, byId: by.id, byName: by.name, x: by.x, z: by.z, sector, means, flare,
      heardRadius: heard, crowd, coverage, justified: this.justified, note,
    });
    if (next === 3) {
      // l'autorité doit s'assurer que la foule peut partir avant d'employer la force
      k.attroupement.recheckExit();
    }

    by.upper = means === 'voix' ? 'point' : 'megaphone';
    by.upperT = 0;
    const text = sommationText(next);
    // le texte est porté par l'événement : la voix et le sous-titre relèvent de l'audio et de l'interface
    ctx.events.emit('law:sommation', { stage: next, byId: by.id, x: by.x, z: by.z, text });
    if (flare) {
      ctx.events.emit('fx', { id: 'feu_artifice', x: by.x, y: by.y + 80, z: by.z, size: 6, color: 0xff2a1a, seconds: 6 });
      ctx.events.emit('sfx', { id: 'petard', x: by.x, y: by.y + 40, z: by.z, volume: 0.8 });
    }

    // la sommation vaut décision : emploi de la force, puis usage des armes après réitération
    if (next === 3) {
      const implied = reiteration ? LEVEL_ARMS : LEVEL_FORCE;
      if (this.ordered < implied) this.setOrdered(implied, by.id, true);
    }
    this.refreshRoe();

    // compte rendu radio à la salle de commandement
    const hour = hourText(ctx.env.state.timeOfDay);
    const from = this.callSign(by);
    const head = 'CENTRAL ICI ' + from + '. ';
    let report: string;
    if (next === 1) {
      report = head + 'Attroupement constaté, ' + sector + '. Annonce faite à ' + hour + '. PARLEZ.';
    } else if (next === 2) {
      report = head + 'Première sommation faite à ' + hour + ', ' + sector + '. PARLEZ.';
    } else if (!reiteration) {
      report = head + 'Dernière sommation faite à ' + hour + ', ' + sector + ". Emploi de la force autorisé à l'issue du délai : refoulement, grenades lacrymogènes à main. PARLEZ.";
    } else {
      report = head + 'Dernière sommation réitérée à ' + hour + ', ' + sector + '. Usage des armes autorisé : lanceurs, tir courbe. PARLEZ.';
    }
    ctx.radio.say({ channel: 'commandement', from, text: report, priority: 1, personId: by.id });
    return next;
  }

  /** Indicatif radio de l'autorité : celui de son unité si elle en commande une, « AUTORITÉ » sinon. */
  private callSign(by: Person | undefined): string {
    if (by && by.squadId !== 0) {
      const squad = this.k.ctx.squads.get(by.squadId);
      if (squad && squad.name !== '') return squad.name.toUpperCase();
    }
    return 'AUTORITÉ';
  }

  /** L'autorité dispose-t-elle de la sonorisation d'un véhicule de police (à bord ou à côté) ? */
  private nearSpeakerVehicle(by: Person): boolean {
    const vehicles = this.k.ctx.vehicles;
    if (by.vehicleId !== 0) {
      const v = vehicles.get(by.vehicleId);
      return v !== undefined && v.faction === 'police' && v.def.hasSiren;
    }
    const list = vehicles.list;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.faction !== 'police' || !v.def.hasSiren || v.def.flying || v.dormant) continue;
      if (v.state === 'wrecked' || v.state === 'burning' || v.state === 'burnt') continue;
      const reach = SPEAKER_REACH + v.def.length * 0.5;
      const dx = v.x - by.x;
      const dz = v.z - by.z;
      if (dx * dx + dz * dz <= reach * reach) return true;
    }
    return false;
  }

  /** Un trouble justifie-t-il de constater l'attroupement ici (bible A.3.3) ? */
  private troubleAt(x: number, z: number): boolean {
    const k = this.k;
    const ctx = k.ctx;
    if (k.offenses.troubleCount(x, z) >= TROUBLE_COUNT) return true;
    if (k.attack.near(x, z, k.cfg.sequenceRadius)) return true;
    const phase = ctx.director.phase;
    // les organisateurs ont appelé à la dispersion, ou la manifestation a dégénéré
    if (phase === 'tension' || phase === 'affrontement' || phase === 'dispersion' || phase === 'apres_manif') return true;
    if (ctx.director.tensionAt(x, z) >= 0.5) return true;
    const config = ctx.session.config;
    // manifestation interdite ou non déclarée : l'attroupement se constate d'emblée
    return config !== null && config.extra !== undefined && config.extra['law.attroupement'] === true;
  }

  // ───────────────────────────── autorisation hiérarchique ─────────────────────────────

  private setOrdered(level: ForceLevel, byId: EntityId, implied: boolean): void {
    const k = this.k;
    this.ordered = level;
    this.orderedBy = byId;
    k.records.autorisations.push({ t: k.ctx.clock.now, level, byId, implied, lawfulAtTime: k.roe.lawfulForce });
    this.refreshRoe();
    k.ctx.events.emit('law:authorized', { level, byId });
  }

  /** Fixe le niveau de force autorisé par la hiérarchie (byId = 0 : salle de commandement ou script de mission). */
  authorize(level: ForceLevel, byId: EntityId): void {
    const k = this.k;
    let lvl = Math.round(Number.isFinite(level) ? level : 0);
    if (lvl < 0) lvl = 0;
    const by = byId !== 0 ? k.ctx.people.get(byId) : undefined;
    if (byId !== 0 && (!by || !this.canCommand(by))) {
      const reason = 'Autorisation refusée : seuls le commandant et les gradés qui commandent une unité fixent le niveau de force.';
      k.records.lastRefusal = reason;
      k.ctx.events.emitAny('law:authorize_refused', { byId, level: lvl, reason });
      k.notify(by, reason, 'warn', 5);
      return;
    }
    if (lvl > LEVEL_ARMS) {
      lvl = LEVEL_ARMS;
      k.notify(by, "L'arme de service ne s'autorise pas : elle relève de la seule légitime défense. Autorisation ramenée aux " + LEVEL_NAMES[LEVEL_ARMS - 1] + '.', 'warn', 6);
    }
    this.setOrdered(lvl as ForceLevel, byId, false);
    if (lvl > k.roe.lawfulForce) {
      // en mots, jamais en chiffre (« Niveau 3 » ne dit rien au joueur) : « Autorisation enregistrée (lacrymogènes…) »
      k.notify(by, 'Autorisation enregistrée (' + LEVEL_NAMES[lvl] + ') : elle ne prendra effet qu\'une fois le cadre légal réuni (sommations ou violences contre les forces).', 'info', 6);
    }
  }

  /** Niveau de force autorisé pour cet agent : ordre général, ordre donné à son unité, riposte immédiate. */
  authorizedFor(by: Person, riposte: boolean): ForceLevel {
    let a = this.ordered;
    if (by.squadId !== 0) {
      const squad = this.k.ctx.squads.get(by.squadId);
      if (squad && squad.order.maxForce > a) a = squad.order.maxForce;
    }
    if (riposte && a < LEVEL_RIPOSTE_AUTO) a = LEVEL_RIPOSTE_AUTO;
    return a;
  }

  // ───────────────────────────── état courant ─────────────────────────────

  /** Le point est-il dans le compartiment de terrain couvert par les sommations ? */
  inZone(x: number, z: number): boolean {
    const dx = x - this.zoneX;
    const dz = z - this.zoneZ;
    const r = this.k.cfg.sequenceRadius;
    return dx * dx + dz * dz <= r * r;
  }

  /** La force est-elle poursuivie alors que l'attroupement est dispersé depuis plus que le délai de grâce ? */
  pursued(now: number): boolean {
    return this.dispersedSince >= 0 && now - this.dispersedSince > this.k.cfg.cessationGrace;
  }

  /** Recalcule RoeState.lawfulForce et authorizedForce. */
  refreshRoe(): void {
    const k = this.k;
    const roe = k.roe;
    const now = k.ctx.clock.now;
    let lawful: ForceLevel = LEVEL_CONTACT;
    if (roe.sommation === 3) {
      if (this.reiterated && now >= this.armsFrom) lawful = LEVEL_ARMS;
      else if (now >= this.forceFrom) lawful = LEVEL_FORCE;
    }
    if (roe.underAttack) lawful = LEVEL_ARMS;
    roe.lawfulForce = lawful;
    let auth = this.ordered;
    if (roe.underAttack && auth < LEVEL_RIPOSTE_AUTO) auth = LEVEL_RIPOSTE_AUTO;
    roe.authorizedForce = auth < lawful ? auth : lawful;
  }

  /** Clôt la séquence de dispersion : retour à l'état de cortège. */
  endSequence(reason: 'dispersion' | 'deplacement' | 'abandon'): void {
    const k = this.k;
    const ctx = k.ctx;
    const roe = k.roe;
    if (roe.sommation === 0) return;
    const x = this.zoneX;
    const z = this.zoneZ;
    const authorityId = this.authorityId;
    roe.sommation = 0;
    roe.sommationAt = 0;
    roe.dispersionOrdered = false;
    this.reiterated = false;
    this.forceFrom = Infinity;
    this.armsFrom = Infinity;
    this.peak = 0;
    this.present = 0;
    this.dispersedSince = -1;
    k.attroupement.reset();
    const hadOrder = this.ordered > LEVEL_CONTACT;
    this.ordered = LEVEL_CONTACT;
    this.orderedBy = 0;
    this.refreshRoe();
    if (hadOrder) {
      k.records.autorisations.push({ t: ctx.clock.now, level: LEVEL_CONTACT, byId: 0, implied: true, lawfulAtTime: roe.lawfulForce });
      ctx.events.emit('law:authorized', { level: LEVEL_CONTACT, byId: 0 });
    }
    ctx.events.emitAny('law:dispersion_ended', { x, z, reason });
    if (reason === 'dispersion') {
      const sector = ctx.world.sectorName(x, z);
      const from = this.callSign(ctx.people.get(authorityId));
      ctx.radio.say({
        channel: 'commandement', from, priority: 1,
        text: 'CENTRAL ICI ' + from + '. Dispersion effective, ' + sector + ". Fin d'emploi de la force à " + hourText(ctx.env.state.timeOfDay) + '. TERMINÉ.',
      });
      const player = ctx.player.person();
      if (player && player.faction === 'police') {
        k.notify(player, "Dispersion effective : l'emploi de la force a pris fin. De nouvelles sommations seraient nécessaires.", 'ok', 6);
      }
    }
  }

  // ───────────────────────────── suivi continu ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    const roe = k.roe;
    this.refreshRoe();
    if (roe.sommation === 0) return;
    const cfg = k.cfg;
    const now = k.ctx.clock.now;

    if (now >= this.nextCountAt) {
      this.nextCountAt = now + 1;
      this.present = k.eyes.participantsIn(this.zoneX, this.zoneZ, cfg.sequenceRadius);
      if (this.present > this.peak) this.peak = this.present;
      if (roe.sommation === 3 && now >= this.forceFrom) {
        const ratio = this.peak * cfg.dispersedRatio;
        const limit = ratio > cfg.dispersedMin ? ratio : cfg.dispersedMin;
        if (this.present <= limit) {
          if (this.dispersedSince < 0) this.dispersedSince = now;
          else if (now - this.dispersedSince >= cfg.sequenceEndDelay) {
            this.endSequence('dispersion');
            return;
          }
        } else {
          this.dispersedSince = -1;
        }
      } else if (roe.sommation < 3) {
        // annonce ou première sommation restée sans suite : la série est caduque
        const stale = 6 * cfg.delaySommation;
        if (now - roe.sommationAt > (stale > 180 ? stale : 180)) {
          this.endSequence('abandon');
          return;
        }
      }
    }

    if (roe.sommation === 3 && now >= this.forceFrom && this.dispersedSince < 0) k.attroupement.scan(dt);
  }

  /** Une personne a quitté le jeu. */
  onRemoved(id: EntityId): void {
    if (this.authorityId === id) this.authorityId = 0;
    this.k.attroupement.onRemoved(id);
  }
}
