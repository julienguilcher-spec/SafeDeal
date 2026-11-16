/* =====================================================================================
 * COMMANDEMENT — réactions aux points chauds et PROCÉDURE d'emploi de la force.
 *
 *   riposte      des violences visent une unité : cadre « violences et voies de fait » (art. L. 211-9
 *                al. 6), sans sommations. Le commandant le dit à la radio, relève le niveau autorisé,
 *                appuie l'unité (réserve, engin lanceur d'eau, Centaure) et peut ordonner un bond offensif ;
 *   sommations   trouble caractérisé sans attaque contre les forces : le commandant se porte au contact
 *                avec le mégaphone, prononce l'annonce puis les deux sommations en respectant les délais
 *                du droit, attend le délai laissé à la foule, et alors seulement autorise la force
 *                (ctx.law.authorize) et donne les ordres : lacrymogènes à main, bond offensif, puis —
 *                après réitération de la dernière sommation — lanceurs, salve du Centaure ;
 *   halte        dès que le trouble a cessé : « Halte à l'emploi de la force », niveau ramené à 1 ;
 *   prévention   groupe hostile en formation : la réserve se rapproche sans aller au contact, les
 *                auteurs identifiés sont interpellés par la BRAV-M.
 * Gradation et délais : docs/research/00-bible-realisme.md §A ; manœuvres : docs/research/06 §4.2.
 * ===================================================================================== */

import type { ForceLevel, Person } from '@/core/contracts';
import { agentOf } from '../brain';
import type { HotSpot } from './api';
import type { Command, Element } from './command';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { recentOffender } from './picture';
import * as TX from './texts';

/** Distance de la ligne d'appui au centre du trouble (m) : portée des grenades à main (10 à 30 m). */
const LINE_DISTANCE = 22;
/** Rayon dans lequel on compte la foule du trouble (m), et effectif en dessous duquel il a cessé. */
const ZONE_RADIUS = 30;
const ZONE_EMPTY = 6;
/** Effectif à partir duquel un trouble est un attroupement à dissiper (en dessous : interpellations ciblées). */
const CROWD_MIN = 8;
/** Durée maximale d'un emploi de la force sur une même zone (s). */
const FORCE_MAX = 240;

type ProcStage = 'aucune' | 'approche' | 'en_cours' | 'delai' | 'force' | 'reiteration' | 'armes';

export class Reaction {
  proc: ProcStage = 'aucune';
  private procT = 0;
  private zoneX = 0;
  private zoneZ = 0;
  private standX = 0;
  private standZ = 0;
  private spotId = 0;
  private tryAt = 0;
  private forceT = 0;
  private stepAt = 0;
  private steps = 0;
  private calmSince = 0;
  private onRequest = false;
  private quietUntil = 0;
  /** Élément qui tient la ligne d'appui face au trouble. */
  private line: Element | null = null;
  // ── riposte ──
  private attacked = false;
  private attackAt = 0;
  private lastAttackAt = -100;
  private authorizedRiposte = false;
  private readonly people: Person[] = [];

  constructor(private readonly core: CommandCore, private readonly pic: Picture, private readonly cmd: Command) {}

  // ───────────────────────────── outils ─────────────────────────────

  private authorize(level: ForceLevel): void {
    const c = this.cmd.commander();
    this.core.ctx.law.authorize(level, c ? c.id : 0);
    this.cmd.state.authorized = level;
  }

  private crowdAt(x: number, z: number, radius: number): number {
    return this.core.ctx.people.countIn(x, z, radius, isProtester);
  }

  /** Auteurs de faits récents autour d'un point (dans this.people) ; retourne leur nombre. */
  private offenders(x: number, z: number, radius: number, window: number): number {
    const core = this.core;
    const n = core.ctx.people.queryRadius(x, z, radius, this.people, notPolice);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.custody === 'free' && recentOffender(p, core.now, window)) this.people[m++] = p;
    }
    this.people.length = m;
    return m;
  }

  /** Le droit tiendrait-il pour fondé le constat d'un attroupement ici (mêmes critères que le module de droit) ? */
  private characterised(x: number, z: number): boolean {
    const ctx = this.core.ctx;
    const d = ctx.director;
    if (d.phase === 'tension' || d.phase === 'affrontement' || d.phase === 'dispersion' || d.phase === 'apres_manif') return true;
    if (d.tensionAt(x, z) >= 0.5) return true;
    if (this.offenders(x, z, 60, 150) >= 3) return true;
    const cfg = ctx.session.config;
    return cfg !== null && cfg.extra !== undefined && cfg.extra['law.attroupement'] === true;
  }

  // ───────────────────────────── riposte ─────────────────────────────

  private riposte(): void {
    const core = this.core;
    const cmd = this.cmd;
    const ctx = core.ctx;
    const roe = ctx.law.roe;
    const now = core.now;
    // unité prise à partie
    let hit: Element | null = null;
    let hx = 0;
    let hz = 0;
    let hh = 0;
    let valid = 1;
    for (let i = 0; i < cmd.elements.length && !hit; i++) {
      const st = core.status ? core.status.of(cmd.elements[i].squadId) : null;
      if (st && st.underAttack) {
        hit = cmd.elements[i];
        hx = st.x;
        hz = st.z;
        hh = st.heading;
        valid = st.total > 0 ? st.valid / st.total : 1;
      }
    }
    const under = hit !== null || roe.underAttack;
    if (under) {
      this.lastAttackAt = now;
      if (!this.attacked) {
        this.attacked = true;
        this.attackAt = now;
        this.authorizedRiposte = false;
      }
    } else if (this.attacked && now - this.lastAttackAt > 30) {
      this.attacked = false;
      if (this.authorizedRiposte && this.proc === 'aucune' && cmd.ready('halte', 20)) {
        this.authorizedRiposte = false;
        cmd.act('halte', 1, cmd.pcX, cmd.pcZ, TX.propose('les violences ont cessé', 'la halte à l’emploi de la force'), () => this.halt(false));
      }
      this.returnToPosts();
      return;
    }
    if (!this.attacked) return;
    const spot = hit ? this.pic.near(hx, hz, 90) : this.pic.hottest(0.3);
    const sx = spot ? spot.x : hx;
    const sz = spot ? spot.z : hz;
    const sector = core.sector(sx, sz);
    // 1. cadre : la riposte est dite et tracée, le niveau autorisé relevé
    if (!this.authorizedRiposte && now - this.attackAt >= cmd.latency * 0.4 && cmd.ready('riposte', 45)) {
      cmd.act('riposte', 3, sx, sz, TX.propose('violences sur ' + (hit ? hit.name : 'les unités') + (sector !== '' ? ', ' + sector : ''), 'la riposte : lacrymogènes à main'), () => {
        this.authorizedRiposte = true;
        this.authorize(3);
        const text = TX.riposte(cmd.squad.name, sector);
        cmd.say(text, 2);
        core.decide(cmd.squad.id, 'autorisation', text, hit ? hit.squadId : 0, '', sx, sz);
      });
    }
    if (!hit) return;
    const lasting = now - this.attackAt;
    // 2. appui : la réserve vient se placer derrière l'unité prise à partie
    if (lasting > 8 + cmd.latency && cmd.ready('appui:' + hit.squadId, 120)) {
      const res = cmd.available(hx, hz);
      if (res && res !== hit) {
        const bx = hx - Math.sin(hh) * 12;
        const bz = hz - Math.cos(hh) * 12;
        const target = hit;
        cmd.act('appui:' + hit.squadId, 2, bx, bz, TX.propose(hit.name + ' est pris à partie', 'd’envoyer ' + res.name + ' en appui'), () => {
          cmd.hurry(res);
          cmd.order(res, 'reserve', { type: 'avancer', x: bx, z: bz, heading: hh, width: 0, maxForce: 3 }, TX.orderForce(res.name, cmd.squad.name, 'proteger', target.name, 0, 0));
        });
      }
    }
    // 3. moyens spéciaux : engin lanceur d'eau, puis salve du Centaure si le groupe est à bonne distance
    if (spot && lasting > 12 + cmd.latency) {
      const canon = cmd.specials.firstOf('canon_eau', cmd.attached);
      if (canon && canon.status.stage === 'repos' && Math.hypot(canon.status.x - sx, canon.status.z - sz) < 160 && cmd.ready('canon', 90)) {
        cmd.act('canon', 2, sx, sz, TX.propose('jets sur ' + hit.name, 'd’engager ' + canon.squad.name + ' au jet'), () => {
          const text = TX.orderForce(canon.squad.name, cmd.squad.name, 'refoulement', sector, 0, 0);
          cmd.say(text);
          core.issue(canon.squad.id, { type: 'refoulement', x: sx, z: sz, maxForce: 3, issuedBy: cmd.issuer() });
          core.decide(cmd.squad.id, 'force', text, canon.squad.id, 'refoulement', sx, sz);
        });
      }
      const cent = cmd.specials.firstOf('centaure', cmd.attached);
      if (cent && cent.status.stage === 'repos' && lasting > 25) {
        const d = Math.hypot(cent.status.x - sx, cent.status.z - sz);
        if (d > 50 && d < 190 && cmd.ready('centaure', 90)) {
          cmd.act('centaure', 2, sx, sz, TX.propose('violences persistantes' + (sector !== '' ? ', ' + sector : ''), 'une salve de ' + cent.squad.name), () => {
            const text = TX.orderForce(cent.squad.name, cmd.squad.name, 'disperser_gaz', sector, 0, 6);
            cmd.say(text);
            core.issue(cent.squad.id, { type: 'disperser_gaz', x: sx, z: sz, width: 6, maxForce: 4, issuedBy: cmd.issuer() });
            core.decide(cmd.squad.id, 'force', text, cent.squad.id, 'disperser_gaz', sx, sz);
          });
        }
      }
    }
    // 4. bond offensif de l'unité prise à partie, si le groupe est devant elle et qu'elle tient encore
    if (spot && lasting > 15 + cmd.latency && valid >= 0.6 && cmd.state.aptitude >= 0.45 && hit.task === '') {
      const d = Math.hypot(sx - hx, sz - hz);
      const ahead = ((sx - hx) * Math.sin(hh) + (sz - hz) * Math.cos(hh)) / (d || 1);
      if (d >= 12 && d <= 45 && ahead > 0.5 && this.crowdAt(sx, sz, 14) >= 3 && cmd.ready('bond:' + hit.squadId, 60)) {
        const el = hit;
        cmd.act('bond:' + hit.squadId, 3, sx, sz, TX.propose('groupe hostile ' + (sector !== '' ? sector : 'devant ' + el.name), 'un bond offensif de ' + el.name), () => {
          cmd.order(el, 'force', { type: 'bond_offensif', x: sx, z: sz, heading: Math.atan2(sx - hx, sz - hz), width: 0, maxForce: 3 }, TX.orderForce(el.name, cmd.squad.name, 'bond_offensif', sector, Math.min(25, d), 0));
        });
      }
    }
  }

  /** Après un bond offensif ou un appui, chacun regagne son emplacement. */
  private returnToPosts(): void {
    const cmd = this.cmd;
    for (let i = 0; i < cmd.elements.length; i++) {
      const el = cmd.elements[i];
      const p = el.post;
      if (el.role === 'poste' && p && (el.lastType === 'bond_offensif' || el.lastType === 'avancer') && el.task === '') {
        cmd.act('retour:' + el.squadId, 0, p.x, p.z, TX.propose(el.name + ' est sorti de son emplacement', 'de le replacer'), () => {
          cmd.order(el, 'dispositif', { type: p.kind === 'site' ? 'proteger' : 'ligne', x: p.x, z: p.z, heading: p.heading, width: p.kind === 'site' ? p.width : 0 }, '');
        });
      } else if (el.role === 'reserve' && el.lastType === 'avancer' && el.task === '' && this.proc === 'aucune' && cmd.ready('regroupe:' + el.squadId, 60)) {
        cmd.act('regroupe:' + el.squadId, 0, cmd.pcX, cmd.pcZ, TX.propose(el.name + ' n’est plus engagé', 'de le ramener en réserve'), () => {
          cmd.order(el, 'reserve', { type: 'colonne', x: cmd.pcX, z: cmd.pcZ, width: 0 }, TX.orderReserve(el.name, cmd.squad.name, this.core.sector(cmd.pcX, cmd.pcZ)));
        });
      }
    }
  }

  // ───────────────────────────── sommations ─────────────────────────────

  /** Démarre la procédure sur une zone (trouble constaté, ou demande de la salle de commandement). */
  start(x: number, z: number, spotId: number, onRequest: boolean): boolean {
    const core = this.core;
    const cmd = this.cmd;
    const c = cmd.commander();
    if (!c || c.isPlayer || core.ctx.health.isIncapacitated(c)) return false;
    this.zoneX = x;
    this.zoneZ = z;
    this.spotId = spotId;
    this.onRequest = onRequest;
    // point de sommation : sur le chemin du commandant vers la zone, à portée de mégaphone
    const reach = Math.min(core.tuning.megaphoneRange, core.megaphoneReach() - 8);
    const want = Math.max(14, Math.min(reach, LINE_DISTANCE + 5));
    let ux = c.x - x;
    let uz = c.z - z;
    const path = core.path;
    if (core.ctx.world.findPath(c.x, c.z, x, z, 'foot', path) && path.length >= 4) {
      // dernier tronçon de l'itinéraire : la rue par laquelle on arrive
      let acc = 0;
      for (let i = path.length - 2; i >= 2; i -= 2) {
        const ax = path[i - 2];
        const az = path[i - 1];
        acc += Math.hypot(path[i] - ax, path[i + 1] - az);
        ux = ax - x;
        uz = az - z;
        if (acc >= want) break;
      }
    }
    const d = Math.hypot(ux, uz) || 1;
    ux /= d;
    uz /= d;
    const v = core.v2;
    v.x = x + ux * want;
    v.z = z + uz * want;
    core.ctx.world.resolveCircle(v, 0.6);
    this.standX = v.x;
    this.standZ = v.z;
    const sector = core.sector(x, z);
    const text = TX.approachContact(cmd.squad.name, sector);
    cmd.say(text);
    core.decide(cmd.squad.id, 'sommation', text, 0, '', x, z);
    // une ligne d'appui précède le commandant, à portée de grenade à main
    const res = cmd.available(x, z);
    this.line = res;
    if (res) {
      res.hold = true;
      cmd.hurry(res);
      const lx = x + ux * LINE_DISTANCE;
      const lz = z + uz * LINE_DISTANCE;
      cmd.order(res, 'reserve', { type: 'avancer', x: lx, z: lz, heading: Math.atan2(-ux, -uz), width: 0 }, TX.orderForce(res.name, cmd.squad.name, 'ligne', sector, 0, 0));
    }
    this.proc = 'approche';
    this.procT = core.now;
    this.tryAt = 0;
    this.steps = 0;
    this.calmSince = 0;
    cmd.state.sommations = 'approche';
    return true;
  }

  /** Le commandant marche vers son point (emplacement temporaire de l'IA de police, sinon commande directe). */
  private walk(c: Person): number {
    const core = this.core;
    const d = Math.hypot(this.standX - c.x, this.standZ - c.z);
    const a = agentOf(c);
    if (a) {
      a.postX = this.standX;
      a.postZ = this.standZ;
      a.postUntil = core.now + 2.5;
      a.face = Math.atan2(this.zoneX - c.x, this.zoneZ - c.z);
    } else if (c.brain === null || c.brain === undefined) {
      const k = d > 1.2 ? 1 / d : 0;
      c.cmd.moveX = (this.standX - c.x) * k;
      c.cmd.moveZ = (this.standZ - c.z) * k;
      c.cmd.gait = d > 12 ? 1 : 0;
      c.cmd.faceMove = d > 1.2;
      c.cmd.aimYaw = Math.atan2(this.zoneX - c.x, this.zoneZ - c.z);
    }
    return d;
  }

  /** Prononce l'étape suivante au mégaphone ; true si elle a été prononcée. */
  private pronounce(c: Person): boolean {
    const core = this.core;
    const ctx = core.ctx;
    const roe = ctx.law.roe;
    if (core.now < this.tryAt) return false;
    if (core.advisor && core.advisor.sommationRefusal(c) !== '') {
      this.tryAt = core.now + Math.max(1, Math.min(10, core.advisor.sommationWait()));
      return false;
    }
    const before = roe.sommation;
    const beforeAt = roe.sommationAt;
    if (ctx.actions.has(c, 'megaphone') > 0 && ctx.actions.def('megaphone') !== undefined) {
      const held = ctx.actions.activeItem(c);
      if (!held || held.id !== 'megaphone') {
        ctx.actions.selectById(c, 'megaphone');
        this.tryAt = core.now + 1.6;
        return false;
      }
      if (!ctx.actions.canUse(c)) {
        this.tryAt = core.now + 1;
        return false;
      }
      ctx.actions.use(c);
    } else {
      ctx.law.sommation(c);
    }
    const done = roe.sommation !== before || roe.sommationAt !== beforeAt;
    // sans conseiller juridique : on laisse à la foule le temps que fixe le droit entre deux étapes
    this.tryAt = core.now + (done ? (core.advisor ? 1.5 : core.lawConfig ? Math.max(core.lawConfig.delayAnnonce, core.lawConfig.delaySommation) : 15) : 3);
    if (done) {
      core.decide(this.cmd.squad.id, 'sommation', ctx.law.sommationText(roe.sommation), 0, '', c.x, c.z);
      this.cmd.state.sommations = 'en_cours';
    }
    return done;
  }

  /** Ordre de force donné à l'élément de la ligne d'appui (ou au plus proche de la zone). */
  private forceOrder(type: 'disperser_gaz' | 'bond_offensif', level: ForceLevel): void {
    const core = this.core;
    const cmd = this.cmd;
    // la ligne d'appui d'abord ; à défaut un élément disponible : jamais une unité qui tient un barrage
    let el = this.line;
    if (!el) {
      el = cmd.available(this.zoneX, this.zoneZ);
      if (el && core.centerOf(el.squadId) && Math.hypot(core.v2.x - this.zoneX, core.v2.z - this.zoneZ) > 70) el = null;
    }
    if (!el || !core.centerOf(el.squadId)) return;
    const ex = core.v2.x;
    const ez = core.v2.z;
    const d = Math.hypot(this.zoneX - ex, this.zoneZ - ez);
    const sector = core.sector(this.zoneX, this.zoneZ);
    if (type === 'disperser_gaz') {
      cmd.task(el, 'force', { type, x: this.zoneX, z: this.zoneZ, maxForce: level }, TX.orderForce(el.name, cmd.squad.name, type, sector, 0, 0));
    } else if (d >= 10 && d <= 60) {
      cmd.order(el, 'force', { type, x: this.zoneX, z: this.zoneZ, heading: Math.atan2(this.zoneX - ex, this.zoneZ - ez), width: 0, maxForce: level }, TX.orderForce(el.name, cmd.squad.name, type, sector, Math.min(25, d), 0));
    }
  }

  /** Abandon de la procédure sans emploi de la force (trouble cessé avant l'annonce, commandant empêché). */
  private abandon(): void {
    const cmd = this.cmd;
    this.proc = 'aucune';
    cmd.state.sommations = 'aucune';
    const el = this.line;
    this.line = null;
    if (el) {
      el.hold = false;
      if (el.role === 'reserve') cmd.order(el, 'reserve', { type: 'colonne', x: cmd.pcX, z: cmd.pcZ, width: 0 }, TX.orderReserve(el.name, cmd.squad.name, this.core.sector(cmd.pcX, cmd.pcZ)));
    }
  }

  private halt(procedure: boolean): void {
    const core = this.core;
    const cmd = this.cmd;
    this.authorize(1);
    const text = TX.haltForce(cmd.squad.name);
    cmd.say(text);
    core.decide(cmd.squad.id, 'halte', text, 0, '', this.zoneX, this.zoneZ);
    if (procedure) {
      this.proc = 'aucune';
      cmd.state.sommations = 'aucune';
      // le calme revient : pas de nouvelle manœuvre sur ce point avant deux minutes
      cmd.ready('approche:' + this.spotId, 120);
      cmd.ready('sommation:' + this.spotId, 120);
      this.quietUntil = core.now + 90;
      const el = this.line;
      this.line = null;
      if (el) el.hold = false;
      if (el && el.role === 'reserve') {
        cmd.order(el, 'reserve', { type: 'colonne', x: cmd.pcX, z: cmd.pcZ, width: 0 }, TX.orderReserve(el.name, cmd.squad.name, core.sector(cmd.pcX, cmd.pcZ)));
      }
    }
  }

  private procedure(): void {
    const core = this.core;
    const cmd = this.cmd;
    const ctx = core.ctx;
    const roe = ctx.law.roe;
    const now = core.now;
    const c = cmd.commander();
    if (!c || c.isPlayer || ctx.health.isIncapacitated(c)) {
      // le commandant est hors de combat : la procédure s'arrête, aucune force n'est autorisée
      this.abandon();
      return;
    }
    const present = this.crowdAt(this.zoneX, this.zoneZ, ZONE_RADIUS);
    // la zone suit le groupe s'il se déplace un peu
    if (present >= 3 && this.proc !== 'approche') {
      const n = ctx.people.queryRadius(this.zoneX, this.zoneZ, ZONE_RADIUS, this.people, isProtester);
      let sx = 0;
      let sz = 0;
      for (let i = 0; i < n; i++) {
        sx += this.people[i].x;
        sz += this.people[i].z;
      }
      if (n > 0) {
        this.zoneX += (sx / n - this.zoneX) * 0.3;
        this.zoneZ += (sz / n - this.zoneZ) * 0.3;
      }
    }
    // le trouble a-t-il cessé ? (foule partie, ou plus aucun fait depuis un moment)
    const quiet = present < ZONE_EMPTY || (this.proc !== 'approche' && this.proc !== 'en_cours' && this.offenders(this.zoneX, this.zoneZ, 45, 90) === 0 && present < CROWD_MIN * 2);
    if (quiet) {
      if (this.calmSince === 0) this.calmSince = now;
    } else {
      this.calmSince = 0;
    }
    if (this.calmSince !== 0 && now - this.calmSince > 12 && this.proc !== 'approche') {
      this.halt(true);
      return;
    }
    const dist = this.walk(c);
    switch (this.proc) {
      case 'approche': {
        const inRange = Math.hypot(c.x - this.zoneX, c.z - this.zoneZ) <= core.megaphoneReach() - 6;
        // le commandant ne somme pas seul : sa ligne d'appui doit être en place (sauf si elle tarde trop)
        const line = this.line;
        const lineReady = !line || line.inPlace || now - this.procT > 240;
        if (((dist < 3 || (inRange && dist < 12)) && lineReady) || now - this.procT > 300) {
          this.proc = 'en_cours';
          this.procT = now;
          cmd.state.sommations = 'en_cours';
        }
        // le trouble a cessé avant l'arrivée : pas d'annonce sur une foule calme (ce serait une faute)
        if (present < ZONE_EMPTY && !this.onRequest && now - this.procT > 20) this.abandon();
        break;
      }
      case 'en_cours':
        if (roe.sommation < 3) {
          // annonce puis sommations ; rien sur une foule calme, sauf demande expresse de la salle
          if (roe.sommation === 0 && !this.onRequest && !this.characterised(this.zoneX, this.zoneZ)) {
            if (now - this.procT > 40) this.abandon();
            break;
          }
          // sommation sur ordre de la salle : une étape par demande
          if (this.pronounce(c) && this.onRequest && roe.sommation < 3) this.abandon();
        }
        if (roe.sommation >= 3) {
          this.proc = 'delai';
          this.procT = now;
        }
        break;
      case 'delai': {
        const wait = core.advisor ? core.advisor.forceWait() : roe.lawfulForce >= 3 ? 0 : 1;
        if (wait <= 0) {
          // la force n'est autorisée qu'ici, après les sommations et le délai laissé à la foule
          this.authorize(3);
          const text = TX.forceAuthorized(cmd.squad.name, 3, '');
          cmd.say(text);
          core.decide(cmd.squad.id, 'autorisation', text, 0, '', this.zoneX, this.zoneZ);
          cmd.state.sommations = 'force_autorisee';
          this.proc = 'force';
          this.procT = now;
          this.forceT = now;
          this.steps = 0;
          this.stepAt = now + 1;
        } else if (now - this.procT > 300) {
          this.halt(true);
        }
        break;
      }
      case 'force':
        if (now - this.forceT > FORCE_MAX) {
          this.halt(true);
          break;
        }
        if (now < this.stepAt) break;
        if (this.steps === 0) {
          this.forceOrder('disperser_gaz', 3);
          this.stepAt = now + 30;
        } else if (this.steps === 1) {
          this.forceOrder('bond_offensif', 3);
          this.stepAt = now + 35;
        } else {
          // sans effet : réitération de la dernière sommation avant l'usage des armes
          this.proc = 'reiteration';
          this.procT = now;
          this.tryAt = 0;
        }
        this.steps++;
        break;
      case 'reiteration': {
        const reiterated = core.advisor ? core.advisor.reiterated : roe.lawfulForce >= 4;
        if (!reiterated) {
          this.pronounce(c);
          if (now - this.procT > 120) this.halt(true);
          break;
        }
        const wait = core.advisor ? core.advisor.armsWait() : 0;
        if (wait > 0) break;
        this.authorize(4);
        const text = TX.forceAuthorized(cmd.squad.name, 4, '');
        cmd.say(text);
        core.decide(cmd.squad.id, 'autorisation', text, 0, '', this.zoneX, this.zoneZ);
        cmd.state.sommations = 'armes_autorisees';
        this.proc = 'armes';
        this.stepAt = now + 1;
        break;
      }
      case 'armes': {
        if (now - this.forceT > FORCE_MAX) {
          this.halt(true);
          break;
        }
        if (now < this.stepAt) break;
        this.stepAt = now + 40;
        const sector = core.sector(this.zoneX, this.zoneZ);
        const cent = cmd.specials.firstOf('centaure', cmd.attached);
        const canon = cmd.specials.firstOf('canon_eau', cmd.attached);
        if (canon && canon.status.stage === 'repos' && Math.hypot(canon.status.x - this.zoneX, canon.status.z - this.zoneZ) < 160) {
          const text = TX.orderForce(canon.squad.name, cmd.squad.name, 'refoulement', sector, 0, 0);
          cmd.say(text);
          core.issue(canon.squad.id, { type: 'refoulement', x: this.zoneX, z: this.zoneZ, maxForce: 3, issuedBy: cmd.issuer() });
          core.decide(cmd.squad.id, 'force', text, canon.squad.id, 'refoulement', this.zoneX, this.zoneZ);
        } else if (cent && cent.status.stage === 'repos' && Math.hypot(cent.status.x - this.zoneX, cent.status.z - this.zoneZ) > 50) {
          const text = TX.orderForce(cent.squad.name, cmd.squad.name, 'disperser_gaz', sector, 0, 6);
          cmd.say(text);
          core.issue(cent.squad.id, { type: 'disperser_gaz', x: this.zoneX, z: this.zoneZ, width: 6, maxForce: 4, issuedBy: cmd.issuer() });
          core.decide(cmd.squad.id, 'force', text, cent.squad.id, 'disperser_gaz', this.zoneX, this.zoneZ);
        } else {
          this.forceOrder('disperser_gaz', 4);
        }
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────────── troubles, prévention ─────────────────────────────

  private trouble(spot: HotSpot): void {
    const core = this.core;
    const cmd = this.cmd;
    const now = core.now;
    const sector = core.sector(spot.x, spot.z);
    const label = TX.hotLabel(spot.kind, spot.againstPolice);
    const where = sector !== '' ? ' ' + sector : '';
    const crowd = this.crowdAt(spot.x, spot.z, ZONE_RADIUS);
    const disorder = spot.weights[0] + spot.weights[1] + spot.weights[3];
    // compte rendu de situation à la salle (nature, volume, attitude)
    if (cmd.ia && cmd.ready('situation:' + spot.id, 90)) {
      const text = TX.situation(cmd.squad.name, spot.kind, spot.againstPolice, sector, crowd >= 5 ? crowd : 0);
      cmd.say(text);
      core.decide(cmd.squad.id, 'situation', text, 0, '', spot.x, spot.z);
    }
    // auteurs identifiés, à l'écart de la foule : interpellation par la BRAV-M
    const bravm = cmd.specials.firstOf('bravm', cmd.attached);
    if (bravm && bravm.status.stage === 'repos' && disorder >= 0.4 && cmd.ready('bravm:' + spot.id, 120)) {
      const n = this.offenders(spot.x, spot.z, 35, 120);
      let target: Person | null = null;
      for (let i = 0; i < n && !target; i++) if (core.ctx.law.canArrest(this.people[i]) && this.crowdAt(this.people[i].x, this.people[i].z, 8) <= 12) target = this.people[i];
      if (target || (n > 0 && crowd <= 14)) {
        const tid = target ? target.id : 0;
        const tx = target ? target.x : spot.x;
        const tz = target ? target.z : spot.z;
        cmd.act('bravm:' + spot.id, 2, tx, tz, TX.propose(label + where + ', auteurs identifiés', 'une interpellation par ' + bravm.squad.name), () => {
          const text = TX.orderForce(bravm.squad.name, cmd.squad.name, 'interpeller', sector, 0, 0);
          cmd.say(text);
          core.issue(bravm.squad.id, { type: 'interpeller', targetId: tid, x: tx, z: tz, maxForce: 2, issuedBy: cmd.issuer() });
          core.decide(cmd.squad.id, 'interpellation', text, bravm.squad.id, 'interpeller', tx, tz);
        });
      } else {
        cmd.unready('bravm:' + spot.id);
      }
    }
    // attroupement qui se livre à des dégradations : sommations (le joueur-commandant les prononce lui-même)
    const lasting = now - spot.firstAt;
    if (this.proc === 'aucune' && !this.attacked && disorder >= 0.6 && crowd >= CROWD_MIN && lasting >= 8 + cmd.latency * 2) {
      if (this.characterised(spot.x, spot.z) && cmd.ready('sommation:' + spot.id, 150)) {
        const id = spot.id;
        const x = spot.x;
        const z = spot.z;
        cmd.act('sommation:' + spot.id, 3, x, z, TX.propose(label + where + ', attroupement caractérisé', 'de procéder aux sommations'), cmd.ia ? () => {
          if (!this.start(x, z, id, false)) cmd.unready('sommation:' + id);
        } : null);
        return;
      }
    }
    // la force est déjà licite (riposte, sommations faites) : proposition de bond offensif par l'unité la plus proche
    const roe = core.ctx.law.roe;
    if (!cmd.ia && roe.lawfulForce >= 3 && crowd >= 3) {
      const el = cmd.nearest(spot.x, spot.z, 50, false);
      if (el && cmd.ready('bond:spot' + spot.id, 90) && core.centerOf(el.squadId)) {
        const ex = core.v2.x;
        const ez = core.v2.z;
        cmd.act('bond:spot' + spot.id, 3, spot.x, spot.z, TX.propose(label + where, 'un bond offensif de ' + el.name), () => {
          cmd.order(el, 'force', { type: 'bond_offensif', x: spot.x, z: spot.z, heading: Math.atan2(spot.x - ex, spot.z - ez), width: 0, maxForce: 3 }, TX.orderForce(el.name, cmd.squad.name, 'bond_offensif', sector, 25, 0));
        });
      }
      return;
    }
    // prévention : la réserve se rapproche, sans aller au contact
    if (this.proc === 'aucune' && cmd.state.aptitude >= 0.45 && spot.heat >= core.tuning.reactHeat * 0.5 && cmd.ready('approche:' + spot.id, 180)) {
      const res = cmd.available(spot.x, spot.z);
      if (!res || res.role !== 'reserve' || !core.centerOf(res.squadId)) {
        cmd.unready('approche:' + spot.id);
        return;
      }
      const rx = core.v2.x;
      const rz = core.v2.z;
      const d = Math.hypot(rx - spot.x, rz - spot.z);
      if (d < 90) return;
      // point à 60 m du trouble, du côté d'où vient la réserve
      const px = spot.x + ((rx - spot.x) / d) * 60;
      const pz = spot.z + ((rz - spot.z) / d) * 60;
      const v = core.v2;
      v.x = px;
      v.z = pz;
      if (core.ctx.world.nearestRoad(px, pz, core.road, 40)) {
        v.x = core.road.x;
        v.z = core.road.z;
      }
      const tx = v.x;
      const tz = v.z;
      cmd.act('approche:' + spot.id, 1, tx, tz, TX.propose(label + where, 'de rapprocher la réserve'), () => {
        cmd.order(res, 'reserve', { type: 'avancer', x: tx, z: tz, heading: Math.atan2(spot.x - tx, spot.z - tz), width: 0 }, TX.orderForce(res.name, cmd.squad.name, 'colonne', sector, 0, 0));
      });
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  update(): void {
    this.riposte();
    if (this.proc !== 'aucune') {
      this.procedure();
      return;
    }
    if (this.core.now < this.quietUntil) return;
    const spot = this.pic.hottest(this.core.tuning.reactHeat * (1.4 - 0.6 * this.cmd.state.aptitude));
    if (spot && spot.kind !== 'compression' && spot.kind !== 'feu') this.trouble(spot);
    else if (spot && spot.kind === 'feu' && spot.weights[0] + spot.weights[1] + spot.weights[3] >= 0.6) this.trouble(spot);
  }

  /** Zone de la procédure en cours (pour l'interface et les essais). */
  get zone(): { x: number; z: number; spotId: number } {
    return { x: this.zoneX, z: this.zoneZ, spotId: this.spotId };
  }
}
