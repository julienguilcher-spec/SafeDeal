/* =====================================================================================
 * COMMANDEMENT — drone : télépilote IA (docs/research/06-roles-jouables.md §9).
 *
 *   placement     sans ordre particulier (« libre »), l'appareil se tient au-dessus du point chaud
 *                 connu le plus intense, à défaut au-dessus de la tête du cortège ; « avancer » le
 *                 place au-dessus d'un point, « suivre » lui fait suivre une personne (avec le groupe
 *                 qui l'entoure) ou une unité ; « repli » et « cesser » le rappellent ;
 *   observation   toutes les deux secondes : volume de la foule dans le champ, auteurs de faits
 *                 récents, feux, barricades. Chaque observation alimente le tableau de situation du
 *                 commandement (un fait dans le champ du drone est « vu ») et les plus notables sont
 *                 rendues à la radio au format nature, volume, attitude ;
 *   batterie      retour automatique géré par le module des véhicules ; un appareil frais redécolle
 *                 40 s après la pose (relève par le second appareil).
 * Hauteur de travail : 60 m (entre 30 et 120 m ; sous 40 m l'appareil attire les projectiles).
 * ===================================================================================== */

import type { Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { COMMAND_OBSERVATION_EVENT } from './api';
import type { CommandCore } from './core';
import { isProtester } from './core';
import type { Picture } from './picture';
import { recentOffender } from './picture';
import { SpecialUnit, locate } from './special';
import { CENTRAL, estimate, received, report, spell } from './texts';

/** Délai de relève par un appareil frais après la pose (s). */
const SWAP_DELAY = 40;
/** Période des observations (s) et intervalle minimal entre deux comptes rendus radio (s). */
const SCAN_PERIOD = 2;
const REPORT_GAP = 25;
/** Balayage d'initiative : décalages par rapport à la tête du cortège (m). */
const SWEEP: readonly number[] = [90, 170, 20, -70];

export function isDroneTeam(_core: CommandCore, s: Squad, members: readonly Person[]): boolean {
  if (s.kind !== 'equipage' && s.kind !== 'binome' && s.kind !== 'groupe') return false;
  for (let i = 0; i < members.length; i++) if (members[i].poste === 'telepilote' || members[i].kind === 'telepilote') return true;
  return false;
}

export class DroneUnit extends SpecialUnit {
  /** 'libre' : placement d'initiative ; 'point' ; 'suivi' ; 'rappel'. */
  private mode: 'libre' | 'point' | 'suivi' | 'rappel' = 'libre';
  private px = 0;
  private pz = 0;
  private followId = 0;
  private orbitX = NaN;
  private orbitZ = NaN;
  private scanAt = 0;
  private reportAt = -100;
  private lastKind = '';
  private landedAt = -1;
  /** Décollage voulu (createDroneTeam({ deploy: false }) le suspend jusqu'au premier ordre). */
  wantsFlight = true;
  private droneId = 0;
  private slot = -1;
  private readonly people: Person[] = [];
  private lastHostile = 0;

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'drone');
    const p = this.pilot();
    if (p) this.rememberHome(p.x, p.z);
  }

  alive(): boolean {
    return this.pilot() !== null;
  }

  private pilot(): Person | null {
    const ctx = this.core.ctx;
    const members = this.squad.members;
    let any: Person | null = null;
    for (let i = 0; i < members.length; i++) {
      const p = ctx.people.get(members[i]);
      if (!p) continue;
      if (p.poste === 'telepilote') return p;
      if (p.kind === 'telepilote' && !any) any = p;
    }
    return any;
  }

  private drone(): Vehicle | null {
    const ext = this.core.vext;
    const pilot = this.pilot();
    if (!ext || !pilot) return null;
    return ext.droneOf(pilot.id);
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    const core = this.core;
    const type = o.type;
    this.order = this.copy(o);
    this.status.order = type;
    if (type === 'avancer' || type === 'proteger' || type === 'colonne') {
      this.mode = 'point';
      this.px = o.x;
      this.pz = o.z;
      if (type === 'proteger' && locate(core, o.targetId)) {
        this.px = core.v2.x;
        this.pz = core.v2.z;
      }
      this.wantsFlight = true;
      this.orbitX = NaN;
      this.say(received(this.squad.name, 'je me place au-dessus du point' + (core.sector(this.px, this.pz) !== '' ? ', ' + core.sector(this.px, this.pz) : '')));
    } else if (type === 'suivre' || type === 'escorter') {
      this.mode = 'suivi';
      this.followId = o.targetId > 0 ? o.targetId : o.issuedBy;
      this.status.targetId = this.followId;
      this.wantsFlight = true;
      this.orbitX = NaN;
      this.say(received(this.squad.name, 'je suis l’objectif désigné'));
    } else if (type === 'repli' || type === 'cesser' || type === 'embarquer') {
      this.mode = 'rappel';
      this.wantsFlight = false;
      const pilot = this.pilot();
      if (core.vext && pilot) core.vext.recallDrone(pilot);
      this.say(received(this.squad.name, 'je rappelle l’appareil'));
      this.finish(true, '');
    } else {
      // libre, tenir… : placement d'initiative
      this.mode = 'libre';
      this.wantsFlight = true;
      this.orbitX = NaN;
      this.finish(true, '');
    }
    return true;
  }

  // ───────────────────────────── vol ─────────────────────────────

  /** Point à survoler (dans core.v2) ; false s'il n'y en a pas. */
  private target(): boolean {
    const core = this.core;
    const pic = this.pic;
    const v2 = core.v2;
    if (this.mode === 'point') {
      v2.x = this.px;
      v2.z = this.pz;
      return true;
    }
    if (this.mode === 'suivi') {
      const ctx = core.ctx;
      const p = ctx.people.get(this.followId);
      if (p) {
        // la personne et le groupe qui l'entoure
        const n = ctx.people.queryRadius(p.x, p.z, 10, this.people);
        let sx = p.x;
        let sz = p.z;
        let m = 1;
        for (let i = 0; i < n; i++) {
          if (this.people[i] === p || this.people[i].faction !== p.faction) continue;
          sx += this.people[i].x;
          sz += this.people[i].z;
          m++;
        }
        v2.x = sx / m;
        v2.z = sz / m;
        return true;
      }
      if (ctx.squads.get(this.followId) && core.centerOf(this.followId)) return true;
      // l'objectif a disparu : retour au placement d'initiative
      this.say(report(this.superior(), this.squad.name, 'Objectif perdu de vue, je reprends la surveillance générale'));
      this.finish(false, 'Objectif perdu.');
      this.mode = 'libre';
    }
    const hot = pic.hottest(0.3);
    if (hot) {
      v2.x = hot.x;
      v2.z = hot.z;
      return true;
    }
    if (pic.active && pic.route.length >= 4) {
      // rien de signalé : balayage du parcours autour de la tête, là où se forme la nébuleuse (un secteur par 30 s)
      const leg = SWEEP[Math.floor(core.now / 30) % SWEEP.length];
      let s = pic.headS + leg;
      if (s < 0) s = 0;
      else if (s > pic.routeLength) s = pic.routeLength;
      pic.routePoint(s);
      return true;
    }
    const cfg = core.ctx.session.config;
    if (cfg && cfg.x !== undefined && cfg.z !== undefined && pic.active) {
      v2.x = cfg.x;
      v2.z = cfg.z;
      return true;
    }
    return false;
  }

  private fly(v: Vehicle): void {
    const core = this.core;
    const ext = core.vext;
    if (!ext) return;
    const fs = ext.flightStatus(v);
    if (!fs || fs.mode === 'retour' || fs.mode === 'atterrissage' || fs.mode === 'chute') return;
    if (!this.target()) return;
    const x = core.v2.x;
    const z = core.v2.z;
    // nouvelle orbite seulement si le point a bougé (un groupe suivi qui marche)
    if (Number.isNaN(this.orbitX) || Math.hypot(x - this.orbitX, z - this.orbitZ) > 10) {
      const t = core.tuning;
      if (ext.orbit(v, x, z, t.droneOrbit, t.droneAltitude, 6)) {
        this.orbitX = x;
        this.orbitZ = z;
        this.setStage(this.mode === 'suivi' ? 'suivi' : 'vol');
        if (this.order && this.order.type !== 'suivre' && this.order.type !== 'escorter' && this.mode === 'point') {
          // l'ordre de placement est exécuté quand l'appareil est en orbite
        }
      }
    }
  }

  // ───────────────────────────── observation ─────────────────────────────

  private scan(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const pic = this.pic;
    const ext = core.vext;
    const fs = ext ? ext.flightStatus(v) : null;
    const alt = fs ? fs.altitude : core.tuning.droneAltitude;
    if (alt < 8) return;
    let radius = alt * 0.85;
    if (radius < 28) radius = 28;
    else if (radius > 85) radius = 85;
    // centre du champ : le point survolé (la caméra est tournée vers le centre de l'orbite)
    const cx = Number.isNaN(this.orbitX) ? v.x : this.orbitX;
    const cz = Number.isNaN(this.orbitZ) ? v.z : this.orbitZ;
    if (this.slot >= 0 && this.slot < pic.droneN) {
      pic.droneX[this.slot] = cx;
      pic.droneZ[this.slot] = cz;
      pic.droneR[this.slot] = radius;
    }
    const n = ctx.people.queryRadius(cx, cz, radius, this.people, isProtester);
    let hostile = 0;
    let hx = 0;
    let hz = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (!recentOffender(p, core.now, 60)) continue;
      hostile++;
      hx += p.x;
      hz += p.z;
    }
    let fires = 0;
    let barricades = 0;
    let fx = cx;
    let fz = cz;
    const np = ctx.props.queryRadius(cx, cz, radius, core.props);
    for (let i = 0; i < np; i++) {
      const q = core.props[i];
      if (q.burning > 0.1) {
        fires++;
        fx = q.x;
        fz = q.z;
      }
      if (q.kind === 'barricade' && q.blocksMove) barricades++;
    }
    let kind = 'calme';
    let ox = cx;
    let oz = cz;
    if (hostile >= 2) {
      kind = 'violences';
      ox = hx / hostile;
      oz = hz / hostile;
    } else if (fires > 0) {
      kind = 'feu';
      ox = fx;
      oz = fz;
    } else if (barricades > 0) kind = 'barricade';
    else if (n >= 15) kind = 'cortege';
    const obs = pic.observe(kind, ox, oz, n, hostile, v.id);
    ctx.events.emitAny(COMMAND_OBSERVATION_EVENT, obs);
    // ce que le drone voit est connu du commandement
    if (hostile >= 2 && hostile > this.lastHostile) pic.note('casse', ox, oz, 0.2 * (hostile - this.lastHostile), true);
    this.lastHostile = hostile;
    // compte rendu radio des observations notables, sans saturer le réseau
    const now = core.now;
    if (kind !== 'calme' && (kind !== this.lastKind || now - this.reportAt > REPORT_GAP * 3) && now - this.reportAt > REPORT_GAP) {
      this.reportAt = now;
      this.lastKind = kind;
      const sec = core.sector(ox, oz);
      let body: string;
      if (kind === 'violences') body = 'Groupe de ' + spell(estimate(Math.max(hostile, 2))) + ' individus, dégradations en cours' + (sec !== '' ? ', ' + sec : '') + '. Objectif suivi';
      else if (kind === 'feu') body = 'Départ de feu' + (sec !== '' ? ', ' + sec : '') + ', ' + spell(estimate(n)) + ' personnes à proximité';
      else if (kind === 'barricade') body = 'Barricade en travers' + (sec !== '' ? ', ' + sec : '');
      else body = 'Cortège' + (sec !== '' ? ', ' + sec : '') + '. Volume dans le champ : ' + spell(estimate(n)) + '. Attitude : calme';
      core.say(this.squad.name, report(CENTRAL, this.squad.name, body), kind === 'cortege' ? 0 : 1, 'commandement', this.squad.leaderId);
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  think(): void {
    const core = this.core;
    const ext = core.vext;
    const pilot = this.pilot();
    const st = this.status;
    if (!pilot) return;
    st.x = pilot.x;
    st.z = pilot.z;
    if (!ext) {
      this.setStage('indisponible');
      return;
    }
    let v = this.drone();
    const now = core.now;
    if (!v) {
      st.vehicleId = 0;
      st.supply = -1;
      if (this.slot >= 0) this.releaseSlot();
      if (this.droneId !== 0) {
        // l'appareil s'est posé (ou a été perdu) : relève par un appareil frais
        this.droneId = 0;
        this.landedAt = now;
        this.orbitX = NaN;
        this.setStage('pose');
      }
      if (!this.wantsFlight || pilot.vehicleId !== 0 || pilot.posture === 'down') return;
      if (this.landedAt >= 0 && now - this.landedAt < SWAP_DELAY) return;
      v = ext.deployDrone(pilot);
      if (!v) return;
      this.droneId = v.id;
      this.landedAt = -1;
      this.emitStage('decollage', true, '');
      this.setStage('decollage');
    }
    st.vehicleId = v.id;
    st.x = v.x;
    st.z = v.z;
    const fs = ext.flightStatus(v);
    st.supply = fs ? fs.battery : -1;
    if (this.slot < 0) this.takeSlot();
    if (!this.wantsFlight) return;
    this.fly(v);
    if (now >= this.scanAt) {
      this.scanAt = now + SCAN_PERIOD;
      this.scan(v);
    }
    // placement demandé : rendu compte une fois l'appareil sur zone
    const o = this.order;
    if (o && this.mode === 'point' && Math.hypot(v.x - this.px, v.z - this.pz) < core.tuning.droneOrbit + 15) {
      this.say(report(this.superior(), this.squad.name, 'Sur zone, en orbite'));
      this.finish(true, '');
    }
  }

  private takeSlot(): void {
    const pic = this.pic;
    this.slot = pic.droneN++;
    pic.droneX[this.slot] = 0;
    pic.droneZ[this.slot] = 0;
    pic.droneR[this.slot] = 0;
  }

  private releaseSlot(): void {
    const pic = this.pic;
    // le champ est simplement neutralisé (les autres appareils gardent leur rang)
    if (this.slot >= 0 && this.slot < pic.droneN) pic.droneR[this.slot] = 0;
  }
}
